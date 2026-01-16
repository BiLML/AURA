from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from uuid import UUID

from models.users import User
from models.chat import Message

# 6. INTERFACE CHO CHAT
class IChatRepository(ABC):
    @abstractmethod
    def create(self, sender_id: UUID, receiver_id: UUID, content: str) -> Message: pass

    @abstractmethod
    def get_all_by_user(self, user_id: UUID) -> List[Message]: pass

    @abstractmethod
    def get_conversation(self, user_id: UUID, partner_id: UUID) -> List[Message]: pass

    @abstractmethod
    def mark_as_read(self, user_id: UUID, partner_id: UUID) -> None: pass
    
    @abstractmethod
    def get_user_info(self, user_id: UUID) -> Optional[User]: pass