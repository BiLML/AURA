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
        return self.config_repo.get_config()
    
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