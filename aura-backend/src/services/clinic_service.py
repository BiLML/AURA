import csv
import io

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, or_

from domain.models.iclinic_repository import IClinicRepository
from domain.models.imedical_repository import IMedicalRepository
from domain.models.iuser_repository import IUserRepository
from domain.models.iaudit_repository import IAuditRepository
from domain.models.inotification_repository import INotificationRepository
from domain.models.iuser_notification_repository import IUserNotificationRepository

from models.medical import RetinalImage, Patient, AIAnalysisResult
from models.clinic import Clinic
from models.users import User, UserRole
from models.enums import UserRole, ClinicStatus, UserStatus
from models.audit_log import AuditLog

from datetime import datetime
from uuid import UUID

from fastapi import HTTPException

class ClinicService:
    # 2. INJECT THÊM USER REPO VÀO HÀM KHỞI TẠO
    def __init__(self, 
                 clinic_repo: IClinicRepository, 
                 medical_repo: IMedicalRepository, 
                 user_repo: IUserRepository,
                 audit_repo: IAuditRepository,
                 noti_template_repo: INotificationRepository, 
                 user_noti_repo: IUserNotificationRepository,
                 db: Session):
        self.clinic_repo = clinic_repo
        self.medical_repo = medical_repo
        self.user_repo = user_repo
        self.audit_repo = audit_repo
        self.noti_template_repo = noti_template_repo
        self.user_noti_repo = user_noti_repo
        self.db = db

    def register_clinic(self, admin_id: UUID, name: str, address: str, phone_number: str, image_url: str = None, description: str = None) -> Clinic:
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
            clinic = self.db.query(Clinic).filter(Clinic.admin_id == current_user.id).first()
        
        if not clinic:
            return None
        
        # B. Lấy thông tin Admin
        admin_user = self.user_repo.get_by_id(clinic.admin_id)
        admin_name = "Clinic Admin"
        if admin_user and admin_user.profile and admin_user.profile.full_name:
            admin_name = admin_user.profile.full_name

        # --- XỬ LÝ BÁC SĨ ---
        doctors = self.user_repo.get_doctors_by_clinic_id(clinic.id)

        formatted_doctors = []
        for doc in doctors:
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
        patients_query = self.user_repo.get_patients_by_clinic_id(clinic.id)

        formatted_patients = []
        for p in patients_query:
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
        clinic_id = None
        
        if current_user.role == UserRole.CLINIC:
            clinic = self.clinic_repo.get_by_admin_id(current_user.id) 
            if clinic:
                clinic_id = clinic.id
        elif current_user.clinic_id:
            clinic_id = current_user.clinic_id

        if not clinic_id:
            raise HTTPException(400, "Bạn chưa sở hữu hoặc không thuộc về phòng khám nào.")

        return self.add_user_to_clinic(clinic_id, target_user_id)
    
    def add_user_to_clinic(self, clinic_id: UUID, user_id: UUID):
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(404, "User not found")
        
        if user.clinic_id is not None:
            # Nếu user đã thuộc phòng khám KHÁC
            if str(user.clinic_id) != str(clinic_id):
                raise HTTPException(400, "Người dùng này đã thuộc về một phòng khám khác.")
            else:
                # Nếu đã thuộc chính phòng khám này rồi thì báo thành công luôn (hoặc báo lỗi tùy logic)
                return True

        user.clinic_id = clinic_id
        self.user_repo.update(user) 

        if user.role == UserRole.USER:
            self.medical_repo.assign_patient_to_clinic(user_id, clinic_id)

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

    def process_clinic_request(self, clinic_id: str, status: str, admin_id: UUID, ip_address: str):
        clinic = self.clinic_repo.get_clinic_by_id(clinic_id)
        if not clinic:
            raise HTTPException(status_code=404, detail="Không tìm thấy phòng khám")
            
        old_status = clinic.status.value if hasattr(clinic.status, 'value') else str(clinic.status)
        updated_clinic = self.clinic_repo.verify_clinic(clinic_id, status)
        
        if updated_clinic:
            user = self.user_repo.get_by_id(updated_clinic.admin_id)
            
            if user:
                user_updated = False 
                if status == 'APPROVED' or status == 'ACTIVE': 
                    if user.role == UserRole.USER:
                        user.role = UserRole.CLINIC
                        user_updated = True
                    if user.status != UserStatus.ACTIVE.value:
                        user.status = UserStatus.ACTIVE.value 
                        user_updated = True
                
                elif status == 'SUSPENDED':
                    if user.role != UserRole.USER:
                        user.role = UserRole.USER
                        user_updated = True
                    
                    if user.status != UserStatus.ACTIVE.value:
                        user.status = UserStatus.ACTIVE.value
                        user_updated = True

                    self.user_repo.release_all_members_from_clinic(clinic.id)
                
                if user_updated:
                    self.user_repo.update(user)

            if status == 'APPROVED':
                try:
                    template = self.noti_template_repo.get_by_code("CLINIC_APPROVED")
                    if template:
                        title = template.subject.format(clinic_name=clinic.name)
                        content = template.content.format(clinic_name=clinic.name)
                        self.user_noti_repo.create(
                            user_id=clinic.admin_id, 
                            title=title, 
                            content=content
                        )
                except Exception as e:
                    print(f"⚠️ Lỗi gửi thông báo duyệt phòng khám: {e}")
                
        try:
            self.audit_repo.create_log(AuditLog(
                user_id=admin_id,
                action="UPDATE_CLINIC_STATUS",
                resource_type="clinics",
                resource_id=str(clinic_id),
                old_values={"status": old_status},
                new_values={"status": status},
                ip_address=ip_address
            ))
        except Exception as e: print(f"Log Error: {e}")

        return updated_clinic
    
    def get_clinic_ai_history_split(self, admin_id: UUID):
        clinic = self.db.query(Clinic).filter(Clinic.admin_id == admin_id).first()
        if not clinic:
            return {"clinic_uploads": [], "patient_uploads": []}

        images = (self.db.query(RetinalImage)
                  .join(Patient, RetinalImage.patient_id == Patient.id)
                  .join(User, Patient.user_id == User.id)
                  .options(
                      joinedload(RetinalImage.analysis_result),
                      joinedload(RetinalImage.patient).joinedload(Patient.user),
                      joinedload(RetinalImage.uploader)
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
            ai_res = "Chưa xử lý"
            status = "PENDING"
            
            analysis = getattr(img, "analysis_result", None)
            if analysis:
                ai_res = analysis.risk_level
                status = "COMPLETED"
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
                "patient_name": img.patient.user.profile.full_name if (img.patient.user.profile and img.patient.user.profile.full_name) else img.patient.user.username,
                "patient_id": str(img.patient.user_id),
                "uploader_name": img.uploader.username
            }

            if img.uploader_id == admin_id:
                clinic_uploads.append(item_data)
            elif img.uploader_id == img.patient.user_id:
                patient_uploads.append(item_data)
            else:
                clinic_uploads.append(item_data)

        return {
            "clinic_uploads": clinic_uploads,
            "patient_uploads": patient_uploads
        }

    def get_clinic_record_detail(self, record_id: str):
        record = self.medical_repo.get_record_by_id(record_id)
        if not record:
            return None

        patient_name = "Unknown"
        is_internal = False

        if record.patient and record.patient.user:
            if record.patient.user.role in [UserRole.ADMIN, UserRole.CLINIC, UserRole.DOCTOR]:
                is_internal = True
            
            if record.patient.user.profile and record.patient.user.profile.full_name:
                patient_name = record.patient.user.profile.full_name
            else:
                patient_name = record.patient.user.username

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
            "is_internal": is_internal
        }
    
    def search_doctors(self, query: str):
        return self.user_repo.search_users_by_role(UserRole.DOCTOR, query)
    
    def search_patients(self, query: str):
        return self.user_repo.search_users_by_role(UserRole.USER, query)
    
    def generate_campaign_report(self, clinic_id: str, start_date: datetime, end_date: datetime):
        clinic_uuid = UUID(clinic_id)
        
        raw_stats = self.clinic_repo.get_screening_stats_by_date(clinic_uuid, start_date, end_date)
        
        total_scans = 0
        distribution = []
        
        risk_map = {}
        for risk, count in raw_stats:
            if not risk: risk = "Unknown"
            risk_map[risk] = count
            total_scans += count
            
        distribution = [
            {"name": k, "value": v} for k, v in risk_map.items()
        ]

        high_risk_cases = self.clinic_repo.get_high_risk_patients_in_range(clinic_uuid, start_date, end_date)
        
        detailed_list = []
        for img in high_risk_cases:
            p_name = "Unknown"
            p_phone = ""
            if img.patient and img.patient.user:
                profile = img.patient.user.profile
                p_name = profile.full_name if profile else img.patient.user.username
                p_phone = profile.phone if profile else ""

            detailed_list.append({
                "patient_name": p_name,
                "phone": p_phone,
                "date": img.created_at,
                "risk_level": img.analysis_result.risk_level,
                "image_url": img.image_url
            })

        return {
            "period": {
                "start": start_date,
                "end": end_date
            },
            "summary": {
                "total_scans": total_scans,
                "high_risk_count": len(detailed_list)
            },
            "chart_data": distribution,
            "high_risk_patients": detailed_list
        }
    
    def export_research_csv(self, clinic_id: str, start_date: datetime, end_date: datetime):
        clinic_uuid = UUID(clinic_id)
        
        records = self.clinic_repo.get_research_data(clinic_uuid, start_date, end_date)
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow([
            'Record_ID', 
            'Date', 
            'Time', 
            'Patient_ID_Anonymized',
            'Risk_Level_AI', 
            'Confidence_Score',
            'Is_Validated',
            'Doctor_Diagnosis'
        ])
        
        for r in records:
            ai_res = r.analysis_result
            
            is_valid = "No"
            doc_diag = ""
            
            if hasattr(ai_res, "doctor_validation") and ai_res.doctor_validation:
                is_valid = "Yes"
                doc_diag = ai_res.doctor_validation.doctor_confirm

            # --- SỬA LỖI Ở ĐÂY: Dùng getattr để tránh crash khi không có field 'confidence' ---
            confidence_val = getattr(ai_res, 'confidence', 0.0)
            if confidence_val is None: confidence_val = 0.0

            writer.writerow([
                str(r.id),
                r.created_at.strftime("%Y-%m-%d"),
                r.created_at.strftime("%H:%M:%S"),
                str(r.patient_id)[:8] + "***",
                ai_res.risk_level,
                f"{confidence_val:.4f}",  # Format an toàn
                is_valid,
                doc_diag
            ])
            
        output.seek(0)
        return output