import re
import os
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy.orm import Session

# 1. Import các Service và Schema cần thiết
from services.billing_service import BillingService
from core.database import get_db

# 2. Import Dependency (Lấy từ file medical_records hoặc billing nơi bạn đã viết hàm này)
# Lưu ý: Nếu bạn chưa tách hàm get_billing_service ra file riêng (dependencies.py),
# bạn có thể import nó từ api.v1.medical_records hoặc copy lại hàm đó vào đây.
from api.medical_records import get_billing_service 

router = APIRouter()

# --- HÀM BỔ TRỢ: Tách mã đơn hàng từ nội dung chuyển khoản ---
def extract_order_id(content: str) -> str:
    """
    Tìm chuỗi UUID trong nội dung chuyển khoản.
    Ví dụ: "Thanh toan Aura 123e4567-e89b-12d3-a456-426614174000"
    -> Trả về: "123e4567-e89b-12d3-a456-426614174000"
    """
    if not content:
        return None
    
    # Regex tìm chuỗi UUID chuẩn
    uuid_pattern = r'[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}'
    match = re.search(uuid_pattern, content.lower())
    
    if match:
        return match.group(0)
    return None

# --- API WEBHOOK ---
@router.post("/sepay-webhook")
async def sepay_webhook_handler(
    request: Request,
    authorization: str = Header(None), # Sửa lỗi gạch chân Header
    service: BillingService = Depends(get_billing_service) # Sửa lỗi gạch chân Depends
):
    # 1. Nhận dữ liệu JSON từ SePay
    try:
        data = await request.json()
    except:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # 2. Bảo mật: Check xem có đúng là SePay gọi không
    # (Lấy API Key này trong trang quản trị SePay)
    MY_SEPAY_API_KEY = os.getenv("SEPAY_API_KEY")

    if not MY_SEPAY_API_KEY:
        print("❌ LỖI: Chưa cấu hình SEPAY_API_KEY trong file .env")
        return {"success": False, "message": "Server Config Error"}
    
    if not authorization or authorization != f"Apikey {MY_SEPAY_API_KEY}":
        # SePay yêu cầu trả về 200 kể cả lỗi để không retry liên tục, nhưng print log ra để debug
        print(f"❌ Fake Webhook Request: {authorization}")
        return {"success": False, "message": "Unauthorized"}

    # 3. Lấy thông tin
    # SePay gửi về: { "content": "Thanh toan Aura 550e8400...", "transferAmount": 50000, ... }
    content = data.get("content", "") 
    amount_in = data.get("transferAmount", 0)

    print(f"💰 Nhận webhook: {content} - {amount_in} VNĐ")

    # 4. Phân tích nội dung để tìm Order ID (UUID transaction)
    order_id = extract_order_id(content)
    
    if not order_id:
        print("⚠️ Không tìm thấy mã đơn hàng trong nội dung chuyển khoản")
        return {"success": False, "message": "Order ID not found"}

    # 5. Gọi Service kích hoạt gói
    # Hàm này sẽ tìm transaction theo ID, check số tiền, và cộng lượt
    try:
        result = service.confirm_sepay_transaction(
            order_id_str=order_id, # Truyền chuỗi (có thể thiếu dash) vào
            amount=amount_in
        )
        print(f"✅ Kết quả xử lý: {result}")
    except Exception as e:
        print(f"❌ Lỗi xử lý Service: {e}")
        return {"success": False, "message": str(e)}

    return {"success": True}