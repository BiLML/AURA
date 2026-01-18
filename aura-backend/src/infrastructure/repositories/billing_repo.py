from sqlalchemy import func, desc
from sqlalchemy.orm import Session, joinedload
from uuid import UUID
from datetime import date, timedelta
from typing import List, Optional

# Import Interface & Models
from domain.models.ibilling_repository import IBillingRepository
from models.billing import ServicePackage, Subscription, PaymentTransaction

class BillingRepository(IBillingRepository):
    def __init__(self, db: Session):
        self.db = db

    # --- IMPLEMENT 1. QUẢN LÝ GÓI ---
    def create_package(self, name: str, price: float, limit: int, days: int, desc: str, role: str) -> ServicePackage:
        pkg = ServicePackage(
            name=name,
            price=price,
            analysis_limit=limit, 
            duration_days=days,
            description=desc,
            target_role=role # Đã khớp với Interface
        )
        self.db.add(pkg)
        self.db.commit()
        self.db.refresh(pkg)
        return pkg

    def get_all_packages(self) -> List[ServicePackage]:
        return self.db.query(ServicePackage).filter(ServicePackage.is_active == True).all()

    def get_package_by_id(self, package_id: UUID) -> Optional[ServicePackage]:
        return self.db.query(ServicePackage).filter(ServicePackage.id == package_id).first()

    # --- IMPLEMENT 2. QUẢN LÝ THUÊ BAO ---
    def get_active_subscription(self, user_id: UUID) -> Optional[Subscription]:
        return self.db.query(Subscription).options(
            joinedload(Subscription.package) # Eager load để lấy tên gói hiển thị Dashboard
        ).filter(
            Subscription.user_id == user_id,
            Subscription.expired_at >= date.today()
        ).first()

    def create_subscription(self, user_id: UUID, package_id: UUID, days: int, credits: int) -> Subscription:
        # Logic: Tìm gói cũ -> Nếu có thì cộng dồn, chưa có thì tạo mới
        sub = self.db.query(Subscription).filter(Subscription.user_id == user_id).first()
        
        # Tính ngày hết hạn
        expiry_date = date.today() + timedelta(days=days)

        if sub:
            # GIA HẠN
            sub.package_id = package_id
            # Nếu gói cũ còn hạn thì cộng dồn, hết hạn thì reset lại bằng số credits gói mới
            if sub.expired_at and sub.expired_at >= date.today():
                sub.credits_left += credits
            else:
                sub.credits_left = credits
            
            sub.expired_at = expiry_date
        else:
            # MUA MỚI
            sub = Subscription(
                user_id=user_id,
                package_id=package_id, 
                credits_left=credits,
                expired_at=expiry_date
            )
            self.db.add(sub)
        
        self.db.commit()
        self.db.refresh(sub)
        return sub
    
    def deduct_credits(self, subscription_id: UUID) -> bool:
        # Atomic Update: Trừ trực tiếp trong DB để tránh Race Condition
        rows_affected = self.db.query(Subscription).filter(
            Subscription.id == subscription_id,
            Subscription.credits_left > 0
        ).update(
            {"credits_left": Subscription.credits_left - 1}
        )
        
        self.db.commit()
        return rows_affected > 0

    # --- IMPLEMENT 3 & 4. GIAO DỊCH & BÁO CÁO ---
    def create_transaction(self, user_id: UUID, package_id: UUID, amount: float, status: str) -> PaymentTransaction:
        tx = PaymentTransaction(
            user_id=user_id,
            package_id=package_id, 
            amount=amount,
            status=status
        )
        self.db.add(tx)
        self.db.commit()
        return tx
    
    def get_total_revenue(self) -> float:
        total = self.db.query(func.sum(PaymentTransaction.amount)).filter(
            PaymentTransaction.status == "SUCCESS"
        ).scalar()
        return total if total else 0.0

    def get_recent_transactions(self, limit: int = 10) -> List[PaymentTransaction]:
        return self.db.query(PaymentTransaction).options(
            joinedload(PaymentTransaction.user),
            joinedload(PaymentTransaction.package)
        ).filter(
            PaymentTransaction.status == "SUCCESS"
        ).order_by(desc(PaymentTransaction.created_at)).limit(limit).all()