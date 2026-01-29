# api/v1/medical_records.py
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List

from core.database import get_db
from core.security import get_current_user
from models.users import User
from models.enums import UserRole
from schemas.medical_schema import ImageResponse

# 1. IMPORT SERVICE VÀ REPO THỰC
from services.medical_service import MedicalService
from services.billing_service import BillingService 

from infrastructure.repositories.medical_repo import MedicalRepository
from infrastructure.repositories.billing_repo import BillingRepository
from infrastructure.repositories.audit_repo import AuditRepository

router = APIRouter()


# 2. HÀM DEPENDENCY ĐỂ KHỞI TẠO SERVICE
def get_billing_service(db: Session = Depends(get_db)) -> BillingService:
    billing_repo = BillingRepository(db)
    audit_repo = AuditRepository(db)
    return BillingService(billing_repo=billing_repo, audit_repo=audit_repo, db=db)

def get_medical_service(db: Session = Depends(get_db)) -> MedicalService:
    # Bước A: Tạo Repo thực cho Medical
    medical_repo = MedicalRepository(db)
    
    # Bước B: Tạo Repo thực cho Billing
    billing_repo = BillingRepository(db)
    audit_repo = AuditRepository(db)
    
    
    # Bước C: Tiêm cả 2 vào Service
    # Service yêu cầu Interface, ta đưa Class thực vào -> Hợp lệ (Polymorphism)
    return MedicalService(
        repo=medical_repo, 
        billing_repo=billing_repo,
        audit_repo=audit_repo
        )

