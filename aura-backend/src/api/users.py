from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from core.database import get_db
from core.security import get_current_user

from services.user_service import UserService
from schemas.user_schema import UserResponse, UserProfileUpdate, UserUpdateCredentials, UserPrivacyUpdate

from models.users import User
from models.enums import UserRole

from infrastructure.repositories.user_repo import UserRepository
from infrastructure.repositories.notification_repo import NotificationRepository
from infrastructure.repositories.user_notification_repo import UserNotificationRepository
from infrastructure.repositories.audit_repo import AuditRepository

router = APIRouter()


def get_user_service(db: Session = Depends(get_db)) -> UserService:
    user_repo = UserRepository(db)
    noti_template_repo = NotificationRepository(db)
    user_noti_repo = UserNotificationRepository(db)
    audit_repo = AuditRepository(db)
    
    # Truyền đủ tham số vào Service
    return UserService(
        user_repo=user_repo, 
        noti_template_repo=noti_template_repo,
        user_noti_repo=user_noti_repo,
        audit_repo=audit_repo,
        db=db
    )

@router.get("/me", response_model=UserResponse)
def read_users_me(
    current_user = Depends(get_current_user),
    service: UserService = Depends(get_user_service) # <--- Inject Service
):
    # Thay vì return current_user (thiếu field consent), ta gọi service
    return service.get_current_user_info(current_user.id)

@router.put("/me")
def update_my_profile(
    update_data: UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    service: UserService = Depends(get_user_service) # Inject
):
    return service.update_user_profile(user_id=current_user.id, update_data=update_data)

@router.put("/set-username")
def set_username_endpoint(
    data: UserUpdateCredentials,
    current_user: User = Depends(get_current_user),
    service: UserService = Depends(get_user_service) # Inject
):
    return service.set_username_password(user_id=current_user.id, data=data)

@router.put("/me/privacy")
def update_my_privacy(
    req: UserPrivacyUpdate,
    current_user: User = Depends(get_current_user),
    service: UserService = Depends(get_user_service)
):
    """
    Cho phép người dùng tự Bật/Tắt quyền sử dụng dữ liệu để huấn luyện AI.
    """
    return service.update_privacy_settings(
        user_id=current_user.id, 
        consent=req.consent_for_training
    )

@router.get("/me/notifications")
def get_my_notifications(
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Gọi Repo lấy danh sách thông báo của user hiện tại
    repo = UserNotificationRepository(db)
    notis = repo.get_by_user(current_user.id)
    
    return {
        "notifications": [
            {
                "id": str(n.id),
                "title": n.title,
                "content": n.content,
                "is_read": n.is_read,
                "created_at": n.created_at,
                "type": n.type # Nếu model có cột này
            } for n in notis
        ]
    }

@router.put("/me/notifications/{noti_id}/read")
def mark_notification_read(
    noti_id: str,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    repo = UserNotificationRepository(db)
    # Cần validate xem notification này có đúng là của current_user không (trong thực tế)
    success = repo.mark_as_read(noti_id)
    if not success:
        raise HTTPException(status_code=404, detail="Không tìm thấy thông báo")
    return {"message": "Đã đánh dấu đã đọc"}