# src/ai_service/main.py
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import uvicorn

# Import các hàm xử lý AI
from inference import run_aura_inference, run_batch_inference
from trainer import run_retraining_process

app = FastAPI(title="AURA AI Microservice", version="2.0")

# CORS config
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def health_check():
    return {"status": "healthy", "service": "aura-ai-core"}

# --- 1. XỬ LÝ ẢNH ĐƠN (Giữ nguyên) ---
@app.post("/analyze")
async def analyze_image(file: UploadFile = File(...)):
    try:
        content = await file.read()
        # Hàm này giờ trả về (base64_string, diagnosis, report_text)
        img_b64, diagnosis, report = run_aura_inference(content)
        
        if img_b64 is None:
            raise HTTPException(status_code=500, detail=diagnosis) # diagnosis chứa lỗi log

        return {
            "image_base64": img_b64, # Frontend nhận cái này
            "diagnosis": diagnosis,
            "report": report
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.post("/analyze/batch")
async def analyze_batch(files: List[UploadFile] = File(...)):
    print(f"🚀 Nhận batch request: {len(files)} ảnh")
    
    image_contents = []
    for file in files:
        content = await file.read()
        image_contents.append(content)
    
    # Gọi hàm xử lý song song vừa sửa ở inference.py
    results = run_batch_inference(image_contents)
    
    return {
        "status": "success",
        "results": results
    }

# --- 2. XỬ LÝ HÀNG LOẠT (SỬA LẠI CHO ĐÚNG NFR-2) ---
@app.post("/analyze/batch")
async def analyze_batch_images(files: List[UploadFile] = File(...)):
    """
    API xử lý hàng loạt >= 100 ảnh.
    Sử dụng cơ chế Batch Tensor của ONNX Runtime để xử lý song song.
    """
    if len(files) > 200:
        raise HTTPException(status_code=400, detail="Batch size limit is 200 images.")

    print(f"🚀 Nhận batch request: {len(files)} ảnh")
    
    image_contents = [await file.read() for file in files]
    # 1. Đọc toàn bộ file vào RAM trước (IO Bound)
    for file in files:
        content = await file.read()
        image_contents.append(content)
    
    # 2. Gọi hàm xử lý song song (CPU/GPU Bound)
    # Đây mới là chỗ tận dụng sức mạnh của ONNX Parallel
    try:
        results = run_batch_inference(image_contents)
        return {
            "status": "success",
            "total_processed": len(results),
            "results": results
        }
    except Exception as e:
        print(f"Batch error: {e}")
        raise HTTPException(status_code=500, detail="Lỗi xử lý batch processing")

# --- 3. AUTO-TRAINING TRIGGER ---
@app.post("/train/trigger")
async def trigger_retraining(background_tasks: BackgroundTasks):
    """
    Kích hoạt huấn luyện lại model (Classifier & Segmentation Negative Learning)
    """
    print("🔄 Nhận lệnh Retrain từ Admin...")
    background_tasks.add_task(run_retraining_process)
    return {"message": "Đã kích hoạt tiến trình Auto-Training ngầm."}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)