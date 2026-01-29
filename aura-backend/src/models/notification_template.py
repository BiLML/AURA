from sqlalchemy import Column, String, Text, DateTime
from sqlalchemy.sql import func
from .base import Base
class NotificationTemplate(Base):
    __tablename__ = "notification_templates"

    code = Column(String, primary_key=True, index=True) # VD: "WELCOME_USER"
    name = Column(String, nullable=False)               # VD: "Email Chào mừng"
    subject = Column(String, nullable=False)            # VD: "Chào mừng {username}..."
    content = Column(Text, nullable=False)              # Nội dung HTML
    available_variables = Column(String, nullable=True) # VD: "username, link"
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())