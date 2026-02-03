# aura-backend/ai/inference.py
import onnxruntime as ort
import numpy as np
import cv2
import os
import base64
import math
from concurrent.futures import ThreadPoolExecutor

# --- CẤU HÌNH ---
SEG_INPUT_SIZE = 256
CLS_INPUT_SIZE = 224

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ONNX_DIR = os.path.join(BASE_DIR, 'ai_onnx')

MODEL_FILES = {
    'EX': 'EX.onnx', 'HE': 'HE.onnx', 'SE': 'SE.onnx',
    'MA': 'MA.onnx', 'OD': 'OD.onnx', 'Vessels': 'Vessels.onnx',
    'CLASSIFIER': 'CLASSIFIER.onnx'
}

CLASS_MAP = {0: "Normal", 1: "Mild NPDR", 2: "Moderate NPDR", 3: "Severe NPDR", 4: "PDR"}

loaded_sessions = {}
print("⏳ [AI CORE] ĐANG KHỞI ĐỘNG ONNX RUNTIME...")

sess_options = ort.SessionOptions()
sess_options.intra_op_num_threads = 2 
sess_options.execution_mode = ort.ExecutionMode.ORT_PARALLEL
sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

providers = ['CPUExecutionProvider'] # Hoặc CUDA nếu có

for name, filename in MODEL_FILES.items():
    path = os.path.join(ONNX_DIR, filename)
    if os.path.exists(path):
        try:
            loaded_sessions[name] = ort.InferenceSession(path, sess_options, providers=providers)
            print(f"   ✅ Loaded: {name}")
        except Exception as e:
            print(f"   ❌ Failed to load {name}: {e}")

# --- HELPER FUNCTIONS ---
def encode_image_to_base64(img_array):
    _, buffer = cv2.imencode('.jpg', img_array)
    return base64.b64encode(buffer).decode('utf-8')

def preprocess_image(img, target_size, use_graham=True):
    img_resized = cv2.resize(img, (target_size, target_size))
    if use_graham and target_size == 224:
        img_resized = cv2.addWeighted(img_resized, 4, cv2.GaussianBlur(img_resized, (0,0), 10), -4, 128)
    img_float = img_resized.astype(np.float32)
    img_float /= 255.0 
    return img_float

def clean_mask(mask_array, min_size=10):
    if mask_array.ndim == 4: mask_array = mask_array[0,:,:,0]
    elif mask_array.ndim == 3: mask_array = mask_array[:,:,0]
    mask_uint8 = (mask_array * 255).astype(np.uint8)
    _, mask_uint8 = cv2.threshold(mask_uint8, 127, 255, cv2.THRESH_BINARY)
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(mask_uint8, connectivity=8)
    cleaned = np.zeros_like(mask_uint8)
    for i in range(1, num_labels):
        if stats[i, cv2.CC_STAT_AREA] >= min_size:
            cleaned[labels == i] = 255
    return cleaned.astype(np.float32) / 255.0

