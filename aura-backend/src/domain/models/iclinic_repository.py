from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from uuid import UUID

from models.clinic import Clinic



# 4. INTERFACE CHO CLINIC
class IClinicRepository(ABC):
    @abstractmethod
    def create_clinic(self, admin_id: UUID, name: str, address: str, phone_number: str, image_url: str = None, description: str = None) -> Clinic: pass

    @abstractmethod
    def get_all_clinics(self) -> List[Clinic]: pass

    @abstractmethod
    def get_clinic_by_id(self, clinic_id: str) -> Optional[Clinic]: pass
    
    @abstractmethod
    def get_unverified_clinics(self) -> List[Clinic]: pass

    @abstractmethod
    def verify_clinic(self, clinic_id: str, status: str) -> Optional[Clinic]: pass

    @abstractmethod
    def get_by_admin_id(self, admin_id: UUID) -> Optional[Clinic]: pass