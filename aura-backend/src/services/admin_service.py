# FILE: services/admin_service.py
from sqlalchemy.orm import Session
from fastapi import HTTPException
from models.users import User
from models.enums import UserRole, UserStatus 
from models.system_config import SystemConfig # Import model mới
from uuid import UUID

from domain.models.iuser_repository import IUserRepository
from domain.models.imedical_repository import IMedicalRepository
from domain.models.ibilling_repository import IBillingRepository
from domain.models.iconfig_repository import IConfigRepository 

class AdminService:
    def __init__(self, user_repo: IUserRepository, medical_repo: IMedicalRepository, billing_repo: IBillingRepository, config_repo: IConfigRepository):
        self.user_repo = user_repo
        self.medical_repo = medical_repo
        self.billing_repo = billing_repo
        self.config_repo = config_repo

    def get_user_by_id(self, user_id: UUID) -> User:
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="Người dùng không tồn tại")
        return user

    def update_user_status(self, user_id: UUID, new_status: str):
        user = self.get_user_by_id(user_id)
        
        # Cập nhật thẳng vào cột status
        # Lưu ý: new_status phải khớp với các giá trị trong Enum UserStatus của bạn
        user.status = new_status 
        
        self.db.commit()
        self.db.refresh(user)
        return user

    def update_user_role(self, user_id: UUID, new_role: str):
        user = self.get_user_by_id(user_id)
        
        # Cập nhật role
        valid_roles = [e.value for e in UserRole]
        if new_role not in valid_roles:
             raise HTTPException(
                 status_code=400, 
                 detail=f"Vai trò '{new_role}' không hợp lệ. Phải là: {valid_roles}"
             )

        user.role = new_role
        self.db.commit()
        self.db.refresh(user) # Thêm refresh để trả về data mới nhất
        return user
    
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
    
    def update_system_config(self, data):
        return self.config_repo.update_config(data)
    
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