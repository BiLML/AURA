from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import SQLAlchemyError
from uuid import UUID
from fastapi import HTTPException

from models.medical import DoctorValidation, AIAnalysisResult
from domain.models.idoctor_repository import IDoctorRepository
from domain.models.imedical_repository import IMedicalRepository
from schemas.doctor_schema import PatientResponse, LatestScan
from models.users import User

class DoctorService:
    def __init__(self, doctor_repo: IDoctorRepository, medical_repo: IMedicalRepository, db: Session):
        self.db = db
        self.repo = doctor_repo      # Gán Interface vào biến self.repo
        self.medical_repo = medical_repo # Gán Interface vào biến self.medical_repo

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

    def update_diagnosis(self, record_id: str, diagnosis: str, notes: str, is_correct: bool, doctor_id: UUID, feedback: str = None, ai_detailed_report: str = None):
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
                    feedback_for_ai=feedback
                )
                self.db.add(validation)

            self.db.commit()
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
    
