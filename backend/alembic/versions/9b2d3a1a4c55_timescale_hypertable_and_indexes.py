"""Timescale hypertable, indexes, and compression for telemetry.

Revision ID: 9b2d3a1a4c55
Revises: 70a5f66bacdb
Create Date: 2025-07-28
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "9b2d3a1a4c55"
down_revision = "70a5f66bacdb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) Ensure extension
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;")

    # 2) Promote telemetry to hypertable on timestamp
    op.execute(
        """
        SELECT create_hypertable(
            'telemetry',
            'timestamp',
            if_not_exists => TRUE,
            migrate_data  => TRUE
        );
        """
    )

    # 3) Indexes for common patterns
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_telemetry_device_ts
        ON telemetry (device_id, "timestamp" DESC);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_telemetry_ts
        ON telemetry ("timestamp" DESC);
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_devices_user
        ON devices (user_id, id);
        """
    )

    # 4) Enable compression (transparent to reads)
    op.execute(
        """
        ALTER TABLE telemetry
        SET (
            timescaledb.compress = TRUE,
            timescaledb.compress_segmentby = 'device_id',
            timescaledb.compress_orderby = '"timestamp"'
        );
        """
    )

    # 5) Add compression policy if not present
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM timescaledb_information.jobs j
            JOIN timescaledb_information.hypertables h
              ON j.hypertable_id = h.hypertable_id
            WHERE j.proc_name = 'policy_compression'
              AND h.hypertable_name = 'telemetry'
          ) THEN
            PERFORM add_compression_policy('telemetry', INTERVAL '7 days');
          END IF;
        EXCEPTION WHEN others THEN
          -- ignore if permission or already exists
          NULL;
        END$$;
        """
    )

    # 6) Add reorder policy if not present
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM timescaledb_information.jobs j
            JOIN timescaledb_information.hypertables h
              ON j.hypertable_id = h.hypertable_id
            WHERE j.proc_name = 'policy_reorder'
              AND h.hypertable_name = 'telemetry'
          ) THEN
            PERFORM add_reorder_policy('telemetry', 'ix_telemetry_device_ts');
          END IF;
        EXCEPTION WHEN others THEN
          -- ignore if permission or already exists
          NULL;
        END$$;
        """
    )


def downgrade() -> None:
    # Best-effort cleanup, avoid data loss
    op.execute(
        """
        DO $$
        BEGIN
          PERFORM remove_reorder_policy('telemetry');
        EXCEPTION WHEN others THEN
          NULL;
        END$$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          PERFORM remove_compression_policy('telemetry');
        EXCEPTION WHEN others THEN
          NULL;
        END$$;
        """
    )
    op.execute('DROP INDEX IF EXISTS ix_telemetry_device_ts;')
    op.execute('DROP INDEX IF EXISTS ix_telemetry_ts;')
    op.execute('DROP INDEX IF EXISTS ix_devices_user;')
    # Do not drop hypertable/extension in downgrade.