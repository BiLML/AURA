from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID

from models.billing import ServicePackage, Subscription, PaymentTransaction






# 5. INTERFACE CHO BILLING
class IBillingRepository(ABC):
    # --- 1. QUẢN LÝ GÓI (ADMIN) ---
    @abstractmethod
    def create_package(self, name: str, price: float, limit: int, days: int, desc: str) -> ServicePackage: pass
    
    @abstractmethod
    def get_all_packages(self) -> List[ServicePackage]: pass

    @abstractmethod
    def get_package_by_id(self, package_id: str) -> Optional[ServicePackage]: pass

    # --- 2. QUẢN LÝ THUÊ BAO (USER) ---
    @abstractmethod
    def get_active_subscription(self, user_id: UUID) -> Optional[Subscription]: pass
    
    # Hàm này nên trả về Subscription để Service biết đường xử lý tiếp
    @abstractmethod
    def create_subscription(self, user_id: UUID, package_id: UUID, days: int, credits: int) -> Subscription: pass

    @abstractmethod
    def deduct_credits(self, subscription_id: UUID) -> bool: pass

    # --- 3. LỊCH SỬ GIAO DỊCH (AUDIT) ---
    @abstractmethod
    def create_transaction(self, user_id: UUID, package_id: UUID, amount: float, status: str) -> PaymentTransaction: pass