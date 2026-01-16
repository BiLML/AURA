from uuid import UUID
from datetime import date, timedelta
from typing import List, Optional

# Import Interface & Models
from domain.models.ibilling_repository import IBillingRepository
from models.billing import ServicePackage, Subscription

class BillingService:
    def __init__(self, billing_repo: IBillingRepository, db=None): 
        self.billing_repo = billing_repo
        self.db = db # Giữ lại nếu cần commit transaction phức tạp, nhưng nên hạn chế dùng

    # --- 1. ADMIN: TẠO GÓI (Thêm mới) ---
    def create_package(self, name, price, limit, days, desc, role):
        return self.billing_repo.create_package(name, price, limit, days, desc, role)

    # --- 2. PUBLIC: LẤY DANH SÁCH GÓI ---
    # (Khớp với hàm bạn gọi ở API: service.list_service_packages())
    def list_service_packages(self) -> List[ServicePackage]:
        return self.billing_repo.get_all_packages()

    # --- 3. USER: MUA GÓI ---
    # (Khớp với hàm bạn gọi ở API: service.subscribe_user())
    def subscribe_user(self, user_id: UUID, package_id: UUID):
        # A. Kiểm tra gói tồn tại
        pkg = self.billing_repo.get_package_by_id(package_id)
        if not pkg:
            raise ValueError("Gói dịch vụ không tồn tại")

        # B. Tạo Transaction (Lưu lịch sử dòng tiền)
        # TODO: Sau này tích hợp VNPay thì check status ở đây
        self.billing_repo.create_transaction(user_id, pkg.id, pkg.price, "SUCCESS")

        # C. Tính hạn dùng & Tạo Subscription
        return self.billing_repo.create_subscription(
            user_id=user_id,
            package_id=pkg.id,
            days=pkg.duration_days,
            credits=pkg.analysis_limit
        )

    # --- 4. CHECK CREDITS ---
    # (Khớp với hàm bạn gọi ở API: service.check_credits())
    def check_credits(self, user_id: UUID) -> int:
        sub = self.billing_repo.get_active_subscription(user_id)
        if not sub:
            return 0
        return sub.credits_left
    
    def get_usage_status(self, user_id: UUID):
        sub = self.billing_repo.get_active_subscription(user_id)
        
        # Trường hợp 1: Không có gói nào
        if not sub:
            return {
                "active": False,
                "credits": 0,
                "plan_name": "Free",
                "expiry": None
            }
        
        # Trường hợp 2: Có gói -> Trả về full thông tin
        # Lưu ý: sub.package.name hoạt động nhờ relationship trong model
        return {
            "active": True,
            "credits": sub.credits_left,
            "plan_name": sub.package.name if sub.package else "Unknown",
            "expiry": sub.expired_at
        }