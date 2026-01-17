import os
import requests
import base64
import io
import time

from concurrent.futures import ThreadPoolExecutor 
from uuid import UUID
from sqlalchemy.orm import Session
from fastapi import UploadFile, HTTPException, BackgroundTasks
from datetime import datetime 
# Import Repository và Model
from domain.models.imedical_repository import IMedicalRepository
from domain.models.ibilling_repository import IBillingRepository

from models.enums import EyeSide
from typing import List
 
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
    def __init__(self, repo: IMedicalRepository, billing_repo: IBillingRepository): 
        self.repo = repo
        self.billing_repo = billing_repo # Lưu lại để dùng
        self.ai_service_url = os.getenv("AI_SERVICE_URL", "http://ai_service:8001/analyze")
        self.ai_batch_url = "http://ai_service:8001/analyze/batch"

    def upload_and_analyze(self, user_id: UUID, file: UploadFile, eye_side: str): # eye_side là str cho linh hoạt
        """
        Quy trình chuẩn Microservices:
        1. Upload ảnh gốc lên Cloudinary (Backend làm).
        2. Gửi file ảnh sang AI Service (Port 8001) để phân tích.
        3. Nhận kết quả từ AI (JSON + URL ảnh đã vẽ đè từ AI).
        4. Lưu tất cả vào Database.
        """

        # A. Lấy thông tin gói cước
        subscription = self.billing_repo.get_active_subscription(user_id)
        
        # B. Kiểm tra xem có gói không
        if not subscription:
            raise HTTPException(status_code=402, detail="⛔ Bạn chưa đăng ký gói dịch vụ. Vui lòng mua gói để tiếp tục!")
            
        # C. Kiểm tra xem còn lượt không
        if subscription.credits_left <= 0:
            raise HTTPException(status_code=402, detail="⛔ Bạn đã hết lượt phân tích (0 credits). Vui lòng nạp thêm!")

        # D. Trừ 1 lượt (Nếu trừ thất bại thì chặn luôn)
        is_deducted = self.billing_repo.deduct_credits(subscription.id)
        if not is_deducted:
             raise HTTPException(status_code=500, detail="Lỗi xử lý thanh toán. Vui lòng thử lại.")
        # ---------------------------------------------------------
        
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
            # 🟢 SỬA LẠI: Định nghĩa dict 'files' đúng chuẩn cho 1 ảnh
            files_payload = {"file": (file.filename, file.file, file.content_type)}
            
            # 🟢 SỬA LẠI: Gọi URL đơn (ai_service_url) và dùng biến files_payload
            response = requests.post(self.ai_service_url, files=files_payload, timeout=300)
            
            if response.status_code == 200:
                ai_data = response.json()
                print("✅ AI Service trả về:", ai_data)
                
                # Lấy dữ liệu từ AI Service (Khớp với main.py của AI)
                # Lưu ý: Cần kiểm tra main.py trả về key gì. 
                # Nếu main.py trả về "diagnosis" thì sửa get("diagnosis_result") thành get("diagnosis")
                dr_grade = ai_data.get("diagnosis", "Unknown") 
                detailed_report = ai_data.get("report", "")
                
                # AI đơn hiện tại trả về base64 trong 'image_base64', chưa chắc có 'annotated_image_url'
                # Nếu bạn muốn lưu ảnh base64 này, cần logic upload lại Cloudinary hoặc decode
                # Tạm thời để trống hoặc xử lý sau tùy nhu cầu
                annotated_url = None 
                b64_str = ai_data.get("image_base64")
                if b64_str:
                    try:
                        # Decode Base64 -> File
                        img_data = base64.b64decode(b64_str)
                        file_obj = io.BytesIO(img_data)
                        
                        # Upload lên Cloudinary folder riêng
                        upload_res = cloudinary.uploader.upload(
                            file_obj, 
                            folder="aura_annotated_results",
                            public_id=f"annotated_{user_id}_{int(datetime.utcnow().timestamp())}"
                        )
                        annotated_url = upload_res.get("secure_url")
                        print(f"✅ Đã lưu ảnh vẽ: {annotated_url}")
                    except Exception as up_err:
                        print(f"⚠️ Lỗi upload ảnh vẽ: {up_err}")
            else:
                print(f"⚠️ AI Service lỗi {response.status_code}: {response.text}")
                detailed_report = f"Lỗi phân tích AI: {response.text}"

        except Exception as e:
            print(f"❌ Lỗi kết nối AI Service: {e}")
            # Không raise lỗi để quy trình vẫn tiếp tục (lưu ảnh gốc) dù AI chết
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
    
    def process_batch_analysis(self, user_id: UUID, files: List[UploadFile], patient_id: str, eye_side: str):
        start_time = time.time()
        print(f"🚀 [BATCH] Bắt đầu xử lý {len(files)} ảnh cho User {user_id}")

        # 1. Billing Check (Giữ nguyên)
        subscription = self.billing_repo.get_active_subscription(user_id)
        # ... logic billing ...

        # 2. Tạo hồ sơ bệnh nhân
        patient = self.repo.create_patient_record(user_id)

        # 3. ĐỌC FILE VÀO RAM (Để xử lý song song)
        files_data = []
        for f in files:
            f.file.seek(0)
            content = f.file.read()
            files_data.append((f.filename, content, f.content_type))

        # --- A. UPLOAD ẢNH GỐC SONG SONG (Tăng tốc độ) ---
        temp_image_urls = [None] * len(files_data)
        
        def upload_worker(index, data_tuple):
            fname, content, _ = data_tuple
            try:
                # Upload lên Cloudinary
                res = cloudinary.uploader.upload(io.BytesIO(content), folder="aura_batch")
                return index, res.get("secure_url")
            except Exception as e:
                print(f"❌ Lỗi upload ảnh {fname}: {e}")
                return index, None

        print("⚡ Đang upload ảnh gốc lên Cloudinary (Parallel)...")
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(upload_worker, i, data) for i, data in enumerate(files_data)]
            for future in futures:
                idx, url = future.result()
                temp_image_urls[idx] = url

        # --- B. GỌI AI SERVICE ---
        print("📡 Đang gọi AI Service...")
        files_to_send = []
        for fname, content, ctype in files_data:
            files_to_send.append(('files', (fname, content, ctype)))

        ai_results = []
        try:
            # Timeout tăng lên 600s cho chắc chắn
            response = requests.post(self.ai_batch_url, files=files_to_send, timeout=600)
            
            if response.status_code != 200:
                print(f"⚠️ AI Error: {response.text}")
                # Nếu lỗi, tạo kết quả giả để không crash
                ai_results = [{"diagnosis": "AI Error", "confidence": 0, "report": str(response.text)} for _ in files]
            else:
                ai_results = response.json().get("results", [])
        except Exception as e:
            print(f"❌ Lỗi kết nối AI: {e}")
            ai_results = [{"diagnosis": "Connection Error", "confidence": 0, "report": str(e)} for _ in files]

        # --- C. UPLOAD ẢNH KẾT QUẢ SONG SONG ---
        print("⚡ Đang upload ảnh kết quả (Annotated)...")
        annotated_urls = [None] * len(ai_results)

        def upload_annotated_worker(index, ai_res):
            b64 = ai_res.get("image_base64")
            if not b64: return index, None
            try:
                img_data = base64.b64decode(b64)
                res = cloudinary.uploader.upload(io.BytesIO(img_data), folder="aura_annotated")
                return index, res.get("secure_url")
            except Exception as e:
                return index, None

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(upload_annotated_worker, i, res) for i, res in enumerate(ai_results)]
            for future in futures:
                idx, url = future.result()
                annotated_urls[idx] = url

        # --- D. LƯU DATABASE (Tuần tự để an toàn Transaction) ---
        saved_records = []
        for i, ai_res in enumerate(ai_results):
            try:
                if not temp_image_urls[i]: continue # Skip nếu ảnh gốc lỗi
                
                # Lưu Image
                saved_image = self.repo.save_image(
                    patient_id=patient.id,
                    uploader_id=user_id,
                    image_url=temp_image_urls[i],
                    eye_side=eye_side
                )
                
                # Lưu Result
                final_result = self.repo.save_analysis_result(
                    image_id=saved_image.id,
                    risk_level=ai_res.get("diagnosis", "Unknown"),
                    vessel_data={},
                    annotated_url=annotated_urls[i],
                    report_content=ai_res.get("report", "")
                )
                
                saved_records.append({
                    "id": str(saved_image.id),
                    "image_url": saved_image.image_url,
                    "annotated_image_url": annotated_urls[i],
                    "diagnosis": final_result.risk_level,
                    "confidence": ai_res.get("confidence", 0),
                    "report": final_result.ai_detailed_report
                })
            except Exception as e:
                print(f"❌ Lỗi lưu DB record {i}: {e}")

        print(f"✅ Hoàn tất Batch trong {time.time() - start_time:.2f}s")
        return saved_records
    
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
    
    # 1. HÀM KHỞI TẠO (Chạy cực nhanh)
    def init_batch_processing(self, user_id: UUID, files_data: list, patient_id: str, eye_side: str, background_tasks: BackgroundTasks):
        
        # A. Tạo hồ sơ bệnh nhân nếu cần
        patient = self.repo.create_patient_record(user_id)
        
        # B. Tạo các bản ghi "PENDING" trong Database trước
        pending_records = []
        for fname, content, ctype in files_data:
            # Lưu tạm ảnh placeholder hoặc null url
            saved_image = self.repo.save_image(
                patient_id=patient.id,
                uploader_id=user_id,
                image_url="", # Chưa có URL
                eye_side=eye_side
            )
            
            # Lưu kết quả "Đang xử lý"
            final_result = self.repo.save_analysis_result(
                image_id=saved_image.id,
                risk_level="Processing...", 
                vessel_data={},
                annotated_url=None,
                report_content="Hệ thống đang phân tích ngầm..."
            )
            
            # Thêm trạng thái status vào object trả về (Bạn cần đảm bảo Schema có field status hoặc tự map)
            pending_records.append({
                "id": str(saved_image.id),
                "image_url": None, # Chưa có
                "annotated_image_url": None,
                "diagnosis": "Đang xử lý...", # Frontend sẽ dựa vào text này để hiện loading
                "confidence": 0,
                "report": "Đang trong hàng đợi...",
                "status": "PENDING", # Cờ để Frontend biết cần Polling
                # Truyền data nội bộ để worker dùng
                "_internal_file_data": (fname, content, ctype),
                "_image_db_id": saved_image.id,
                "_result_db_id": final_result.id
            })

        # C. Đẩy việc nặng xuống Background Task
        background_tasks.add_task(self._background_worker, user_id, pending_records)
        
        # D. Trả về danh sách PENDING cho Frontend hiển thị ngay
        # (Lọc bỏ data nội bộ trước khi trả về để nhẹ json)
        return [{k: v for k, v in r.items() if not k.startswith('_')} for r in pending_records]

    # 2. HÀM WORKER (Chạy ngầm - Queue Processor)
    def _background_worker(self, user_id: UUID, pending_records: list):
        print(f"🔄 [QUEUE] Bắt đầu xử lý ngầm {len(pending_records)} ảnh...")
        
        for record in pending_records:
            try:
                fname, content, ctype = record["_internal_file_data"]
                img_id = record["_image_db_id"]
                result_id = record["_result_db_id"]
                
                # B1: Upload Cloudinary
                upload_res = cloudinary.uploader.upload(io.BytesIO(content), folder="aura_batch")
                image_url = upload_res.get("secure_url")
                
                # Update DB: URL ảnh gốc
                # (Lưu ý: Bạn cần thêm hàm update_image_url vào repo, hoặc dùng session trực tiếp)
                # Ở đây tôi giả định repo có hàm update hoặc bạn gọi lại save đè
                self.repo.update_image_url(img_id, image_url) 

                # B2: Gọi AI (Tuần tự hoặc Song song đều được vì giờ đã chạy ngầm)
                files_payload = {"file": (fname, content, ctype)}
                response = requests.post(self.ai_service_url, files=files_payload, timeout=300)
                
                diagnosis = "Lỗi AI"
                report = "Không thể phân tích"
                annotated_url = None
                
                if response.status_code == 200:
                    ai_data = response.json()
                    diagnosis = ai_data.get("diagnosis", "Unknown")
                    report = ai_data.get("report", "")
                    
                    # Upload ảnh vẽ
                    b64_str = ai_data.get("image_base64")
                    if b64_str:
                        try:
                            img_data = base64.b64decode(b64_str)
                            up_res = cloudinary.uploader.upload(io.BytesIO(img_data), folder="aura_annotated")
                            annotated_url = up_res.get("secure_url")
                        except: pass
                
                # B3: Update Kết quả vào DB (Chuyển trạng thái thành COMPLETED)
                self.repo.update_analysis_result(
                    result_id, 
                    risk_level=diagnosis, 
                    annotated_url=annotated_url, 
                    report_content=report
                )
                print(f"✅ [QUEUE] Xong ảnh {fname} -> {diagnosis}")
                
            except Exception as e:
                print(f"❌ [QUEUE] Lỗi xử lý ảnh {record.get('id')}: {e}")
                # Update DB thành Lỗi