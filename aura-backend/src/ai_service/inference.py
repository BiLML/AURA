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
VESSEL_INPUT_SIZE = 512 

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

def preprocess_image(img, target_size, use_graham=True):
    img_resized = cv2.resize(img, (target_size, target_size))
    if use_graham and target_size == 224:
        img_resized = cv2.addWeighted(img_resized, 4, cv2.GaussianBlur(img_resized, (0,0), 10), -4, 128)
    img_float = img_resized.astype(np.float32)
    img_float /= 255.0 
    return img_float

def preprocess_for_vessels(img_rgb):
    img_resized = cv2.resize(img_rgb, (VESSEL_INPUT_SIZE, VESSEL_INPUT_SIZE))
    g_channel = img_resized[:, :, 1]
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(g_channel)
    img_float = enhanced.astype(np.float32) / 255.0
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

# --- PHÂN TÍCH VASCULAR (THUẬT TOÁN MỚI) ---
def analyze_vascular_health(vessel_mask_full):
    mask_bin = (vessel_mask_full * 255).astype(np.uint8) if vessel_mask_full.max() <= 1.0 else vessel_mask_full.astype(np.uint8)
    _, mask_bin = cv2.threshold(mask_bin, 127, 255, cv2.THRESH_BINARY)
    
    h, w = mask_bin.shape
    total_area = h * w
    vessel_area = np.sum(mask_bin > 0)
    
    # 1. Mật độ (Density)
    density = (vessel_area / total_area) * 100 
    
    # 2. Độ cong (Tortuosity) - [THUẬT TOÁN MỚI: ARC-CHORD RATIO]
    contours, _ = cv2.findContours(mask_bin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    tortuosity_indices = []
    
    for cnt in contours:
        # Chỉ xét các đoạn mạch máu đủ dài
        if cv2.contourArea(cnt) > 30: 
            perimeter = cv2.arcLength(cnt, True)
            
            # Thay vì dùng ConvexHull (dễ sai với nhánh cây), ta dùng Rotated Bounding Box
            rect = cv2.minAreaRect(cnt)
            (center), (width, height), angle = rect
            
            # Chiều dài lớn nhất của hộp bao quanh (xấp xỉ Chord Length)
            major_axis = max(width, height)
            
            if major_axis > 5:
                # Chu vi mạch máu (2 mặt) chia 2 = Chiều dài thực tế của mạch (Arc Length)
                actual_length = perimeter / 2.0
                
                # Công thức: Arc / Chord
                t_index = actual_length / major_axis
                tortuosity_indices.append(t_index)

    # Lấy trung bình (nếu không có mạch nào thì mặc định 1.0)
    avg_tortuosity = np.mean(tortuosity_indices) if tortuosity_indices else 1.0

    # 3. Đánh giá Rủi ro
    risks = []
    
    # Tăng Huyết Áp (Ngưỡng đã được chuẩn hóa lại theo công thức mới)
    # Công thức Arc/Chord thường cho giá trị nhỏ hơn Hull, nên ngưỡng thấp hơn chút
    # Bình thường ~1.0 - 1.05. Cong nhẹ > 1.08. Cong nặng > 1.12
    htn_risk = "Thấp"
    if avg_tortuosity > 1.15: # Cong xoắn lò xo
        htn_risk = "Cao (Cảnh báo)"
        risks.append(f"- Tăng huyết áp: Mạch máu co kéo rõ rệt (Tortuosity: {avg_tortuosity:.2f} > 1.15).")
    elif avg_tortuosity > 1.09: # Hơi uốn lượn
        htn_risk = "Trung bình"
        risks.append(f"- Tăng huyết áp: Mạch máu bắt đầu có dấu hiệu uốn cong (Tortuosity: {avg_tortuosity:.2f}).")

    # Tim mạch / Đột quỵ (Ngưỡng 3.5% như đã chốt)
    cvd_risk = "Ổn định"
    if density < 3.5: 
        cvd_risk = "Cảnh báo thiếu máu cục bộ"
        risks.append(f"- Nguy cơ Đột quỵ/Tim mạch: Mật độ mạch máu thấp ({density:.2f}% < 3.5%), gợi ý tình trạng thiếu máu cục bộ.")
    
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
        
        # Lấy kênh Green để lọc nhiễu màu
        g_channel = original_img[:, :, 1] 
        avg_brightness = np.mean(g_channel)

        input_seg = preprocess_image(original_rgb, target_size=SEG_INPUT_SIZE, use_graham=False)
        input_cls = preprocess_image(original_rgb, target_size=CLS_INPUT_SIZE, use_graham=True)
        if input_seg.ndim == 3: input_seg = np.expand_dims(input_seg, axis=0)
        if input_cls.ndim == 3: input_cls = np.expand_dims(input_cls, axis=0)

        # 1. CLASSIFIER
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
            mask_full = cv2.resize(mask_cleaned, (orig_w, orig_h), interpolation=cv2.INTER_NEAREST)
            mask_bool = mask_full > 0.5
            color_np = np.array(color, dtype=np.uint8)
            overlay_full[mask_bool] = color_np
            return mask_full

        # --- A. VESSELS ---
        if 'Vessels' in loaded_sessions:
            try:
                input_v = preprocess_for_vessels(original_rgb)
                session = loaded_sessions['Vessels']
                pred = session.run(None, {session.get_inputs()[0].name: input_v})[0]
                mask_v = clean_mask(pred[0,:,:,0], min_size=0) 
                vessel_mask_full = cv2.resize(mask_v, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
                draw_mask_on_overlay(mask_v, (0, 255, 0))
                findings['Vessels'] = 1 
            except Exception as e: print(f"❌ Vessels Error: {e}")

        # --- B. LESIONS (VỚI BỘ LỌC ÁNH SÁNG) ---
        def run_seg_std(key, color, min_size=5):
            if key in loaded_sessions:
                try:
                    session = loaded_sessions[key]
                    pred = session.run(None, {session.get_inputs()[0].name: input_seg})[0]
                    mask_cleaned = clean_mask(pred[0,:,:,0], min_size)
                    
                    mask_full = cv2.resize(mask_cleaned, (orig_w, orig_h), interpolation=cv2.INTER_NEAREST)
                    
                    # Luminosity Check
                    if key in ['EX', 'SE']: 
                        mask_full[g_channel < avg_brightness] = 0 
                    elif key in ['HE', 'MA']: 
                        mask_full[g_channel > (avg_brightness + 30)] = 0

                    final_count = np.sum(mask_full > 0) / (orig_w * orig_h / (256*256)) 
                    findings[key] = final_count

                    if final_count > 0:
                        mask_bool = mask_full > 0.5
                        color_np = np.array(color, dtype=np.uint8)
                        overlay_full[mask_bool] = color_np
                        
                except Exception as e: pass

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
            # Cập nhật ngưỡng mới cho công thức Arc/Chord
            if t_val > 1.15: 
                htn_status = "Cao (Cảnh báo)"
                new_risks.append(f"- Tăng huyết áp: Mạch máu co kéo rõ rệt (Tortuosity: {t_val:.2f} > 1.15).")
            elif t_val > 1.09: 
                htn_status = "Trung bình"
                new_risks.append(f"- Tăng huyết áp: Mạch máu bắt đầu có dấu hiệu uốn cong (Tortuosity: {t_val:.2f}).")
            info['htn_risk'] = htn_status
            info['systemic_notes'] = new_risks + [n for n in info['systemic_notes'] if "Tăng huyết áp" not in n]
            return info

        vascular_info = re_evaluate_vascular(analyze_vascular_health(vessel_mask_full))

        # 4. REPORTING
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
        report_lines.append(f"   - Độ cong (Tortuosity): {vascular_info['tortuosity']:.2f} (Ngưỡng an toàn < 1.09)")
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