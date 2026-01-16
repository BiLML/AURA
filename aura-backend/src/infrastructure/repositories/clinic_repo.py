from sqlalchemy.orm import Session, joinedload
from uuid import UUID
from typing import List, Optional

# Import Interface
from domain.models.iclinic_repository import IClinicRepository

# Import Models
from models.clinic import Clinic
from models.enums import ClinicStatus

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
        else:
            return None
        
        self.db.commit()
        self.db.refresh(clinic)
        return clinic