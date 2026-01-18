import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context
from dotenv import load_dotenv

# ----------------------------------------------------------------------
# [PHẦN 1: CẤU HÌNH ĐƯỜNG DẪN & IMPORT]
# ----------------------------------------------------------------------

# 1. Lấy vị trí của file env.py (.../aura-backend/alembic)
current_path = os.path.dirname(os.path.abspath(__file__))

# 2. Lùi ra ngoài 1 cấp để lấy thư mục gốc dự án (.../aura-backend)
project_root = os.path.dirname(current_path)

# 3. Trỏ thẳng vào thư mục 'src' (.../aura-backend/src)
src_path = os.path.join(project_root, 'src')

# 4. Thêm đường dẫn src vào hệ thống
sys.path.append(src_path)

# [SỬA LỖI 1]: Dùng đúng tên biến project_root
load_dotenv(os.path.join(project_root, ".env"))

# Import Base và DATABASE_URL
from core.database import DATABASE_URL 
from models.base import Base

# --- IMPORT TẤT CẢ CÁC MODELS CỦA BẠN TẠI ĐÂY ---
from models.users import User, Profile
from models.clinic import Clinic
from models.medical import (
    Patient, 
    RetinalImage, 
    AIAnalysisResult, 
    DoctorValidation
)
from models.billing import ServicePackage, Subscription
from models.chat import Message
from models.system_config import SystemConfig
from models.audit_log import AuditLog  

# ----------------------------------------------------------------------

# Lấy config từ alembic.ini
config = context.config

# Ghi đè URL kết nối bằng biến môi trường
config.set_main_option("sqlalchemy.url", DATABASE_URL)

# Thiết lập log
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Gán metadata của Base vào target để Alembic so sánh
target_metadata = Base.metadata

def run_migrations_offline() -> None:
    """Chế độ Offline."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Chế độ Online."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()