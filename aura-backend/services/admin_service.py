# FILE: services/admin_service.py
from sqlalchemy.orm import Session
from fastapi import HTTPException
from models.users import User
from models.enums import UserRole, UserStatus 
from models.system_config import SystemConfig # Import model mới
from uuid import UUID

class AdminService:
    def __init__(self, db: Session):
        self.db = db

    def get_user_by_id(self, user_id: UUID) -> User:
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Người dùng không tồn tại")
        return user

    def update_user_status(self, user_id: UUID, new_status: str):
        user = self.get_user_by_id(user_id)
        
        # Cập nhật thẳng vào cột status
        # Lưu ý: new_status phải khớp với các giá trị trong Enum UserStatus của bạn
        user.status = new_status 
        
        self.db.commit()
        self.db.refresh(user)
        return user

    def update_user_role(self, user_id: UUID, new_role: str):
        user = self.get_user_by_id(user_id)
        
        # Cập nhật role
        valid_roles = [e.value for e in UserRole]
        if new_role not in valid_roles:
             raise HTTPException(
                 status_code=400, 
                 detail=f"Vai trò '{new_role}' không hợp lệ. Phải là: {valid_roles}"
             )

        user.role = new_role
        self.db.commit()
        self.db.refresh(user) # Thêm refresh để trả về data mới nhất
        return user
    
    def get_system_config(self):
        # Lấy dòng đầu tiên, nếu chưa có thì tạo default
        config = self.db.query(SystemConfig).first()
        if not config:
            config = SystemConfig()
            self.db.add(config)
            self.db.commit()
            self.db.refresh(config)
        return config

    def update_system_config(self, config_in):
        config = self.get_system_config() # Lấy config hiện tại
        
        # Cập nhật từng trường
        config.confidence_threshold = config_in.confidence_threshold
        config.model_version = config_in.model_version
        config.alert_risk_level = config_in.alert_risk_level
        config.enable_email_alerts = config_in.enable_email_alerts
        config.auto_retrain = config_in.auto_retrain
        config.retrain_frequency_days = config_in.retrain_frequency_days
        config.min_new_data_samples = config_in.min_new_data_samples
        
        self.db.commit()
        self.db.refresh(config)
        return config