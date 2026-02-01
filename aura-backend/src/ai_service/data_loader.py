# aura-backend/ai_service/data_loader.py
import os
print(">>>> TÔI LÀ CODE MỚI - DATABASE_URL HIỆN TẠI LÀ:", os.getenv("DATABASE_URL")) # <--- THÊM DÒNG NÀY
import psycopg2
import cv2
import numpy as np
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

# Lấy URL kết nối chuẩn từ biến môi trường (Đã khớp với file .env và docker-compose)
DATABASE_URL = os.getenv("DATABASE_URL")

def download_and_process_image(row):
    """Hàm worker xử lý từng ảnh cho ThreadPool"""
    image_url, label = row
    try:
        response = requests.get(image_url, timeout=10)
        if response.status_code == 200:
            # Chuyển bytes thành numpy array
            img_array = np.asarray(bytearray(response.content), dtype=np.uint8)
            img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            
            # Mapping label
            label_map = {"Normal": 0, "Mild": 1, "Moderate": 2, "Severe": 3, "PDR": 4}
            label_str = label.split()[0] if label else "Normal"
            label_idx = label_map.get(label_str, 0)
            
            if img is not None:
                # Resize ảnh về 224x224 chuẩn training
                img_resized = cv2.resize(img, (224, 224))
                return (img_resized, label_idx)
    except Exception as e:
        # Chỉ print lỗi ngắn gọn để không rác log
        print(f"⚠️ Lỗi ảnh: {image_url[-20:]}... -> {e}")
    return None

def get_verified_data():
    if not DATABASE_URL:
        print("❌ LỖI: Chưa tìm thấy biến môi trường DATABASE_URL")
        return []

    conn = None
    try:
        # [QUAN TRỌNG] Kết nối thẳng bằng DATABASE_URL thay vì tách lẻ host/user
        conn = psycopg2.connect(DATABASE_URL)
        cursor = conn.cursor()

        # --- BƯỚC 1: LẤY CẤU HÌNH HỆ THỐNG ---
        # Kiểm tra xem bảng system_configs có tồn tại không trước khi query để tránh crash
        try:
            cursor.execute("""
                SELECT require_training_consent 
                FROM system_configs 
                ORDER BY updated_at DESC 
                LIMIT 1;
            """)
            config_row = cursor.fetchone()
            require_consent = config_row[0] if config_row else False
        except Exception:
            # Nếu bảng chưa có hoặc lỗi, mặc định là False và rollback transaction
            conn.rollback() 
            require_consent = False

        print(f"🔒 Chế độ Yêu cầu Đồng ý (Consent): {'BẬT' if require_consent else 'TẮT'}")

        # --- BƯỚC 2: XÂY DỰNG QUERY ---
        if require_consent:
            print("⚠️ Đang lọc dữ liệu chỉ lấy bệnh nhân đã đồng ý...")
            # Lưu ý: Cột p.consent_for_training phải tồn tại trong bảng patients
            # Tôi đã xóa dòng comment "<-- BỎ COMMENT" đi vì nó gây lỗi SQL Syntax
            query = """
                SELECT ri.image_url, dv.doctor_confirm 
                FROM doctor_validations dv
                JOIN ai_analysis_results ar ON dv.analysis_id = ar.id
                JOIN retinal_images ri ON ar.image_id = ri.id
                JOIN patients p ON ri.patient_id = p.id 
                WHERE dv.doctor_confirm IS NOT NULL
                AND p.consent_for_training = TRUE 
                ORDER BY dv.created_at DESC
                LIMIT 100;
            """
        else:
            query = """
                SELECT ri.image_url, dv.doctor_confirm 
                FROM doctor_validations dv
                JOIN ai_analysis_results ar ON dv.analysis_id = ar.id
                JOIN retinal_images ri ON ar.image_id = ri.id
                WHERE dv.doctor_confirm IS NOT NULL
                ORDER BY dv.created_at DESC
                LIMIT 100;
            """

        cursor.execute(query)
        rows = cursor.fetchall()
        
        if not rows:
            print("⚠️ Không tìm thấy dữ liệu phù hợp.")
            return []

        training_data = []
        print(f"🚀 Tìm thấy {len(rows)} bản ghi. Bắt đầu tải ảnh...")

        # Tải song song
        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = [executor.submit(download_and_process_image, row) for row in rows]
            
            for future in as_completed(futures):
                result = future.result()
                if result:
                    training_data.append(result)

        print(f"✅ Đã tải thành công {len(training_data)} ảnh huấn luyện.")
        return training_data

    except Exception as e:
        print(f"❌ Lỗi Data Loader: {e}")
        return []
    finally:
        if conn:
            conn.close()