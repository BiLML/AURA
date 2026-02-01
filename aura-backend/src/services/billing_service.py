from uuid import UUID
from datetime import date, timedelta
from typing import List, Optional

# Import Interface & Models
from domain.models.ibilling_repository import IBillingRepository
from domain.models.iaudit_repository import IAuditRepository
from domain.models.ipayment_gateway import IPaymentGateway

from models.billing import ServicePackage
from models.audit_log import AuditLog 

class BillingService:
    def __init__(self, billing_repo: IBillingRepository, audit_repo: IAuditRepository, payment_gateway: IPaymentGateway, db=None): 
        self.billing_repo = billing_repo
        self.audit_repo = audit_repo
        self.payment_gateway = payment_gateway
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
    def create_payment_url(self, user_id: UUID, package_id: UUID, ip_address: str):
        # A. Lấy thông tin gói
        pkg = self.billing_repo.get_package_by_id(package_id)
        if not pkg: raise ValueError("Gói dịch vụ không tồn tại")

        # B. Tạo Transaction trạng thái PENDING
        tx = self.billing_repo.create_transaction(user_id, pkg.id, pkg.price, "PENDING")

        # C. Gọi qua Interface để lấy link (VNPay/Momo/...)
        payment_url = self.payment_gateway.create_payment_link(
            order_id=str(tx.id),
            amount=pkg.price,
            order_info=f"ThanhToanAura_{pkg.limit}",
            ip_addr=ip_address
        )
        
        return {"payment_url": payment_url}
    
    # 2. XỬ LÝ KHI USER THANH TOÁN XONG (Callback)
    def process_payment_return(self, params: dict):
        # A. Validate dữ liệu trả về qua Interface
        result = self.payment_gateway.validate_callback(params)
        
        tx_id = result.get("order_id")
        # Tìm giao dịch trong DB
        tx = self.billing_repo.get_transaction_by_id(tx_id)
        if not tx: return {"status": "FAILED", "message": "Giao dịch không tồn tại"}
        
        # Nếu đã thành công trước đó thì bỏ qua (tránh cộng dồn 2 lần)
        if tx.status == "SUCCESS": 
            return {"status": "SUCCESS", "message": "Giao dịch đã hoàn tất"}

        if result["is_success"]:
            # --- THANH TOÁN THÀNH CÔNG ---
            # 1. Cập nhật trạng thái Transaction
            self.billing_repo.update_transaction_status(tx.id, "SUCCESS")
            
            # 2. Kích hoạt Subscription (Cộng ngày, cộng lượt)
            self.billing_repo.create_subscription(
                user_id=tx.user_id,
                package_id=tx.package_id,
                days=tx.package.duration_days,
                credits=tx.package.analysis_limit
            )
            
            return {"status": "SUCCESS", "message": "Thanh toán thành công"}
        else:
            # --- THANH TOÁN THẤT BẠI ---
            self.billing_repo.update_transaction_status(tx.id, "FAILED")
            return {"status": "FAILED", "message": result["message"]}

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