from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, func, case, or_ , and_ , not_
from uuid import UUID
from typing import List, Optional, Dict, Any

# Import Interface
from domain.models.idoctor_repository import IDoctorRepository

# Import Models
from models.users import User
from models.medical import RetinalImage, AIAnalysisResult, DoctorValidation
from models.enums import UserRole

class DoctorRepository(IDoctorRepository):
    def __init__(self, db: Session):
        self.db = db

    def get_assigned_patients(self, doctor_id: UUID) -> List[User]:
        """Lấy danh sách bệnh nhân được phân công cho bác sĩ này"""
        return self.db.query(User).filter(
            User.assigned_doctor_id == doctor_id,
            User.role == UserRole.USER
        ).all()

    def get_latest_scan(self, patient_id: UUID) -> Optional[RetinalImage]:
        """Lấy kết quả khám mới nhất của bệnh nhân"""
        return self.db.query(RetinalImage).join(
            AIAnalysisResult, RetinalImage.id == AIAnalysisResult.image_id, isouter=True
        ).filter(
            RetinalImage.uploader_id == patient_id
        ).order_by(
            desc(RetinalImage.created_at)
        ).first()
    
    def get_feedback_by_doctor_id(self, doctor_id: UUID):
        """Lấy danh sách báo cáo do bác sĩ gửi, kèm theo thông tin AI và Ảnh"""
        return (
            self.db.query(DoctorValidation)
            .options(
                # Load: Validation -> Analysis -> Image
                joinedload(DoctorValidation.analysis).joinedload(AIAnalysisResult.image)
            )
            .filter(DoctorValidation.doctor_id == doctor_id)
            .order_by(DoctorValidation.created_at.desc())
            .all()
        )
    
    def get_doctor_statistics(self, doctor_id: UUID) -> Dict[str, Any]:
        # 1. Thống kê Bệnh nhân (Tổng số & Phân loại rủi ro)
        # Lấy danh sách bệnh nhân của bác sĩ
        patient_ids_query = self.db.query(User.id).filter(
            User.assigned_doctor_id == doctor_id,
            User.role == UserRole.USER
        )
        total_patients = patient_ids_query.count()

        # 2. Thống kê Hoạt động Duyệt (Validation)
        # Đếm tổng số lần bác sĩ đã đánh giá
        total_reviews = self.db.query(DoctorValidation).filter(
            DoctorValidation.doctor_id == doctor_id
        ).count()

        # Đếm số lần đồng ý với AI (is_correct = True)
        agreed_reviews = self.db.query(DoctorValidation).filter(
            DoctorValidation.doctor_id == doctor_id,
            DoctorValidation.is_correct == True
        ).count()

        # 3. Thống kê Phân bố rủi ro (Dựa trên kết quả khám mới nhất của các bệnh nhân được gán)
        # Logic này hơi phức tạp, ta có thể query đơn giản từ bảng AIAnalysisResult 
        # kết hợp với RetinalImage của các bệnh nhân thuộc bác sĩ này.
        
        risk_stats = (
            self.db.query(
                AIAnalysisResult.risk_level,
                func.count(AIAnalysisResult.id)
            )
            .join(RetinalImage, AIAnalysisResult.image_id == RetinalImage.id)
            .filter(RetinalImage.uploader_id.in_(patient_ids_query)) # Chỉ lấy bệnh nhân của bác sĩ
            .group_by(AIAnalysisResult.risk_level)
            .all()
        )
        
        # Chuyển risk_stats thành dict
        risk_map = {r[0]: r[1] for r in risk_stats if r[0]}

        return {
            "total_patients": total_patients,
            "total_reviews": total_reviews,
            "agreed_reviews": agreed_reviews,
            "risk_distribution": risk_map
        }
    
    def get_critical_unreviewed_records(self, doctor_id: UUID):
        """
        Lấy hồ sơ nguy hiểm cần bác sĩ chú ý.
        Logic: Chỉ lấy 'Severe' hoặc 'PDR'. Tự động loại bỏ Mild/Moderate.
        """
        # Lấy danh sách ID bệnh nhân của bác sĩ này
        patient_ids_query = self.db.query(User.id).filter(
            User.assigned_doctor_id == doctor_id
        )

        return (
            self.db.query(RetinalImage)
            .join(AIAnalysisResult, RetinalImage.id == AIAnalysisResult.image_id)
            .join(User, RetinalImage.uploader_id == User.id)
            .outerjoin(DoctorValidation, AIAnalysisResult.id == DoctorValidation.analysis_id)
            .filter(
                RetinalImage.uploader_id.in_(patient_ids_query),
                or_(
                # Trường hợp 1: Chưa khám (Validation là Null)
                DoctorValidation.id == None,
                
                # Trường hợp 2: Đã khám nhưng đánh dấu là Nguy hiểm (Logic mở rộng nếu cần)
                DoctorValidation.doctor_confirm.ilike("%Severe%"),
                DoctorValidation.doctor_confirm.ilike("%PDR%"),
                DoctorValidation.doctor_confirm.ilike("%Nặng%"),
                DoctorValidation.doctor_confirm.ilike("%Nguy hiểm%")
                ),
                
                # --- LOGIC LỌC CHÍNH XÁC ---
                or_(
                    # NHÓM 1: Bắt buộc phải là NẶNG (Severe)
                    # (Cái này sẽ bắt được 'Severe NPDR' vì nó có chữ Severe)
                    AIAnalysisResult.risk_level.ilike("%Severe%"),
                    AIAnalysisResult.risk_level.ilike("%Nặng%"),
                    AIAnalysisResult.risk_level.ilike("%Nguy hiểm%"),

                    # NHÓM 2: Là PDR nhưng KHÔNG PHẢI là NPDR
                    # (Cái này bắt 'PDR', và loại bỏ 'Mild NPDR', 'Moderate NPDR')
                    and_(
                        AIAnalysisResult.risk_level.ilike("%PDR%"),      
                        not_(AIAnalysisResult.risk_level.ilike("%NPDR%")) 
                    )
                )
            )
            .options(
                joinedload(RetinalImage.analysis_result),
                joinedload(RetinalImage.uploader).joinedload(User.profile)
            )
            .order_by(desc(RetinalImage.created_at))
            .all()
        )