from sqlalchemy.orm import Session
from domain.models.iconfig_repository import IConfigRepository
from models.system_config import SystemConfig # Model SQLAlchemy của bạn

class ConfigRepository(IConfigRepository):
    def __init__(self, db: Session):
        self.db = db

    def get_config(self) -> SystemConfig:
        return self.db.query(SystemConfig).first()
    
    def create_config(self, new_config: SystemConfig) -> SystemConfig:
        self.db.add(new_config)
        self.db.commit()
        self.db.refresh(new_config)
        return new_config

    def update_config(self, config_data):
        # 1. Lấy cấu hình hiện tại
        existing_config = self.get_config()
        
        if existing_config:
            # 2. Cập nhật từng trường (Field) thay vì tạo mới
            # Dùng model_dump để chuyển thành dict
            update_dict = config_data.model_dump(exclude_unset=True)
            
            for key, value in update_dict.items():
                setattr(existing_config, key, value)
            
            # 3. Cập nhật thời gian
            from datetime import datetime
            existing_config.updated_at = datetime.now()
            
            # 4. Lưu lại
            self.db.commit()
            self.db.refresh(existing_config)
            return existing_config
        else:
            # Trường hợp chưa có thì tạo mới (ít khi xảy ra vì ta đã seed dữ liệu)
            new_config = SystemConfig(**config_data.model_dump())
            self.db.add(new_config)
            self.db.commit()
            self.db.refresh(new_config)
            return new_config