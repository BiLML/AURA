# aura-backend/ai_service/data_loader.py
import os
import psycopg2
import cv2
import numpy as np
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed

# Cấu hình DB an toàn
DB_HOST = os.getenv("DB_HOST", "aura_db")
DB_NAME = os.getenv("DB_NAME", "aura_clinic_db")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASS", "password")

def download_and_process_image(row):
    """Hàm worker xử lý từng ảnh cho ThreadPool"""
    image_url, label = row
    try:
        response = requests.get(image_url, timeout=10)
        if response.status_code == 200:
            img_array = np.asarray(bytearray(response.content), dtype=np.uint8)
            img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            
            label_map = {"Normal": 0, "Mild": 1, "Moderate": 2, "Severe": 3, "PDR": 4}
            # Xử lý label an toàn hơn nếu label rỗng
            label_str = label.split()[0] if label else "Normal"
            label_idx = label_map.get(label_str, 0)
            
            if img is not None:
                # Resize ảnh về chuẩn training (VD: 224x224) để tiết kiệm RAM
                img_resized = cv2.resize(img, (224, 224))
                return (img_resized, label_idx)
    except Exception as e:
        print(f"❌ Lỗi tải {image_url}: {e}")
    return None

def get_verified_data():
    conn = psycopg2.connect(host=DB_HOST, database=DB_NAME, user=DB_USER, password=DB_PASS)
    cursor = conn.cursor()

    # --- BƯỚC 1: LẤY CẤU HÌNH HỆ THỐNG ---
    # Lấy config mới nhất (sắp xếp theo updated_at)
    config_query = """
        SELECT require_training_consent 
        FROM system_configs 
        ORDER BY updated_at DESC 
        LIMIT 1;
    """
    cursor.execute(config_query)
    config_row = cursor.fetchone()
    
    # Mặc định là False nếu chưa có config
    require_consent = config_row[0] if config_row else False
    
    print(f"🔒 Chế độ Yêu cầu Đồng ý (Consent): {'BẬT' if require_consent else 'TẮT'}")

    # --- BƯỚC 2: XÂY DỰNG QUERY DỰA TRÊN CẤU HÌNH ---
    if require_consent:
        # ⚠️ QUAN TRỌNG: Nếu Admin bật Consent, hệ thống sẽ lọc kỹ hơn
        # (Giả sử bảng Patients có cột 'consent_for_training'. 
        # Nếu chưa có, bạn cần thêm cột này hoặc code sẽ báo lỗi/trả về rỗng)
        print("⚠️ Đang lọc dữ liệu chỉ lấy bệnh nhân đã đồng ý...")
        query = """
            SELECT ri.image_url, dv.doctor_confirm 
            FROM doctor_validations dv
            JOIN ai_analysis_results ar ON dv.analysis_id = ar.id
            JOIN retinal_images ri ON ar.image_id = ri.id
            JOIN patients p ON ri.patient_id = p.id  -- Join để check quyền
            WHERE dv.doctor_confirm IS NOT NULL
            AND p.consent_for_training = TRUE  <-- BỎ COMMENT DÒNG NÀY KHI DB CÓ CỘT NÀY
            ORDER BY dv.created_at DESC
            LIMIT 100;
        """
    else:
        # Chế độ cũ: Lấy tất cả ảnh đã được bác sĩ xác nhận
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
    conn.close()
    
    if not rows:
        print("⚠️ Không tìm thấy dữ liệu phù hợp (Hoặc do bộ lọc Consent).")
        return []

    training_data = []
    print(f"🚀 Bắt đầu tải song song {len(rows)} mẫu...")

    # Tải song song với 10 luồng
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(download_and_process_image, row) for row in rows]
        
        for future in as_completed(futures):
            result = future.result()
            if result:
                training_data.append(result)

    print(f"✅ Đã tải xong {len(training_data)} ảnh hợp lệ để huấn luyện.")
    return training_data