from pydantic import BaseModel
from models.enums import UserRole

class UpdateUserStatusRequest(BaseModel):
    status: str  # Ví dụ: "ACTIVE", "BANNED", "PENDING"

class UpdateUserRoleRequest(BaseModel):
    role: str