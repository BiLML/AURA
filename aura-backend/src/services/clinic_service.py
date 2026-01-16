from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, or_
from domain.models.iclinic_repository import IClinicRepository
from domain.models.imedical_repository import IMedicalRepository
from domain.models.iuser_repository import IUserRepository

from models.medical import RetinalImage, Patient, AIAnalysisResult
from models.clinic import Clinic
from models.users import User, UserRole
from models.enums import UserRole, ClinicStatus, UserStatus 
from uuid import UUID

from fastapi import HTTPException
class ClinicService:
    # 2. INJECT THÊM USER REPO VÀO HÀM KHỞI TẠO
    def __init__(self, 
                 clinic_repo: IClinicRepository, 
                 medical_repo: IMedicalRepository, 
                 user_repo: IUserRepository, # <--- Inject User Repo
                 db: Session):
        self.clinic_repo = clinic_repo
        self.medical_repo = medical_repo
        self.user_repo = user_repo # <--- Lưu lại dùng sau này
        self.db = db
    def register_clinic(self, admin_id: UUID, name: str, address: str, phone_number: str, image_url: str = None, description: str = None) -> Clinic:
        # Code cũ: existing_clinic = self.clinic_repo.db.query... -> SAI (Vi phạm encapsulation)
        # Code mới: Bạn nên thêm hàm check_exist vào IClinicRepository
        # Nhưng để chạy tạm, bạn có thể dùng self.db.query(...)
        return self.clinic_repo.create_clinic(admin_id, name, address, phone_number, image_url, description)

    def get_clinic_info(self, clinic_id: str) -> Clinic:
        return self.clinic_repo.get_clinic_by_id(clinic_id)

    def get_all_clinics(self):
        return self.clinic_repo.get_all_clinics()

    def get_clinic_dashboard_data(self, current_user: User):
        clinic = None

        # TRƯỜNG HỢP 1: User là nhân viên/bác sĩ (đã được gán vào phòng khám)
        if current_user.clinic_id:
            clinic = self.clinic_repo.get_clinic_by_id(current_user.clinic_id)
            
        # TRƯỜNG HỢP 2: User là CHỦ PHÒNG KHÁM (tìm trong bảng clinics cột admin_id)
        else:
            # Code cũ của bạn: self.db.query(Clinic)... -> Nên chuyển vào Repo nếu được, nhưng để tạm đây cũng chạy được
            clinic = self.db.query(Clinic).filter(Clinic.admin_id == current_user.id).first()
        
        if not clinic:
            return None
        
        # B. Lấy thông tin Admin (Dùng Repo thay vì query trực tiếp)
        admin_user = self.user_repo.get_by_id(clinic.admin_id) # <--- Dùng Repo
        admin_name = "Clinic Admin"
        if admin_user and admin_user.profile and admin_user.profile.full_name:
            admin_name = admin_user.profile.full_name

        # --- XỬ LÝ BÁC SĨ (Code mới: Gọi Repo) ---
        doctors = self.user_repo.get_doctors_by_clinic_id(clinic.id) # <--- SẠCH HƠN HẲN!

        formatted_doctors = []
        for doc in doctors:
            # Gọi Repo để đếm số bệnh nhân
            p_counts = self.user_repo.count_patients_by_doctor_id(doc.id) 

            formatted_doctors.append({
                "id": doc.id,
                "username": doc.username,
                "email": doc.email,
                "full_name": doc.profile.full_name if (doc.profile and doc.profile.full_name) else doc.username,
                "role": doc.role,   
                "created_at": doc.created_at,
                "is_active": True,
                "phone": doc.profile.phone if (doc.profile and doc.profile.phone) else "", 
                "patient_count": p_counts,
                "status": doc.status
            })

        # --- XỬ LÝ BỆNH NHÂN ---
        patients_query = self.user_repo.get_patients_by_clinic_id(clinic.id) # <--- QUÁ GỌN!

        formatted_patients = []
        for p in patients_query:
            # 1. Xử lý tên Bác sĩ phụ trách
            doc_name = "Chưa phân công"
            assigned_doctor_id = None 

            if p.assigned_doctor:
                assigned_doctor_id = p.assigned_doctor.id
                if hasattr(p.assigned_doctor, 'profile') and p.assigned_doctor.profile:
                     doc_name = p.assigned_doctor.profile.full_name or p.assigned_doctor.username
                else:
                     doc_name = p.assigned_doctor.username

            latest_imgs = self.medical_repo.get_by_patient_id(p.id, limit=1)
            img = latest_imgs[0] if latest_imgs else None

            scan_data = None
            if img:
                ai_res = "Chưa xử lý"
                status = "PENDING"
                if img.analysis_result:
                    ai_res = img.analysis_result.risk_level
                    status = "COMPLETED"
                    if img.analysis_result.doctor_validation and img.analysis_result.doctor_validation.doctor_confirm:
                        ai_res = img.analysis_result.doctor_validation.doctor_confirm
                
                scan_data = {
                    "ai_result": ai_res,
                    "ai_analysis_status": status,
                    "upload_date": img.created_at
                }

            formatted_patients.append({
                "id": p.id,
                "username": p.username,
                "email": p.email,
                "role": p.role,
                "status": p.status,
                "created_at": p.created_at,
                "is_active": True, 
                "full_name": p.profile.full_name if (p.profile and p.profile.full_name) else p.username,
                "phone": p.profile.phone if (p.profile and p.profile.phone) else "",
                "assigned_doctor_id": assigned_doctor_id,
                "assigned_doctor": doc_name,
                "latest_scan": scan_data
            })

        return {
            "clinic": clinic,
            "admin_name": admin_name,
            "doctors": formatted_doctors, 
            "patients": formatted_patients
        }
    
    def add_user_to_clinic_context(self, current_user: User, target_user_id: UUID):
        
        # 1. LOGIC TÌM CLINIC ID (Đã chuyển từ Router sang đây)
        clinic_id = None
        
        if current_user.role == UserRole.CLINIC:
            # Gọi Repo thay vì db.query trực tiếp
            clinic = self.clinic_repo.get_by_admin_id(current_user.id) 
            if clinic:
                clinic_id = clinic.id
        elif current_user.clinic_id:
            clinic_id = current_user.clinic_id

        # Kiểm tra
        if not clinic_id:
            raise HTTPException(400, "Bạn chưa sở hữu hoặc không thuộc về phòng khám nào.")

        # 2. GỌI HÀM LOGIC CŨ ĐỂ THÊM (Tái sử dụng code)
        return self.add_user_to_clinic(clinic_id, target_user_id)

    def assign_patient(self, patient_id: UUID, doctor_id: UUID):
        patient = self.db.query(User).filter(User.id == patient_id).first()
        if not patient:
            raise Exception("Không tìm thấy bệnh nhân")
        
        patient.assigned_doctor_id = doctor_id 
        self.db.commit()
        return True
    
    def get_pending_clinics(self):
        return self.clinic_repo.get_unverified_clinics()

    def process_clinic_request(self, clinic_id: str, status: str):
            clinic = self.clinic_repo.verify_clinic(clinic_id, status)
            
            if clinic and status == 'APPROVED':
                user = self.db.query(User).filter(User.id == clinic.admin_id).first()
                if user and user.role == UserRole.USER:
                    user.role = UserRole.CLINIC
                    self.db.commit()
            return clinic
    
    def get_clinic_ai_history_split(self, admin_id: UUID):
        """
        Lấy lịch sử phân tích của phòng khám, chia làm 2 loại:
        1. internal_uploads: Do bác sĩ/admin phòng khám upload.
        2. patient_uploads: Do bệnh nhân của phòng khám tự upload ở nhà.
        """
        # 1. Tìm Clinic ID của admin
        clinic = self.db.query(Clinic).filter(Clinic.admin_id == admin_id).first()
        if not clinic:
            return {"clinic_uploads": [], "patient_uploads": []}

        # 2. Query tất cả ảnh thuộc về bệnh nhân của phòng khám này
        # Join Patient để lọc theo clinic_id
        # Join User (Patient User) để so sánh uploader
        # Join User (Uploader) để lấy tên người upload
        images = (self.db.query(RetinalImage)
                  .join(Patient, RetinalImage.patient_id == Patient.id)
                  .join(User, Patient.user_id == User.id)
                  .options(
                      joinedload(RetinalImage.analysis_result),
                      joinedload(RetinalImage.patient).joinedload(Patient.user), # Load thông tin bệnh nhân
                      joinedload(RetinalImage.uploader) # Load người upload
                  )
                  .filter(
                      or_(
                      User.clinic_id == clinic.id,
                      RetinalImage.uploader_id == admin_id
                      )
                    )
                  .order_by(desc(RetinalImage.created_at))
                  .all())

        clinic_uploads = []
        patient_uploads = []

        for img in images:
            # Format dữ liệu trả về (Giống ImageResponse)
            ai_res = "Chưa xử lý"
            status = "PENDING"
            
            # Xử lý kết quả AI
            analysis = getattr(img, "analysis_result", None)
            if analysis:
                ai_res = analysis.risk_level
                status = "COMPLETED"
                # Nếu bác sĩ đã validate, ghi đè kết quả
                if analysis.doctor_validation and analysis.doctor_validation.doctor_confirm:
                    ai_res = analysis.doctor_validation.doctor_confirm
            
            p_name = "Unknown"
            if img.patient and img.patient.user:
                if img.patient.user.profile and img.patient.user.profile.full_name:
                    p_name = img.patient.user.profile.full_name
                else:
                    p_name = img.patient.user.username

            item_data = {
                "id": str(img.id),
                "created_at": img.created_at,
                "image_url": img.image_url,
                "ai_result": ai_res,
                "ai_analysis_status": status,
                # Thông tin bệnh nhân
                "patient_name": img.patient.user.profile.full_name if (img.patient.user.profile and img.patient.user.profile.full_name) else img.patient.user.username,
                "patient_id": str(img.patient.user_id),
                # Thông tin người thực hiện
                "uploader_name": img.uploader.username
            }

            # PHÂN LOẠI
            # Nếu người upload là chính bệnh nhân -> Patient Upload
           # Ưu tiên 1: Nếu người upload là Admin (chính là user đang đăng nhập) -> Vào "Phòng khám thực hiện"
            if img.uploader_id == admin_id:
                clinic_uploads.append(item_data)
            
            # Ưu tiên 2: Nếu người upload trùng với chủ hồ sơ bệnh án -> "Bệnh nhân tự tải"
            elif img.uploader_id == img.patient.user_id:
                patient_uploads.append(item_data)
                
            # Ưu tiên 3: Các trường hợp còn lại (Bác sĩ nhân viên upload) -> "Phòng khám thực hiện"
            else:
                clinic_uploads.append(item_data)

        return {
            "clinic_uploads": clinic_uploads,
            "patient_uploads": patient_uploads
        }

    def get_clinic_record_detail(self, record_id: str):
        """
        Lấy chi tiết hồ sơ dành riêng cho Clinic Dashboard.
        Trả về dictionary phẳng, không bị lỗi lazy loading hay schema.
        """
        # 1. Lấy record từ Repo (đã có joinedload từ bước trước)
        record = self.medical_repo.get_record_by_id(record_id)
        if not record:
            return None

        # 2. Xử lý tên Bệnh nhân
        patient_name = "Unknown"
        is_internal = False

        if record.patient and record.patient.user:
            # KIỂM TRA: Nếu chủ hồ sơ là Admin/Clinic/Doctor -> Đánh dấu là nội bộ
            if record.patient.user.role in [UserRole.ADMIN, UserRole.CLINIC, UserRole.DOCTOR]:
                is_internal = True
            
            # Lấy tên hiển thị
            if record.patient.user.profile and record.patient.user.profile.full_name:
                patient_name = record.patient.user.profile.full_name
            else:
                patient_name = record.patient.user.username

        # 3. Xử lý Kết quả AI & Bác sĩ
        ai_res = "Chưa xử lý"
        ai_report = ""
        annotated_url = None
        
        doctor_name = None
        doctor_diagnosis = None
        doctor_notes = None
        is_validated = False

        analysis = getattr(record, "analysis_result", None)
        if analysis:
            ai_res = analysis.risk_level
            ai_report = analysis.ai_detailed_report
            annotated_url = analysis.annotated_image_url
            
            val = getattr(analysis, "doctor_validation", None)
            if val:
                is_validated = True
                doctor_diagnosis = val.doctor_confirm
                doctor_notes = val.doctor_notes
                if val.doctor:
                    if val.doctor.profile and val.doctor.profile.full_name:
                        doctor_name = val.doctor.profile.full_name
                    else:
                        doctor_name = val.doctor.username

        # 4. Trả về JSON (Thêm is_internal vào)
        return {
            "id": str(record.id),
            "created_at": record.created_at,
            "image_url": record.image_url,
            "annotated_image_url": annotated_url,
            
            "patient_name": patient_name,
            "ai_risk_level": ai_res,
            "ai_detailed_report": ai_report,
            
            "is_validated": is_validated,
            "doctor_name": doctor_name,
            "doctor_diagnosis": doctor_diagnosis,
            "doctor_notes": doctor_notes,
            
            "is_internal": is_internal # <--- TRẢ VỀ CỜ NÀY
        }
    
    def search_doctors(self, query: str):
        # Gọi Repo để tìm User có role là DOCTOR
        return self.user_repo.search_users_by_role(UserRole.DOCTOR, query)
    
    def search_patients(self, query: str):
        # Gọi Repo để tìm User có role là USER (Bệnh nhân)
        return self.user_repo.search_users_by_role(UserRole.USER, query)