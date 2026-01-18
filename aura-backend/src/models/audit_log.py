# models/audit_log.py
from sqlalchemy import Column, String, DateTime, JSON, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime
from .base import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False) # Người thực hiện
    action = Column(String(100), nullable=False)        # VD: "UPDATE_AI_CONFIG", "DELETE_PATIENT"
    resource_type = Column(String(50))                  # Loại dữ liệu: "system_configs", "users"
    resource_id = Column(String(100))                   # ID của bản ghi bị tác động
    old_values = Column(JSON)                           # Giá trị trước khi đổi
    new_values = Column(JSON)                           # Giá trị sau khi đổi
    ip_address = Column(String(45))
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship
    user = relationship("User")