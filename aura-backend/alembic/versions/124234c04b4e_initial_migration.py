"""initial_migration

Revision ID: 1bb132e179ea
Revises: 
Create Date: 2026-01-11 17:29:40.068033

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '1bb132e179ea'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Tạo bảng service_packages (Độc lập)
    op.create_table('service_packages',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('price', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('analysis_limit', sa.Integer(), nullable=True),
    sa.Column('duration_days', sa.Integer(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )

    # 2. Tạo bảng users TRƯỚC (Lưu ý: Đã BỎ khóa ngoại clinic_id ở đây để tránh lỗi)
    op.create_table('users',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('username', sa.String(length=50), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('role', sa.Enum('admin', 'user', 'doctor', 'clinic', name='userrole'), nullable=True),
    sa.Column('status', sa.Enum('active', 'suspended', 'pending', name='userstatus'), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('clinic_id', sa.UUID(), nullable=True), # Vẫn tạo cột, nhưng chưa gắn khóa ngoại
    sa.Column('assigned_doctor_id', sa.UUID(), nullable=True),
    sa.ForeignKeyConstraint(['assigned_doctor_id'], ['users.id'], ), # Tự trỏ chính mình thì OK
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('email'),
    sa.UniqueConstraint('username')
    )

    # 3. Tạo bảng clinics SAU (Lúc này users đã có, nên admin_id OK)
    op.create_table('clinics',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('admin_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('address', sa.Text(), nullable=True),
    sa.Column('phone_number', sa.String(length=20), nullable=False),
    sa.Column('image_url', sa.String(length=500), nullable=True),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('status', sa.Enum('APPROVED', 'REJECTED', 'PENDING', name='clinicstatus'), nullable=True),
    sa.ForeignKeyConstraint(['admin_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )

    # 4. Các bảng khác (Bình thường)
    op.create_table('messages',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('sender_id', sa.UUID(), nullable=False),
    sa.Column('receiver_id', sa.UUID(), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('is_read', sa.Boolean(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['receiver_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['sender_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('patients',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('clinic_id', sa.UUID(), nullable=True),
    sa.Column('dob', sa.Date(), nullable=True),
    sa.Column('gender', sa.Enum('MALE', 'FEMALE', 'OTHER', name='gender'), nullable=True),
    sa.ForeignKeyConstraint(['clinic_id'], ['clinics.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('profiles',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('full_name', sa.String(length=255), nullable=True),
    sa.Column('phone', sa.String(length=20), nullable=True),
    sa.Column('avatar_url', sa.Text(), nullable=True),
    sa.Column('medical_info', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id')
    )
    op.create_table('subscriptions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('package_id', sa.UUID(), nullable=False),
    sa.Column('credits_left', sa.Integer(), nullable=True),
    sa.Column('expired_at', sa.Date(), nullable=True),
    sa.ForeignKeyConstraint(['package_id'], ['service_packages.id'], ),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('retinal_images',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('patient_id', sa.UUID(), nullable=False),
    sa.Column('uploader_id', sa.UUID(), nullable=False),
    sa.Column('image_url', sa.Text(), nullable=False),
    sa.Column('image_type', sa.Enum('FUNDUS', 'OCT', name='imagetype'), nullable=True),
    sa.Column('eye_side', sa.Enum('LEFT', 'RIGHT', name='eyeside'), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ),
    sa.ForeignKeyConstraint(['uploader_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('ai_analysis_results',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('image_id', sa.UUID(), nullable=False),
    sa.Column('risk_level', sa.String(length=255), nullable=True),
    sa.Column('vessel_details', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('annotated_image_url', sa.Text(), nullable=True),
    sa.Column('ai_detailed_report', sa.Text(), nullable=True),
    sa.Column('ai_version', sa.String(length=50), nullable=True),
    sa.Column('processed_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['image_id'], ['retinal_images.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('image_id')
    )
    op.create_table('doctor_validations',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('analysis_id', sa.UUID(), nullable=False),
    sa.Column('doctor_id', sa.UUID(), nullable=False),
    sa.Column('is_correct', sa.Boolean(), nullable=True),
    sa.Column('doctor_notes', sa.Text(), nullable=True),
    sa.Column('feedback_for_ai', sa.Text(), nullable=True),
    sa.Column('doctor_confirm', sa.String(length=255), nullable=True),
    sa.ForeignKeyConstraint(['analysis_id'], ['ai_analysis_results.id'], ),
    sa.ForeignKeyConstraint(['doctor_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('analysis_id')
    )

    # 5. QUAN TRỌNG NHẤT: Bây giờ mới thêm khóa ngoại users -> clinics
    op.create_foreign_key('fk_users_clinic', 'users', 'clinics', ['clinic_id'], ['id'])


def downgrade() -> None:
    """Downgrade schema."""
    # Khi xóa thì phải xóa khóa ngoại trước
    op.drop_constraint('fk_users_clinic', 'users', type_='foreignkey')

    op.drop_table('doctor_validations')
    op.drop_table('ai_analysis_results')
    op.drop_table('retinal_images')
    op.drop_table('subscriptions')
    op.drop_table('profiles')
    op.drop_table('patients')
    op.drop_table('messages')
    op.drop_table('clinics')
    op.drop_table('users')
    op.drop_table('service_packages')
    
    # Xóa các Enum type
    sa.Enum(name='clinicstatus').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='userrole').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='userstatus').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='gender').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='imagetype').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='eyeside').drop(op.get_bind(), checkfirst=True)