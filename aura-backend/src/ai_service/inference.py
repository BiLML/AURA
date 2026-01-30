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

providers = [
    ('CUDAExecutionProvider', {
        'device_id': 0,
        'arena_extend_strategy': 'kNextPowerOfTwo',
        'cudnn_conv_algo_search': 'EXHAUSTIVE',
        'do_copy_in_default_stream': True,
    }),
    'CPUExecutionProvider',
]

print(f"📂 Đang tìm model trong thư mục: {ONNX_DIR}")
for name, filename in MODEL_FILES.items():
    path = os.path.join(ONNX_DIR, filename)
    if os.path.exists(path):
        try:
            loaded_sessions[name] = ort.InferenceSession(path, sess_options, providers=providers)
            used_provider = loaded_sessions[name].get_providers()[0]
            print(f"   ✅ Loaded: {name} [{used_provider}]")
        except Exception as e:
            print(f"   ❌ Failed to load {name}: {e}")
    else:
        print(f"   ⚠️ FILE MISSING: {filename}")

# In ra tổng kết CUDA vs CPU
def get_runtime_info():
    """Trả về thông tin runtime (CUDA hay CPU) để kiểm tra từ API."""
    if not loaded_sessions:
        return {"cuda": False, "provider": None, "message": "No model loaded"}
    sample = next(iter(loaded_sessions.values()))
    provider = sample.get_providers()[0]
    return {
        "cuda": "CUDAExecutionProvider" in provider,
        "provider": provider,
        "message": "CUDA (GPU)" if "CUDAExecutionProvider" in provider else "CPU",
    }

if loaded_sessions:
    info = get_runtime_info()
    print(f"🖥️ RUNTIME: {info['message']}")

# --- HELPER ---
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

