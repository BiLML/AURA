# FILE: api/clinic.py
import os
import cloudinary
import cloudinary.uploader

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Request # <--- [ADD] Request
from fastapi.responses import StreamingResponse

from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

from core.database import get_db
from core.security import get_current_user
from services.clinic_service import ClinicService
from schemas.clinic_schema import ClinicCreate, ClinicResponse, DashboardResponse, AddUserRequest, AssignRequest
from models.users import User
from models.enums import UserRole
from models.clinic import Clinic

from infrastructure.repositories.clinic_repo import ClinicRepository
from infrastructure.repositories.medical_repo import MedicalRepository
from infrastructure.repositories.user_repo import UserRepository
from infrastructure.repositories.audit_repo import AuditRepository # <--- [ADD] Import AuditRepo
from infrastructure.repositories.notification_repo import NotificationRepository
from infrastructure.repositories.user_notification_repo import UserNotificationRepository

# --- CẤU HÌNH CLOUDINARY ---
cloudinary.config( 
  cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME"), 
  api_key = os.getenv("CLOUDINARY_API_KEY"), 
  api_secret = os.getenv("CLOUDINARY_API_SECRET"),
  secure = True
)

router = APIRouter()

# --- [MODIFIED] Inject thêm AuditRepository ---
def get_clinic_service(db: Session = Depends(get_db)) -> ClinicService:
    return ClinicService(
        clinic_repo=ClinicRepository(db), 
        medical_repo=MedicalRepository(db), 
        user_repo=UserRepository(db), 
        audit_repo=AuditRepository(db),
        noti_template_repo=NotificationRepository(db),
        user_noti_repo=UserNotificationRepository(db),
        db=db
    )

# =========================================================================
# 1. CÁC ROUTE TĨNH (STATIC PATHS)
# =========================================================================

@router.post("/register", response_model=ClinicResponse)
def register_clinic(
    name: str = Form(...),
    address: str = Form(...),
    phone: str = Form(...),
    description: str = Form(None),
    logo: UploadFile = File(None),
    current_user: User = Depends(get_current_user),
    service: ClinicService = Depends(get_clinic_service)
):
    if current_user.role not in [UserRole.ADMIN, UserRole.DOCTOR, UserRole.CLINIC, UserRole.USER]:
        raise HTTPException(status_code=403, detail="Bạn không có quyền tạo phòng khám")

    image_url_path = None
    if logo:
        try:
            upload_result = cloudinary.uploader.upload(logo.file, folder="clinics")
            image_url_path = upload_result.get("secure_url")
        except Exception as e:
            print(f"Lỗi upload Cloudinary: {e}")

    return service.register_clinic(
        admin_id=current_user.id,
        name=name,
        address=address,
        phone_number=phone,
        image_url=image_url_path,
        description=description
    )

@router.get("/dashboard-data", response_model=DashboardResponse)
def get_dashboard_data(
    current_user: User = Depends(get_current_user),
    service: ClinicService = Depends(get_clinic_service)
):
    data = service.get_clinic_dashboard_data(current_user)
    if not data:
        return {
            "clinic": None,
            "admin_name": current_user.username,
            "doctors": [],
            "patients": []
        }
    return data

@router.get("/doctors/available")
def search_doctors(
    query: str = Query(""), 
    service: ClinicService = Depends(get_clinic_service) 
):
    doctors = service.search_doctors(query)
    return {"doctors": doctors}

@router.get("/patients/available")
def search_patients(
    query: str = Query(""), 
    service: ClinicService = Depends(get_clinic_service)
):
    patients = service.search_patients(query)
    return {"patients": patients}

