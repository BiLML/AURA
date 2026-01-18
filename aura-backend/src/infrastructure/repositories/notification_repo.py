from sqlalchemy.orm import Session
from typing import List, Optional

from domain.models.inotification_repository import INotificationRepository
from models.notification_template import NotificationTemplate

class NotificationRepository(INotificationRepository):
    def __init__(self, db: Session):
        self.db = db

    def get_all(self) -> List[NotificationTemplate]:
        return self.db.query(NotificationTemplate).all()

    def get_by_code(self, code: str) -> Optional[NotificationTemplate]:
        return self.db.query(NotificationTemplate).filter(NotificationTemplate.code == code).first()

    def update(self, template: NotificationTemplate) -> NotificationTemplate:
        # Lưu ý: Hàm này nhận vào object đã thay đổi data, chỉ việc commit
        self.db.add(template)
        self.db.commit()
        self.db.refresh(template)
        return template

    def create(self, template: NotificationTemplate) -> NotificationTemplate:
        self.db.add(template)
        self.db.commit()
        return template

    def init_defaults(self):
        defaults = [
            {
                "code": "WELCOME_USER", "name": "Email Chào mừng",
                "subject": "Chào mừng {username} đến với Aura!",
                "content": "Xin chào {username}, ...", "available_variables": "username"
            },
            {
                "code": "CLINIC_APPROVED", "name": "Thông báo Duyệt",
                "subject": "Phòng khám {clinic_name} đã được duyệt",
                "content": "Chúc mừng...", "available_variables": "clinic_name"
            }
        ]
        for d in defaults:
            if not self.get_by_code(d["code"]):
                self.create(NotificationTemplate(**d))