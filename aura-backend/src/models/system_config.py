# FILE: models/system_config.py
from sqlalchemy import Column, Float, Integer, Boolean, String, DateTime
from sqlalchemy.sql import func
from models.base import Base
import uuid
from sqlalchemy.dialects.postgresql import UUID

class SystemConfig(Base):
    __tablename__ = "system_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # --- 1. THAM SỐ AI (Đã có) ---
    confidence_threshold = Column(Float, default=0.85)
    model_version = Column(String, default="v1.0.0")
    
    # --- 2. NGƯỠNG CẢNH BÁO (Đã có) ---
    alert_risk_level = Column(String, default="SEVERE") 
    enable_email_alerts = Column(Boolean, default=True)

    # --- 3. CHÍNH SÁCH HUẤN LUYỆN LẠI (Đã có) ---
    auto_retrain = Column(Boolean, default=False)
    retrain_frequency_days = Column(Integer, default=30)
    min_new_data_samples = Column(Integer, default=100)

    # --- 4. CÀI ĐẶT QUYỀN RIÊNG TƯ & TUÂN THỦ (BỔ SUNG CHO FR-37) ---
    # Tự động ẩn danh tên bệnh nhân khi gửi dữ liệu sang AI Core
    anonymize_patient_data = Column(Boolean, default=True) 
    
    # Yêu cầu sự đồng ý của bệnh nhân trước khi dùng ảnh để train AI
    require_training_consent = Column(Boolean, default=False)
    
    # Thời gian lưu trữ nhật ký hệ thống (ngày) trước khi tự động xóa
    data_retention_days = Column(Integer, default=90)

    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())