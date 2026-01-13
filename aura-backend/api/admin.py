# FILE: api/admin.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from core.database import get_db
from core.security import get_current_user, get_current_admin
from services.user_service import UserService
from services.doctor_service import DoctorService

from services.admin_service import AdminService
from schemas.user_schema import UserResponse
from schemas.admin_schema import UpdateUserStatusRequest, UpdateUserRoleRequest
from schemas.config_schema import SystemConfigResponse, SystemConfigUpdate # Import schema mới

from models.users import User
from models.enums import UserRole


router = APIRouter()

# Lưu ý: Ở đây chỉ để "/" vì bên main.py sẽ gắn prefix "/api/v1/admin"
@router.get("/users", response_model=list[UserResponse])
def get_all_users_admin(
    current_user = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    user_service = UserService(db)
    return user_service.get_all_users()

@router.get("/reports")
def get_admin_reports(
    current_user: User = Depends(get_current_admin),
    db: Session = Depends(get_db)    
):
    doctor_service = DoctorService(db)
    return doctor_service.get_all_feedback_for_admin()

# 1. Cập nhật Trạng thái (Khóa/Mở khóa)
@router.put("/users/{user_id}/status")
def update_user_status(
    user_id: UUID,
    req: UpdateUserStatusRequest, # Schema mới
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Không thể tự khóa tài khoản của chính mình")

    service = AdminService(db)
    service.update_user_status(user_id, req.status) 
    return {"message": "Cập nhật trạng thái thành công"}

# 2. Cập nhật Vai trò (Role)
@router.put("/users/{user_id}/role")
def update_user_role(
    user_id: UUID,
    req: UpdateUserRoleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Không thể tự đổi quyền của chính mình")

    service = AdminService(db)
    service.update_user_role(user_id, req.role)
    return {"message": "Cập nhật vai trò thành công"}

@router.get("/config", response_model=SystemConfigResponse)
def get_ai_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin) # Bảo vệ bằng quyền Admin
):
    service = AdminService(db)
    return service.get_system_config()

@router.put("/config", response_model=SystemConfigResponse)
def update_ai_config(
    config_in: SystemConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin)
):
    service = AdminService(db)
    return service.update_system_config(config_in)