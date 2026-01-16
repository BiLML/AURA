from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from core.database import get_db
from core.security import get_current_user
from services.billing_service import BillingService
from schemas.billing_schema import PackageResponse, SubscriptionResponse, SubscribeRequest
from models.users import User

from infrastructure.repositories.billing_repo import BillingRepository

router = APIRouter()

def get_billing_service(db: Session = Depends(get_db)) -> BillingService:
    repo = BillingRepository(db)
    return BillingService(billing_repo=repo, db=db)

@router.get("/packages")
def list_packages(
    service: BillingService = Depends(get_billing_service)): # <--- Inject
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

@router.get("/my-subscription")
def check_credits(
    current_user: User = Depends(get_current_user),
    service: BillingService = Depends(get_billing_service)
):
    credits = service.check_credits(current_user.id)
    return {"credits_left": credits}