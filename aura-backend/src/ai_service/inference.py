# aura-backend/ai/inference.py
import onnxruntime as ort
import numpy as np
import cv2
import os
import base64
from concurrent.futures import ThreadPoolExecutor

# --- CẤU HÌNH ---
SEG_INPUT_SIZE = 256
CLS_INPUT_SIZE = 224
VESSEL_INPUT_SIZE = 512  # [QUAN TRỌNG] Tăng độ phân giải cho mạch máu

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

providers = ['CPUExecutionProvider']

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

# [CŨ] Hàm này chỉ dùng cho Lesions (HE, EX, MA)
def preprocess_image(img, target_size, use_graham=True):
    img_resized = cv2.resize(img, (target_size, target_size))
    if use_graham and target_size == 224:
        img_resized = cv2.addWeighted(img_resized, 4, cv2.GaussianBlur(img_resized, (0,0), 10), -4, 128)
    img_float = img_resized.astype(np.float32)
    img_float /= 255.0 
    return img_float

# [MỚI] Hàm chuyên biệt cho mạch máu (CLAHE + Green Channel)
def preprocess_for_vessels(img_rgb):
    """
    Tách kênh Green và áp dụng CLAHE để làm nổi bật mạch máu.
    Resize lên 512x512 để giữ chi tiết mảnh.
    """
    # 1. Resize chuẩn
    img_resized = cv2.resize(img_rgb, (VESSEL_INPUT_SIZE, VESSEL_INPUT_SIZE))
    
    # 2. Lấy kênh Green (Kênh này mạch máu đen rõ nhất)
    # OpenCV đọc RGB (vì ở hàm main đã convert), Green là kênh 1
    g_channel = img_resized[:, :, 1]

    # 3. Áp dụng CLAHE (Contrast Limited Adaptive Histogram Equalization)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(g_channel)

    # 4. Normalize 0-1
    img_float = enhanced.astype(np.float32) / 255.0
    
    # 5. Expand dims để thành (1, 512, 512, 1)
    img_expanded = np.expand_dims(img_float, axis=0)
    img_expanded = np.expand_dims(img_expanded, axis=-1)
    
    return img_expanded

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

