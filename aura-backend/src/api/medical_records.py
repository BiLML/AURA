# api/v1/medical_records.py
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from typing import List

from core.database import get_db
from core.security import get_current_user
from models.users import User
from models.enums import UserRole
from schemas.medical_schema import ImageResponse

# 1. IMPORT SERVICE VÀ REPO THỰC
from services.medical_service import MedicalService
from infrastructure.repositories.medical_repo import MedicalRepository

router = APIRouter()


# 2. HÀM DEPENDENCY ĐỂ KHỞI TẠO SERVICE
def get_medical_service(db: Session = Depends(get_db)) -> MedicalService:
    # Bước A: Tạo Repo thực
    repo = MedicalRepository(db)
    # Bước B: Tiêm vào Service (Service nhận Interface, ta đưa Class thực vào là OK)
    return MedicalService(repo=repo)

# 1. API UPLOAD & PHÂN TÍCH
@router.post("/analyze", response_model=ImageResponse, status_code=201)
def analyze_retina(
    eye_side: str = Form("left"),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    # Thay vì tự khởi tạo, hãy nhờ FastAPI lấy hộ Service đã được lắp ráp
    service: MedicalService = Depends(get_medical_service) 
):
    if file.content_type not in ["image/jpeg", "image/png", "image/jpg"]:
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file ảnh (jpg, png)")

    try:
        # Gọi Service trực tiếp, không cần truyền db nữa
        result = service.upload_and_analyze(
            user_id=current_user.id,
            file=file,
            eye_side=eye_side 
        )
        
        img_data = result["image"]
        analysis_data = result["analysis"]
        
        return {
            "id": img_data.id,
            "uploader_id": img_data.uploader_id,
            "image_url": img_data.image_url,
            "image_type": img_data.image_type,
            "eye_side": img_data.eye_side,
            "created_at": img_data.created_at,
            "analysis_result": analysis_data 
        }
    except Exception as e:
        print(f"Lỗi Upload: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
# 2. API LẤY DANH SÁCH (Của user đang login)
@router.get("/", response_model=List[ImageResponse])
def get_my_records(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    service: MedicalService = Depends(get_medical_service) # <--- Inject Service
):
    if current_user.role in [UserRole.DOCTOR, UserRole.ADMIN, UserRole.CLINIC]:
        return service.get_all_records(skip=skip, limit=limit)
    return service.get_records_by_user(user_id=current_user.id, skip=skip, limit=limit)

# --- 3. API LỊCH SỬ PHÒNG KHÁM (QUAN TRỌNG: PHẢI ĐẶT TRƯỚC {record_id}) ---
@router.get("/clinic-history")
def get_clinic_history_records(
    current_user: User = Depends(get_current_user),
    service: MedicalService = Depends(get_medical_service)
):
    if current_user.role in [UserRole.CLINIC, UserRole.DOCTOR, UserRole.ADMIN]:
        records = service.get_all_records(limit=50) 
    else:
        records = service.get_records_by_user(user_id=current_user.id)

    # Format dữ liệu trả về cho khớp với Frontend ClinicDashboard
    results = []
    for r in records:
        # Xử lý lấy kết quả AI (list hoặc object)
        analysis = None
        if hasattr(r, "analysis_result") and r.analysis_result:
            analysis = r.analysis_result
        elif hasattr(r, "analysis_results") and r.analysis_results:
            analysis = r.analysis_results[0]

        results.append({
            "id": str(r.id),
            "created_at": r.created_at,
            "patient_name": r.uploader.username if r.uploader else "Unknown", 
            "image_url": r.image_url,
            "ai_result": analysis.risk_level if analysis else "Đang phân tích...",
            "ai_analysis_status": "COMPLETED" if analysis else "PENDING"
        })
    
    return results

# 4. API CHI TIẾT (ĐẶT Ở CUỐI CÙNG ĐỂ KHÔNG CHẶN CÁC API KHÁC)
@router.get("/{record_id}")
def get_record_detail(
    record_id: str, 
    current_user: User = Depends(get_current_user),
    service: MedicalService = Depends(get_medical_service)
):
    record = service.get_record_by_id(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ")
         
    if str(record.uploader_id) != str(current_user.id) and current_user.role not in [UserRole.DOCTOR, UserRole.ADMIN, UserRole.CLINIC]:
         raise HTTPException(status_code=403, detail="Không có quyền truy cập")

    analysis = None
    if hasattr(record, "analysis_result") and record.analysis_result:
        analysis = record.analysis_result
    elif hasattr(record, "analysis_results") and record.analysis_results:
         analysis = record.analysis_results[0]
    doctor_note = None
    doctor_diagnosis = None
    
    if analysis and analysis.doctor_validation:
        # Lấy dữ liệu từ bảng validation
        doctor_note = analysis.doctor_validation.doctor_notes
        doctor_diagnosis = analysis.doctor_validation.doctor_confirm

    return {
        "id": str(record.id),
        # Nếu bác sĩ đã chẩn đoán, ưu tiên hiển thị kết quả của bác sĩ
        "ai_result": doctor_diagnosis if doctor_diagnosis else (analysis.risk_level if analysis else "Đang phân tích..."),
        
        # Đây là nội dung report (đã được bác sĩ edit và lưu đè ở bước PUT trên)
        "ai_detailed_report": analysis.ai_detailed_report if analysis else "Chưa có báo cáo chi tiết.",
        
        "annotated_image_url": analysis.annotated_image_url if analysis else None,
        "image_url": record.image_url,
        "upload_date": record.created_at,
        "ai_analysis_status": "COMPLETED" if analysis else "PENDING",
        
        # Trả về ghi chú thật thay vì None
        "doctor_note": doctor_note 
    }