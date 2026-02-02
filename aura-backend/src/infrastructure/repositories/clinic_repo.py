from sqlalchemy import func, and_
from sqlalchemy.orm import Session, joinedload
from uuid import UUID
from typing import List, Optional
from datetime import datetime

# Import Interface
from domain.models.iclinic_repository import IClinicRepository

# Import Models
from models.clinic import Clinic
from models.enums import ClinicStatus
from models.medical import RetinalImage, AIAnalysisResult, Patient
from models.users import User
from models.clinic import Clinic

class ClinicRepository(IClinicRepository):
    def __init__(self, db: Session):
        self.db = db

    def create_clinic(self, admin_id: UUID, name: str, address: str, phone_number: str, image_url: str = None, description: str = None) -> Clinic:
        clinic = Clinic(
            admin_id=admin_id,
            name=name,
            address=address,
            phone_number=phone_number,
            image_url=image_url,
            description=description,
            status=ClinicStatus.PENDING
        )
        self.db.add(clinic)
        self.db.commit()
        self.db.refresh(clinic)
        return clinic

    def get_all_clinics(self) -> List[Clinic]:
        return self.db.query(Clinic).all()

    def get_clinic_by_id(self, clinic_id: str) -> Optional[Clinic]:
        return self.db.query(Clinic).filter(Clinic.id == clinic_id).first()
    
    def get_unverified_clinics(self) -> List[Clinic]:
        return self.db.query(Clinic).options(joinedload(Clinic.admin)).filter(
            Clinic.status == ClinicStatus.PENDING
        ).all()

    def verify_clinic(self, clinic_id: str, status: str) -> Optional[Clinic]:
        clinic = self.get_clinic_by_id(clinic_id)
        if not clinic: return None
        
        if status == 'APPROVED':
            clinic.status = ClinicStatus.APPROVED
        elif status == 'REJECTED':
            clinic.status = ClinicStatus.REJECTED
        elif status == 'SUSPENDED':   # <--- THÊM DÒNG NÀY
            clinic.status = ClinicStatus.SUSPENDED 
        elif status == 'ACTIVE':      # (Tùy chọn) Để mở lại
            clinic.status = ClinicStatus.APPROVED
        else:
            return None
        
        self.db.commit()
        self.db.refresh(clinic)
        return clinic
    
    def get_by_admin_id(self, admin_id: UUID) -> Optional[Clinic]:
        return self.db.query(Clinic).filter(Clinic.admin_id == admin_id).first()
    
    def get_screening_stats_by_date(self, clinic_id: UUID, start_date: datetime, end_date: datetime):
        """
        Đếm số lượng ca theo từng mức độ rủi ro (Risk Level) trong khoảng thời gian.
        """
        return (
            self.db.query(
                AIAnalysisResult.risk_level, 
                func.count(AIAnalysisResult.id).label("count")
            )
            .join(RetinalImage, AIAnalysisResult.image_id == RetinalImage.id)
            .join(Patient, RetinalImage.patient_id == Patient.id)
            .join(User, Patient.user_id == User.id)
            .filter(
                User.clinic_id == clinic_id,
                RetinalImage.created_at >= start_date,
                RetinalImage.created_at <= end_date
            )
            .group_by(AIAnalysisResult.risk_level)
            .all()
        )

    def get_high_risk_patients_in_range(self, clinic_id: UUID, start_date: datetime, end_date: datetime):
        """
        Lấy danh sách chi tiết các ca 'SEVERE' hoặc 'PDR' để bác sĩ follow-up.
        """
        risk_keywords = ['SEVERE', 'PDR', 'NẶNG', 'CAO'] # Các từ khóa nguy cơ cao
        
        # Tạo điều kiện OR cho các từ khóa
        risk_condition = [AIAnalysisResult.risk_level.ilike(f"%{k}%") for k in risk_keywords]

        return (
            self.db.query(RetinalImage)
            .join(AIAnalysisResult, RetinalImage.id == AIAnalysisResult.image_id)
            .join(Patient, RetinalImage.patient_id == Patient.id)
            .join(User, Patient.user_id == User.id)
            .options(
                joinedload(RetinalImage.analysis_result),
                joinedload(RetinalImage.patient).joinedload(Patient.user)
            )
            .filter(
                User.clinic_id == clinic_id,
                RetinalImage.created_at >= start_date,
                RetinalImage.created_at <= end_date,
                *risk_condition # Unpack list điều kiện
            )
            .order_by(RetinalImage.created_at.desc())
            .all()
        )
    
    def get_research_data(self, clinic_id: UUID, start_date: datetime, end_date: datetime):
        return (
            self.db.query(RetinalImage)
            .join(AIAnalysisResult, RetinalImage.id == AIAnalysisResult.image_id)
            .join(Patient, RetinalImage.patient_id == Patient.id)
            .join(User, Patient.user_id == User.id)
            # Load thêm thông tin validate của bác sĩ (nếu cần so sánh AI vs Bác sĩ)
            .options(
                joinedload(RetinalImage.analysis_result).joinedload(AIAnalysisResult.doctor_validation),
                joinedload(RetinalImage.patient).joinedload(Patient.user) # Load User để lấy giới tính/tuổi từ profile
            )
            .filter(
                User.clinic_id == clinic_id,
                RetinalImage.created_at >= start_date,
                RetinalImage.created_at <= end_date
            )
            .order_by(RetinalImage.created_at.desc())
            .all()
        )