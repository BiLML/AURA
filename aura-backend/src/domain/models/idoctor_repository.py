from typing import Dict, Any

from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID

from models.users import User
from models.medical import RetinalImage




# 3. INTERFACE CHO DOCTOR
class IDoctorRepository(ABC):
    @abstractmethod
    def get_assigned_patients(self, doctor_id: UUID) -> List[User]: pass

    @abstractmethod
    def get_latest_scan(self, patient_id: UUID) -> Optional[RetinalImage]: pass

    @abstractmethod
    def get_feedback_by_doctor_id(self, doctor_id: UUID): pass

    @abstractmethod
    def get_doctor_statistics(self, doctor_id: UUID) -> Dict[str, Any]:
        """Lấy các chỉ số thống kê hiệu suất của bác sĩ"""
        pass
    @abstractmethod
    def get_critical_unreviewed_records(self, doctor_id: UUID):
        pass