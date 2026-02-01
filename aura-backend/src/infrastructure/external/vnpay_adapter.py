# File: core/infrastructure/external/vnpay_adapter.py

import os
from typing import Dict, Any
from datetime import datetime

# [FIX] Import đúng đường dẫn tuyệt đối dựa trên cấu trúc thư mục của bạn
from infrastructure.utils.vnpay_helper import VNPay 
from domain.models.ipayment_gateway import IPaymentGateway

class VNPayAdapter(IPaymentGateway):
    def __init__(self):
        # [FIX] Lấy cấu hình từ biến môi trường (Docker/Env)
        self.tmn_code = os.getenv("VNP_TMN_CODE")
        raw_secret = os.getenv("VNP_HASH_SECRET", "")
        self.secret_key = raw_secret.strip()
        self.vnp_url = os.getenv("VNP_URL")
        self.frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
        
        # Tạo URL return về trang Dashboard (hoặc trang kết quả)
        self.return_url = f"{self.frontend_url}/dashboard"

    def create_payment_link(self, order_id: str, amount: float, order_info: str, ip_addr: str) -> str:
        if not self.secret_key or not self.tmn_code:
            raise ValueError("VNPAY config is missing in .env")

        vnp = VNPay()
        vnp.requestData['vnp_Version'] = '2.1.0'
        vnp.requestData['vnp_Command'] = 'pay'
        vnp.requestData['vnp_TmnCode'] = self.tmn_code
        vnp.requestData['vnp_Amount'] = str(int(amount * 100))
        vnp.requestData['vnp_CurrCode'] = 'VND'
        vnp.requestData['vnp_TxnRef'] = order_id
        vnp.requestData['vnp_OrderInfo'] = order_info
        vnp.requestData['vnp_OrderType'] = 'other'
        vnp.requestData['vnp_Locale'] = 'vn'
        vnp.requestData['vnp_CreateDate'] = datetime.now().strftime('%Y%m%d%H%M%S')
        vnp.requestData['vnp_IpAddr'] = ip_addr
        vnp.requestData['vnp_ReturnUrl'] = self.return_url
        
        return vnp.get_payment_url(self.vnp_url, self.secret_key)

    def validate_callback(self, params: Dict[str, Any]) -> Dict[str, Any]:
        vnp = VNPay()
        vnp.responseData = params.copy()
        
        # Validate checksum
        if not vnp.validate_response(self.secret_key):
             return {"is_success": False, "message": "Invalid Checksum"}
            
        response_code = params.get('vnp_ResponseCode')
        order_id = params.get('vnp_TxnRef')
        
        if response_code == "00":
            return {
                "is_success": True, 
                "order_id": order_id, 
                "message": "Success"
            }
        else:
            return {
                "is_success": False, 
                "order_id": order_id, 
                "message": f"Payment failed with code {response_code}"
            }