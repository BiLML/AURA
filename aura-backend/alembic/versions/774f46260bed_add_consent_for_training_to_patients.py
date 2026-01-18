"""Add consent_for_training to patients

Revision ID: 774f46260bed
Revises: 7ea7eab90005
Create Date: 2026-01-18 15:34:18.530737

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '774f46260bed'
down_revision: Union[str, Sequence[str], None] = '7ea7eab90005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Thêm cột consent_for_training vào bảng patients
    # server_default='false': Mặc định là KHÔNG đồng ý (để an toàn tối đa)
    op.add_column('patients', sa.Column('consent_for_training', sa.Boolean(), server_default='false', nullable=True))


def downgrade() -> None:
    op.drop_column('patients', 'consent_for_training')