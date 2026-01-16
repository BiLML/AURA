from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from typing import Any

from core.database import get_db
# ⚠️ Lưu ý: Đảm bảo bạn import đúng dependency lấy user từ project của bạn
# Ví dụ: from api.deps import get_current_active_user
from core.security import get_current_active_user 

from models.users import User
from schemas.chat_schema import MessageCreate
from services.chat_service import ChatService

from services.chat_service import ChatService
from infrastructure.repositories.chat_repo import ChatRepository
from infrastructure.repositories.user_repo import UserRepository

router = APIRouter()

def get_chat_service(db: Session = Depends(get_db)) -> ChatService:
    chat_repo = ChatRepository(db)
    user_repo = UserRepository(db)
    return ChatService(chat_repo=chat_repo, user_repo=user_repo, db=db)

@router.get("")
def get_chats(
    current_user: User = Depends(get_current_active_user),
    service: ChatService = Depends(get_chat_service) # <--- Inject
):
    chats = service.get_recent_chats(current_user.id)
    return {"chats": chats}

@router.get("/history/{partner_id}")
def get_history(
    partner_id: str,
    service: ChatService = Depends(get_chat_service),
    current_user: User = Depends(get_current_active_user),
):
    """Lấy nội dung chat với một người"""
    try:
        messages = service.get_chat_history(current_user.id, partner_id)
        return {"messages": messages}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/send")
def send_message(
    msg_in: MessageCreate,
    service: ChatService = Depends(get_chat_service),
    current_user: User = Depends(get_current_active_user),
):
    """Gửi tin nhắn mới"""
    try:
        new_msg = service.send_message(current_user.id, msg_in)
        return {"status": "success", "msg_id": str(new_msg.id)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/read/{partner_id}")
def mark_read(
    partner_id: str,
    service: ChatService = Depends(get_chat_service),
    current_user: User = Depends(get_current_active_user),
):
    """Đánh dấu đã đọc"""
    service.mark_read(current_user.id, partner_id)
    return {"status": "marked as read"}