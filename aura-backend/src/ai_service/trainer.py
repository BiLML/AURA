# aura-backend/ai_service/trainer.py
import os
import numpy as np
import tensorflow as tf
import tf2onnx
import cv2
import tensorflow as tf
from data_loader import get_verified_data

gpus = tf.config.list_physical_devices('GPU')
if gpus:
    try:
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
        print(f"✅ [SETUP] Đã kích hoạt TF Memory Growth cho {len(gpus)} GPU")
    except RuntimeError as e:
        print(f"⚠️ [SETUP] Không thể set memory growth: {e}")

# Cấu hình Path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SOURCE_DIR = os.path.join(BASE_DIR, 'ai_source')
ONNX_DIR = os.path.join(BASE_DIR, 'ai_onnx')

# Mapping model cần khử nhiễu (Negative Learning)
SEG_MODELS_TO_FIX = {
    'SE': 'unet_soft_exudates.keras',
    'EX': 'unet_mega_fusion.keras'
}

def run_retraining_process():
    print("🚀 [OFFICIAL TRAINER] Bắt đầu quy trình huấn luyện...")
    
    # Lấy dữ liệu: List of (img, label_idx)
    raw_data = get_verified_data() 
    if len(raw_data) < 5:
        print("⚠️ Chưa đủ dữ liệu feedback. Hủy bỏ.")
        return False

    # --- 1. TRAIN CLASSIFIER (EfficientNet) ---
    print("🔄 [1/2] Train Classifier...")
    try:
        model_path = os.path.join(SOURCE_DIR, 'aura_retinal_model_final.keras')
        if os.path.exists(model_path):
            model = tf.keras.models.load_model(model_path)
            
            X_train, y_train = [], []
            for img, label_idx in raw_data:
                # Resize 224x224 & Chuẩn hóa 0-1
                resized = cv2.resize(img, (224, 224))

                resized = cv2.addWeighted(resized, 4, cv2.GaussianBlur(resized, (0,0), 10), -4, 128)
                
                X_train.append(resized.astype(np.float32) / 255.0)
                y_train.append(label_idx)
            
            # Train nhẹ 5 epochs
            model.compile(optimizer=tf.keras.optimizers.Adam(1e-5), loss='sparse_categorical_crossentropy', metrics=['accuracy'])
            model.fit(np.array(X_train), np.array(y_train), epochs=5, batch_size=2, verbose=1)
            
            # Lưu & Export ONNX
            model.save(model_path)
            export_to_onnx(model, 'CLASSIFIER.onnx', (224, 224, 3))
        else:
            print(f"❌ Không tìm thấy file gốc: {model_path}")
    except Exception as e:
        print(f"❌ Lỗi Train Classifier: {e}")

    # --- 2. TRAIN SEGMENTATION (NEGATIVE LEARNING - KHỬ NHIỄU) ---
    print("🔄 [2/2] Sửa lỗi Segmentation (Chỉ dùng ca Normal)...")
    
    # Lọc ra các ca Normal (label_idx == 0)
    normal_cases = [img for img, label in raw_data if label == 0]
    
    if len(normal_cases) > 0:
        print(f"👉 Tìm thấy {len(normal_cases)} ca Normal để khử nhiễu.")
        
        X_seg = []
        y_seg = [] # Mask đen toàn tập
        for img in normal_cases:
            resized = cv2.resize(img, (256, 256))
            X_seg.append(resized.astype(np.float32) / 255.0)
            y_seg.append(np.zeros((256, 256, 1), dtype=np.float32)) # Mask đen
            
        for key, filename in SEG_MODELS_TO_FIX.items():
            path = os.path.join(SOURCE_DIR, filename)
            if os.path.exists(path):
                try:
                    # Compile=False để tránh lỗi DiceLoss custom
                    seg_model = tf.keras.models.load_model(path, compile=False)
                    seg_model.compile(optimizer=tf.keras.optimizers.Adam(1e-6), loss='binary_crossentropy')
                    
                    seg_model.fit(np.array(X_seg), np.array(y_seg), epochs=2, batch_size=1, verbose=1)
                    
                    seg_model.save(path)
                    export_to_onnx(seg_model, f'{key}.onnx', (256, 256, 3))
                    print(f"   ✅ Đã khử nhiễu model {key}")
                except Exception as e:
                    print(f"   ❌ Lỗi sửa {key}: {e}")
    else:
        print("Không có ca Normal để sửa lỗi segmentation.")

    return True

def export_to_onnx(model, name, input_shape):
    try:
        output_path = os.path.join(ONNX_DIR, name)
        spec = (tf.TensorSpec((None, *input_shape), tf.float32, name="input"),)
        model_proto, _ = tf2onnx.convert.from_keras(model, input_signature=spec, opset=13)
        with open(output_path, "wb") as f:
            f.write(model_proto.SerializeToString())
        print(f"⚡ Exported ONNX: {name}")
    except Exception as e:
        print(f"⚠️ Lỗi Export ONNX {name}: {e}")