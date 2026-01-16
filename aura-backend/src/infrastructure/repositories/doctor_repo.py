from sqlalchemy.orm import Session
from sqlalchemy import desc
from uuid import UUID
from typing import List, Optional

# Import Interface
from domain.models.idoctor_repository import IDoctorRepository

# Import Models
from models.users import User
from models.medical import RetinalImage, AIAnalysisResult
from models.enums import UserRole

class DoctorRepository(IDoctorRepository):
    def __init__(self, db: Session):
        self.db = db

    def get_assigned_patients(self, doctor_id: UUID) -> List[User]:
        """Lấy danh sách bệnh nhân được phân công cho bác sĩ này"""
        return self.db.query(User).filter(
            User.assigned_doctor_id == doctor_id,
            User.role == UserRole.USER
        ).all()

    def get_latest_scan(self, patient_id: UUID) -> Optional[RetinalImage]:
        """Lấy kết quả khám mới nhất của bệnh nhân"""
        return self.db.query(RetinalImage).join(
            AIAnalysisResult, RetinalImage.id == AIAnalysisResult.image_id, isouter=True
        ).filter(
            RetinalImage.uploader_id == patient_id
        ).order_by(
            desc(RetinalImage.created_at)
        ).first()