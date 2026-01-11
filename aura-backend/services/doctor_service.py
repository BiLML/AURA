from sqlalchemy.orm import Session
from uuid import UUID
from datetime import datetime
from fastapi import HTTPException

from models.medical import DoctorValidation, AIAnalysisResult
from repositories.doctor_repo import DoctorRepository
from repositories.medical_repo import MedicalRepository
from schemas.doctor_schema import PatientResponse, LatestScan

class DoctorService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = DoctorRepository(db)
        self.medical_repo = MedicalRepository(db)
        
        

    def get_my_patients(self, doctor_id: UUID):
        # 1. Lấy danh sách bệnh nhân thô từ DB
        users = self.repo.get_assigned_patients(doctor_id)
        results = []
        for user in users:
            latest_img = self.repo.get_latest_scan(user.id)
            scan_data = None

            if latest_img:
                # Xử lý an toàn nếu analysis_result bị None
                ai_res = "Đang xử lý"
                status = "PENDING"
            
                if latest_img.analysis_result:
                    val = latest_img.analysis_result.doctor_validation
                    if val and val.doctor_confirm:
                        # Nếu bác sĩ đã chốt, lấy kết quả bác sĩ (VD: Normal)
                        ai_res = val.doctor_confirm
                    else:
                        # Nếu chưa, lấy kết quả AI
                        ai_res = latest_img.analysis_result.risk_level
                    # Nếu model chưa có cột status, ta giả định có kết quả là COMPLETED
                    status = "COMPLETED" 

                scan_data = LatestScan(
                    record_id=str(latest_img.id),
                    ai_result=ai_res,
                    ai_analysis_status=status,
                    upload_date=latest_img.created_at
                )

            # 3. Map sang Schema
            # Lấy thông tin profile nếu có
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
    
    def update_diagnosis(self, record_id: str, diagnosis: str, notes: str, is_correct: bool, doctor_id: UUID):
        """
        Lưu kết quả thẩm định vào bảng doctor_validations
        """
        # 1. Tìm Analysis ID từ Record ID
        # (Vì bảng DoctorValidation nối với AIAnalysisResult, không phải RetinalImage)
        record = self.medical_repo.get_record_by_id(record_id)
        if not record:
            raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ")
            
        analysis = None
        if record.analysis_result:
            analysis = record.analysis_result
        # Logic dự phòng nếu analysis_result là list
        elif hasattr(record, "analysis_results") and record.analysis_results:
             analysis = record.analysis_results[0]
            
        if not analysis:
             raise HTTPException(status_code=400, detail="Hồ sơ này chưa có kết quả AI để thẩm định")

        # 2. Kiểm tra xem đã có Validation chưa (để Update hay Create)
        validation = self.db.query(DoctorValidation).filter(
            DoctorValidation.analysis_id == analysis.id
        ).first()

        if validation:
            # UPDATE: Nếu đã có thì cập nhật lại
            validation.doctor_id = doctor_id
            validation.is_correct = is_correct
            validation.doctor_confirm = diagnosis # Map 'doctor_diagnosis' vào cột 'doctor_confirm'
            validation.doctor_notes = notes
        else:
            # CREATE: Nếu chưa có thì tạo mới
            validation = DoctorValidation(
                analysis_id=analysis.id,
                doctor_id=doctor_id,
                is_correct=is_correct,
                doctor_confirm=diagnosis, 
                doctor_notes=notes
            )
            self.db.add(validation)

        self.db.commit()
        self.db.refresh(validation)
        
        return validation