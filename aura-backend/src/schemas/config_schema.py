# FILE: schemas/config_schema.py
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class SystemConfigBase(BaseModel):
    confidence_threshold: float
    model_version: str
    alert_risk_level: str
    enable_email_alerts: bool
    auto_retrain: bool
    retrain_frequency_days: int
    min_new_data_samples: int

class SystemConfigUpdate(SystemConfigBase):
    pass

class SystemConfigResponse(SystemConfigBase):
    updated_at: datetime
    
    class Config:
        from_attributes = True

class PublicConfigResponse(BaseModel):
    model_version: str
    maintenance_mode: bool = False # Ví dụ thêm: chế độ bảo trì
    
    class Config:
        from_attributes = True