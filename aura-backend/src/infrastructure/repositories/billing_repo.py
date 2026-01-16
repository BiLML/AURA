from sqlalchemy.orm import Session, joinedload
from uuid import UUID
from datetime import date, timedelta
from typing import List, Optional

from domain.models.ibilling_repository import IBillingRepository
from models.billing import ServicePackage, Subscription, PaymentTransaction

class BillingRepository(IBillingRepository):
    def __init__(self, db: Session):
        self.db = db

    def get_all_packages(self) -> List[ServicePackage]:
        # Chỉ lấy gói đang active
        return self.db.query(ServicePackage).filter(ServicePackage.is_active == True).all()

    def get_package_by_id(self, package_id: UUID) -> Optional[ServicePackage]:
        return self.db.query(ServicePackage).filter(ServicePackage.id == package_id).first()

    def create_package(self, name, price, limit, days, desc, role) -> ServicePackage:
        pkg = ServicePackage(
            name=name, price=price, analysis_limit=limit, 
            duration_days=days, description=desc, target_role=role
        )
        self.db.add(pkg)
        self.db.commit()
        self.db.refresh(pkg)
        return pkg

    def get_active_subscription(self, user_id: UUID) -> Optional[Subscription]:
        return self.db.query(Subscription).filter(
            Subscription.user_id == user_id,
            Subscription.expired_at >= date.today()
        ).first()

    def create_subscription(self, user_id: UUID, package_id: UUID, days: int, credits: int) -> Subscription:
        # Check gói cũ
        sub = self.db.query(Subscription).filter(Subscription.user_id == user_id).first()
        expiry_date = date.today() + timedelta(days=days)

        if sub:
            # Gia hạn: Cộng dồn credit, reset ngày hết hạn mới
            sub.package_id = package_id
            sub.credits_left += credits
            sub.expired_at = expiry_date
        else:
            # Mua mới
            sub = Subscription(
                user_id=user_id, package_id=package_id, 
                credits_left=credits, expired_at=expiry_date
            )
            self.db.add(sub)
        
        self.db.commit()
        self.db.refresh(sub)
        return sub

    def create_transaction(self, user_id: UUID, package_id: UUID, amount, status: str):
        tx = PaymentTransaction(
            user_id=user_id, package_id=package_id, 
            amount=amount, status=status
        )
        self.db.add(tx)
        self.db.commit()
        return tx
    
    def deduct_credits(self, subscription_id: UUID) -> bool:
        # Hàm này dùng để trừ tiền khi user chạy AI
        sub = self.db.query(Subscription).filter(Subscription.id == subscription_id).first()
        if sub and sub.credits_left > 0:
            sub.credits_left -= 1
            self.db.commit()
            return True
        return False