from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import date
from decimal import Decimal

# --- 1. GÓI DỊCH VỤ ---
class PackageCreate(BaseModel): # <--- THÊM CÁI NÀY
    name: str
    price: Decimal
    analysis_limit: int
    duration_days: int
    description: Optional[str] = None
    target_role: str = "USER" # USER, CLINIC, DOCTOR

class PackageResponse(BaseModel):
    id: UUID
    name: str
    price: Decimal
    analysis_limit: int
    duration_days: int
    description: Optional[str] = None # Thêm description để hiển thị ở Frontend
    
    class Config:
        from_attributes = True

# --- 2. ĐĂNG KÝ (SUBSCRIPTION) ---
class SubscriptionResponse(BaseModel):
    id: UUID
    package_id: UUID
    user_id: UUID
    credits_left: int
    expired_at: date
    package: Optional[PackageResponse] = None # Nested object

    class Config:
        from_attributes = True

# --- 3. INPUT ---
class SubscribeRequest(BaseModel):
    package_id: UUID