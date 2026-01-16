from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from core.database import get_db
from core.security import get_current_user
from services.user_service import UserService
from schemas.user_schema import UserResponse, UserProfileUpdate, UserUpdateCredentials
from models.users import User
from models.enums import UserRole
from infrastructure.repositories.user_repo import UserRepository


router = APIRouter()


def get_user_service(db: Session = Depends(get_db)) -> UserService:
    repo = UserRepository(db)
    return UserService(user_repo=repo, db=db) # Nhớ truyền cả db vì init của UserService vẫn còn giữ db

@router.get("/me", response_model=UserResponse)
def read_users_me(current_user = Depends(get_current_user)):
    # current_user đã được lấy từ token thông qua hàm get_current_user trong core/security.py
    return current_user

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
