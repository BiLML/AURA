import uuid
from sqlalchemy import Column, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from .base import Base

class Notification(Base):
    __tablename__ = "notifications" # Tên bảng mới

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False) # Người nhận
    title = Column(String, nullable=False)   # Tiêu đề (VD: Chào mừng...)
    content = Column(Text, nullable=False)   # Nội dung
    is_read = Column(Boolean, default=False) # Đã xem chưa?
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Loại thông báo (Optional): INFO, WARNING, ERROR...
    type = Column(String, default="INFO")