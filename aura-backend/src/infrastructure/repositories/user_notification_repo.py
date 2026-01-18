from sqlalchemy.orm import Session
from sqlalchemy import desc
from domain.models.iuser_notification_repository import IUserNotificationRepository
from models.notification import Notification

class UserNotificationRepository(IUserNotificationRepository):
    def __init__(self, db: Session):
        self.db = db

    def create(self, user_id, title: str, content: str) -> Notification:
        new_noti = Notification(user_id=user_id, title=title, content=content)
        self.db.add(new_noti)
        self.db.commit()
        self.db.refresh(new_noti)
        return new_noti

    def get_by_user(self, user_id, limit: int = 20):
        return self.db.query(Notification)\
            .filter(Notification.user_id == user_id)\
            .order_by(desc(Notification.created_at))\
            .limit(limit).all()

    def mark_as_read(self, notification_id):
        noti = self.db.query(Notification).filter(Notification.id == notification_id).first()
        if noti:
            noti.is_read = True
            self.db.commit()
            return True
        return False