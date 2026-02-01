# FILE: api/billing.py
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List

from core.database import get_db
from core.security import get_current_user, get_current_admin

from services.billing_service import BillingService
from schemas.billing_schema import SubscribeRequest, PackageCreate, PackageResponse, TransactionResponse, SubscriptionResponse

from models.users import User
from models.enums import UserRole

# Import Repositories & Adapters
from infrastructure.repositories.billing_repo import BillingRepository
from infrastructure.repositories.audit_repo import AuditRepository
from infrastructure.external.vnpay_adapter import VNPayAdapter
from infrastructure.external.sepay_adapter import SePayAdapter 

router = APIRouter()

# --- DEPENDENCY INJECTION ---
def get_billing_service(db: Session = Depends(get_db)) -> BillingService:
    billing_repo = BillingRepository(db)
    audit_repo = AuditRepository(db)
    gateways = {
            "VNPAY": VNPayAdapter(),
            "SEPAY": SePayAdapter()
    }
    
    return BillingService(
        billing_repo=billing_repo, 
        audit_repo=audit_repo, 
        gateways=gateways, # Truyền dict gateways vào
        db=db
    )
# --- 1. ADMIN: QUẢN LÝ GÓI ---
@router.post("/packages", response_model=PackageResponse)
def create_package(
    pkg: PackageCreate,
    request: Request,
    current_user: User = Depends(get_current_admin),
    service: BillingService = Depends(get_billing_service)
):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Permission denied")
    
    return service.create_package(
        name=pkg.name, 
        price=pkg.price, 
        limit=pkg.analysis_limit, 
        days=pkg.duration_days, 
        desc=pkg.description, 
        role=pkg.target_role,
        admin_id=current_user.id,
        ip_address=request.client.host
    )

@router.get("/packages")
def list_packages(service: BillingService = Depends(get_billing_service)):
    return service.list_service_packages()

# --- 2. USER: THANH TOÁN & GIAO DỊCH ---

# [QUAN TRỌNG] API này tạo URL thanh toán (Thay thế cho subscribe trực tiếp)
@router.post("/payment/create-url") # Bạn có thể đổi tên thành /create-payment-url cho chuẩn
def create_payment_url(
    req: SubscribeRequest, # Cần đảm bảo Schema này có field payment_method
    request: Request,
    current_user: User = Depends(get_current_user),
    service: BillingService = Depends(get_billing_service)
):
    try:
        # Lấy method từ request, mặc định là SEPAY nếu không gửi
        # Lưu ý: Cần thêm field 'payment_method' vào SubscribeRequest trong schemas/billing_schema.py
        # Nếu lười sửa schema, dùng getattr để tránh lỗi tạm thời:
        method = getattr(req, "payment_method", "SEPAY") 
        
        return service.create_payment_url(
            user_id=current_user.id,
            package_id=req.package_id,
            ip_address=request.client.host,
            payment_method=method # Truyền xuống service
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
# Callback từ VNPay (User không gọi trực tiếp API này)
@router.get("/vnpay/return")
def vnpay_return(
    request: Request,
    service: BillingService = Depends(get_billing_service)
):
    params = dict(request.query_params)
    return service.process_payment_return(params)

# --- 3. USER: TRA CỨU ---
@router.get("/my-usage")
def get_my_usage(
    current_user: User = Depends(get_current_user),
    service: BillingService = Depends(get_billing_service)
):
    return service.get_usage_status(current_user.id)

@router.get("/my-transactions", response_model=List[TransactionResponse])
def get_my_transaction_history(
    current_user: User = Depends(get_current_user),
    service: BillingService = Depends(get_billing_service)
):
    return service.get_user_history(current_user.id)