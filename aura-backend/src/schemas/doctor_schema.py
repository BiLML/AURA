from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class LatestScan(BaseModel):
    record_id: Optional[str] = None
    ai_result: Optional[str] = "Chưa khám"
    ai_analysis_status: Optional[str] = "PENDING"
    upload_date: Optional[datetime] = None

class PatientResponse(BaseModel):
    id: str
    userName: str
    full_name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    medical_info: Optional[dict] = None
    latest_scan: Optional[LatestScan] = None

class MyPatientsResponse(BaseModel):
    patients: List[PatientResponse]

class DoctorDiagnosisUpdate(BaseModel):
    doctor_diagnosis: str          # Kết luận của bác sĩ
    doctor_notes: Optional[str] = None # Ghi chú chi tiết

class DoctorDiagnosisRequest(BaseModel):
    doctor_diagnosis: str          # Sẽ lưu vào feedback_for_ai
    doctor_notes: Optional[str] = ""
    is_correct: bool = True        # Mặc định là AI đúng
    feedback_for_ai: Optional[str] = None  # Phản hồi chi tiết cho AI
    ai_detailed_report: Optional[str] = None  # Báo cáo chi tiết của AI
    doctor_drawing: Optional[str] = None  # Nhận chuỗi Base64 từ canvas