@router.post("/add-user")
def add_user_to_my_clinic(
    req: AddUserRequest,
    current_user: User = Depends(get_current_user), 
    service: ClinicService = Depends(get_clinic_service)
):
    try:
        service.add_user_to_clinic_context(current_user, req.user_id)
        return {"message": "Thêm thành công"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/assign-patient")
def assign_patient_route(
    req: AssignRequest, 
    current_user: User = Depends(get_current_user), 
    service: ClinicService = Depends(get_clinic_service)
):
    try:
        service.assign_patient(req.patient_id, req.doctor_id)
        return {"message": "Phân công thành công"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/medical-records/clinic-history-split")
def get_history_split(
    service: ClinicService = Depends(get_clinic_service), 
    current_user: User = Depends(get_current_user)
):
    return service.get_clinic_ai_history_split(current_user.id)

@router.get("/admin/pending")
def get_pending_clinics_for_admin(
    current_user: User = Depends(get_current_user),
    service: ClinicService = Depends(get_clinic_service)
):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Chỉ Admin mới có quyền này")
    
    clinics = service.get_pending_clinics()
    
    results = []
    for c in clinics:
        owner_name = c.admin.username if c.admin else "Unknown User"
        license_number = "N/A"
        if c.description and "Mã GP:" in c.description:
            try:
                parts = c.description.split("Mã GP:")
                if len(parts) > 1:
                    license_number = parts[1].split(".")[0].strip()
            except Exception: 
                license_number = "Error Parsing"

        results.append({
            "id": str(c.id),
            "name": c.name,
            "owner_name": owner_name,
            "owner_id": str(c.admin_id) if c.admin_id else None,
            "phone": c.phone_number,
            "address": c.address,
            "license_number": license_number,
            "images": { 
                "front": c.image_url, 
                "back": None 
            },
            "created_at": datetime.now().isoformat()
        })
    
    return {"requests": results}

class ClinicStatusUpdate(BaseModel):
    status: str 

@router.put("/admin/{clinic_id}/status")
def update_clinic_status(
    clinic_id: str,
    body: ClinicStatusUpdate,
    request: Request, # <--- [ADD] Request
    current_user: User = Depends(get_current_user),
    service: ClinicService = Depends(get_clinic_service)
):
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Chỉ Admin mới có quyền duyệt")
    
        # --- [MODIFIED] Truyền thêm admin_id và ip_address ---
    service.process_clinic_request(
        clinic_id=clinic_id, 
        status=body.status,
        admin_id=current_user.id,
        ip_address=request.client.host
    )
    return {"message": f"Đã cập nhật trạng thái: {body.status}"}


# =========================================================================
# 2. CÁC ROUTE ĐỘNG (DYNAMIC PATHS)
# =========================================================================

@router.get("/medical-records/{record_id}/detail")
def get_clinic_record_detail_api(
    record_id: str,
    service: ClinicService = Depends(get_clinic_service),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in [UserRole.CLINIC, UserRole.ADMIN, UserRole.DOCTOR]:
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem chi tiết hồ sơ này")
    data = service.get_clinic_record_detail(record_id)
    if not data:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ")
    return data

@router.get("/{clinic_id}", response_model=ClinicResponse)
def get_clinic_detail(
    clinic_id: str, service: ClinicService = Depends(get_clinic_service)
):
    clinic = service.get_clinic_info(clinic_id)
    if not clinic: raise HTTPException(status_code=404, detail="Không tìm thấy")
    return clinic

@router.get("/", response_model=list[ClinicResponse])
def get_all_clinics(service: ClinicService = Depends(get_clinic_service)):
    return service.get_all_clinics()

@router.get("/reports/campaign")
def get_clinic_campaign_report(
    start_date: datetime,
    end_date: datetime,
    service: ClinicService = Depends(get_clinic_service),
    current_user: User = Depends(get_current_user)
):
    if current_user.role not in [UserRole.CLINIC, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Chỉ Admin phòng khám mới xem được báo cáo")
    
    # Xác định Clinic ID của user hiện tại
    clinic_id = None
    if current_user.role == UserRole.CLINIC:
        # Nếu user là chủ phòng khám, tìm clinic của họ
        # Lưu ý: Logic này phụ thuộc việc bạn lưu clinic_id trong user hay ngược lại
        # Giả sử dùng logic cũ trong service add_user_to_clinic_context
        # Ở đây tôi dùng cách đơn giản nhất: query clinic theo admin_id
        clinic = service.clinic_repo.get_by_admin_id(current_user.id)
        if clinic: clinic_id = str(clinic.id)
    else:
        clinic_id = str(current_user.clinic_id)

    if not clinic_id:
        raise HTTPException(status_code=400, detail="Không xác định được phòng khám")

    return service.generate_campaign_report(clinic_id, start_date, end_date)

@router.get("/reports/export/research")
def export_clinic_research_csv(
    start_date: datetime,
    end_date: datetime,
    service: ClinicService = Depends(get_clinic_service),
    current_user: User = Depends(get_current_user)
):
    # Check quyền (như cũ)
    if current_user.role not in [UserRole.CLINIC, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Quyền hạn không đủ")
    
    clinic_id = None
    if current_user.role == UserRole.CLINIC:
        clinic = service.clinic_repo.get_by_admin_id(current_user.id)
        if clinic: clinic_id = str(clinic.id)
    else:
        clinic_id = str(current_user.clinic_id)

    if not clinic_id:
        raise HTTPException(status_code=400, detail="Lỗi xác định phòng khám")

    # Gọi Service tạo CSV
    csv_file = service.export_research_csv(clinic_id, start_date, end_date)
    
    # Trả về file stream
    filename = f"aura_research_{start_date.date()}_{end_date.date()}.csv"
    
    return StreamingResponse(
        iter([csv_file.getvalue()]), 
        media_type="text/csv", 
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )