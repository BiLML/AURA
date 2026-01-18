from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID

from models.users import User
from models.enums import UserRole

from schemas.user_schema import UserCreate





# 1. INTERFACE CHO USER
class IUserRepository(ABC):
    @abstractmethod
    def get_by_email(self, email: str) -> Optional[User]: pass

    @abstractmethod
    def get_by_username(self, username: str) -> Optional[User]: pass

    @abstractmethod
    def get_by_id(self, user_id: str) -> Optional[User]: pass

    @abstractmethod
    def update(self, user: User) -> User:
        pass

    @abstractmethod
    def create_user(self, user_data: UserCreate, hashed_password: str) -> User: pass
    
    @abstractmethod
    def get_all_users(self, skip: int = 0, limit: int = 100) -> List[User]: pass

    @abstractmethod
    def get_doctors_by_clinic_id(self, clinic_id: UUID) -> List[User]: pass
    
    @abstractmethod
    def get_patients_by_clinic_id(self, clinic_id: UUID) -> List[User]: pass

    @abstractmethod
    def search_users_by_role(self, role: UserRole, query: str) -> List[User]:
        pass

    @abstractmethod
    def count_users(self) -> int: pass

    @abstractmethod
    def count_patients_by_doctor_id(self, doctor_id: UUID) -> int: pass

    @abstractmethod
    def update_patient_consent(self, user_id: UUID, consent: bool) -> bool:
        pass

    @abstractmethod
    def release_all_members_from_clinic(self, clinic_id: UUID):
        pass