# --- PHÂN TÍCH VASCULAR (GIỮ NGUYÊN LOGIC MỚI) ---
def analyze_vascular_health(vessel_mask_full):
    # 1. Chuẩn bị mask
    mask_bin = (vessel_mask_full * 255).astype(np.uint8) if vessel_mask_full.max() <= 1.0 else vessel_mask_full.astype(np.uint8)
    _, mask_bin = cv2.threshold(mask_bin, 127, 255, cv2.THRESH_BINARY)
    
    h, w = mask_bin.shape
    total_area = h * w
    vessel_area = np.sum(mask_bin > 0)
    
    # 2. Tính Mật độ (Density)
    density = (vessel_area / total_area) * 100 
    
    # 3. Tính Độ cong (Tortuosity)
    contours, _ = cv2.findContours(mask_bin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    tortuosity_indices = []
    
    for cnt in contours:
        if cv2.contourArea(cnt) > 30: # Giảm min size xuống để bắt mạch nhỏ
            perimeter = cv2.arcLength(cnt, True)
            hull = cv2.convexHull(cnt)
            hull_perimeter = cv2.arcLength(hull, True)
            if hull_perimeter > 0:
                tortuosity_indices.append(perimeter / hull_perimeter)

    avg_tortuosity = np.mean(tortuosity_indices) if tortuosity_indices else 1.0

    # 4. Đánh giá Rủi ro (Đã tinh chỉnh ngưỡng)
    risks = []
    
    # -- Tăng Huyết Áp --
    htn_risk = "Thấp"
    if avg_tortuosity > 1.12: 
        htn_risk = "Cao (Cảnh báo)"
        risks.append(f"- Tăng huyết áp: Mạch máu co kéo rõ rệt (Tortuosity: {avg_tortuosity:.2f} > 1.12).")
    elif avg_tortuosity > 1.08: 
        htn_risk = "Trung bình"
        risks.append(f"- Tăng huyết áp: Mạch máu bắt đầu có dấu hiệu uốn cong (Tortuosity: {avg_tortuosity:.2f}).")

    # -- Tim mạch / Đột quỵ --
    cvd_risk = "Ổn định"
    if density < 1.5: 
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
        
        # Preprocessing cho DR
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
        
        vessel_mask_full = np.zeros((orig_h, orig_w), dtype=np.float32)

        def draw_mask_on_overlay(mask_cleaned, color):
            mask_full = cv2.resize(mask_cleaned, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
            color_np = np.array(color, dtype=np.float32)
            current_region = overlay_full.astype(np.float32)
            for c in range(3):
                current_region[:, :, c] = np.maximum(current_region[:, :, c], mask_full * color_np[c])
            np.copyto(overlay_full, current_region.astype(np.uint8))
            return mask_full

        # --- A. XỬ LÝ VESSELS (OPTIMIZED) ---
        if 'Vessels' in loaded_sessions:
            try:
                # [FIX] Dùng hàm preprocess riêng (CLAHE)
                input_v = preprocess_for_vessels(original_rgb)

                session = loaded_sessions['Vessels']
                pred = session.run(None, {session.get_inputs()[0].name: input_v})[0]
                
                # [FIX] min_size=0 để không xóa các mạch máu đứt đoạn
                mask_v = clean_mask(pred[0,:,:,0], min_size=0) 
                
                # Lưu mask full để phân tích
                vessel_mask_full = cv2.resize(mask_v, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
                
                # Vẽ lên ảnh (Xanh lá)
                draw_mask_on_overlay(mask_v, (0, 255, 0))
                findings['Vessels'] = 1 
            except Exception as e:
                print(f"❌ Vessels Error: {e}")

        # --- B. XỬ LÝ LESIONS ---
        def run_seg_std(key, color, min_size=5):
            if key in loaded_sessions:
                try:
                    session = loaded_sessions[key]
                    pred = session.run(None, {session.get_inputs()[0].name: input_seg})[0]
                    mask_cleaned = clean_mask(pred[0,:,:,0], min_size)
                    findings[key] = np.sum(mask_cleaned)
                    if findings[key] > 0:
                        draw_mask_on_overlay(mask_cleaned, color)
                except: pass

        run_seg_std('EX', (0, 255, 255)) 
        run_seg_std('SE', (0, 255, 255)) 
        if 'HE' in loaded_sessions: run_seg_std('HE', (0, 0, 255), 2)
        if 'MA' in loaded_sessions: run_seg_std('MA', (0, 0, 255), 2)

        if 'OD' in loaded_sessions:
            try:
                session = loaded_sessions['OD']
                pred = session.run(None, {session.get_inputs()[0].name: input_seg})[0]
                mask_od = clean_mask(pred[0,:,:,0], 0)
                if np.sum(mask_od) > 0:
                    mask_full = cv2.resize(mask_od, (orig_w, orig_h))
                    _, mask_bin = cv2.threshold(mask_full, 0.5, 1, cv2.THRESH_BINARY)
                    contours, _ = cv2.findContours(mask_bin.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    cv2.drawContours(overlay_full, contours, -1, (255, 0, 0), 2)
            except: pass

        # 3. PHÂN TÍCH CHUYÊN SÂU
        def re_evaluate_vascular(info):
            t_val = info['tortuosity']
            new_risks = []
            htn_status = "Thấp"
            if t_val > 1.12: 
                htn_status = "Cao (Cảnh báo)"
                new_risks.append(f"- Tăng huyết áp: Mạch máu co kéo rõ rệt (Tortuosity: {t_val:.2f} > 1.12).")
            elif t_val > 1.08: 
                htn_status = "Trung bình"
                new_risks.append(f"- Tăng huyết áp: Mạch máu bắt đầu có dấu hiệu uốn cong (Tortuosity: {t_val:.2f}).")
            info['htn_risk'] = htn_status
            info['systemic_notes'] = new_risks + [n for n in info['systemic_notes'] if "Tăng huyết áp" not in n]
            return info

        vascular_info = re_evaluate_vascular(analyze_vascular_health(vessel_mask_full))

        # 4. REPORTING (RULE BASED OVERRIDE)
        risk_score = (findings['MA']*1) + (findings['EX']*2) + (findings['HE']*3) + (findings['SE']*4)
        ai_grade_origin = dr_grade
        
        if risk_score > 8000: dr_grade = "Severe NPDR (Nặng - Cần can thiệp gấp)"
        elif risk_score > 3500: dr_grade = "Moderate NPDR (Trung bình)"
        elif risk_score > 500 and "Normal" in dr_grade: dr_grade = "Mild NPDR (Dấu hiệu sớm)"
        if "PDR" in ai_grade_origin: dr_grade = "PDR (Võng mạc đái tháo đường tăng sinh)"

        report_lines = []
        report_lines.append("=== KẾT QUẢ PHÂN TÍCH TỔNG QUÁT ===")
        report_lines.append(f"• Chẩn đoán cuối cùng: {dr_grade.upper()}")
        report_lines.append(f"• Phân loại gốc từ AI: {ai_grade_origin}")
        report_lines.append(f"• Điểm tổn thương vùng mắt: {int(risk_score)}")
        
        if risk_score > 8000:
            report_lines.append("⚠️ CẢNH BÁO: Mức độ tổn thương RẤT CAO. Số lượng điểm xuất huyết và xuất tiết vượt ngưỡng an toàn.")
        
        report_lines.append("\n=== SÀNG LỌC SỨC KHỎE TOÀN THÂN (QUA MẠCH MÁU) ===")
        report_lines.append(f"🔍 Chỉ số mạch máu (Vessel Metrics):")
        report_lines.append(f"   - Mật độ (Density): {vascular_info['density']:.2f}%")
        report_lines.append(f"   - Độ cong (Tortuosity): {vascular_info['tortuosity']:.2f} (Ngưỡng an toàn < 1.08)")
        report_lines.append(f"\n► Nguy cơ Tăng Huyết Áp: {vascular_info['htn_risk'].upper()}")
        report_lines.append(f"► Nguy cơ Tim mạch/Đột quỵ: {vascular_info['cvd_risk'].upper()}")
        
        if vascular_info['systemic_notes']:
            report_lines.append("\n⚠️ DẤU HIỆU TOÀN THÂN:")
            for note in vascular_info['systemic_notes']: report_lines.append(note)
        else:
            report_lines.append("\n✅ Chưa phát hiện dấu hiệu bất thường liên quan đến bệnh lý toàn thân.")

        report_lines.append("\n=== CHI TIẾT TỔN THƯƠNG VÕNG MẠC ===")
        report_lines.append(f"- Xuất huyết (HE): {int(findings['HE'])} vùng")
        report_lines.append(f"- Vi phình mạch (MA): {int(findings['MA'])} điểm")
        report_lines.append(f"- Xuất tiết (EX/SE): {int(findings['EX'] + findings['SE'])} vùng")
        
        final_report = "\n".join(report_lines)

        disease_mask = np.sum(overlay_full, axis=2) > 0   
        final_overlay = original_img.copy()
        final_overlay[disease_mask] = cv2.addWeighted(original_img[disease_mask], 0.3, overlay_full[disease_mask], 0.7, 0)

        return encode_image_to_base64(final_overlay), dr_grade, final_report

    except Exception as e:
        print(f"❌ ERROR Inference: {e}")
        try: return encode_image_to_base64(original_img), "AI Error", str(e)
        except: return None, "Critical Error", str(e)

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

def get_runtime_info():
    return {"cuda": False, "provider": "CPUExecutionProvider", "message": "CPU Optimized Mode"}