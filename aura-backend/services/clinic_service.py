from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, or_
from repositories.clinic_repo import ClinicRepository
from repositories.medical_repo import MedicalRepository
from models.medical import RetinalImage, Patient, AIAnalysisResult
from models.clinic import Clinic
from models.users import User
from models.enums import UserRole, ClinicStatus, UserStatus 
from uuid import UUID

class ClinicService:
    def __init__(self, db: Session):
        self.clinic_repo = ClinicRepository(db)
        self.medical_repo = MedicalRepository(db)
        self.db = db

    def register_clinic(self, admin_id: UUID, name: str, address: str, phone_number: str, image_url: str = None, description: str = None) -> Clinic:
        existing_clinic = self.clinic_repo.db.query(Clinic).filter(Clinic.admin_id == admin_id).first()
        if existing_clinic:
             raise Exception("Admin này đã sở hữu một phòng khám.")
        return self.clinic_repo.create_clinic(admin_id, name, address, phone_number, image_url, description)

    def get_clinic_info(self, clinic_id: str) -> Clinic:
        return self.clinic_repo.get_clinic_by_id(clinic_id)

    def get_all_clinics(self):
        return self.clinic_repo.get_all_clinics()

    def get_clinic_dashboard_data(self, admin_id: UUID):
        clinic = self.db.query(Clinic).filter(Clinic.admin_id == admin_id).first()
        if not clinic:
            return None
        
        admin_user = self.db.query(User).options(joinedload(User.profile)).filter(User.id == admin_id).first()
        admin_name = "Clinic Admin" # Giá trị mặc định
        if admin_user and admin_user.profile and admin_user.profile.full_name:
            admin_name = admin_user.profile.full_name

        # --- XỬ LÝ BÁC SĨ ---
        doctors = self.db.query(User).options(joinedload(User.profile)).filter(
            User.clinic_id == clinic.id, 
            User.role == UserRole.DOCTOR
        ).all()

        formatted_doctors = []
        for doc in doctors:
            p_counts = self.db.query(User).filter(
                User.assigned_doctor_id == doc.id,
                User.role == UserRole.USER
            ).count()

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
        patients_query = self.db.query(User).options(
            joinedload(User.assigned_doctor).joinedload(User.profile),
            joinedload(User.profile),
        ).filter(
            User.clinic_id == clinic.id,
            User.role == UserRole.USER
        ).all()

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

            # 2. 🔥 QUAN TRỌNG: Gọi Repo để tìm ảnh mới nhất của bệnh nhân này
            # (Phần này đang bị thiếu hoặc sai trong code cũ của bạn)
            latest_imgs = self.medical_repo.get_by_patient_id(p.id, limit=1)
            img = latest_imgs[0] if latest_imgs else None

            # 3. Map dữ liệu scan ra dạng phẳng
            scan_data = None
            if img:
                ai_res = "Chưa xử lý"
                status = "PENDING"
                
                # Lấy kết quả AI hoặc Bác sĩ
                if img.analysis_result:
                    ai_res = img.analysis_result.risk_level
                    status = "COMPLETED"
                    if img.analysis_result.doctor_validation and img.analysis_result.doctor_validation.doctor_confirm:
                        ai_res = img.analysis_result.doctor_validation.doctor_confirm
                
                scan_data = {
                    "ai_result": ai_res,          # Frontend cần trường này để lọc Severe/PDR
                    "ai_analysis_status": status,
                    "upload_date": img.created_at
                }

            # 4. Đóng gói dữ liệu bệnh nhân
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
                "latest_scan": scan_data # <-- Dữ liệu đã xử lý được gán vào đây
            })

        return {
            "clinic": clinic,
            "admin_name": admin_name,
            "doctors": formatted_doctors, 
            "patients": formatted_patients
        }
    
    def add_user_to_clinic(self, admin_id: UUID, target_user_id: UUID):
        clinic = self.db.query(Clinic).filter(Clinic.admin_id == admin_id).first()
        if not clinic: raise Exception("Admin chưa có phòng khám")
        
        user = self.db.query(User).filter(User.id == target_user_id).first()
        if not user: raise Exception("User không tồn tại")
        
        user.clinic_id = clinic.id
        self.db.commit()
        return True

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