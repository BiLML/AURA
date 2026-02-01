# infrastructure/external/sepay_adapter.py
import os
from domain.models.ipayment_gateway import IPaymentGateway
import urllib.parse

class SePayAdapter(IPaymentGateway):
    def __init__(self):
        # Thông tin tài khoản ngân hàng của bạn (Đăng ký bên SePay)
        self.bank_code = os.getenv("BANK_CODE", "VietinBank")      
        self.acc_number = os.getenv("BANK_ACCOUNT", "") 
        self.template = "compact"

    def create_payment_link(self, order_id, amount, order_info, ip_addr):
        
        # [QUAN TRỌNG] Nội dung chuyển khoản phải chứa order_id (hoặc code riêng) để nhận diện
        # Ví dụ: Aura123 (Aura là prefix, 123 là transaction id)
        transfer_content = f"SEVQR Aura{order_id}"
        
        base_url = "https://qr.sepay.vn/img"
        params = {
            "bank": self.bank_code,
            "acc": self.acc_number,
            "template": self.template,
            "amount": int(amount),
            "des": transfer_content # Đây là chìa khóa để Webhook nhận diện đơn hàng
        }
        
        query_string = urllib.parse.urlencode(params)
        return f"{base_url}?{query_string}"

    def validate_callback(self, params: dict):
        # SePay dùng API Key để bảo mật Webhook (Header Authorization)
        # Logic này thường sẽ nằm ở Controller nhiều hơn là Adapter,
        # nhưng bạn có thể viết hàm check đơn giản ở đây.
        pass