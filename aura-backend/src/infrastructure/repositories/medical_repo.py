from sqlalchemy.orm import Session, joinedload
from uuid import UUID
from typing import List, Optional

# --- 1. IMPORT INTERFACE TỪ DOMAIN ---
# Đây là bước quan trọng nhất để kết nối "Luật chơi" (Domain) với "Cách chơi" (Infrastructure)
from domain.models.imedical_repository import IMedicalRepository

# Import Models (Giữ nguyên như cũ)
from models.medical import Patient, RetinalImage, AIAnalysisResult, DoctorValidation
from models.enums import ImageType, EyeSide
from models.users import User

# --- 2. KẾ THỪA INTERFACE ---
class MedicalRepository(IMedicalRepository):
    def __init__(self, db: Session):
        self.db = db

    # --- Triển khai các hàm đã định nghĩa trong Interface ---

    def get_patient_by_user_id(self, user_id: UUID) -> Optional[Patient]:
        return self.db.query(Patient).filter(Patient.user_id == user_id).first()

    def create_patient_record(self, user_id: UUID, dob=None, gender=None) -> Patient:
        patient = self.get_patient_by_user_id(user_id)
        if not patient:
            patient = Patient(user_id=user_id, dob=dob, gender=gender)
            self.db.add(patient)
            self.db.commit()
            self.db.refresh(patient)
        return patient

    def save_image(self, patient_id: UUID, uploader_id: UUID, image_url: str, eye_side: EyeSide) -> RetinalImage:
        new_image = RetinalImage(
            patient_id=patient_id,
            uploader_id=uploader_id,
            image_url=image_url,
            image_type=ImageType.FUNDUS,
            eye_side=eye_side
        )
        self.db.add(new_image)
        self.db.commit()
        self.db.refresh(new_image)
        return new_image

    def get_image_by_id(self, image_id: str) -> Optional[RetinalImage]:
        return self.db.query(RetinalImage).filter(RetinalImage.id == image_id).first()

    def save_analysis_result(self, image_id: UUID, risk_level: str, vessel_data: dict, annotated_url: str, report_content: str = None) -> AIAnalysisResult:
        try:
            new_result = AIAnalysisResult(
                image_id=image_id,
                risk_level=risk_level,
                vessel_details=vessel_data, 
                annotated_image_url=annotated_url,
                ai_detailed_report=report_content,
                ai_version="v1.0-onnx"
            )
            self.db.add(new_result)
            self.db.commit()
            self.db.refresh(new_result)
            return new_result
        except Exception as e:
            self.db.rollback()
            # Có thể log error tại đây
            raise e

    def get_records_by_uploader(self, user_id: UUID, skip: int = 0, limit: int = 100) -> List[RetinalImage]:
        return self.db.query(RetinalImage).filter(RetinalImage.uploader_id == user_id).offset(skip).limit(limit).all()

    def get_all_records(self, skip: int = 0, limit: int = 100) -> List[RetinalImage]:
        return self.db.query(RetinalImage).offset(skip).limit(limit).all()

    def get_record_by_id(self, record_id: str) -> Optional[RetinalImage]:
        return (
            self.db.query(RetinalImage)
            # Load thông tin Bệnh nhân
            .options(
                joinedload(RetinalImage.patient)
                .joinedload(Patient.user)
                .joinedload(User.profile)
            )
            # Load thông tin Kết quả & Bác sĩ
            .options(
                joinedload(RetinalImage.analysis_result)
                .joinedload(AIAnalysisResult.doctor_validation)
                .joinedload(DoctorValidation.doctor)
                .joinedload(User.profile)
            )
            .filter(RetinalImage.id == record_id)
            .first()
        )
    
    def get_by_patient_id(self, user_id: str, skip: int = 0, limit: int = 100) -> List[RetinalImage]:
        return (
            self.db.query(RetinalImage)
            .join(Patient, RetinalImage.patient_id == Patient.id)
            .filter(Patient.user_id == user_id)
            .options(
                joinedload(RetinalImage.analysis_result)
                .joinedload(AIAnalysisResult.doctor_validation)
            )
            .order_by(RetinalImage.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )
    
    def count_all_records(self) -> int:
        return self.db.query(RetinalImage).count()
    
    def get_ai_validation_stats(self) -> dict:
        # 1. Đếm tổng số ca bác sĩ đã xác nhận
        total_validated = self.db.query(DoctorValidation).filter(
            DoctorValidation.doctor_confirm.isnot(None)
        ).count()
        
        if total_validated == 0:
            return {"total_validated": 0, "correct_ai": 0}

        # 2. Đếm số ca AI đoán đúng (So sánh risk_level vs doctor_confirm)
        correct_ai = self.db.query(DoctorValidation).join(
            AIAnalysisResult, 
            DoctorValidation.analysis_id == AIAnalysisResult.id
        ).filter(
            DoctorValidation.doctor_confirm.isnot(None),
            DoctorValidation.doctor_confirm == AIAnalysisResult.risk_level
        ).count()

        return {
            "total_validated": total_validated,
            "correct_ai": correct_ai
        }
    
    def assign_patient_to_clinic(self, user_id: UUID, clinic_id: UUID) -> bool:
        # Tìm hồ sơ bệnh nhân của user này
        patient = self.db.query(Patient).filter(Patient.user_id == user_id).first()
        
        if patient:
            # Nếu đã có hồ sơ -> Update
            patient.clinic_id = clinic_id
        else:
            # Nếu chưa có -> Tạo mới (Tự động tạo hồ sơ trống khi join phòng khám)
            patient = Patient(user_id=user_id, clinic_id=clinic_id)
            self.db.add(patient)
            
        self.db.commit()
        return True