# 1. API UPLOAD & PHÂN TÍCH
@router.post("/analyze", response_model=ImageResponse, status_code=201)
def analyze_retina(
    eye_side: str = Form("left"),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    # Thay vì tự khởi tạo, hãy nhờ FastAPI lấy hộ Service đã được lắp ráp
    service: MedicalService = Depends(get_medical_service), 
    billing_service: BillingService = Depends(get_billing_service)
    
):
    if file.content_type not in ["image/jpeg", "image/png", "image/jpg"]:
        raise HTTPException(status_code=400, detail="Chỉ chấp nhận file ảnh (jpg, png)")

    has_credit = billing_service.deduct_credit(current_user.id)
    
    if not has_credit:
        raise HTTPException(
            status_code=402, # Mã lỗi Payment Required
            detail="Bạn đã hết lượt phân tích. Vui lòng nạp thêm gói dịch vụ."
        )

    try:
        # Gọi Service trực tiếp, không cần truyền db nữa
        result = service.upload_and_analyze(
            user_id=current_user.id,
            file=file,
            eye_side=eye_side 
        )
        
        img_data = result["image"]
        analysis_data = result["analysis"]
        
        return {
            "id": img_data.id,
            "uploader_id": img_data.uploader_id,
            "image_url": img_data.image_url,
            "image_type": img_data.image_type,
            "eye_side": img_data.eye_side,
            "created_at": img_data.created_at,
            "analysis_result": analysis_data 
        }
    except Exception as e:
        print(f"Lỗi Upload: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
# 2. API LẤY DANH SÁCH (Của user đang login)
@router.get("/", response_model=List[ImageResponse])
def get_my_records(
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    service: MedicalService = Depends(get_medical_service)
):
    # 1. Lấy dữ liệu thô từ Service (SQLAlchemy Objects)
    if current_user.role in [UserRole.DOCTOR, UserRole.ADMIN, UserRole.CLINIC]:
        records = service.get_all_records(skip=skip, limit=limit)
    else:
        records = service.get_records_by_user(user_id=current_user.id, skip=skip, limit=limit)

    # 2. MAP DỮ LIỆU THỦ CÔNG (Khắc phục lỗi Lazy Loading)
    final_results = []
    
    for r in records:
        # Mặc định là None
        analysis_data = None
        
        # --- [FIX QUAN TRỌNG] Kiểm tra cả 2 trường hợp: Object (số ít) và List (số nhiều) ---
        a = None
        
        # Trường hợp 1: Quan hệ 1-1 hoặc tên biến là số ít
        if hasattr(r, "analysis_result") and r.analysis_result:
            a = r.analysis_result
            
        # Trường hợp 2: Quan hệ 1-N (List), lấy phần tử mới nhất/đầu tiên
        elif hasattr(r, "analysis_results") and r.analysis_results:
            # Sắp xếp hoặc lấy phần tử đầu (thường là cái mới nhất do order_by)
            a = r.analysis_results[0]

        # Nếu tìm thấy kết quả phân tích (biến a có dữ liệu)
        if a: 
            # Tạo dictionary khớp với Schema AIAnalysisResponse
            analysis_data = {
                "id": a.id,
                "risk_level": a.risk_level,
                "vessel_details": a.vessel_details,
                "annotated_image_url": a.annotated_image_url,
                "processed_at": a.processed_at,
                "ai_detailed_report": a.ai_detailed_report
            }

        # Tạo dictionary khớp với Schema ImageResponse
        mapped_record = {
            "id": r.id,
            "uploader_id": r.uploader_id,
            "image_url": r.image_url,
            "image_type": r.image_type,
            "eye_side": r.eye_side,
            "created_at": r.created_at,
            "analysis_result": analysis_data # ✅ Dữ liệu sẽ xuất hiện ở đây
        }
        
        final_results.append(mapped_record)

    # Trả về list dictionary (FastAPI sẽ tự validate lại lần cuối)
    return final_results

# --- 3. API LỊCH SỬ PHÒNG KHÁM (QUAN TRỌNG: PHẢI ĐẶT TRƯỚC {record_id}) ---
@router.get("/clinic-history")
def get_clinic_history_records(
    current_user: User = Depends(get_current_user),
    service: MedicalService = Depends(get_medical_service)
):
    if current_user.role in [UserRole.CLINIC, UserRole.DOCTOR, UserRole.ADMIN]:
        records = service.get_all_records(limit=50) 
    else:
        records = service.get_records_by_user(user_id=current_user.id)

    # Format dữ liệu trả về cho khớp với Frontend ClinicDashboard
    results = []
    for r in records:
        # Xử lý lấy kết quả AI (list hoặc object)
        analysis = None
        if hasattr(r, "analysis_result") and r.analysis_result:
            analysis = r.analysis_result
        elif hasattr(r, "analysis_results") and r.analysis_results:
            analysis = r.analysis_results[0]

        results.append({
            "id": str(r.id),
            "created_at": r.created_at,
            "patient_name": r.uploader.username if r.uploader else "Unknown", 
            "image_url": r.image_url,
            "ai_result": analysis.risk_level if analysis else "Đang phân tích...",
            "ai_analysis_status": "COMPLETED" if analysis else "PENDING"
        })
    
    return results

# 4. API CHI TIẾT (ĐẶT Ở CUỐI CÙNG ĐỂ KHÔNG CHẶN CÁC API KHÁC)
@router.get("/{record_id}")
def get_record_detail(
    record_id: str, 
    current_user: User = Depends(get_current_user),
    service: MedicalService = Depends(get_medical_service)
):
    record = service.get_record_by_id(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ")
         
    if str(record.uploader_id) != str(current_user.id) and current_user.role not in [UserRole.DOCTOR, UserRole.ADMIN, UserRole.CLINIC]:
         raise HTTPException(status_code=403, detail="Không có quyền truy cập")

    analysis = None
    if hasattr(record, "analysis_result") and record.analysis_result:
        analysis = record.analysis_result
    elif hasattr(record, "analysis_results") and record.analysis_results:
         analysis = record.analysis_results[0]
    doctor_note = None
    doctor_diagnosis = None
    
    if analysis and analysis.doctor_validation:
        # Lấy dữ liệu từ bảng validation
        doctor_note = analysis.doctor_validation.doctor_notes
        doctor_diagnosis = analysis.doctor_validation.doctor_confirm

    return {
        "id": str(record.id),
        # Nếu bác sĩ đã chẩn đoán, ưu tiên hiển thị kết quả của bác sĩ
        "ai_result": doctor_diagnosis if doctor_diagnosis else (analysis.risk_level if analysis else "Đang phân tích..."),
        
        # Đây là nội dung report (đã được bác sĩ edit và lưu đè ở bước PUT trên)
        "ai_detailed_report": analysis.ai_detailed_report if analysis else "Chưa có báo cáo chi tiết.",
        
        "annotated_image_url": analysis.annotated_image_url if analysis else None,
        "image_url": record.image_url,
        "upload_date": record.created_at,
        "ai_analysis_status": "COMPLETED" if analysis else "PENDING",
        
        # Trả về ghi chú thật thay vì None
        "doctor_note": doctor_note 
    }

# --- API BATCH ANALYZE (CLEAN ARCHITECTURE) ---
@router.post("/batch-analyze", status_code=200)
async def batch_analyze_retina(
    background_tasks: BackgroundTasks, # 👈 Thêm tham số này
    eye_side: str = Form("left"),
    patient_id: str = Form(None),
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    service: MedicalService = Depends(get_medical_service),
    billing_service: BillingService = Depends(get_billing_service)
):
    """
    API Batch Async: Nhận ảnh -> Tạo hàng đợi -> Trả về ngay lập tức
    """
    total_cost = len(files)
    
    # 3. Kiểm tra số dư hiện tại trước
    current_credits = billing_service.check_credits(current_user.id)
    
    if current_credits < total_cost:
        raise HTTPException(
            status_code=402, 
            detail=f"Bạn không đủ lượt phân tích. Cần: {total_cost}, Hiện có: {current_credits}. Vui lòng nạp thêm."
        )

    # 4. Thực hiện trừ lượt (Lặp qua số lượng ảnh để trừ từng lượt)
    # (Cách này tận dụng hàm deduct_credit có sẵn. Tốt nhất là viết thêm hàm deduct_multiple trong service sau này)
    for _ in range(total_cost):
        success = billing_service.deduct_credit(current_user.id)
        if not success:
            # Phòng trường hợp hiếm gặp (Race condition), double check lại
            raise HTTPException(status_code=402, detail="Lỗi trong quá trình trừ lượt. Vui lòng thử lại.")
    # 1. Đọc dữ liệu file vào RAM ngay lập tức (Vì UploadFile sẽ đóng sau khi request kết thúc)
    # Lưu ý: Với 100 ảnh, RAM sẽ tăng. Nếu server yếu thì cần lưu tạm ra ổ cứng. 
    # Nhưng với demo đồ án thì đọc vào RAM vẫn ổn (100 ảnh x 2MB = 200MB RAM).
    files_data = []
    for file in files:
        content = await file.read()
        files_data.append((file.filename, content, file.content_type))

    # 2. Gọi Service để khởi tạo hàng đợi
    initial_records = service.init_batch_processing(
        user_id=current_user.id,
        files_data=files_data,
        patient_id=patient_id,
        eye_side=eye_side,
        background_tasks=background_tasks
    )
    
    return {
        "status": "success",
        "message": f"Đã thêm {len(files)} ảnh vào hàng đợi xử lý.",
        "data": initial_records,
        "remaining_credits": current_credits - total_cost
    }