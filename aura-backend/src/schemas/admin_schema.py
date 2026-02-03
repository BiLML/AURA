from pydantic import BaseModel
from typing import List
from models.enums import UserRole

class UpdateUserStatusRequest(BaseModel):
    status: str  # Ví dụ: "ACTIVE", "BANNED", "PENDING"

class UpdateUserRoleRequest(BaseModel):
    role: str

# 1. Thống kê Upload theo vai trò
class UploadsByRole(BaseModel):
    user: int
    clinic: int
    total: int

# 2. Item cho biểu đồ phân bố rủi ro
class RiskDistributionItem(BaseModel):
    name: str
    value: int
    color: str

# 3. Thống kê hiệu suất AI
class AIPerformanceStats(BaseModel):
    error_rate: float
    total_validated: int
    total_incorrect: int

# 4. Schema TỔNG HỢP trả về cho API
class DetailedAnalyticsResponse(BaseModel):
    uploads_by_role: UploadsByRole
    risk_distribution: List[RiskDistributionItem]
    ai_performance: AIPerformanceStats

    class Config:
        from_attributes = True