# src/infrastructure/repositories/audit_repo.py
from sqlalchemy.orm import Session, joinedload
from domain.models.iaudit_repository import IAuditRepository
from models.audit_log import AuditLog

class AuditRepository(IAuditRepository):
    def __init__(self, db: Session):
        self.db = db

    def create_log(self, log_entry: AuditLog) -> AuditLog:
        self.db.add(log_entry)
        self.db.commit()
        self.db.refresh(log_entry)
        return log_entry
    
    def get_recent_logs(self, limit: int = 50):
        return (
            self.db.query(AuditLog)
            .options(joinedload(AuditLog.user)) # Join để lấy tên người làm
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
            .all()
        )