# FILE: services/admin_service.py
from sqlalchemy.orm import Session
from fastapi import HTTPException
from models.users import User
from models.enums import UserRole, UserStatus 
from models.system_config import SystemConfig
from models.audit_log import AuditLog
from uuid import UUID

from schemas.notification_schema import TemplateUpdate

from domain.models.iuser_repository import IUserRepository
from domain.models.imedical_repository import IMedicalRepository
from domain.models.ibilling_repository import IBillingRepository
from domain.models.iconfig_repository import IConfigRepository 
from domain.models.iaudit_repository import IAuditRepository
from domain.models.inotification_repository import INotificationRepository

class AdminService:
    def __init__(self, 
                 user_repo: IUserRepository, 
                 medical_repo: IMedicalRepository, 
                 billing_repo: IBillingRepository, 
                 config_repo: IConfigRepository, 
                 audit_repo: IAuditRepository, 
                 noti_repo: INotificationRepository):
        self.user_repo = user_repo
        self.medical_repo = medical_repo
        self.billing_repo = billing_repo
        self.config_repo = config_repo
        self.audit_repo = audit_repo
        self.noti_repo = noti_repo

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
    
    def get_system_analytics(self):
        # 1. Lấy phân bố rủi ro
        risk_data = self.medical_repo.get_risk_distribution_stats()
        # Format lại: [{'name': 'SEVERE', 'value': 10}, ...]
        risk_chart = [
            {"name": risk if risk else "Unknown", "value": count} 
            for risk, count in risk_data
        ]

        # 2. Lấy xu hướng 7 ngày
        trend_data = self.medical_repo.get_upload_trends_last_7_days()
        # Đảo ngược lại để ngày cũ bên trái, ngày mới bên phải
        trend_data.reverse() 
        trend_chart = [
            {"date": d.strftime("%d/%m"), "count": c} 
            for d, c in trend_data
        ]

        # 3. Lấy tỷ lệ lỗi (Dựa trên hàm cũ get_ai_validation_stats)
        val_stats = self.medical_repo.get_ai_validation_stats()
        total_val = val_stats["total_validated"]
        correct = val_stats["correct_ai"]
        incorrect = total_val - correct
        
        error_chart = [
            {"name": "Chính xác", "value": correct, "fill": "#28a745"}, # Màu xanh
            {"name": "Sai lệch", "value": incorrect, "fill": "#dc3545"}  # Màu đỏ
        ]

        return {
            "risk_distribution": risk_chart,
            "upload_trends": trend_chart,
            "error_rates": error_chart,
            "total_samples": total_val
        }
    
    def get_audit_logs(self):
        logs = self.audit_repo.get_recent_logs()
        # Format dữ liệu trả về cho đẹp
        return [
            {
                "id": str(log.id),
                "actor": log.user.username if log.user else "Unknown",
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