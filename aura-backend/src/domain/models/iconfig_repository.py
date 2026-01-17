from abc import ABC, abstractmethod
from typing import Optional
from models.system_config import SystemConfig # Giả sử bạn đã có model này

class IConfigRepository(ABC):
    @abstractmethod
    def get_config(self) -> Optional[SystemConfig]: pass

    @abstractmethod
    def create_config(self, new_config: SystemConfig) -> SystemConfig: pass

    @abstractmethod
    def update_config(self, config_data: dict) -> SystemConfig: pass