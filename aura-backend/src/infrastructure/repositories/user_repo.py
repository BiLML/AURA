from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from typing import List, Optional
from uuid import UUID

from models.users import User, Profile
from models.enums import UserRole, UserStatus
from models.medical import Patient 

from schemas.user_schema import UserCreate

# Import Interface (Đã sửa lại đường dẫn đúng)
from domain.models.iuser_repository import IUserRepository

class UserRepository(IUserRepository):
    def __init__(self, db: Session):
        self.db = db

    # --- CÁC HÀM CŨ (Giữ nguyên) ---
    def get_by_email(self, email: str):
        return self.db.query(User).filter(User.email == email).first()

    def get_by_username(self, username: str):
        return self.db.query(User).filter(User.username == username).first()

    def get_by_id(self, user_id: str):
        return self.db.query(User).filter(User.id == user_id).first()
    
    def update(self, user: User) -> User:
        self.db.add(user)      # Đánh dấu object này cần lưu
        self.db.commit()       # Đẩy xuống DB
        self.db.refresh(user)  # Lấy lại dữ liệu mới nhất (nếu có trigger/default)
        return user

    def create_user(self, user_data: UserCreate, hashed_password: str):
        try:
            new_user = User(
                username=user_data.username,
                email=user_data.email,
                password_hash=hashed_password,
                role=user_data.role if user_data.role else UserRole.USER,
                status=UserStatus.ACTIVE
            )
            self.db.add(new_user)
            self.db.flush() 

            new_profile = Profile(
                user_id=new_user.id,
                full_name=user_data.full_name,
                phone=user_data.phone
            )
            self.db.add(new_profile)
            
            self.db.commit()
            self.db.refresh(new_user)
            return new_user
        except Exception as e:
            self.db.rollback()
            raise e
        
    def get_all_users(self, skip: int = 0, limit: int = 100):
        return self.db.query(User).offset(skip).limit(limit).all()

    # --- 🔥 BƯỚC B: THÊM 2 HÀM MỚI Ở ĐÂY 🔥 ---
    
    def get_doctors_by_clinic_id(self, clinic_id: UUID) -> List[User]:
        """
        Lấy danh sách Bác sĩ thuộc phòng khám.
        Có join sẵn Profile để hiển thị tên.
        """
        return self.db.query(User).options(
            joinedload(User.profile)
        ).filter(
            User.clinic_id == clinic_id, 
            User.role == UserRole.DOCTOR
        ).all()

    def get_patients_by_clinic_id(self, clinic_id: UUID) -> List[User]:
        """
        Lấy danh sách Bệnh nhân thuộc phòng khám.
        Có join sẵn Profile và Bác sĩ phụ trách.
        """
        return self.db.query(User).options(
            # Load bác sĩ phụ trách -> Load profile của bác sĩ đó
            joinedload(User.assigned_doctor).joinedload(User.profile),
            # Load profile của chính bệnh nhân
            joinedload(User.profile),
        ).filter(
            User.clinic_id == clinic_id,
            User.role == UserRole.USER
        ).all()
    
    def search_users_by_role(self, role: UserRole, query: str) -> List[User]:
        """
        Tìm kiếm User theo Role và từ khóa (Username hoặc Email)
        """
        sql_query = self.db.query(User).filter(
            User.role == role,
            User.clinic_id == None 
        )
        
        if query:
            search_term = f"%{query}%"
            sql_query = sql_query.filter(
                or_(
                    User.email.ilike(search_term), 
                    User.username.ilike(search_term),
                    User.profile.has(Profile.full_name.ilike(search_term))
                )
            )
            
        return sql_query.all()
    
    def count_users(self) -> int:
        # Đếm số user đang active, trừ admin ra
        return self.db.query(User).filter(User.role != UserRole.ADMIN).count()
    
    def update(self, user: User) -> User:
        """
        Cập nhật thông tin User và LƯU vào Database (Commit).
        Hàm này rất quan trọng để lưu clinic_id.
        """
        self.db.add(user)       # Đánh dấu object này cần update
        self.db.commit()        # <--- LỆNH QUAN TRỌNG NHẤT: Lưu xuống ổ cứng
        self.db.refresh(user)   # Load lại dữ liệu mới nhất
        return user
    
    def count_patients_by_doctor_id(self, doctor_id: UUID) -> int:
        """
        Đếm số lượng bệnh nhân đang được phân công cho một bác sĩ cụ thể.
        """
        return self.db.query(User).filter(
            User.assigned_doctor_id == doctor_id,
            User.role == UserRole.USER # Đảm bảo chỉ đếm bệnh nhân
        ).count()
    
    def update_patient_consent(self, user_id: UUID, consent: bool) -> bool:
        # Tìm hồ sơ bệnh nhân của user này
        patient = self.db.query(Patient).filter(Patient.user_id == user_id).first()
        
        if patient:
            patient.consent_for_training = consent
            self.db.commit()
            return True
        else:
            # Nếu user chưa có hồ sơ bệnh nhân (ví dụ mới đăng ký), có thể tự tạo mới
            # Hoặc trả về False tùy logic. Ở đây ta trả về False cho đơn giản.
            return False
        
    def release_all_members_from_clinic(self, clinic_id: UUID):
        """
        Gỡ bỏ liên kết (clinic_id = NULL) cho tất cả Bác sĩ và Bệnh nhân
        đang thuộc về phòng khám này.
        """
        # Cập nhật hàng loạt (Bulk Update) cho hiệu suất cao
        self.db.query(User).filter(User.clinic_id == clinic_id).update(
            {User.clinic_id: None}, 
            synchronize_session=False
        )
        self.db.commit()