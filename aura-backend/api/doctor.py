from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Any, List
from uuid import UUID

from core.database import get_db
from core.security import get_current_active_user
from models.users import User
from models.enums import UserRole

from services.doctor_service import DoctorService
from services.medical_service import MedicalService
from schemas.doctor_schema import MyPatientsResponse, DoctorDiagnosisUpdate, DoctorDiagnosisRequest
from schemas.medical_schema import ImageResponse
from pydantic import BaseModel
from typing import Optional


router = APIRouter()

@router.get("/my-patients", response_model=MyPatientsResponse)
def get_my_assigned_patients(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Lấy danh sách bệnh nhân của bác sĩ đang đăng nhập.
    """
    if current_user.role != UserRole.DOCTOR:
        raise HTTPException(status_code=403, detail="Chỉ bác sĩ mới có quyền truy cập")
        
    service = DoctorService(db)
    return service.get_my_patients(current_user.id)

# --- THÊM MỚI: API LẤY LỊCH SỬ KHÁM CỦA BỆNH NHÂN (DÀNH CHO BÁC SĨ) ---
@router.get("/patients/{patient_id}/history", response_model=List[ImageResponse])
def get_patient_medical_history(
    patient_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Bác sĩ xem lịch sử các lần upload/phân tích của một bệnh nhân cụ thể.
    URL thực tế sẽ là: /api/v1/doctor/patients/{patient_id}/history
    """
    # 1. Check quyền Bác sĩ
    if current_user.role != UserRole.DOCTOR:
        raise HTTPException(status_code=403, detail="Chỉ bác sĩ mới có quyền truy cập")

    # 2. Validate UUID
    try:
        p_uuid = UUID(patient_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID bệnh nhân không hợp lệ")

    # 3. Gọi MedicalService để lấy dữ liệu
    # (Tái sử dụng hàm get_records_by_user đã viết sẵn bên MedicalService)
    medical_service = MedicalService(db)
    records = medical_service.get_records_by_user(user_id=p_uuid)

    return records

# ... (các imports khác) ...

@router.put("/records/{record_id}/diagnose")
def doctor_update_diagnosis(
    record_id: str,
    payload: DoctorDiagnosisRequest, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Bác sĩ thẩm định kết quả AI -> Lưu vào bảng DoctorValidation
    """
    if current_user.role != UserRole.DOCTOR:
        raise HTTPException(status_code=403, detail="Chỉ bác sĩ mới có quyền chẩn đoán")

    service = DoctorService(db)
    
    updated_validation = service.update_diagnosis(
        record_id=record_id,
        diagnosis=payload.doctor_diagnosis,
        notes=payload.doctor_notes,
        is_correct=payload.is_correct, # Truyền biến này vào service
        doctor_id=current_user.id,
        feedback=payload.feedback_for_ai,
        ai_detailed_report=payload.ai_detailed_report
    )
    
    return {
        "message": "Đã lưu thẩm định thành công",
        "record_id": record_id,
        "is_correct": updated_validation.is_correct,
        "feedback_saved": bool(updated_validation.feedback_for_ai)
    }

@router.get("/records/{record_id}/report-detail")
def get_report_detail_api(
    record_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    API lấy dữ liệu chi tiết (Tên BN, BS, KQ AI) để hiển thị lên trang Report
    """
    if current_user.role != UserRole.DOCTOR:
        raise HTTPException(status_code=403, detail="Chỉ bác sĩ mới có quyền truy cập")
        
    service = DoctorService(db)
    return service.get_report_detail(record_id, current_user.id)