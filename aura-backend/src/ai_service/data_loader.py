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
DB_PASS = os.getenv("DB_PASS", "password") # Fallback chỉ dùng cho dev

def download_and_process_image(row):
    """Hàm worker xử lý từng ảnh cho ThreadPool"""
    image_url, label = row
    try:
        response = requests.get(image_url, timeout=10) # Thêm timeout
        if response.status_code == 200:
            img_array = np.asarray(bytearray(response.content), dtype=np.uint8)
            img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            
            label_map = {"Normal": 0, "Mild": 1, "Moderate": 2, "Severe": 3, "PDR": 4}
            label_idx = label_map.get(label.split()[0], 0)
            
            if img is not None:
                return (img, label_idx)
    except Exception as e:
        print(f"❌ Lỗi tải {image_url}: {e}")
    return None

def get_verified_data():
    conn = psycopg2.connect(host=DB_HOST, database=DB_NAME, user=DB_USER, password=DB_PASS)
    cursor = conn.cursor()

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
    
    training_data = []
    print(f"🚀 Bắt đầu tải song song {len(rows)} mẫu...")

    # Tải song song với 10 luồng (Threads)
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(download_and_process_image, row) for row in rows]
        
        for future in as_completed(futures):
            result = future.result()
            if result:
                training_data.append(result)

    print(f"✅ Đã tải xong {len(training_data)} ảnh hợp lệ.")
    return training_data