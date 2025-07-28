# backend/app/telemetry/service.py

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any

from sqlalchemy.orm import Session
from sqlalchemy import text

from . import models, schemas

# Cap very large gaps to avoid overstating energy during outages
DEFAULT_MAX_GAP_SECONDS = 15 * 60  # 15 minutes


def create_telemetry(db: Session, telemetry: schemas.TelemetryCreate) -> models.Telemetry:
    """Create a new telemetry reading."""
    db_telemetry = models.Telemetry(
        device_id=telemetry.device_id,
        timestamp=telemetry.timestamp,
        energy_watts=telemetry.energy_watts,
    )
    db.add(db_telemetry)
    db.commit()
    db.refresh(db_telemetry)
    return db_telemetry


def get_telemetry(
    db: Session,
    query: schemas.TelemetryQuery,
    user_id: Optional[int] = None,
) -> List[models.Telemetry]:
    """
    Query telemetry data with filters.

    If user_id is provided, results are scoped to devices owned by that user.
    """
    # Base query
    if user_id is not None:
        q = (
            db.query(models.Telemetry)
            .join(models.Device, models.Device.id == models.Telemetry.device_id)
            .filter(models.Device.user_id == user_id)
        )
    else:
        q = db.query(models.Telemetry)

    # Optional filters
    if query.device_id:
        q = q.filter(models.Telemetry.device_id == query.device_id)
    if query.start_time:
        q = q.filter(models.Telemetry.timestamp >= query.start_time)
    if query.end_time:
        q = q.filter(models.Telemetry.timestamp <= query.end_time)

    return q.order_by(models.Telemetry.timestamp.desc()).limit(query.limit).all()


def create_device(db: Session, device: schemas.DeviceCreate, user_id: int) -> models.Device:
    """Create a new device."""
    db_device = models.Device(
        name=device.name,
        user_id=user_id,
    )
    db.add(db_device)
    db.commit()
    db.refresh(db_device)
    return db_device


def get_user_devices(db: Session, user_id: int) -> List[models.Device]:
    """Get all devices for a user."""
    return db.query(models.Device).filter(models.Device.user_id == user_id).all()


def get_device(db: Session, device_id: str, user_id: int) -> Optional[models.Device]:
    """Get a specific device for a user."""
    return (
        db.query(models.Device)
        .filter(models.Device.id == device_id, models.Device.user_id == user_id)
        .first()
    )


def get_aggregate_telemetry(
    db: Session,
    query: schemas.AggregateQuery,
    user_id: int,
) -> List[schemas.AggregateDataPoint]:
    """
    Get aggregated telemetry data for visualization (energy, not raw watts).

    Integrates instantaneous power (W) over time to compute energy (Wh),
    using TimescaleDB window functions + time_bucket, then aggregates to
    the requested resolution.

    Returns a list of buckets with:
      - timestamp: bucket start (UTC, tz-aware)
      - value: total energy in Wh (schema enforces > 0)
      - device_count: number of active devices in the bucket
    """
    # ---- Determine window from TimeRange enum ----
    now = datetime.now(timezone.utc)
    if query.time_range == schemas.TimeRange.HOUR:
        start_time = now - timedelta(hours=1)
    elif query.time_range == schemas.TimeRange.DAY:
        start_time = now - timedelta(days=1)
    elif query.time_range == schemas.TimeRange.WEEK:
        start_time = now - timedelta(weeks=1)
    elif query.time_range == schemas.TimeRange.MONTH:
        start_time = now - timedelta(days=30)
    else:
        start_time = now - timedelta(days=1)

    end_time = now

    # ---- Build bucket string for time_bucket ----
    res_minutes = int(query.resolution_minutes)  # already validated by schema
    bucket = f"{res_minutes} minutes"

    # ---- Optional device filter ----
    device_filter_sql = ""
    params: Dict[str, Any] = {
        "user_id": user_id,
        "start_time": start_time,
        "end_time": end_time,
        "bucket": bucket,
        "max_gap_seconds": DEFAULT_MAX_GAP_SECONDS,
    }
    if query.device_ids:
        device_filter_sql = " AND t.device_id = ANY(:device_ids) "
        params["device_ids"] = query.device_ids

    # ---- SQL: integrate W -> Wh per device, per bucket ----
    sql = f"""
    WITH filtered AS (
        SELECT
            t.device_id,
            t.timestamp,
            t.energy_watts AS power_w,
            LAG(t.timestamp) OVER (PARTITION BY t.device_id ORDER BY t.timestamp) AS prev_ts,
            LAG(t.energy_watts) OVER (PARTITION BY t.device_id ORDER BY t.timestamp) AS prev_w
        FROM telemetry t
        JOIN devices d ON d.id = t.device_id
        WHERE d.user_id = :user_id
          AND t.timestamp >= :start_time
          AND t.timestamp <= :end_time
          {device_filter_sql}
    ),
    intervals AS (
        SELECT
            device_id,
            timestamp,
            COALESCE(prev_w, power_w) AS power_w_for_interval,
            EXTRACT(EPOCH FROM (timestamp - prev_ts)) AS delta_s
        FROM filtered
    ),
    intervals_capped AS (
        SELECT
            device_id,
            timestamp,
            power_w_for_interval,
            GREATEST(0, LEAST(:max_gap_seconds, COALESCE(delta_s, 0))) AS delta_s
        FROM intervals
    ),
    per_bucket AS (
        SELECT
            time_bucket(:bucket, timestamp) AS bucket,
            SUM(power_w_for_interval * delta_s / 3600.0) AS energy_wh,
            COUNT(DISTINCT device_id) AS device_count
        FROM intervals_capped
        GROUP BY bucket
    )
    SELECT
        bucket,
        energy_wh,
        device_count
    FROM per_bucket
    ORDER BY bucket;
    """

    rows = db.execute(text(sql), params).fetchall()

    # ---- Map to response objects (skip zero buckets to satisfy value > 0) ----
    out: List[schemas.AggregateDataPoint] = []
    for r in rows:
        e_wh = float(r.energy_wh or 0.0)
        if e_wh <= 0:
            continue
        out.append(
            schemas.AggregateDataPoint(
                timestamp=r.bucket,  # timestamptz from DB
                value=e_wh,
                device_count=int(r.device_count or 0),
            )
        )

    return out


