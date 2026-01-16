# FILE: models/system_config.py
from sqlalchemy import Column, Float, Integer, Boolean, String, DateTime
from sqlalchemy.sql import func
from models.base import Base
import uuid
from sqlalchemy.dialects.postgresql import UUID

class SystemConfig(Base):
    __tablename__ = "system_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # --- 1. THAM SỐ AI (AI PARAMETERS) ---
    confidence_threshold = Column(Float, default=0.85)  # Ngưỡng tin cậy (VD: >85% mới kết luận)
    model_version = Column(String, default="v1.0.0")    # Phiên bản model đang chạy
    
    # --- 2. NGƯỠNG CẢNH BÁO (WARNING THRESHOLDS) ---
    # Mức độ nguy hiểm tối thiểu để gửi email cảnh báo ngay lập tức
    # (VD: "SEVERE" hoặc "PDR")
    alert_risk_level = Column(String, default="SEVERE") 
    enable_email_alerts = Column(Boolean, default=True)

    # --- 3. CHÍNH SÁCH HUẤN LUYỆN LẠI (RETRAINING POLICY) ---
    auto_retrain = Column(Boolean, default=False)       # Tự động training lại hay không
    retrain_frequency_days = Column(Integer, default=30) # Bao lâu training 1 lần (ngày)
    min_new_data_samples = Column(Integer, default=100)  # Cần ít nhất bao nhiêu ảnh mới để training

    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())