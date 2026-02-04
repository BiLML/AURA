from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.database import get_db
from schemas.config_schema import PublicConfigResponse
from services.config_service import ConfigService

# Import Repo thực (Infrastructure Layer)
from infrastructure.repositories.config_repo import ConfigRepository 

router = APIRouter()

# Dependency Injection Helper
def get_config_service(db: Session = Depends(get_db)) -> ConfigService:
    # 1. Khởi tạo Repo thực
    repo = ConfigRepository(db)
    # 2. Tiêm vào Service
    return ConfigService(config_repo=repo)

@router.get("/config", response_model=PublicConfigResponse)
def get_public_system_config(
    service: ConfigService = Depends(get_config_service)
):
    """
    API Public: Lấy version model để hiển thị UI
    Không yêu cầu Token hay quyền Admin
    """
    return service.get_public_config()