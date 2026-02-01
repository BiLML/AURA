import re
import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from services.billing_service import BillingService
from api.billing import get_billing_service

router = APIRouter()

def extract_order_id(content: str) -> str:
    if not content:
        return None
    
    # [QUAN TRỌNG] Xóa chữ "aura" đi để tránh Regex bắt nhầm chữ 'a' cuối cùng
    # content gốc: "...Auraf867..." -> clean: "... f867..."
    clean_content = content.lower().replace("aura", " ") 
    
    # Regex tìm chuỗi UUID (32 ký tự hex)
    uuid_pattern = r'[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}'
    match = re.search(uuid_pattern, clean_content)
    
    if match:
        return match.group(0)
    return None

@router.post("/sepay-webhook")
async def sepay_webhook_handler(
    request: Request,
    authorization: str = Header(None),
    service: BillingService = Depends(get_billing_service)
):
    try:
        data = await request.json()
    except:
        return {"success": False, "message": "Invalid JSON"}

    MY_SEPAY_API_KEY = os.getenv("SEPAY_API_KEY")
    if not authorization or authorization != f"Apikey {MY_SEPAY_API_KEY}":
        print(f"❌ Fake Webhook: {authorization}")
        return {"success": False, "message": "Unauthorized"}

    content = data.get("content", "") 
    amount_in = data.get("transferAmount", 0)
    print(f"💰 Nhận webhook: {content} - {amount_in}")

    order_id = extract_order_id(content)
    if not order_id:
        print(f"⚠️ Không tìm thấy ID trong: {content}")
        return {"success": False, "message": "Order ID not found"}

    try:
        # Chuẩn hóa về dạng UUID có gạch ngang
        formatted_order_id = str(uuid.UUID(order_id))
        
        # Gọi service
        result = service.confirm_sepay_transaction(formatted_order_id, amount_in)
        
        # Log kết quả chi tiết
        if result['success']:
             print(f"✅ SUCCESS: Kích hoạt xong đơn {formatted_order_id}")
        else:
             print(f"❌ FAILED: Service trả về False: {result}")
             
        return result
        
    except ValueError:
        print(f"❌ UUID Error: Chuỗi '{order_id}' không phải UUID chuẩn")
        return {"success": False, "message": "Invalid UUID format"}
    except Exception as e:
        print(f"❌ Exception: {str(e)}")
        return {"success": False, "message": str(e)}