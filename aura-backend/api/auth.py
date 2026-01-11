from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta

from core.database import get_db
from core.security import create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
from services.user_service import UserService
from schemas.user_schema import UserCreate, UserResponse, GoogleLoginSchema, FacebookLoginSchema, ForgotPasswordSchema, ResetPasswordSchema



router = APIRouter()
 

@router.post("/register", response_model=UserResponse)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    user_service = UserService(db)
    return user_service.register_user(user_in)

@router.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # form_data.username ở đây có thể là username hoặc email
    user_service = UserService(db)
    user = user_service.authenticate_user(form_data.username, form_data.password)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản hoặc mật khẩu không chính xác",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Tạo Token chứa ID và Role
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
def google_login_api(schema: GoogleLoginSchema, db: Session = Depends(get_db)):
    """
    API này nhận Access Token từ React gửi lên
    """
    user_service = UserService(db)
    # Gọi hàm google_login đã sửa ở bước 2
    return user_service.google_login(token=schema.token)

@router.post("/facebook-login")
def facebook_login_api(schema: FacebookLoginSchema, db: Session = Depends(get_db)):
    """
    API nhận Access Token và UserID từ React Facebook Login
    """
    user_service = UserService(db)
    return user_service.facebook_login(token=schema.accessToken, user_id_from_fe=schema.userID)

@router.post("/forgot-password")
async def forgot_password_api(schema: ForgotPasswordSchema, db: Session = Depends(get_db)):
    user_service = UserService(db)
    # Thêm 'await' vì service là async
    return await user_service.forgot_password(schema.email)

@router.post("/reset-password")
def reset_password_api(schema: ResetPasswordSchema, db: Session = Depends(get_db)):
    user_service = UserService(db)
    return user_service.reset_password(token=schema.token, new_password=schema.new_password)