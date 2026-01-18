# FILE: api/billing.py
from fastapi import APIRouter, Depends, HTTPException, Request # <--- [ADD] Request
from sqlalchemy.orm import Session
from uuid import UUID

from core.database import get_db
from core.security import get_current_user, get_current_admin # <--- [ADD] get_current_admin
from services.billing_service import BillingService
from schemas.billing_schema import PackageResponse, SubscriptionResponse, SubscribeRequest, PackageCreate
from models.users import User
from models.enums import UserRole

from infrastructure.repositories.billing_repo import BillingRepository
from infrastructure.repositories.audit_repo import AuditRepository # <--- [ADD] Import AuditRepo

router = APIRouter()

# --- [MODIFIED] Inject thêm AuditRepository ---
def get_billing_service(db: Session = Depends(get_db)) -> BillingService:
    billing_repo = BillingRepository(db)
    audit_repo = AuditRepository(db) # <--- Khởi tạo AuditRepo
    return BillingService(billing_repo=billing_repo, audit_repo=audit_repo, db=db) # Inject vào Service

@router.post("/packages", response_model=PackageResponse)
def create_package(
    pkg: PackageCreate,
    request: Request, # <--- [ADD] Để lấy IP
    current_user: User = Depends(get_current_admin), # Dùng get_current_admin cho chắc chắn
    service: BillingService = Depends(get_billing_service)
):
    # (Đã có get_current_admin check role rồi nên bỏ if check thủ công cũng được, nhưng giữ lại cũng không sao)
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Chỉ Admin mới được tạo gói dịch vụ")
    
    return service.create_package(
        name=pkg.name, 
        price=pkg.price, 
        limit=pkg.analysis_limit, 
        days=pkg.duration_days, 
        desc=pkg.description, 
        role=pkg.target_role,
        # --- [ADD] TRUYỀN THÔNG TIN AUDIT ---
        admin_id=current_user.id,
        ip_address=request.client.host
    )

@router.get("/packages")
def list_packages(
    service: BillingService = Depends(get_billing_service)):
    return service.list_service_packages()

@router.post("/subscribe", response_model=SubscriptionResponse)
def subscribe(
    req: SubscribeRequest,
    current_user: User = Depends(get_current_user),
    service: BillingService = Depends(get_billing_service)
):
    try:
        return service.subscribe_user(current_user.id, req.package_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/my-usage")
def get_my_usage(
    current_user: User = Depends(get_current_user),
    service: BillingService = Depends(get_billing_service)
):
    return service.get_usage_status(current_user.id)