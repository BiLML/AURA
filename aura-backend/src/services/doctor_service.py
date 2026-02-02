from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import SQLAlchemyError
from uuid import UUID
from fastapi import HTTPException

from models.medical import DoctorValidation, AIAnalysisResult, RetinalImage
from models.audit_log import AuditLog

from domain.models.idoctor_repository import IDoctorRepository
from domain.models.imedical_repository import IMedicalRepository
from domain.models.iaudit_repository import IAuditRepository

from schemas.doctor_schema import PatientResponse, LatestScan
from models.users import User, UserRole

import base64
import io
import cloudinary.uploader
from datetime import datetime

class DoctorService:
    def __init__(self, doctor_repo: IDoctorRepository, medical_repo: IMedicalRepository, audit_repo: IAuditRepository, db: Session):
        self.db = db
        self.repo = doctor_repo      # Gán Interface vào biến self.repo
        self.medical_repo = medical_repo # Gán Interface vào biến self.medical_repo
        self.audit_repo = audit_repo

    def get_my_patients(self, doctor_id: UUID):
        users = self.repo.get_assigned_patients(doctor_id)
        results = []
        for user in users:
            latest_img = self.repo.get_latest_scan(user.id)
            scan_data = None

            if latest_img:
                ai_res = "Đang xử lý"
                status = "PENDING"
                
                # Xử lý an toàn: Kiểm tra nếu analysis_result tồn tại
                # Vì uselist=False, nó là object hoặc None. Nhưng ta kiểm tra kỹ.
                analysis = getattr(latest_img, "analysis_result", None)
                
                if analysis:
                    # Nếu cấu hình sai thành list, lấy phần tử đầu
                    if isinstance(analysis, list) and len(analysis) > 0:
                        analysis = analysis[0]
                    
                    if not isinstance(analysis, list):
                        ai_res = analysis.risk_level
                        status = "COMPLETED" # Giả định completed nếu có kết quả
                        
                        # Kiểm tra xem bác sĩ đã validate chưa
                        # analysis.doctor_validation cũng là object (uselist=False)
                        val = getattr(analysis, "doctor_validation", None)
                        if val and val.doctor_confirm:
                             ai_res = val.doctor_confirm

                scan_data = LatestScan(
                    record_id=str(latest_img.id),
                    ai_result=ai_res,
                    ai_analysis_status=status,
                    upload_date=latest_img.created_at
                )

            full_name = user.username
            phone = None
            if user.profile:
                full_name = user.profile.full_name or user.username
                phone = user.profile.phone

            results.append(PatientResponse(
                id=str(user.id),
                userName=user.username,
                full_name=full_name,
                email=user.email,
                phone=phone,
                latest_scan=scan_data
            ))
            
        return {"patients": results}

    def update_diagnosis(self, record_id: str, diagnosis: str, notes: str, is_correct: bool, doctor_id: UUID, ip_address: str = "Unknown", feedback: str = None, ai_detailed_report: str = None, doctor_drawing: str = None):
        """
        Lưu kết quả thẩm định. Có Try/Except để bắt lỗi DB.
        """
        # 1. Lấy record
        record = self.medical_repo.get_record_by_id(record_id)
        if not record:
            raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ")
            
        # 2. Lấy Analysis Result an toàn
        analysis = None
        if record.analysis_result:
            analysis = record.analysis_result
        elif hasattr(record, "analysis_results") and record.analysis_results:
             analysis = record.analysis_results[0]
        
        if not analysis:
             raise HTTPException(status_code=400, detail="Hồ sơ này chưa có kết quả AI để thẩm định")

        if ai_detailed_report is not None:
            analysis.ai_detailed_report = ai_detailed_report

        # 2. XỬ LÝ UPLOAD ẢNH VẼ (MỚI)
        final_drawing_url = None
        if doctor_drawing and len(doctor_drawing) > 100:
            try:
                # Cắt header base64 nếu có (data:image/png;base64,...)
                if "base64," in doctor_drawing:
                    doctor_drawing = doctor_drawing.split("base64,")[1]
                
                image_data = base64.b64decode(doctor_drawing)
                
                # Upload lên Cloudinary vào folder riêng
                upload_res = cloudinary.uploader.upload(
                    io.BytesIO(image_data),
                    folder="aura_doctor_annotations",
                    public_id=f"doc_paint_{record_id}_{int(datetime.utcnow().timestamp())}"
                )
                final_drawing_url = upload_res.get("secure_url")
            except Exception as e:
                print(f"⚠️ Lỗi upload hình vẽ: {e}") 
                # Không raise lỗi để vẫn lưu được text chẩn đoán

        try:
            # 3. Tìm Validation cũ (Upsert)
            validation = self.db.query(DoctorValidation).filter(
                DoctorValidation.analysis_id == analysis.id
            ).first()

            if validation:
                # UPDATE
                validation.doctor_id = doctor_id
                validation.is_correct = is_correct
                validation.doctor_confirm = diagnosis 
                validation.doctor_notes = notes
                # Chỉ update feedback nếu có giá trị (để tránh ghi đè None vào dữ liệu cũ nếu muốn)
                if feedback is not None:
                    validation.feedback_for_ai = feedback
            else:
                # CREATE
                validation = DoctorValidation(
                    analysis_id=analysis.id,
                    doctor_id=doctor_id,
                    is_correct=is_correct,
                    doctor_confirm=diagnosis, 
                    doctor_notes=notes,
                    feedback_for_ai=feedback,
                    doctor_annotated_url=final_drawing_url # <--- Map vào cột mới
                )
                self.db.add(validation)

            self.db.commit()
            try:
                self.audit_repo.create_log(AuditLog(
                    user_id=doctor_id,
                    action="DOCTOR_VALIDATE",
                    resource_type="doctor_validations",
                    resource_id=str(validation.id), # validation là biến vừa lưu xong
                    ip_address=ip_address,
                    new_values={
                        "diagnosis": diagnosis,
                        "is_correct": is_correct,
                        "record_id": record_id
                    }
                ))
            except Exception: pass

            self.db.refresh(validation)
            return validation

        except SQLAlchemyError as e:
            self.db.rollback()
            error_msg = str(e)
            print(f"❌ DATABASE ERROR: {error_msg}") # Xem log terminal để biết lỗi chính xác
            
            # Gợi ý lỗi thường gặp cho người dùng
            if "column" in error_msg and "does not exist" in error_msg:
                 raise HTTPException(status_code=500, detail="Lỗi DB: Thiếu cột trong bảng doctor_validations. Hãy kiểm tra migration.")
            
            raise HTTPException(status_code=500, detail=f"Lỗi lưu dữ liệu: {error_msg}")
        except Exception as e:
            print(f"❌ UNKNOWN ERROR: {str(e)}")
            raise HTTPException(status_code=500, detail="Lỗi không xác định từ Server.")
            
    # Giữ nguyên hàm get_report_detail cũ của bạn...
    def get_report_detail(self, record_id: str, current_doctor_id: UUID):
        record = self.medical_repo.get_record_by_id(record_id)
        if not record:
            raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ")
            
        patient_name = "Unknown"
        patient_id = "Unknown"
        
        if record.patient:
            patient_id = str(record.patient.user_id) 
            if record.patient.user:
                if record.patient.user.profile and record.patient.user.profile.full_name:
                    patient_name = record.patient.user.profile.full_name
                else:
                    patient_name = record.patient.user.username

        doctor_user = self.db.query(User).filter(User.id == current_doctor_id).first()
        doctor_name = doctor_user.username if doctor_user else "Unknown"
        if doctor_user and doctor_user.profile and doctor_user.profile.full_name:
            doctor_name = doctor_user.profile.full_name

        doctor_diagnosis = None
        ai_result = "Unknown"
        
        # Xử lý an toàn như trên
        analysis = getattr(record, "analysis_result", None)
        if analysis and not isinstance(analysis, list):
            ai_result = analysis.risk_level
            # Check validation
            val = getattr(analysis, "doctor_validation", None)
            if val and not isinstance(val, list):
                doctor_diagnosis = val.doctor_confirm

        return {
            "record_id": str(record.id),
            "image_url": record.image_url,
            "ai_result": ai_result,
            "doctor_diagnosis": doctor_diagnosis,
            "patient_name": patient_name,
            "patient_id": patient_id,
            "doctor_name": doctor_name,
            "doctor_id": str(current_doctor_id)
        }
    
    def get_all_feedback_for_admin(self):
        """
        Lấy danh sách feedback từ bác sĩ để hiển thị dashboard Admin.
        """
        # 1. Query bảng DoctorValidation
        # Sử dụng joinedload để lấy luôn thông tin User (Bác sĩ) và Analysis (Kết quả AI) trong 1 câu lệnh (Tránh N+1 query)
        validations = (
            self.db.query(DoctorValidation)
            .options(
                joinedload(DoctorValidation.doctor).joinedload(User.profile), # Load bác sĩ -> profile
                joinedload(DoctorValidation.analysis)  # Load kết quả AI
            )
            .order_by(DoctorValidation.created_at.desc()) # Sắp xếp mới nhất (cần cột created_at ở Bước 1)
            .all()
        )
        
        results = []
        for val in validations:
            # A. Lấy tên bác sĩ từ relationship 'doctor' trong model
            doctor_name = "Unknown"
            if val.doctor: 
                # Ưu tiên lấy full_name trong profile, nếu không có thì lấy username
                if val.doctor.profile and val.doctor.profile.full_name:
                    doctor_name = val.doctor.profile.full_name
                else:
                    doctor_name = val.doctor.username

            # B. Lấy kết quả AI từ relationship 'analysis'
            ai_result = "N/A"
            if val.analysis:
                ai_result = val.analysis.risk_level

            # C. Map dữ liệu trả về cho Frontend
            results.append({
                "id": str(val.id),
                "created_at": val.created_at, 
                "doctor_name": doctor_name,
                "doctor_id": str(val.doctor_id),
                
                "ai_result": ai_result,
                "doctor_diagnosis": val.doctor_confirm, # Model dùng 'doctor_confirm'
                
                # Frontend dùng 'notes' để hiển thị cột lý do
                # Ưu tiên hiển thị feedback gửi AI, nếu ko có thì lấy ghi chú bác sĩ
                "notes": val.feedback_for_ai if val.feedback_for_ai else val.doctor_notes,
                
                # Frontend dùng check này để hiện badge Xanh/Đỏ
                "accuracy": "CORRECT" if val.is_correct else "INCORRECT"
            })
            
        return {"reports": results}
    
    def get_my_reports(self, doctor_id: UUID):
        reports = self.repo.get_feedback_by_doctor_id(doctor_id)
        
        results = []
        for r in reports:
            # 1. Lấy Image URL an toàn
            img_url = None
            ai_res = "N/A"
            
            # Kiểm tra từng cấp quan hệ để tránh crash nếu dữ liệu bị thiếu
            if r.analysis:
                ai_res = r.analysis.risk_level
                if r.analysis.image:
                    img_url = r.analysis.image.image_url
            
            # 2. Map các trường dữ liệu
            results.append({
                "id": str(r.id),
                "image_url": img_url,
                "ai_result": ai_res,
                "doctor_confirm": r.doctor_confirm,
                
                # Model DoctorValidation dùng 'feedback_for_ai' để lưu nội dung báo cáo
                "report_content": r.feedback_for_ai if r.feedback_for_ai else r.doctor_notes,
                
                # Nếu chưa có cột admin_feedback trong DB, tạm thời để None hoặc fix cứng
                "admin_feedback": getattr(r, "admin_feedback", None),
                
                # Trạng thái giả định: Nếu đã có admin_feedback là FIXED, ngược lại là PENDING
                "status": getattr(r, "status", "PENDING"),
                
                "created_at": r.created_at
            })
            
        return results
    
    def get_dashboard_stats(self, doctor_id: UUID):
        # 1. Lấy các chỉ số cơ bản (Số bệnh nhân, số lần duyệt...) từ Repo
        raw_stats = self.repo.get_doctor_statistics(doctor_id)
        
        # 2. Tính tỷ lệ đồng thuận (Giữ nguyên logic cũ)
        total_reviews = raw_stats["total_reviews"]
        agreed = raw_stats["agreed_reviews"]
        accuracy_rate = 0
        if total_reviews > 0:
            accuracy_rate = round((agreed / total_reviews) * 100, 1)

        # 3. [LÀM MỚI] Tính phân bố rủi ro (Ưu tiên kết quả Bác sĩ)
        # Thay vì lấy 'risk_distribution' sai từ Repo, ta tự tính lại ở đây
        
        distribution = {
            "safe": 0, "mild": 0, "moderate": 0, "severe": 0, "pdr": 0
        }

        # Query lấy tất cả ảnh của bệnh nhân thuộc bác sĩ này
        # (Lưu ý: Dùng self.db trực tiếp để linh hoạt)
        patient_ids_query = self.db.query(User.id).filter(
            User.assigned_doctor_id == doctor_id,
            User.role == UserRole.USER
        )

        images = (
            self.db.query(RetinalImage)
            .join(AIAnalysisResult, RetinalImage.id == AIAnalysisResult.image_id)
            # Join thêm bảng xác nhận để lấy kết quả bác sĩ
            .outerjoin(DoctorValidation, AIAnalysisResult.id == DoctorValidation.analysis_id)
            .filter(RetinalImage.uploader_id.in_(patient_ids_query))
            .options(
                joinedload(RetinalImage.analysis_result).joinedload(AIAnalysisResult.doctor_validation)
            )
            .all()
        )

        for img in images:
            ai_res = img.analysis_result
            if not ai_res: continue

            # --- LOGIC QUAN TRỌNG: AI vs BÁC SĨ ---
            final_risk = ai_res.risk_level # Mặc định tin AI
            
            # Nhưng nếu Bác sĩ đã chốt (validate), tin Bác sĩ tuyệt đối
            if ai_res.doctor_validation and ai_res.doctor_validation.doctor_confirm:
                final_risk = ai_res.doctor_validation.doctor_confirm
            
            # Phân loại vào nhóm biểu đồ
            if not final_risk: continue
            r_norm = final_risk.upper().strip()

            if "PDR" in r_norm and "NPDR" not in r_norm:
                distribution["pdr"] += 1
            elif "SEVERE" in r_norm or "NẶNG" in r_norm:
                distribution["severe"] += 1
            elif "MODERATE" in r_norm or "TRUNG BÌNH" in r_norm:
                distribution["moderate"] += 1
            elif "MILD" in r_norm or "NHẸ" in r_norm or "EARLY" in r_norm:
                distribution["mild"] += 1
            elif "NORMAL" in r_norm or "BÌNH THƯỜNG" in r_norm or "NO DR" in r_norm:
                distribution["safe"] += 1

        return {
            "patient_count": raw_stats["total_patients"],
            "reviewed_count": total_reviews,
            "ai_agreement_rate": accuracy_rate,
            "chart_data": distribution # Dữ liệu chuẩn xác đã qua xử lý
        }