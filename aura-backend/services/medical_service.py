import os
import requests
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import UploadFile, HTTPException
from datetime import datetime 
# Import Repository và Model
from repositories.medical_repo import MedicalRepository
from models.enums import EyeSide

# Cấu hình Cloudinary
import cloudinary
import cloudinary.uploader

cloudinary.config( 
    cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME"), 
    api_key = os.getenv("CLOUDINARY_API_KEY"), 
    api_secret = os.getenv("CLOUDINARY_API_SECRET"),
    secure = True
)

class MedicalService:
    def __init__(self, db: Session):
        self.repo = MedicalRepository(db)
        # Lấy URL của AI Service từ biến môi trường (đã set trong docker-compose)
        self.ai_service_url = os.getenv("AI_SERVICE_URL", "http://ai_service:8001/analyze")

    def upload_and_analyze(self, user_id: UUID, file: UploadFile, eye_side: str): # eye_side là str cho linh hoạt
        """
        Quy trình chuẩn Microservices:
        1. Upload ảnh gốc lên Cloudinary (Backend làm).
        2. Gửi file ảnh sang AI Service (Port 8001) để phân tích.
        3. Nhận kết quả từ AI (JSON + URL ảnh đã vẽ đè từ AI).
        4. Lưu tất cả vào Database.
        """
        
        # B1: Đảm bảo User đã có hồ sơ Bệnh nhân
        patient = self.repo.create_patient_record(user_id)

        # B2: Upload ảnh gốc lên Cloudinary
        try:
            # Reset con trỏ file về đầu để đọc
            file.file.seek(0)
            upload_res = cloudinary.uploader.upload(file.file, folder="aura_retina_clean_arch")
            image_url = upload_res.get("secure_url")
        except Exception as e:
            print(f"❌ Cloudinary Error: {e}")
            raise HTTPException(status_code=500, detail="Lỗi upload ảnh gốc lên Cloud")

        # B3: Lưu metadata ảnh gốc vào Database
        # Convert string "left"/"right" sang Enum hoặc để repo tự xử lý (tùy repo của bạn)
        saved_image = self.repo.save_image(
            patient_id=patient.id,
            uploader_id=user_id,
            image_url=image_url,
            eye_side=eye_side 
        )

        # B4: GỌI SANG AI SERVICE (Microservice Call)
        print(f"📡 Đang gửi ảnh tới AI Service: {self.ai_service_url}")
        
        ai_result = {}
        annotated_url = None
        dr_grade = "Unknown"
        detailed_report = "Không thể kết nối tới AI Service."

        try:
            # Reset con trỏ file lần nữa để gửi sang AI
            file.file.seek(0)
            
            # Gửi request POST multipart/form-data sang port 8001
            files = {"file": (file.filename, file.file, file.content_type)}
            response = requests.post(self.ai_service_url, files=files, timeout=300) # Timeout 5 phút cho AI chạy
            
            if response.status_code == 200:
                ai_data = response.json()
                print("✅ AI Service trả về:", ai_data)
                
                # Lấy dữ liệu từ AI Service (Khớp với main.py của AI)
                dr_grade = ai_data.get("diagnosis_result", "Unknown")
                detailed_report = ai_data.get("detailed_risk", "")
                annotated_url = ai_data.get("annotated_image_url") # AI Service đã tự upload ảnh vẽ đè
            else:
                print(f"⚠️ AI Service lỗi {response.status_code}: {response.text}")
                detailed_report = f"Lỗi phân tích AI: {response.text}"

        except Exception as e:
            print(f"❌ Lỗi kết nối AI Service: {e}")
            detailed_report = f"Lỗi hệ thống: Không thể kết nối tới AI Server ({str(e)})"

        # B5: Lưu kết quả phân tích vào Database
        # Lưu ý: Bạn cần đảm bảo hàm save_analysis_result trong Repo nhận đúng tham số
        # Ở đây tôi map theo giả định Repo của bạn nhận string text
        
        final_result = self.repo.save_analysis_result(
            image_id=saved_image.id,
            risk_level=dr_grade,       # Lưu kết luận ngắn (VD: Severe NPDR)
            vessel_data={},            # Có thể bỏ qua hoặc update nếu AI trả về chi tiết mạch máu
            annotated_url=annotated_url,
            report_content=detailed_report # Cần thêm tham số này vào Repo để lưu bài văn chi tiết
        )
        
        # Nếu Repo cũ chưa hỗ trợ lưu text dài (report_content), bạn có thể tạm nhét vào risk_level hoặc sửa Repo sau.


        analysis_response = {
                "id": final_result.id,
                "risk_level": dr_grade,                 # Lấy từ biến local
                "processed_at": datetime.utcnow(),
                "annotated_image_url": annotated_url,   # Lấy từ biến local
                "ai_detailed_report": detailed_report,  # ✅ QUAN TRỌNG: Lấy text trực tiếp từ AI
                "ai_analysis_status": "COMPLETED"
            }

        return {
            "image": saved_image,    # Metadata ảnh gốc
            "analysis": analysis_response # Trả về dict thủ công này
        }
    
    # Giữ lại các hàm GET
    def get_records_by_user(self, user_id: UUID, skip: int = 0, limit: int = 100):
        
        # Truyền skip, limit xuống repo
        records = self.repo.get_by_patient_id(user_id, skip=skip, limit=limit)

        # --- ĐOẠN CHECK KẾT QUẢ BÁC SĨ (Giữ nguyên logic cũ của bạn) ---
        for record in records:
            if record.analysis_result:
                val = record.analysis_result.doctor_validation
                if val and val.doctor_confirm:
                    record.analysis_result.risk_level = val.doctor_confirm
        # ---------------------------------------------------------------

        return records
        
    def get_all_records(self, skip: int = 0, limit: int = 100):
        return self.repo.get_all_records(skip, limit)

    def get_record_by_id(self, record_id: int): # Lưu ý: kiểu dữ liệu record_id có thể là str hoặc int tùy setup, tốt nhất là khớp với repo
        # 1. Lấy record từ Repo
        record = self.repo.get_record_by_id(record_id)
        
        # 2. [THÊM MỚI] Kiểm tra và ghi đè kết quả nếu Bác sĩ đã chốt
        if record and record.analysis_result:
            val = record.analysis_result.doctor_validation
            
            # Nếu có validation và đã có kết luận cuối cùng
            if val and val.doctor_confirm:
                # Ghi đè để Frontend hiển thị kết quả cuối cùng này
                record.analysis_result.risk_level = val.doctor_confirm
                
                # (Tùy chọn) Bạn có thể gán thêm cờ để Frontend biết đây là kết quả của bác sĩ
                # record.analysis_result.ai_version = "Doctor Verified" 

        return record