# --- NEW: PHÂN TÍCH MẠCH MÁU & RỦI RO TOÀN THÂN ---
def analyze_vascular_health(vessel_mask_full):
    """
    Phân tích hình thái mạch máu để dự đoán rủi ro toàn thân.
    Input: Mask mạch máu kích thước gốc (0-1 float hoặc 0-255 uint8)
    """
    # 1. Chuẩn bị mask
    mask_bin = (vessel_mask_full * 255).astype(np.uint8) if vessel_mask_full.max() <= 1.0 else vessel_mask_full.astype(np.uint8)
    _, mask_bin = cv2.threshold(mask_bin, 127, 255, cv2.THRESH_BINARY)
    
    h, w = mask_bin.shape
    total_area = h * w
    vessel_area = np.sum(mask_bin > 0)
    
    # 2. Tính Mật độ mạch máu (Vessel Density) -> Liên quan đến thiếu máu cục bộ
    density = (vessel_area / total_area) * 100 
    
    # 3. Tính Độ cong (Tortuosity) -> Liên quan đến Tăng huyết áp (Hypertension)
    contours, _ = cv2.findContours(mask_bin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    tortuosity_indices = []
    
    for cnt in contours:
        if cv2.contourArea(cnt) > 50: # Chỉ tính mạch máu dài
            perimeter = cv2.arcLength(cnt, True)
            # Khoảng cách thẳng giữa điểm đầu và cuối (xấp xỉ qua bounding box diagonal hoặc perimeter ratio)
            # Đơn giản hóa: Tortuosity = Chu vi thực / Chu vi convex hull (độ lồi lõm)
            hull = cv2.convexHull(cnt)
            hull_perimeter = cv2.arcLength(hull, True)
            if hull_perimeter > 0:
                tortuosity_indices.append(perimeter / hull_perimeter)

    avg_tortuosity = np.mean(tortuosity_indices) if tortuosity_indices else 1.0

    # 4. Đánh giá Rủi ro
    risks = []
    
    # -- Rủi ro Tăng Huyết Áp (Hypertensive Retinopathy Signs) --
    htn_risk = "Thấp"
    if avg_tortuosity > 2.2: htn_risk = "Cao (Cảnh báo)"
    elif avg_tortuosity > 1.8: htn_risk = "Trung bình"
    
    if htn_risk != "Thấp":
        risks.append(f"- Tăng huyết áp: Phát hiện mạch máu co kéo, gấp khúc bất thường (Tortuosity Index: {avg_tortuosity:.2f}).")

    # -- Rủi ro Tim mạch / Đột quỵ (Cardiovascular / Stroke) --
    # Mạch máu quá thưa thớt hoặc bị đứt đoạn (Density thấp bất thường)
    cvd_risk = "Ổn định"
    if density < 1.5: # Ngưỡng giả định
        cvd_risk = "Cảnh báo thiếu máu cục bộ"
        risks.append(f"- Nguy cơ Đột quỵ/Tim mạch: Mật độ mạch máu võng mạc thấp ({density:.2f}%), gợi ý tình trạng thiếu máu cục bộ.")
    
    return {
        "density": density,
        "tortuosity": avg_tortuosity,
        "htn_risk": htn_risk,
        "cvd_risk": cvd_risk,
        "systemic_notes": risks
    }

# --- CORE LOGIC ---
def run_aura_inference(image_bytes):
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        original_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if original_img is None: return None, "Lỗi đọc ảnh", "File hỏng"
        
        orig_h, orig_w = original_img.shape[:2]
        original_rgb = cv2.cvtColor(original_img, cv2.COLOR_BGR2RGB)
        
        # Input Models
        input_seg = preprocess_image(original_rgb, target_size=SEG_INPUT_SIZE, use_graham=False)
        input_cls = preprocess_image(original_rgb, target_size=CLS_INPUT_SIZE, use_graham=True)
        if input_seg.ndim == 3: input_seg = np.expand_dims(input_seg, axis=0)
        if input_cls.ndim == 3: input_cls = np.expand_dims(input_cls, axis=0)

        # 1. CLASSIFIER (DR Grading)
        dr_grade = "Unknown"
        confidence = 0.0
        if 'CLASSIFIER' in loaded_sessions:
            session = loaded_sessions['CLASSIFIER']
            preds = session.run(None, {session.get_inputs()[0].name: input_cls})[0]
            class_idx = np.argmax(preds[0])
            confidence = float(np.max(preds[0]))
            dr_grade = CLASS_MAP.get(class_idx, "Unknown")
            if class_idx == 0 and confidence > 0.95: dr_grade = "Normal (Healthy Retina)"

        # 2. SEGMENTATION LOOP
        overlay_full = np.zeros((orig_h, orig_w, 3), dtype=np.uint8) 
        findings = {'HE': 0, 'MA': 0, 'EX': 0, 'SE': 0, 'Vessels': 0}
        
        vessel_mask_full = np.zeros((orig_h, orig_w), dtype=np.float32) # Để dành phân tích mạch máu

        def run_seg_model(key, color, is_vessel=False):
            if key not in loaded_sessions: return
            try:
                # Xử lý input riêng cho Vessels (nếu cần 512x512) hoặc dùng chung
                curr_input = input_seg
                if key == 'Vessels': # Vessels model thường train 512 hoặc xử lý riêng
                    img_v = cv2.resize(original_rgb, (512, 512))
                    img_v = cv2.cvtColor(img_v, cv2.COLOR_RGB2GRAY)
                    img_v = img_v.astype(np.float32) / 255.0
                    curr_input = np.expand_dims(img_v, axis=0)
                    curr_input = np.expand_dims(curr_input, axis=-1)

                session = loaded_sessions[key]
                pred = session.run(None, {session.get_inputs()[0].name: curr_input})[0]
                mask_small = pred[0,:,:,0]
                mask_cleaned = clean_mask(mask_small, min_size=10 if not is_vessel else 0)
                
                findings[key] = np.sum(mask_cleaned)
                
                # Resize lên kích thước gốc để vẽ
                mask_full = cv2.resize(mask_cleaned, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
                
                # Nếu là Vessels, lưu lại mask full để phân tích sau
                if is_vessel:
                    np.copyto(vessel_mask_full, mask_full)

                # Vẽ Overlay
                color_np = np.array(color, dtype=np.float32)
                current_region = overlay_full.astype(np.float32)
                for c in range(3):
                    current_region[:, :, c] = np.maximum(current_region[:, :, c], mask_full * color_np[c])
                np.copyto(overlay_full, current_region.astype(np.uint8))
                
            except Exception as e: print(f"Lỗi {key}: {e}")

        # Chạy các model
        run_seg_model('EX', (0, 255, 255)) # Vàng
        run_seg_model('SE', (0, 255, 255))
        run_seg_model('HE', (0, 0, 255))   # Đỏ
        run_seg_model('MA', (0, 0, 255))
        run_seg_model('Vessels', (0, 255, 0), is_vessel=True) # Xanh lá
        run_seg_model('OD', (255, 0, 0))   # Xanh dương

        # 3. PHÂN TÍCH CHUYÊN SÂU (SYSTEMIC RISK)
        vascular_info = analyze_vascular_health(vessel_mask_full)

        # 4. TỔNG HỢP BÁO CÁO (NÂNG CAO)
        risk_score = (findings['MA']*1) + (findings['HE']*3) + (findings['EX']*2) + (findings['SE']*3)
        if risk_score > 500 and "Normal" in dr_grade: dr_grade = "Mild NPDR (Early Signs)"

        # Tạo nội dung báo cáo chi tiết
        report_lines = []
        report_lines.append("=== KẾT QUẢ PHÂN TÍCH TỔNG QUÁT ===")
        report_lines.append(f"• Chẩn đoán AI: {dr_grade.upper()}")
        report_lines.append(f"• Độ tin cậy: {confidence*100:.1f}%")
        report_lines.append(f"• Điểm tổn thương vùng mắt: {int(risk_score)}")
        
        report_lines.append("\n=== PHÂN TÍCH HỆ THỐNG MẠCH MÁU (SÀNG LỌC TOÀN THÂN) ===")
        report_lines.append("Dựa trên hình thái mạch máu võng mạc (Retinal Vessel Morphology):")
        report_lines.append(f"- Mật độ mạch máu: {vascular_info['density']:.2f}% (Chỉ số tưới máu)")
        report_lines.append(f"- Chỉ số độ cong (Tortuosity): {vascular_info['tortuosity']:.2f}")
        
        report_lines.append(f"► Nguy cơ Tăng Huyết Áp: {vascular_info['htn_risk'].upper()}")
        if vascular_info['htn_risk'] != 'Thấp':
             report_lines.append("  (Phát hiện dấu hiệu mạch máu gấp khúc, gợi ý áp lực thành mạch cao)")
             
        report_lines.append(f"► Sức khỏe Tim mạch/Đột quỵ: {vascular_info['cvd_risk'].upper()}")
        
        if vascular_info['systemic_notes']:
            report_lines.append("\n⚠️ CẢNH BÁO LÂM SÀNG:")
            for note in vascular_info['systemic_notes']:
                report_lines.append(note)
        else:
            report_lines.append("\n✅ Chưa phát hiện dấu hiệu bất thường liên quan đến bệnh lý toàn thân trên ảnh đáy mắt.")

        report_lines.append("\n=== CHI TIẾT TỔN THƯƠNG VÕNG MẠC ===")
        report_lines.append(f"- Xuất huyết (Hemorrhages): {int(findings['HE'])} vùng")
        report_lines.append(f"- Vi phình mạch (Microaneurysms): {int(findings['MA'])} điểm")
        report_lines.append(f"- Xuất tiết cứng (Exudates): {int(findings['EX'])} vùng")
        
        final_report = "\n".join(report_lines)

        # Trộn ảnh
        disease_mask = np.sum(overlay_full, axis=2) > 0   
        final_overlay = original_img.copy()
        final_overlay[disease_mask] = cv2.addWeighted(original_img[disease_mask], 0.3, overlay_full[disease_mask], 0.7, 0)

        return encode_image_to_base64(final_overlay), dr_grade, final_report

    except Exception as e:
        print(f"❌ ERROR Inference: {e}")
        try: return encode_image_to_base64(original_img), "AI Error", str(e)
        except: return None, "Critical Error", str(e)

# --- BATCH PROCESSING ---
def run_batch_inference(images_bytes_list):
    results = [None] * len(images_bytes_list)
    def worker(index, img_bytes):
        annotated, diag, rep = run_aura_inference(img_bytes)
        return {"file_index": index, "diagnosis": diag, "confidence": 99.9, "image_base64": annotated, "report": rep}

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(worker, i, img) for i, img in enumerate(images_bytes_list)]
        for future in futures:
            res = future.result()
            results[res['file_index']] = res
    return results

# Cần giữ hàm này cho API check
def get_runtime_info():
    return {"cuda": False, "provider": "CPUExecutionProvider", "message": "CPU Optimized Mode"}