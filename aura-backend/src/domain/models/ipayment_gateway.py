# core/domain/models/ipayment_gateway.py
from abc import ABC, abstractmethod
from typing import Dict, Any

class IPaymentGateway(ABC):
    @abstractmethod
    def create_payment_link(self, order_id: str, amount: float, order_info: str, ip_addr: str) -> str:
        """Tạo URL thanh toán để redirect user sang trang thanh toán"""
        pass

    @abstractmethod
    def validate_callback(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Kiểm tra tính hợp lệ của dữ liệu trả về (Checksum).
        Return: Dictionary chứa {is_success: bool, order_id: str, message: str, ...}
        """
        pass