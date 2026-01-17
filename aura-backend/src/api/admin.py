# FILE: api/admin.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from core.database import get_db
from core.security import get_current_admin, get_current_user

from services.user_service import UserService
from services.doctor_service import DoctorService
from services.admin_service import AdminService

from schemas.user_schema import UserResponse
from schemas.admin_schema import UpdateUserStatusRequest, UpdateUserRoleRequest
from schemas.config_schema import SystemConfigResponse, SystemConfigUpdate

from models.users import User
from models.enums import UserRole

from infrastructure.repositories.user_repo import UserRepository
from infrastructure.repositories.doctor_repo import DoctorRepository
from infrastructure.repositories.medical_repo import MedicalRepository 
from infrastructure.repositories.billing_repo import BillingRepository 
from infrastructure.repositories.config_repo import ConfigRepository

router = APIRouter()

def get_admin_service(db: Session = Depends(get_db)) -> AdminService:
    user_repo = UserRepository(db)
    medical_repo = MedicalRepository(db) 
    billing_repo = BillingRepository(db) 
    config_repo = ConfigRepository(db)
    return AdminService(user_repo, medical_repo, billing_repo, config_repo)

def get_user_service(db: Session = Depends(get_db)) -> UserService:
    repo = UserRepository(db)
    return UserService(user_repo=repo, db=db)

def get_doctor_service(db: Session = Depends(get_db)) -> DoctorService:
    doc_repo = DoctorRepository(db)
    med_repo = MedicalRepository(db)
    return DoctorService(doctor_repo=doc_repo, medical_repo=med_repo, db=db)


# Lưu ý: Ở đây chỉ để "/" vì bên main.py sẽ gắn prefix "/api/v1/admin"
@router.get("/users")
def get_all_users_admin(
    current_user = Depends(get_current_admin),
    service: UserService = Depends(get_user_service) # <--- Inject Service
):
    return service.get_all_users()

@router.get("/reports")
def get_admin_reports(
    current_user: User = Depends(get_current_admin),
    service: DoctorService = Depends(get_doctor_service)
):
    return service.get_all_feedback_for_admin()

@router.put("/users/{user_id}/status")
def update_user_status(
    user_id: UUID,
    req: UpdateUserStatusRequest,
    current_user: User = Depends(get_current_admin),
    service: AdminService = Depends(get_admin_service)
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Không thể tự khóa tài khoản của chính mình")
    service.update_user_status(user_id, req.status) 
    return {"message": "Cập nhật trạng thái thành công"}

# 2. Cập nhật Vai trò (Role)
@router.put("/users/{user_id}/role")
def update_user_role(
    user_id: UUID,
    req: UpdateUserRoleRequest,
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(get_current_admin)
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Không thể tự đổi quyền của chính mình")

    service.update_user_role(user_id, req.role)
    return {"message": "Cập nhật vai trò thành công"}

@router.get("/config", response_model=SystemConfigResponse)
def get_ai_config(
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(get_current_admin) 
):
    config = service.get_system_config()
    
    # --- BỔ SUNG ĐOẠN NÀY ---
    # if not config:
        # Nếu không có config, trả về lỗi 404 thay vì để crash server
        # Frontend sẽ nhận được lỗi này và xử lý (ví dụ: hiển thị form tạo mới)
    #    raise HTTPException(status_code=404, detail="Chưa có cấu hình hệ thống")
    # ------------------------

    return config

@router.put("/config", response_model=SystemConfigResponse)
def update_ai_config(
    config_in: SystemConfigUpdate,
    current_user: User = Depends(get_current_admin),
    service: AdminService = Depends(get_admin_service)
):
    return service.update_system_config(config_in)

@router.get("/stats/global")
def get_global_dashboard_stats(
    current_user: User = Depends(get_current_admin), 
    service: AdminService = Depends(get_admin_service)
):
    return service.get_global_stats()

@router.get("/stats/analytics")
def get_analytics_data(
    service: AdminService = Depends(get_admin_service),
    current_user: User = Depends(get_current_admin) # Chỉ Admin mới được xem
):
    return service.get_system_analytics()