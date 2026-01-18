from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID

# Import Models (Entities)
from models.billing import ServicePackage, Subscription, PaymentTransaction

class IBillingRepository(ABC):
    # --- 1. QUẢN LÝ GÓI (ADMIN) ---
    @abstractmethod
    def create_package(self, name: str, price: float, limit: int, days: int, desc: str, role: str) -> ServicePackage:
        """Tạo gói dịch vụ mới"""
        pass
    
    @abstractmethod
    def get_all_packages(self) -> List[ServicePackage]:
        """Lấy danh sách các gói đang active"""
        pass

    @abstractmethod
    def get_package_by_id(self, package_id: UUID) -> Optional[ServicePackage]:
        """Lấy thông tin chi tiết một gói"""
        pass

    # --- 2. QUẢN LÝ THUÊ BAO (USER) ---
    @abstractmethod
    def get_active_subscription(self, user_id: UUID) -> Optional[Subscription]:
        """Lấy gói thuê bao CÒN HẠN sử dụng của user"""
        pass
    
    @abstractmethod
    def create_subscription(self, user_id: UUID, package_id: UUID, days: int, credits: int) -> Subscription:
        """Tạo mới hoặc gia hạn gói thuê bao"""
        pass

    @abstractmethod
    def deduct_credits(self, subscription_id: UUID) -> bool:
        """Trừ 1 lượt sử dụng (Atomic Update)"""
        pass

    # --- 3. LỊCH SỬ GIAO DỊCH (AUDIT) ---
    @abstractmethod
    def create_transaction(self, user_id: UUID, package_id: UUID, amount: float, status: str) -> PaymentTransaction:
        """Ghi lại lịch sử thanh toán"""
        pass

    # --- 4. BÁO CÁO DOANH THU (ADMIN) ---
    @abstractmethod
    def get_total_revenue(self) -> float:
        """Tính tổng doanh thu từ các giao dịch thành công"""
        pass

    @abstractmethod
    def get_recent_transactions(self, limit: int = 10) -> List[PaymentTransaction]:
        """Lấy danh sách giao dịch gần nhất"""
        pass