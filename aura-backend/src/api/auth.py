# FILE: src/api/auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta

from core.database import get_db
from core.security import create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from services.user_service import UserService
from schemas.user_schema import UserCreate, UserResponse, GoogleLoginSchema, FacebookLoginSchema, ForgotPasswordSchema, ResetPasswordSchema
from infrastructure.repositories.user_repo import UserRepository
from models.enums import UserStatus


router = APIRouter()

# Hàm Dependency Factory
def get_user_service(db: Session = Depends(get_db)) -> UserService:
    repo = UserRepository(db)
    return UserService(user_repo=repo, db=db) 

@router.post("/register", response_model=UserResponse)
def register(
    user_in: UserCreate, 
    # 👇 SỬA: Inject Service vào tham số (Bỏ db thừa)
    service: UserService = Depends(get_user_service) 
):
    return service.register_user(user_in)

@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    # 👇 SỬA: Inject Service vào tham số (Quan trọng nhất để fix lỗi 500)
    service: UserService = Depends(get_user_service)
):
    # form_data.username ở đây có thể là username hoặc email
    user = service.authenticate_user(form_data.username, form_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản hoặc mật khẩu không chính xác",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Tài khoản chưa được kích hoạt hoặc bị khóa.")

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role}, 
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "role": user.role
    }

@router.post("/google-login")
def google_login_api(
    schema: GoogleLoginSchema, 
    # 👇 SỬA: Inject Service vào tham số
    service: UserService = Depends(get_user_service)
):
    """
    API này nhận Access Token từ React gửi lên
    """
    return service.google_login(token=schema.token)

@router.post("/facebook-login")
def facebook_login_api(
    schema: FacebookLoginSchema, 
    # 👇 SỬA: Inject Service vào tham số
    service: UserService = Depends(get_user_service)
):
    """
    API nhận Access Token và UserID từ React Facebook Login
    """
    return service.facebook_login(token=schema.accessToken, user_id_from_fe=schema.userID)

@router.post("/forgot-password")
async def forgot_password_api(
    schema: ForgotPasswordSchema, 
    # 👇 SỬA: Inject Service vào tham số
    service: UserService = Depends(get_user_service)
):
    # Thêm 'await' vì service là async (gửi mail)
    return await service.forgot_password(schema.email)

@router.post("/reset-password")
def reset_password_api(
    schema: ResetPasswordSchema, 
    # 👇 SỬA: Inject Service vào tham số
    service: UserService = Depends(get_user_service)
):
    return service.reset_password(token=schema.token, new_password=schema.new_password)