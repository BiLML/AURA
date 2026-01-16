from sqlalchemy.orm import Session
from domain.models.iconfig_repository import IConfigRepository
from models.system_config import SystemConfig # Model SQLAlchemy của bạn

class ConfigRepository(IConfigRepository):
    def __init__(self, db: Session):
        self.db = db

    def get_config(self) -> SystemConfig:
        return self.db.query(SystemConfig).first()

    def update_config(self, config_data: dict) -> SystemConfig:
        config = self.get_config()
        if not config:
            config = SystemConfig(**config_data)
            self.db.add(config)
        else:
            # Cập nhật từng trường
            for key, value in config_data.items():
                setattr(config, key, value)
        
        self.db.commit()
        self.db.refresh(config)
        return config