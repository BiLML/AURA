from domain.models.iconfig_repository import IConfigRepository
from models.system_config import SystemConfig

class ConfigService:
    def __init__(self, config_repo: IConfigRepository):
        self.config_repo = config_repo

    def get_public_config(self):
        # Tận dụng hàm get_config() đã có trong Repo
        config = self.config_repo.get_config()
        
        if not config:
            # Fallback nếu DB chưa có config
            return {"model_version": "v1.0.0", "maintenance_mode": False}
            
        return config