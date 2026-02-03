# FILE: services/user_service.py

from sqlalchemy.orm import Session
from domain.models.iuser_repository import IUserRepository
from domain.models.inotification_repository import INotificationRepository
from domain.models.iuser_notification_repository import IUserNotificationRepository
from domain.models.iaudit_repository import IAuditRepository

from models.audit_log import AuditLog
from models.users import User, Profile
from models.enums import UserRole

from schemas.user_schema import UserCreate, UserLogin, UserProfileUpdate, UserUpdateCredentials, UserResponse
from core.security import get_password_hash, verify_password, create_access_token, SECRET_KEY, ALGORITHM

from fastapi import HTTPException, status
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType

import uuid
import secrets
import requests
import os
from jose import jwt, JWTError
from datetime import timedelta, date
from uuid import UUID

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

conf = ConnectionConfig(
    MAIL_USERNAME = os.getenv("MAIL_USERNAME"),
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD"),
    MAIL_FROM = os.getenv("MAIL_FROM"),
    MAIL_PORT = int(os.getenv("MAIL_PORT", 587)),
    MAIL_SERVER = os.getenv("MAIL_SERVER", "smtp.gmail.com"),
    MAIL_STARTTLS = True,
    MAIL_SSL_TLS = False,
    USE_CREDENTIALS = True,
    VALIDATE_CERTS = True
)

