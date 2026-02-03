from sqlalchemy import func, case
from sqlalchemy.orm import Session
from fastapi import HTTPException
from models.users import User, UserRole
from models.enums import UserRole, UserStatus 
from models.system_config import SystemConfig
from models.audit_log import AuditLog
from models.medical import RetinalImage, AIAnalysisResult, DoctorValidation
from uuid import UUID

from schemas.notification_schema import TemplateUpdate
from schemas.admin_schema import DetailedAnalyticsResponse, UploadsByRole, AIPerformanceStats

from domain.models.iuser_repository import IUserRepository
from domain.models.imedical_repository import IMedicalRepository
from domain.models.ibilling_repository import IBillingRepository
from domain.models.iconfig_repository import IConfigRepository 
from domain.models.iaudit_repository import IAuditRepository
from domain.models.inotification_repository import INotificationRepository
from domain.models.idoctor_repository import IDoctorRepository
class AdminService:
    def __init__(self, 
                 user_repo: IUserRepository, 
                 medical_repo: IMedicalRepository, 
                 billing_repo: IBillingRepository, 
                 config_repo: IConfigRepository, 
                 audit_repo: IAuditRepository, 
                 noti_repo: INotificationRepository,
                 doctor_repo: IDoctorRepository):
        self.user_repo = user_repo
        self.medical_repo = medical_repo
        self.billing_repo = billing_repo
        self.config_repo = config_repo
        self.audit_repo = audit_repo
        self.noti_repo = noti_repo
        self.doctor_repo = doctor_repo

    def get_user_by_id(self, user_id: UUID) -> User:
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Người dùng không tồn tại")
        return user

    def update_user_status(self, user_id: UUID, new_status: str, admin_id: UUID, ip_address: str):
        user = self.get_user_by_id(user_id)
        old_status = user.status
        
        # Logic cũ
        user.status = new_status 
        updated_user = self.user_repo.update(user)

        # --- THÊM LOGGING ---
        try:
            self.audit_repo.create_log(AuditLog(
                user_id=admin_id, # Người thực hiện là Admin
                action="UPDATE_USER_STATUS",
                resource_type="users",
                resource_id=str(user.id),
                old_values={"status": old_status},
                new_values={"status": new_status},
                ip_address=ip_address
            ))
        except Exception as e: print(f"Log Error: {e}")
        
        return updated_user

    # Tương tự cho update_user_role
    def update_user_role(self, user_id: UUID, new_role: str, admin_id: UUID, ip_address: str):
        user = self.get_user_by_id(user_id)
        old_role = user.role
        
        # Logic cũ
        valid_roles = [e.value for e in UserRole]
        if new_role not in valid_roles: raise HTTPException(status_code=400, detail="Role invalid")
        user.role = new_role
        updated_user = self.user_repo.update(user)

        # --- THÊM LOGGING ---
        try:
            self.audit_repo.create_log(AuditLog(
                user_id=admin_id,
                action="UPDATE_USER_ROLE",
                resource_type="users",
                resource_id=str(user.id),
                old_values={"role": old_role},
                new_values={"role": new_role},
                ip_address=ip_address
            ))
        except: pass
        
        return updated_user
    
    def get_system_config(self):
        # 1. Thử lấy cấu hình hiện tại
        config = self.config_repo.get_config()
        
        # 2. Nếu chưa có (None) -> Tự động tạo mới
        if not config:
            # Tạo object mặc định (SQLAlchemy sẽ tự lấy các giá trị default đã khai báo trong Model)
            default_config = SystemConfig() 
            
            # Gọi hàm create_config (hàm này bạn đã thêm vào Repo ở bước trước)
            return self.config_repo.create_config(default_config)
            
        return config
    
    def update_system_config(self, data, user_id: UUID, ip_address: str):
        # A. Lấy cấu hình CŨ để so sánh
        current_config = self.get_system_config()
        
        # Serialize giá trị cũ sang Dict để lưu log
        old_values = {
            "confidence_threshold": current_config.confidence_threshold,
            "auto_retrain": current_config.auto_retrain,
            "anonymize_patient_data": getattr(current_config, "anonymize_patient_data", True),
            "require_training_consent": getattr(current_config, "require_training_consent", False),
            "data_retention_days": getattr(current_config, "data_retention_days", 90)
        }

        # B. Thực hiện Cập nhật (Logic cũ)
        updated_config = self.config_repo.update_config(data)

        # C. Chuẩn bị dữ liệu MỚI (chuyển Pydantic model sang dict)
        new_values = data.model_dump(exclude_unset=True)

        # D. GHI LOG (Audit Trail)
        try:
            log_entry = AuditLog(
                user_id=user_id,
                action="UPDATE_SYSTEM_CONFIG",
                resource_type="system_configs",
                resource_id=str(updated_config.id),
                old_values=old_values,
                new_values=new_values,
                ip_address=ip_address
            )
            self.audit_repo.create_log(log_entry)
            print(f"✅ [AUDIT] Admin {user_id} updated config.")
        except Exception as e:
            print(f"⚠️ [AUDIT FAIL] Could not write log: {e}")

        return updated_config
    
    def get_global_stats(self):
        # 1. Số liệu Người dùng
        total_users = self.user_repo.count_users() # Giả sử UserRepo đã có hàm count
        new_users = 0 # Có thể thêm hàm count_new_users_this_month() nếu cần
        
        # 2. Số liệu AI & Y tế
        # (Lưu ý: Bạn cần thêm hàm count_total_records() vào IMedicalRepository nếu chưa có)
        # Tạm thời giả định MedicalRepo có hàm đếm record
        total_scans = self.medical_repo.count_all_records() 
        
        # 3. Số liệu Tài chính (Billing)
        total_revenue = self.billing_repo.get_total_revenue()
        recent_tx = self.billing_repo.get_recent_transactions(5)

        # 4. Lấy thống kê hiệu suất AI (tỷ lệ chính xác)
        val_stats = self.medical_repo.get_ai_validation_stats()
        total_val = val_stats["total_validated"]
        correct = val_stats["correct_ai"]
        accuracy = (correct / total_val * 100) if total_val > 0 else 0

        # 5. Lấy Config để hiển thị version model
        current_config = self.config_repo.get_config() 
        model_ver = current_config.model_version if current_config else "Unknown"

        #6. Lấy biểu đồ doanh thu 7 ngày gần nhất
        revenue_chart = self.billing_repo.get_revenue_trend(7)

        # Format danh sách giao dịch để trả về Frontend
        tx_list = []
        for tx in recent_tx:
            # Lấy tên user (cẩn thận lazy loading)
            user_name = "Unknown"
            if tx.user: # Giả sử relation đã setup
                user_name = tx.user.username

            tx_list.append({
                "id": str(tx.id),
                "user": user_name,
                "amount": tx.amount,
                "package": tx.package_id, # Hoặc tx.package.name
                "date": tx.created_at
            })

        return {
            "total_users": total_users,
            "total_scans": total_scans,
            "total_revenue": total_revenue,
            "revenue_chart": revenue_chart, # <--- TRẢ VỀ FIELD MỚI Ở ĐÂY
            "recent_transactions": tx_list,
            "ai_performance": {
                "accuracy": round(accuracy, 1), # VD: 92.5
                "total_validated": total_val,
                "model_version": model_ver # Hiển thị: "Model v1.0.0"
            }
        }
    
    def get_audit_logs(self):
        logs = self.audit_repo.get_recent_logs()
        # Format dữ liệu trả về cho đẹp
        return [
            {
                "id": str(log.id),
                "actor": log.user.username if log.user else "Unknown",
                "role": log.user.role if log.user else "SYSTEM",
                "action": log.action,
                "resource": f"{log.resource_type}/{log.resource_id}",
                "ip": log.ip_address,
                "time": log.created_at,
                "changes": log.new_values # Hoặc log.old_values tùy bạn
            }
            for log in logs
        ]
    
    def get_all_templates(self):
        self.noti_repo.init_defaults() # Đảm bảo luôn có dữ liệu
        return self.noti_repo.get_all()

    def update_notification_template(self, code: str, data: TemplateUpdate, admin_id: str, ip: str):
        # 1. Lấy dữ liệu từ Repo qua Interface
        template = self.noti_repo.get_by_code(code)
        if not template:
             raise HTTPException(status_code=404, detail="Mẫu không tồn tại")

        # 2. Cập nhật logic
        template.subject = data.subject
        template.content = data.content
        
        # 3. Lưu xuống DB qua Interface
        updated_tpl = self.noti_repo.update(template)

        # 4. Ghi Audit Log (Logic nghiệp vụ)
        try:
            self.audit_repo.create_log(AuditLog(
                user_id=admin_id,
                action="UPDATE_TEMPLATE",
                resource_type="notification_templates",
                resource_id=code,
                new_values=data.model_dump(),
                ip_address=ip
            ))
        except: pass
        
        return updated_tpl
    
    def get_analytics_stats(self):
        """
        API tổng hợp dữ liệu cho biểu đồ Hiệu suất AI (Analytics).
        Gồm:
        1. Tổng số lượt Upload/Scan (Đường Tím)
        2. Số lượt Bác sĩ xác nhận Đúng (Đường Xanh)
        3. Số lượt Bác sĩ xác nhận Sai (Đường Đỏ)
        """
        # 1. Lấy xu hướng Upload ảnh trong 7 ngày qua (Từ MedicalRepo)
        # Hàm này trả về list dạng: [{'date': '2023-10-27', 'count': 15}, ...]
        upload_trends = self.medical_repo.get_upload_trends(7)
        
        # 2. Lấy xu hướng Bác sĩ xác nhận trong 7 ngày qua (Từ DoctorRepo)
        # Hàm này trả về dict dạng: {'2023-10-27': {'correct': 10, 'incorrect': 2}, ...}
        validation_trends = self.doctor_repo.get_validation_trends(7)
        
        # 3. Gộp dữ liệu (Merge) dựa trên ngày tháng
        final_trends = []
        total_correct = 0   # <--- Thêm biến đếm
        total_incorrect = 0 # <--- Thêm biến đếm
        
        for item in upload_trends:
            # Chuyển ngày sang string để làm key tra cứu
            d_str = str(item['date']) 
            
            # Lấy data đúng/sai tương ứng với ngày đó (Nếu không có thì mặc định là 0)
            val_data = validation_trends.get(d_str, {"correct": 0, "incorrect": 0})
            
            final_trends.append({
                "date": d_str,
                "count": item['count'],            # Tổng lượt scan (Data cũ)
                "correct": val_data["correct"],    # AI Đúng (Data mới)
                "incorrect": val_data["incorrect"] # AI Sai (Data mới)
            })

            total_correct += val_data["correct"]
            total_incorrect += val_data["incorrect"]

        error_rates = [
            {"name": "Chính xác", "value": total_correct, "fill": "#22c55e"},
            {"name": "Sai lệch", "value": total_incorrect, "fill": "#ef4444"}
        ]

        if total_correct == 0 and total_incorrect == 0:
            error_rates = []
            
        return {
            "upload_trends": final_trends,
            "error_rates": error_rates,        # <--- Frontend đang cần cái này
            "risk_distribution": []            # <--- Frontend cũng cần cái này (trả rỗng tạm thời)
        }
    
    def get_detailed_analytics(self) -> DetailedAnalyticsResponse:
        # 1. Gọi Repo lấy dữ liệu thô
        raw_data = self.medical_repo.get_analytics_summary()
        
        # 2. Xử lý: Uploads By Role
        # raw_data["upload_stats"] trả về list tuple, ví dụ: [('user', 10), ('clinic', 5)]
        stats_map = {role: count for role, count in raw_data["upload_stats"]}
        user_uploads = stats_map.get(UserRole.USER, 0)
        clinic_uploads = stats_map.get(UserRole.CLINIC, 0)

        # 3. Xử lý: Risk Distribution & Màu sắc
        color_map = {
            "Normal": "#22c55e",      # Xanh
            "Mild": "#eab308",        # Vàng
            "Moderate": "#f97316",    # Cam
            "Severe": "#ef4444",      # Đỏ
            "PDR": "#b91c1c"          # Đỏ đậm
        }
        
        risk_dist = []
        for level, count in raw_data["risk_query"]:
            if not level: continue
            
            # Tìm màu tương đối (Case-insensitive)
            color = "#64748b" # Mặc định xám
            for key, val in color_map.items():
                if key.upper() in level.upper():
                    color = val
                    break
            
            risk_dist.append({"name": level, "value": count, "color": color})
        
        # Sắp xếp giảm dần theo số lượng
        risk_dist.sort(key=lambda x: x['value'], reverse=True)

        # 4. Xử lý: Error Rate
        total_val = raw_data["val_total"]
        total_inc = raw_data["val_incorrect"]
        err_rate = 0.0
        if total_val > 0:
            err_rate = round((total_inc / total_val * 100), 1)

        # 5. Trả về đúng Schema đã định nghĩa
        return DetailedAnalyticsResponse(
            uploads_by_role=UploadsByRole(
                user=user_uploads,
                clinic=clinic_uploads,
                total=user_uploads + clinic_uploads
            ),
            risk_distribution=risk_dist,
            ai_performance=AIPerformanceStats(
                error_rate=err_rate,
                total_validated=total_val,
                total_incorrect=total_inc
            )
        )