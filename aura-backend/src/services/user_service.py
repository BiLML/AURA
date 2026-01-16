from sqlalchemy.orm import Session
from domain.models.iuser_repository import IUserRepository
from models.users import User, Profile
from models.enums import UserRole
from schemas.user_schema import UserCreate, UserLogin, UserProfileUpdate, UserUpdateCredentials
from core.security import get_password_hash, verify_password, create_access_token, SECRET_KEY, ALGORITHM
from fastapi import HTTPException, status
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
import uuid
import secrets
import requests
import os
from jose import jwt, JWTError
from datetime import timedelta



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
    # [SỬA] Inject IUserRepository vào đây
    def __init__(self, user_repo: IUserRepository, db: Session):
        self.user_repo = user_repo
        self.db = db # Vẫn giữ db để commit transaction trong service
    def register_user(self, user_data: UserCreate):
        # 1. CHECK TRÙNG USERNAME
        if self.user_repo.get_by_username(user_data.username):
            raise HTTPException(
                status_code=400, 
                detail="Username này đã tồn tại. Vui lòng chọn tên khác."
            )
        
        # 2. CHECK TRÙNG EMAIL
        if self.user_repo.get_by_email(user_data.email):
            raise HTTPException(
                status_code=400, 
                detail="Email này đã được sử dụng."
            )

        # 3. Nếu không trùng thì Hash pass và tạo
        hashed_pwd = get_password_hash(user_data.password)
        return self.user_repo.create_user(user_data, hashed_pwd)

    def authenticate_user(self, username_or_email: str, password: str):
        # Logic đăng nhập đa năng: Tìm theo username trước, nếu không có thì tìm theo email
        user = self.user_repo.get_by_username(username_or_email)
        if not user:
            user = self.user_repo.get_by_email(username_or_email)
            
        if not user:
            return None
        
        if not verify_password(password, user.password_hash):
            return None
            
        return user
        
    def get_user_by_id(self, user_id: str):
        return self.user_repo.get_by_id(user_id)
    
    def update_user_profile(self, user_id: str, update_data: UserProfileUpdate):
        # 1. Lấy User từ DB
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # 2. Cập nhật thông tin cơ bản bảng User (Email)
        if update_data.email and update_data.email != user.email:
            # Check trùng email nếu cần (bỏ qua nếu lười)
            user.email = update_data.email
        
        # 3. Xử lý bảng Profile (Quan hệ 1-1)
        profile = user.profile # SQLAlchemy relationship
        
        if not profile:
            # Nếu chưa có profile thì tạo mới
            profile = Profile(user_id=user.id)
            self.user_repo.db.add(profile)
        
        # 4. Map dữ liệu từ Schema sang Model Profile
        if update_data.full_name is not None: profile.full_name = update_data.full_name
        if update_data.phone is not None: profile.phone = update_data.phone
        
        # Các trường lưu trong JSONB (medical_info) hoặc tạo cột mới tuỳ DB của bạn
        # Ở đây tôi giả định bạn đã tạo cột riêng hoặc lưu vào JSONB 'medical_info'
        # Nếu model Profile của bạn chưa có cột age, height, weight... 
        # Bạn nên lưu chúng vào cột 'medical_info' (JSONB) nếu không muốn sửa DB schema.
        
        # Cách lưu vào JSONB (medical_info):
        current_info = profile.medical_info or {}
        
        # Cập nhật các trường phụ vào JSON
        updates_for_json = {
            "date_of_birth": update_data.date_of_birth.isoformat() if update_data.date_of_birth else None,
            "hometown": update_data.hometown,
            "insurance_id": update_data.insurance_id,
            "height": update_data.height,
            "weight": update_data.weight,
            "gender": update_data.gender,
            "nationality": update_data.nationality
        }
        if 'age' in current_info:
            del current_info['age']
        
        # Loại bỏ các giá trị None
        clean_updates = {k: v for k, v in updates_for_json.items() if v is not None}
        
        # Luôn khởi tạo new_info bằng current_info trước
        new_info = current_info.copy() 
        
        if clean_updates:
            new_info.update(clean_updates)
            profile.medical_info = new_info # Gán lại để SQLAlchemy nhận diện thay đổi
        
        # 6. Lưu vào DB
        self.db.commit()
        self.db.refresh(user)
        
        # 7. Trả về
        return {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "full_name": profile.full_name,
            "phone": profile.phone,
            **new_info # Bây giờ new_info luôn tồn tại, không bị lỗi nữa
        }

    def get_all_users(self):
        return self.user_repo.get_all_users()
    
    def google_login(self, token: str):
        # 1. Dùng Access Token để hỏi Google: "Chủ nhân token này là ai?"
        try:
            google_response = requests.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                params={'access_token': token}
            )
            
            if not google_response.ok:
                raise HTTPException(status_code=400, detail="Token Google không hợp lệ hoặc đã hết hạn")
                
            google_data = google_response.json()

            if google_data.get('aud') and google_data.get('aud') != GOOGLE_CLIENT_ID:
                raise HTTPException(status_code=400, detail="Token không thuộc về ứng dụng này!")
            
            email = google_data.get('email')
            name = google_data.get('name')
            
            # Lưu ý: "sub" là ID duy nhất của Google, nên lưu lại để sau này map
            google_id = google_data.get('sub') 

            if not email:
                raise HTTPException(status_code=400, detail="Không tìm thấy email từ Google")

        except Exception as e:
             raise HTTPException(status_code=400, detail=f"Lỗi xác thực Google: {str(e)}")

        # 2. Kiểm tra user trong DB (Đoạn dưới này Logic của bạn OK, tôi chỉnh lại chút cho mượt)
        user = self.user_repo.get_by_email(email)
        is_new_user = False

        if not user:
            is_new_user = True
            # Tạo password ngẫu nhiên + unique username
            random_password = secrets.token_urlsafe(16)
            hashed_pwd = get_password_hash(random_password)
            
            base_username = email.split("@")[0]
            unique_username = f"{base_username}_{uuid.uuid4().hex[:4]}"

            new_user_data = UserCreate(
                username=unique_username,
                email=email,
                password=random_password,
                full_name=name, # Thêm cái này vào schema UserCreate nếu chưa có, hoặc xử lý riêng
                role="user"
            )
            
            # Tạo User
            user = self.user_repo.create_user(new_user_data, hashed_pwd)
            
            # Tạo Profile
            if not user.profile:
                new_profile = Profile(
                    user_id=user.id,
                    full_name=name,
                    avatar_url=google_data.get('picture') # Lấy luôn avatar Google
                )
                self.db.add(new_profile)
                self.db.commit()
                self.db.refresh(user)

        # 3. Tạo JWT Token của hệ thống bạn
        access_token = create_access_token(
            data={"sub": str(user.id), "role": user.role}
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "is_new_user": is_new_user,
            "role": user.role, # Trả về role để Frontend điều hướng
            "user_info": {
                "id": str(user.id),
                "username": user.username,
                "email": user.email,
                "role": user.role,
                "full_name": user.profile.full_name if user.profile else ""
            }
        }
    
    def set_username_password(self, user_id: str, data: UserUpdateCredentials):
        # 1. Tìm user hiện tại
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")

        # 2. Kiểm tra xem username mới có bị trùng với người KHÁC không?
        existing_user = self.user_repo.get_by_username(data.new_username)
        if existing_user and existing_user.id != user.id:
            raise HTTPException(status_code=400, detail="Tên đăng nhập này đã có người sử dụng")

        # 3. Cập nhật thông tin
        user.username = data.new_username
        user.password_hash = get_password_hash(data.new_password)
        
        # (Tuỳ chọn) Nếu bạn có cột status, có thể kích hoạt user luôn
        # user.status = "active"

        self.db.commit()
        self.db.refresh(user)

        # 4. Tạo Token mới (Vì thông tin quan trọng đã thay đổi)
        access_token = create_access_token(
            data={"sub": str(user.id), "role": user.role}
        )

        # 5. Trả về đúng format mà Frontend đang chờ
        return {
            "new_access_token": access_token,
            "new_username": user.username,
            "token_type": "bearer"
        }
    
    # Thêm vào class UserService trong user_service.py

    def facebook_login(self, token: str, user_id_from_fe: str):
        # 1. Gọi Facebook API (Giữ nguyên)
        facebook_graph_url = "https://graph.facebook.com/me"
        params = {
            "access_token": token,
            "fields": "id,name,email,picture.type(large)" # Lấy ảnh nét hơn chút
        }
        
        try:
            response = requests.get(facebook_graph_url, params=params)
            fb_data = response.json()
            
            if "error" in fb_data:
                raise HTTPException(status_code=400, detail=f"Facebook Error: {fb_data['error']['message']}")
                
            email = fb_data.get("email")
            name = fb_data.get("name")
            fb_id = fb_data.get("id")

            if fb_id != user_id_from_fe:
                 raise HTTPException(status_code=400, detail="User ID không khớp!")

            if not email:
                raise HTTPException(status_code=400, detail="Không tìm thấy email từ Facebook account này.")

        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Lỗi xác thực Facebook: {str(e)}")

        # 2. Logic tìm hoặc tạo User
        user = self.user_repo.get_by_email(email)
        is_new_user = False

        if not user:
            is_new_user = True
            random_password = secrets.token_urlsafe(16)
            hashed_pwd = get_password_hash(random_password)
            
            base_username = email.split("@")[0]
            unique_username = f"{base_username}_{uuid.uuid4().hex[:4]}"

            # --- SỬA Ở ĐÂY CHO KHỚP USERS.PY ---
            new_user_data = UserCreate(
                username=unique_username,
                email=email,
                password=random_password,
                full_name=name,
                role=UserRole.USER  # <-- Dùng Enum thay vì string "user"
            )
            # -----------------------------------
            
            user = self.user_repo.create_user(new_user_data, hashed_pwd)
            
            # Xử lý Avatar cho bảng Profile (Khớp với users.py)
            avatar_url = None
            if fb_data.get('picture') and fb_data['picture'].get('data'):
                avatar_url = fb_data['picture']['data']['url']

            # Kiểm tra nếu repo chưa tạo profile thì tạo thủ công
            if not user.profile:
                new_profile = Profile(
                    user_id=user.id,
                    full_name=name,     # Khớp cột full_name trong Profile
                    avatar_url=avatar_url # Khớp cột avatar_url trong Profile
                )
                self.db.add(new_profile)
                self.db.commit()
                self.db.refresh(user)

        # 3. Tạo Token (Lưu ý chuyển Enum role thành string khi tạo token nếu cần)
        access_token = create_access_token(
            data={"sub": str(user.id), "role": user.role.value if hasattr(user.role, 'value') else user.role}
        )

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
        # 1. Tìm user
        user = self.user_repo.get_by_email(email)
        if not user:
            # Vẫn báo thành công để bảo mật (tránh người lạ dò email)
            return {"message": "Nếu email tồn tại, hệ thống sẽ gửi hướng dẫn đặt lại mật khẩu."}

        # 2. Tạo Token Reset
        reset_token = create_access_token(
            data={"sub": str(user.id), "type": "reset"},
            expires_delta=timedelta(minutes=15)
        )

        # 3. Tạo Link (Giả sử Frontend chạy localhost:3000)
        reset_link = f"http://localhost:3000/reset-password?token={reset_token}"

        # 4. Nội dung Email HTML
        html = f"""
        <div style="font-family: Arial, sans-serif; padding: 20px;">
            <h2 style="color: #007bff;">AURA - Yêu cầu đặt lại mật khẩu</h2>
            <p>Xin chào <strong>{user.username}</strong>,</p>
            <p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu cho tài khoản của mình.</p>
            <p>Vui lòng nhấn vào nút bên dưới để tạo mật khẩu mới:</p>
            <a href="{reset_link}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Đặt lại mật khẩu</a>
            <p style="margin-top: 20px; color: #666;">Link này chỉ có hiệu lực trong 15 phút.</p>
            <p style="font-size: 12px; color: #999;">Nếu bạn không yêu cầu, vui lòng bỏ qua email này.</p>
        </div>
        """

        # 5. Gửi Email
        message = MessageSchema(
            subject="[AURA] Hướng dẫn đặt lại mật khẩu",
            recipients=[email],
            body=html,
            subtype=MessageType.html
        )

        fm = FastMail(conf)
        await fm.send_message(message)

        return {"message": "Email hướng dẫn đã được gửi. Vui lòng kiểm tra hộp thư đến."}

    # --- HÀM RESET PASSWORD (Không cần async vì chỉ thao tác DB) ---
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

    def reset_password(self, token: str, new_password: str):
        # 1. Giải mã Token bằng SECRET_KEY và ALGORITHM từ security.py
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = payload.get("sub")
            token_type = payload.get("type")

            if user_id is None or token_type != "reset":
                raise HTTPException(status_code=400, detail="Token không hợp lệ.")
            
        except JWTError:
            raise HTTPException(status_code=400, detail="Token đã hết hạn hoặc bị lỗi.")

        # 2. Tìm user và đổi pass
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User không tồn tại.")

        # 3. Hash mật khẩu mới và lưu
        user.password_hash = get_password_hash(new_password)
        self.db.commit()
        
        return {"message": "Đặt lại mật khẩu thành công."}