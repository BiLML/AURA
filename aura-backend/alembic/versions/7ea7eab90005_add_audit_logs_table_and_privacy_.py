"""Add audit_logs table and privacy settings

Revision ID: 7ea7eab90005
Revises: 054404cc773e
Create Date: 2026-01-18 13:51:22.503988

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '7ea7eab90005'
down_revision: Union[str, Sequence[str], None] = '054404cc773e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- 1. TẠO BẢNG AUDIT_LOGS ---
    op.create_table(
        'audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('action', sa.String(length=100), nullable=False),
        sa.Column('resource_type', sa.String(length=50), nullable=True),
        sa.Column('resource_id', sa.String(length=100), nullable=True),
        sa.Column('old_values', sa.JSON(), nullable=True),
        sa.Column('new_values', sa.JSON(), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')
    )

    # --- 2. THÊM CỘT VÀO SYSTEM_CONFIGS ---
    # Thêm cột ẩn danh dữ liệu
    op.add_column('system_configs', sa.Column('anonymize_patient_data', sa.Boolean(), nullable=True, server_default='true'))
    
    # Thêm cột yêu cầu sự đồng ý huấn luyện
    op.add_column('system_configs', sa.Column('require_training_consent', sa.Boolean(), nullable=True, server_default='false'))
    
    # Thêm cột thời gian lưu trữ log
    op.add_column('system_configs', sa.Column('data_retention_days', sa.Integer(), nullable=True, server_default='90'))


def downgrade() -> None:
    # --- ROLLBACK: XÓA CỘT VÀ BẢNG ---
    op.drop_column('system_configs', 'data_retention_days')
    op.drop_column('system_configs', 'require_training_consent')
    op.drop_column('system_configs', 'anonymize_patient_data')
    op.drop_table('audit_logs')