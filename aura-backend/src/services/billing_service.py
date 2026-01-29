from uuid import UUID
from datetime import date, timedelta
from typing import List, Optional

# Import Interface & Models
from domain.models.ibilling_repository import IBillingRepository
from domain.models.iaudit_repository import IAuditRepository

from models.billing import ServicePackage
from models.audit_log import AuditLog 

class BillingService:
    def __init__(self, billing_repo: IBillingRepository, audit_repo: IAuditRepository, db=None): 
        self.billing_repo = billing_repo
        self.audit_repo = audit_repo
        self.db = db # Giữ lại nếu cần commit transaction phức tạp, nhưng nên hạn chế dùng

    # --- 1. ADMIN: TẠO GÓI (Thêm mới) ---
    def create_package(self, name, price, limit, days, desc, role, admin_id: UUID, ip_address: str):
        
        # Logic cũ
        new_pkg = self.billing_repo.create_package(name, price, limit, days, desc, role)

        # --- THÊM LOGGING ---
        try:
            self.audit_repo.create_log(AuditLog(
                user_id=admin_id,
                action="CREATE_SERVICE_PACKAGE",
                resource_type="service_packages",
                resource_id=str(new_pkg.id),
                old_values=None, # Tạo mới nên không có giá trị cũ
                new_values={
                    "name": name, 
                    "price": float(price) if price else 0,
                    "role": role
                },
                ip_address=ip_address
            ))
        except Exception as e: print(f"Log Error: {e}")

        return new_pkg

    # --- 2. PUBLIC: LẤY DANH SÁCH GÓI ---
    def list_service_packages(self) -> List[ServicePackage]:
        return self.billing_repo.get_all_packages()

    # --- 3. USER: MUA GÓI ---
    def subscribe_user(self, user_id: UUID, package_id: UUID, ip_address: str = "Unknown"):
        # A. Kiểm tra gói tồn tại
        pkg = self.billing_repo.get_package_by_id(package_id)
        if not pkg:
            raise ValueError("Gói dịch vụ không tồn tại")

        try:
            self.audit_repo.create_log(AuditLog(
                user_id=user_id,
                action="SUBSCRIBE_PACKAGE",
                resource_type="subscriptions",
                resource_id=str(pkg.id),
                ip_address=ip_address,
                new_values={
                    "package_name": pkg.name,
                    "price": float(pkg.price),
                    "days": pkg.duration_days
                }
            ))
        except Exception: pass

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
    
    # --- [QUAN TRỌNG] 5. HÀM TRỪ LƯỢT (BỔ SUNG) ---
    def deduct_credit(self, user_id: UUID) -> bool:
        """
        Kiểm tra và trừ 1 lượt của user.
        Logic: Service lấy User ID -> Tìm Subscription ID -> Gọi Repo trừ tiền
        """
        # 1. Tìm gói đăng ký còn hạn của user
        sub = self.billing_repo.get_active_subscription(user_id)

        
        # 2. Nếu không có gói hoặc hết lượt -> Trả về False
        if not sub or sub.credits_left <= 0:
            return False
            
        # 3. Gọi xuống Repo để thực hiện trừ (Atomic Update)
        # Lưu ý: Repo deduct_credits nhận subscription_id, không phải user_id
        return self.billing_repo.deduct_credits(sub.id)
    
    def get_user_history(self, user_id: UUID):
        txs = self.billing_repo.get_transactions_by_user(user_id)
        
        # Map sang dict/schema (hoặc để Pydantic tự làm ở tầng API)
        results = []
        for t in txs:
            pkg_name = t.package.name if t.package else "Gói bị xóa"
            results.append({
                "id": t.id,
                "amount": t.amount,
                "status": t.status,
                "created_at": t.created_at,
                "package_name": pkg_name
            })
        return results