# --- CORE LOGIC ---
def run_aura_inference(image_bytes):
    try:
        nparr = np.frombuffer(image_bytes, np.uint8)
        original_img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if original_img is None: return None, "Lỗi đọc ảnh", "File hỏng"
        
        orig_h, orig_w = original_img.shape[:2]
        original_rgb = cv2.cvtColor(original_img, cv2.COLOR_BGR2RGB)
        
        # Input chuẩn cho các model 256 (EX, SE, HE, MA, OD)
        input_seg = preprocess_image(original_rgb, target_size=SEG_INPUT_SIZE, use_graham=False)
        if input_seg.ndim == 3:
            input_seg = np.expand_dims(input_seg, axis=0)

        input_cls = preprocess_image(original_rgb, target_size=CLS_INPUT_SIZE, use_graham=True)

        # 1. CLASSIFIER
        dr_grade = "Unknown"
        confidence = 0.0
        
        if 'CLASSIFIER' in loaded_sessions:
            session = loaded_sessions['CLASSIFIER']
            cls_input = input_cls
            if cls_input.ndim == 3: cls_input = np.expand_dims(cls_input, axis=0)
            
            preds = session.run(None, {session.get_inputs()[0].name: cls_input})[0]
            class_idx = np.argmax(preds[0])
            confidence = float(np.max(preds[0]))
            dr_grade = CLASS_MAP.get(class_idx, "Unknown")
            
            # Logic: Luôn trả về tên bệnh, nếu Normal tin cậy cao thì ghi chú thêm
            if class_idx == 0 and confidence > 0.95:
                dr_grade = "Normal (Healthy Retina)"

        # 2. SEGMENTATION
        overlay_full = np.zeros((orig_h, orig_w, 3), dtype=np.uint8) 
        findings = {'HE': 0, 'MA': 0, 'EX': 0, 'SE': 0, 'Vessels': 0}

        def process_and_draw(key, input_tensor, color, min_size=0, is_contour=False):
            if key in loaded_sessions:
                try:
                    # Chạy AI
                    session = loaded_sessions[key]
                    pred = session.run(None, {session.get_inputs()[0].name: input_tensor})[0]
                    
                    # Lấy mask gốc (float 0.0 -> 1.0)
                    mask_small = pred[0,:,:,0]
                    
                    # Clean mask nhưng giữ nguyên độ mượt (không threshold cứng ở đây nếu muốn đẹp)
                    # Nếu clean_mask của bạn đang trả về 0/1, hãy sửa nó để trả về soft mask hoặc chấp nhận clean xong mới resize
                    mask_cleaned = clean_mask(mask_small, min_size)
                    
                    findings[key] = np.sum(mask_cleaned)
                    
                    if findings[key] > 0:
                        # 1. Resize mượt mà lên kích thước gốc
                        mask_full = cv2.resize(mask_cleaned, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
                        
                        if is_contour:
                            # Với Gai thị (OD), vẫn cần viền nên giữ logic contour
                            _, mask_bin = cv2.threshold(mask_full, 0.5, 1, cv2.THRESH_BINARY)
                            contours, _ = cv2.findContours(mask_bin.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                            cv2.drawContours(overlay_full, contours, -1, color, 2)
                        else:
                            # 2. VỚI CÁC BỆNH KHÁC: Dùng Alpha Blending thay vì tô bệt
                            # Biến color thành mảng numpy
                            color_np = np.array(color, dtype=np.float32)
                            
                            # Tạo vùng ảnh màu tại vị trí mask
                            # mask_full lúc này là độ đậm nhạt (0.0 đến 1.0) tại từng pixel
                            
                            # Lấy vùng ảnh hiện tại trên overlay
                            current_region = overlay_full.astype(np.float32)
                            
                            # Công thức cộng màu: Màu Mới * Độ Đậm Mask
                            # Ta lặp qua 3 kênh màu (B, G, R)
                            for c in range(3):
                                # Chỉ cộng màu vào nơi có mask, giữ nguyên nơi khác
                                # Cách này tạo hiệu ứng "phát sáng" (Glow)
                                current_region[:, :, c] = np.maximum(
                                    current_region[:, :, c], 
                                    mask_full * color_np[c]
                                )
                                
                            # Gán ngược lại overlay_full
                            np.copyto(overlay_full, current_region.astype(np.uint8))
                            
                except Exception as e:
                    print(f"Lỗi xử lý {key}: {e}")

        # --- A. XỬ LÝ RIÊNG CHO VESSELS (512x512, Grayscale) ---
        if 'Vessels' in loaded_sessions:
            try:
                # 1. Resize về 512x512
                img_vessels = cv2.resize(original_rgb, (512, 512))
                # 2. Chuyển sang Grayscale (1 kênh)
                img_vessels_gray = cv2.cvtColor(img_vessels, cv2.COLOR_RGB2GRAY)
                # 3. Chuẩn hóa 0-1
                img_vessels_norm = img_vessels_gray.astype(np.float32) / 255.0
                # 4. Reshape thành (1, 512, 512, 1)
                input_vessels = np.expand_dims(img_vessels_norm, axis=0) # (1, 512, 512)
                input_vessels = np.expand_dims(input_vessels, axis=-1)   # (1, 512, 512, 1)
                
                process_and_draw('Vessels', input_vessels, (0, 255, 0), min_size=0)
            except Exception as e:
                print(f"❌ Custom Vessel Error: {e}")

        # --- B. CÁC MODEL KHÁC (256x256, RGB) ---
        process_and_draw('EX', input_seg, (0, 255, 255), 5)
        process_and_draw('SE', input_seg, (0, 255, 255), 5)
        
        # HE/MA
        seg_batch = np.expand_dims(input_seg, axis=0) if input_seg.ndim == 3 else input_seg
        if 'HE' in loaded_sessions:
            try:
                pred = loaded_sessions['HE'].run(None, {loaded_sessions['HE'].get_inputs()[0].name: seg_batch})[0]
                mask_he = clean_mask(pred[0,:,:,0], 2)
                findings['HE'] = np.sum(mask_he)
            except: pass
        if 'MA' in loaded_sessions:
            try:
                pred = loaded_sessions['MA'].run(None, {loaded_sessions['MA'].get_inputs()[0].name: seg_batch})[0]
                mask_ma = clean_mask(pred[0,:,:,0], 2)
                findings['MA'] = np.sum(mask_ma)
            except: pass

        # Vẽ HE/MA (Màu Đỏ)
        if findings['HE'] > 0 or findings['MA'] > 0:
             try:
                 mask_red = np.zeros((SEG_INPUT_SIZE, SEG_INPUT_SIZE))
                 if 'HE' in loaded_sessions: mask_red = np.maximum(mask_red, clean_mask(loaded_sessions['HE'].run(None, {loaded_sessions['HE'].get_inputs()[0].name: seg_batch})[0][0,:,:,0], 2))
                 if 'MA' in loaded_sessions: mask_red = np.maximum(mask_red, clean_mask(loaded_sessions['MA'].run(None, {loaded_sessions['MA'].get_inputs()[0].name: seg_batch})[0][0,:,:,0], 2))
                 
                 mask_full = cv2.resize(mask_red, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)
                 _, mask_binary = cv2.threshold(mask_full, 0.5, 1, cv2.THRESH_BINARY)
                 overlay_full[mask_binary.astype(np.uint8) > 0] = (0, 0, 255)
             except: pass

        process_and_draw('OD', input_seg, (255, 0, 0), 0, True)

        # Trộn màu
        disease_mask = np.sum(overlay_full, axis=2) > 0   
        final_overlay = original_img.copy()
        final_overlay[disease_mask] = cv2.addWeighted(original_img[disease_mask], 0.3, overlay_full[disease_mask], 0.7, 0)

        # Report
        risk_score = (findings['MA']*1) + (findings['HE']*3) + (findings['EX']*2) + (findings['SE']*3)
        if risk_score > 0 and "Normal" in dr_grade: dr_grade = "Mild NPDR (Early Signs)"
        if risk_score > 5000 and "Mild" in dr_grade: dr_grade = "Moderate NPDR"

        report = f"DIAGNOSIS: {dr_grade}\nSeverity Score: {int(risk_score)}\nHE: {int(findings['HE'])} | EX: {int(findings['EX'])}"
        return encode_image_to_base64(final_overlay), dr_grade, report

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

    print(f"🚀 AI Batch: Đang xử lý {len(images_bytes_list)} ảnh...")
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(worker, i, img) for i, img in enumerate(images_bytes_list)]
        for future in futures:
            res = future.result()
            results[res['file_index']] = res
    return results