class UserService:
    def __init__(self, 
                 user_repo: IUserRepository, 
                 noti_template_repo: INotificationRepository, 
                 user_noti_repo: IUserNotificationRepository, 
                 audit_repo: IAuditRepository,
                 db: Session):
        self.user_repo = user_repo
        self.noti_template_repo = noti_template_repo 
        self.user_noti_repo = user_noti_repo 
        self.audit_repo = audit_repo
        self.db = db

    # --- HELPER: Gửi thông báo chào mừng ---
    def _send_welcome_notification(self, user):
        try:
            template = self.noti_template_repo.get_by_code("WELCOME_USER")
            if template:
                title = template.subject.format(username=user.username)
                content = template.content.format(username=user.username, email=user.email)
                self.user_noti_repo.create(user_id=user.id, title=title, content=content)
        except Exception as e:
            print(f"⚠️ Lỗi gửi thông báo chào mừng: {e}")

    # 1. REGISTER
    def register_user(self, user_data: UserCreate, ip_address: str = "Unknown"):
        if self.user_repo.get_by_username(user_data.username):
            raise HTTPException(status_code=400, detail="Username này đã tồn tại.")
        if self.user_repo.get_by_email(user_data.email):
            raise HTTPException(status_code=400, detail="Email này đã được sử dụng.")

        hashed_pwd = get_password_hash(user_data.password)
        new_user = self.user_repo.create_user(user_data, hashed_pwd)
        self._send_welcome_notification(new_user)

        # --- GHI LOG ---
        try:
            self.audit_repo.create_log(AuditLog(
                user_id=new_user.id,
                action="REGISTER",
                resource_type="users",
                resource_id=str(new_user.id),
                ip_address=ip_address,
                new_values={"username": new_user.username, "email": new_user.email}
            ))
        except Exception: pass
        # ----------------

        return new_user

    def authenticate_user(self, username_or_email: str, password: str):
        user = self.user_repo.get_by_username(username_or_email)
        if not user:
            user = self.user_repo.get_by_email(username_or_email)
        if not user or not verify_password(password, user.password_hash):
            return None
        return user
        
    def get_user_by_id(self, user_id: str):
        return self.user_repo.get_by_id(user_id)
    
    def update_user_profile(self, user_id: str, update_data: UserProfileUpdate):
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if update_data.email and update_data.email != user.email:
            user.email = update_data.email
        
        profile = user.profile
        if not profile:
            profile = Profile(user_id=user.id)
            self.db.add(profile)
        
        if update_data.full_name is not None: profile.full_name = update_data.full_name
        if update_data.phone is not None: profile.phone = update_data.phone
        
        current_info = profile.medical_info or {}
        updates_for_json = {
            "date_of_birth": update_data.date_of_birth.isoformat() if update_data.date_of_birth else None,
            "hometown": update_data.hometown,
            "insurance_id": update_data.insurance_id,
            "height": update_data.height,
            "weight": update_data.weight,
            "gender": update_data.gender,
            "nationality": update_data.nationality
        }
        if 'age' in current_info: del current_info['age']
        
        clean_updates = {k: v for k, v in updates_for_json.items() if v is not None}
        new_info = current_info.copy()
        if clean_updates:
            new_info.update(clean_updates)
            profile.medical_info = new_info
        
        self.db.commit()
        self.db.refresh(user)
        
        return {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "full_name": profile.full_name,
            "phone": profile.phone,
            **new_info
        }

    def get_all_users(self):
        users = self.user_repo.get_all_users()
        
        results = []
        for user in users:
            # --- LOGIC XỬ LÝ SUBSCRIPTION [ĐÃ SỬA] ---
            active_sub_data = None
            
            if user.subscriptions:
                # Lọc các gói cước chưa hết hạn (expired_at >= hôm nay)
                # Sắp xếp giảm dần theo ngày hết hạn để lấy gói mới nhất
                valid_subs = [
                    s for s in user.subscriptions 
                    if s.expired_at and s.expired_at >= date.today()
                ]
                
                # Sắp xếp: Gói nào hết hạn xa nhất thì lấy (hoặc logic tùy bạn)
                valid_subs.sort(key=lambda x: x.expired_at, reverse=True)

                if valid_subs:
                    current = valid_subs[0] 
                    
                    # Map dữ liệu
                    active_sub_data = {
                        "plan_name": current.package.name if current.package else "Unknown Plan", # Lấy tên từ relationship package
                        "remaining_analyses": current.credits_left, 
                        "total_limit": current.package.analysis_limit if current.package else 0
                    }
                else:
                     # Nếu hết hạn hết rồi -> Trả về mặc định hoặc None
                     pass

            # Map user sang UserResponse
            user_dto = UserResponse(
                id=user.id,
                username=user.username,
                email=user.email,
                role=user.role,
                status=user.status,
                created_at=user.created_at,
                profile=user.profile,
                consent_for_training=False, # Hoặc lấy từ bảng Patient
                subscription=active_sub_data # <--- Gán dữ liệu vừa xử lý vào đây
            )
            results.append(user_dto)
            
        return {"users": results}
    
    # 2. GOOGLE LOGIN
    def google_login(self, token: str, ip_address: str = "Unknown"):
        try:
            google_response = requests.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                params={'access_token': token}
            )
            if not google_response.ok:
                raise HTTPException(status_code=400, detail="Token Google không hợp lệ")
            google_data = google_response.json()
            if google_data.get('aud') and google_data.get('aud') != GOOGLE_CLIENT_ID:
                raise HTTPException(status_code=400, detail="Token không thuộc về ứng dụng này!")
            
            email = google_data.get('email')
            name = google_data.get('name')
            if not email:
                raise HTTPException(status_code=400, detail="Không tìm thấy email từ Google")
        except Exception as e:
             raise HTTPException(status_code=400, detail=f"Lỗi xác thực Google: {str(e)}")

        user = self.user_repo.get_by_email(email)
        try:
            action_type = "LOGIN_GOOGLE_NEW" if is_new_user else "LOGIN_GOOGLE"
            self.audit_repo.create_log(AuditLog(
                user_id=user.id,
                action=action_type,
                resource_type="auth",
                resource_id=str(user.id),
                ip_address=ip_address
            ))
        except Exception: pass

        is_new_user = False

        if not user:
            is_new_user = True
            random_password = secrets.token_urlsafe(16)
            hashed_pwd = get_password_hash(random_password)
            base_username = email.split("@")[0]
            unique_username = f"{base_username}_{uuid.uuid4().hex[:4]}"

            new_user_data = UserCreate(
                username=unique_username,
                email=email,
                password=random_password,
                full_name=name,
                role=UserRole.USER
            )
            
            # Repo đã tạo Profile, ta không cần tạo lại thủ công
            user = self.user_repo.create_user(new_user_data, hashed_pwd)
            
            # Nếu cần cập nhật avatar (vì create_user mặc định chưa có avatar)
            if user.profile and google_data.get('picture'):
                user.profile.avatar_url = google_data.get('picture')
                self.db.commit()

            self._send_welcome_notification(user) # Gửi thông báo

        access_token = create_access_token(data={"sub": str(user.id), "role": user.role})

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "is_new_user": is_new_user,
            "role": user.role,
            "user_info": {
                "id": str(user.id),
                "username": user.username,
                "email": user.email,
                "role": user.role,
                "full_name": user.profile.full_name if user.profile else ""
            }
        }
    
    def set_username_password(self, user_id: str, data: UserUpdateCredentials):
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")

        existing_user = self.user_repo.get_by_username(data.new_username)
        if existing_user and existing_user.id != user.id:
            raise HTTPException(status_code=400, detail="Tên đăng nhập này đã có người sử dụng")

        user.username = data.new_username
        user.password_hash = get_password_hash(data.new_password)
        self.db.commit()
        self.db.refresh(user)

        access_token = create_access_token(data={"sub": str(user.id), "role": user.role})
        return {
            "new_access_token": access_token,
            "new_username": user.username,
            "token_type": "bearer"
        }
    
    # 3. FACEBOOK LOGIN
    def facebook_login(self, token: str, user_id_from_fe: str):
        # 1. Gọi API Facebook
        facebook_graph_url = "https://graph.facebook.com/me"
        params = {"access_token": token, "fields": "id,name,email,picture.type(large)"}
        
        try:
            response = requests.get(facebook_graph_url, params=params)
            fb_data = response.json()
            
            if "error" in fb_data:
                raise HTTPException(status_code=400, detail=f"Facebook Error: {fb_data['error']['message']}")
                
            # Lấy thông tin
            fb_id = fb_data.get("id")
            name = fb_data.get("name")
            email = fb_data.get("email") # Có thể là None

            # Kiểm tra ID khớp nhau
            if fb_id != user_id_from_fe:
                 raise HTTPException(status_code=400, detail="User ID không khớp!")
            
            # --- SỬA LỖI TẠI ĐÂY ---
            # Nếu không có email (do đăng ký bằng SĐT), tự tạo email ảo dựa trên ID
            if not email:
                email = f"{fb_id}@facebook.user"  # Ví dụ: 1022384...@facebook.user

        except HTTPException as he:
            raise he
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Lỗi xác thực Facebook: {str(e)}")

        # 2. Tìm user trong DB
        user = self.user_repo.get_by_email(email)
        is_new_user = False

        # 3. Nếu chưa có thì tạo mới
        if not user:
            is_new_user = True
            random_password = secrets.token_urlsafe(16)
            hashed_pwd = get_password_hash(random_password)
            
            # Tạo username unique
            base_username = email.split("@")[0]
            unique_username = f"{base_username}_{uuid.uuid4().hex[:4]}"

            new_user_data = UserCreate(
                username=unique_username,
                email=email, # Email thật hoặc email ảo đã tạo ở trên
                password=random_password,
                full_name=name,
                role=UserRole.USER
            )
            
            # Repo tạo User
            user = self.user_repo.create_user(new_user_data, hashed_pwd)
            
            # Cập nhật Avatar
            if user.profile and fb_data.get('picture') and fb_data['picture'].get('data'):
                user.profile.avatar_url = fb_data['picture']['data']['url']
                self.db.commit()
                
            self._send_welcome_notification(user)

        # 4. Trả về Token
        access_token = create_access_token(data={
            "sub": str(user.id), 
            "role": user.role.value if hasattr(user.role, 'value') else user.role
        })
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "is_new_user": is_new_user,
            "role": user.role,
            "user_info": {
                "id": str(user.id),
                "username": user.username,
                "email": user.email,
                "role": user.role,
                "full_name": user.profile.full_name if user.profile else ""
            }
        }
    
    async def forgot_password(self, email: str):
        user = self.user_repo.get_by_email(email)
        if not user:
            return {"message": "Nếu email tồn tại, hệ thống sẽ gửi hướng dẫn đặt lại mật khẩu."}

        reset_token = create_access_token(
            data={"sub": str(user.id), "type": "reset"},
            expires_delta=timedelta(minutes=15)
        )
        reset_link = f"http://localhost:5173/reset-password?token={reset_token}"
        html = f"""
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #007bff;">AURA - Yêu cầu đặt lại mật khẩu</h2>
            <p>Xin chào <strong>{user.username}</strong>,</p>
            <p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản của mình.</p>
            <p>Vui lòng nhấn vào nút bên dưới để tạo mật khẩu mới:</p>
            <a href="{reset_link}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Đặt lại mật khẩu</a>
            <p style="margin-top: 20px; color: #666;">Link này chỉ có hiệu lực trong 15 phút.</p>
        </div>
        """
        message = MessageSchema(subject="[AURA] Hướng dẫn đặt lại mật khẩu", recipients=[email], body=html, subtype=MessageType.html)
        fm = FastMail(conf)
        await fm.send_message(message)
        return {"message": "Email hướng dẫn đã được gửi. Vui lòng kiểm tra hộp thư đến."}

    # Đã xóa 1 hàm reset_password trùng lặp
    def reset_password(self, token: str, new_password: str):
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
            token_type = payload.get("type")

            if user_id is None or token_type != "reset":
                raise HTTPException(status_code=400, detail="Token không hợp lệ.")
        except JWTError:
            raise HTTPException(status_code=400, detail="Link đã hết hạn hoặc không hợp lệ.")

        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User không tồn tại.")

        user.password_hash = get_password_hash(new_password)
        self.db.commit()
        return {"message": "Đặt lại mật khẩu thành công."}

    def update_privacy_settings(self, user_id: UUID, consent: bool, ip_address: str = "Unknown"):
        result = self.user_repo.update_patient_consent(user_id, consent)
        if not result:
            raise HTTPException(status_code=404, detail="Hồ sơ bệnh nhân chưa được kích hoạt")
        
        try:
            self.audit_repo.create_log(AuditLog(
                user_id=user_id,
                action="UPDATE_CONSENT",
                resource_type="privacy",
                resource_id=str(user_id),
                ip_address=ip_address,
                new_values={"consent_for_training": consent}
            ))
        except: pass

        return {"message": "Cập nhật quyền riêng tư thành công", "consent": consent}
    
    def get_current_user_info(self, user_id: UUID) -> UserResponse:
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        from models.medical import Patient
        patient = self.db.query(Patient).filter(Patient.user_id == user_id).first()
        consent = patient.consent_for_training if patient else False

        return UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            role=user.role,
            status=user.status,
            created_at=user.created_at,
            profile=user.profile,
            consent_for_training=consent
        )
