from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime

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

    @abstractmethod
    def get_screening_stats_by_date(self, clinic_id: UUID, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
        """Lấy thống kê kết quả sàng lọc theo khoảng thời gian"""
        pass
    
    @abstractmethod
    def get_high_risk_patients_in_range(self, clinic_id: UUID, start_date: datetime, end_date: datetime) -> List[Any]:
        """Lấy danh sách bệnh nhân có kết quả nặng trong khoảng thời gian"""
        pass

    @abstractmethod
    def get_research_data(self, clinic_id: UUID, start_date: datetime, end_date: datetime) -> List[Any]:
        """Lấy dữ liệu thô (đã ẩn danh) phục vụ nghiên cứu"""
        pass