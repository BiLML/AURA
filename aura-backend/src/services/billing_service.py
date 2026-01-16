from sqlalchemy.orm import Session
from domain.models.ibilling_repository import IBillingRepository
from models.billing import Subscription
from uuid import UUID

class BillingService:
    def __init__(self, billing_repo: IBillingRepository, db: Session):
        self.billing_repo = billing_repo
        self.db = db

    def list_service_packages(self):
        return self.billing_repo.get_all_packages()

    def subscribe_user(self, user_id: UUID, package_id: UUID):
        # 1. Lấy thông tin gói cước để biết thời hạn và giá
        # (Giả sử bạn có hàm get_package_by_id trong repo, hoặc lấy từ list)
        packages = self.billing_repo.get_all_packages()
        selected_pkg = next((p for p in packages if p.id == package_id), None)
        
        if not selected_pkg:
            raise ValueError("Gói dịch vụ không tồn tại")

        # 2. Kiểm tra xem user có đang dùng gói nào còn hạn không?
        current_sub = self.billing_repo.get_active_subscription(user_id)
        if current_sub:
            raise ValueError("User đang có gói dịch vụ còn hiệu lực")

        # 3. Đăng ký mới
        return self.billing_repo.create_subscription(
            user_id=user_id,
            package_id=package_id,
            days=selected_pkg.duration_days,
            credits=selected_pkg.analysis_limit
        )

    def check_credits(self, user_id: UUID) -> int:
        """Kiểm tra xem user còn bao nhiêu lượt khám"""
        sub = self.billing_repo.get_active_subscription(user_id)
        if sub:
            return sub.credits_left
        return 0