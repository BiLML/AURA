# src/domain/models/iaudit_repository.py
from abc import ABC, abstractmethod
from models.audit_log import AuditLog
from typing import List

class IAuditRepository(ABC):
    @abstractmethod
    def create_log(self, log_entry: AuditLog) -> AuditLog:
        pass

    @abstractmethod
    def get_recent_logs(self, limit: int = 50) -> List[AuditLog]:
        pass