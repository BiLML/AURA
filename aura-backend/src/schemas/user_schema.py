from pydantic import BaseModel, EmailStr
from typing import Any, Optional, List
from uuid import UUID
from datetime import datetime, date
from models.enums import UserRole, UserStatus

# --- Base & Profile Schemas ---
class ProfileBase(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None

class ProfileResponse(ProfileBase):
    medical_info: Optional[Any] = None  # Lưu tiền sử bệnh, dị ứng...
    class Config:
        from_attributes = True

# --- INPUT Schemas (Frontend gửi lên) ---
class UserCreate(BaseModel):
    username: str   # Bắt buộc
    email: EmailStr
    password: str
    full_name: str
    phone: Optional[str] = None
    role: UserRole = UserRole.USER

class UserLogin(BaseModel):
    username_or_email: str 
    password: str

# --- OUTPUT Schemas (Backend trả về) ---
class UserSubscriptionDTO(BaseModel):
    plan_name: str
    remaining_analyses: int
    total_limit: int
    
    class Config:
        from_attributes = True

class UserResponse(BaseModel):
    id: UUID
    username: str
    email: str
    role: UserRole
    status: UserStatus
    created_at: datetime
    
    profile: Optional[ProfileResponse] = None

    subscription: Optional[UserSubscriptionDTO] = None
    consent_for_training: bool = False

    class Config:
        from_attributes = True

# Thêm class này vào
class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    date_of_birth: Optional[date] = None       # Để Any vì frontend có thể gửi string/int
    hometown: Optional[str] = None
    insurance_id: Optional[str] = None
    height: Optional[Any] = None
    weight: Optional[Any] = None
    gender: Optional[str] = None
    nationality: Optional[str] = None

    class Config:
        from_attributes = True

class GoogleLoginSchema(BaseModel):
    token: str

class UserUpdateCredentials(BaseModel):
    new_username: str
    new_password: str

class FacebookLoginSchema(BaseModel):
    accessToken: str
    userID: str

class ForgotPasswordSchema(BaseModel):
    email: EmailStr

class ResetPasswordSchema(BaseModel):
    token: str
    new_password: str

class UserPrivacyUpdate(BaseModel):
    consent_for_training: bool # True = Đồng ý, False = Từ chối