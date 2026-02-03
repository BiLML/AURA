from abc import ABC, abstractmethod
from typing import List, Optional, Union, Dict, Any
from uuid import UUID
from datetime import date
from models.enums import EyeSide

from models.medical import Patient, RetinalImage, AIAnalysisResult

# 2. INTERFACE CHO MEDICAL (BỆNH ÁN & ẢNH)
class IMedicalRepository(ABC):
    # Patient
    @abstractmethod
    def get_patient_by_user_id(self, user_id: UUID) -> Optional[Patient]: pass

    @abstractmethod
    def create_patient_record(self, user_id: UUID, dob: date = None, gender: str = None) -> Patient: pass

    # Images
    @abstractmethod
    def save_image(self, patient_id: UUID, uploader_id: UUID, image_url: str, eye_side: EyeSide) -> RetinalImage: pass

    @abstractmethod
    def get_image_by_id(self, image_id: str) -> Optional[RetinalImage]: pass
    
    @abstractmethod
    def get_records_by_uploader(self, user_id: UUID, skip: int = 0, limit: int = 100) -> List[RetinalImage]: pass

    @abstractmethod
    def get_all_records(self, skip: int = 0, limit: int = 100) -> List[RetinalImage]: pass

    @abstractmethod
    def get_record_by_id(self, record_id: str) -> Optional[RetinalImage]: pass

    @abstractmethod
    def get_by_patient_id(self, user_id: str, skip: int = 0, limit: int = 100) -> List[RetinalImage]: pass

    # Analysis
    @abstractmethod
    def save_analysis_result(self, image_id: UUID, risk_level: str, vessel_data: dict, annotated_url: str, report_content: str = None) -> AIAnalysisResult: pass

    @abstractmethod
    def count_all_records(self) -> int: pass

    @abstractmethod
    def get_ai_validation_stats(self) -> dict: pass

    @abstractmethod
    def assign_patient_to_clinic(self, user_id: UUID, clinic_id: UUID) -> bool: pass

    @abstractmethod
    def get_risk_distribution_stats(self) -> list: pass

    @abstractmethod
    def get_upload_trends_last_7_days(self) -> list: pass

    @abstractmethod
    def update_image_url(self, image_id: Union[UUID, int, str], new_url: str) -> bool: 
        pass

    @abstractmethod
    def update_analysis_result(self, result_id: Union[UUID, int, str], risk_level: str, annotated_url: str, report_content: str) -> bool:
        pass

    @abstractmethod
    def get_upload_trends(self, days: int = 7) -> List[Dict[str, Any]]:
        """Lấy thống kê số lượt upload ảnh theo ngày"""
        pass