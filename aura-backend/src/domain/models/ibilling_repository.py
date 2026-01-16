from abc import ABC, abstractmethod
from typing import List, Optional
from uuid import UUID

from models.billing import ServicePackage, Subscription






# 5. INTERFACE CHO BILLING
class IBillingRepository(ABC):
    @abstractmethod
    def get_all_packages(self) -> List[ServicePackage]: pass

    @abstractmethod
    def get_active_subscription(self, user_id: UUID) -> Optional[Subscription]: pass

    @abstractmethod
    def create_subscription(self, user_id: UUID, package_id: UUID, days: int, credits: int) -> Subscription: pass