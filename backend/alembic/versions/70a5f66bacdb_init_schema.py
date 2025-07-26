"""init schema

Revision ID: 70a5f66bacdb
Revises: 
Create Date: 2025-07-26 12:41:26.632116

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '70a5f66bacdb'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('email', sa.String(length=255), nullable=False, unique=True),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )

    # 2) devices table
    op.create_table(
        'devices',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )

    # 3) telemetry table with composite PK (id + timestamp)
    op.create_table(
        'telemetry',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('device_id', sa.String(length=36), sa.ForeignKey('devices.id', ondelete='CASCADE'), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('energy_watts', sa.Float(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id', 'timestamp')
    )

    # 4) supporting indexes
    op.create_index('ix_telemetry_device_id', 'telemetry', ['device_id'], unique=False)
    op.create_index('ix_telemetry_timestamp', 'telemetry', ['timestamp'], unique=False)

    # 5) turn telemetry into a hypertable
    op.execute(
        "SELECT create_hypertable('telemetry', 'timestamp', if_not_exists => TRUE);"
    )


def downgrade() -> None:
    # remove hypertable (drops chunks, keeps table schema)
    op.execute("SELECT drop_hypertable('telemetry', if_exists => TRUE);")

    # drop telemetry
    op.drop_index('ix_telemetry_timestamp', table_name='telemetry')
    op.drop_index('ix_telemetry_device_id', table_name='telemetry')
    op.drop_table('telemetry')

    # drop devices & users
    op.drop_table('devices')
    op.drop_table('users')