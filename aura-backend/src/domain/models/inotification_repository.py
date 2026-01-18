from abc import ABC, abstractmethod
from typing import List, Optional
from models.notification_template import NotificationTemplate

class INotificationRepository(ABC):
    @abstractmethod
    def get_all(self) -> List[NotificationTemplate]: pass

    @abstractmethod
    def get_by_code(self, code: str) -> Optional[NotificationTemplate]: pass

    @abstractmethod
    def update(self, template: NotificationTemplate) -> NotificationTemplate: pass

    @abstractmethod
    def create(self, template: NotificationTemplate) -> NotificationTemplate: pass
    
    @abstractmethod
    def init_defaults(self): pass