def get_device_energy_summary(
    db: Session,
    *,
    start_time: datetime,
    end_time: datetime,
    user_id: int,
    device_ids: Optional[List[str]] = None,
) -> List[schemas.DeviceEnergySummary]:
    """
    Compute integrated energy per device (kWh) over [start_time, end_time], scoped to user.

    Integration model matches aggregate:
      - Piecewise-constant using the previous power reading
      - Gaps are capped at DEFAULT_MAX_GAP_SECONDS to avoid runaway energy

    Returns:
      [{ device_id: str, energy_kwh: float }]
    """
    device_filter_sql = ""
    params: Dict[str, Any] = {
        "user_id": user_id,
        "start_time": start_time,
        "end_time": end_time,
        "max_gap_seconds": DEFAULT_MAX_GAP_SECONDS,
    }
    if device_ids:
        device_filter_sql = " AND t.device_id = ANY(:device_ids) "
        params["device_ids"] = device_ids

    sql = f"""
    WITH filtered AS (
        SELECT
            t.device_id,
            t.timestamp,
            t.energy_watts AS power_w,
            LAG(t.timestamp) OVER (PARTITION BY t.device_id ORDER BY t.timestamp) AS prev_ts,
            LAG(t.energy_watts) OVER (PARTITION BY t.device_id ORDER BY t.timestamp) AS prev_w
        FROM telemetry t
        JOIN devices d ON d.id = t.device_id
        WHERE d.user_id = :user_id
          AND t.timestamp >= :start_time
          AND t.timestamp <= :end_time
          {device_filter_sql}
    ),
    intervals AS (
        SELECT
            device_id,
            COALESCE(prev_w, power_w) AS power_w_for_interval,
            EXTRACT(EPOCH FROM (timestamp - prev_ts)) AS delta_s
        FROM filtered
    ),
    intervals_capped AS (
        SELECT
            device_id,
            power_w_for_interval,
            GREATEST(0, LEAST(:max_gap_seconds, COALESCE(delta_s, 0))) AS delta_s
        FROM intervals
    ),
    per_device AS (
        SELECT
            device_id,
            -- W * s / 3600 = Wh; divide by 1000 to get kWh
            SUM(power_w_for_interval * delta_s / 3600.0) / 1000.0 AS energy_kwh
        FROM intervals_capped
        GROUP BY device_id
    )
    SELECT device_id, energy_kwh
    FROM per_device
    WHERE energy_kwh > 0
    ORDER BY energy_kwh DESC;
    """

    rows = db.execute(text(sql), params).fetchall()

    out: List[schemas.DeviceEnergySummary] = []
    for r in rows:
        kwh = float(r.energy_kwh or 0.0)
        if kwh <= 0:
            continue
        out.append(
            schemas.DeviceEnergySummary(
                device_id=r.device_id,
                energy_kwh=kwh,
            )
        )
    return out