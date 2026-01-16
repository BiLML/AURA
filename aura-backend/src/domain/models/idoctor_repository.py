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