from abc import ABC, abstractmethod
from models.notification import Notification
from typing import List

class IUserNotificationRepository(ABC):
    @abstractmethod
    def create(self, user_id, title: str, content: str) -> Notification: pass

    @abstractmethod
    def get_by_user(self, user_id, limit: int = 20) -> List[Notification]: pass
    
    @abstractmethod
    def mark_as_read(self, notification_id) -> bool: pass