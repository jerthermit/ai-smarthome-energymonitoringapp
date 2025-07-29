# backend/app/telemetry/service.py

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any, Literal

from zoneinfo import ZoneInfo
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


# ----------------------------- Centralized windowing -----------------------------

LogicalRange = Literal["day", "3days", "week"]  # canonical values used by frontend

def _compute_local_window(range_key: LogicalRange, tz: str) -> Dict[str, Any]:
    """
    Compute [start_local, end_local) and UTC equivalents for canonical ranges.

    - 'day'   => [today 00:00, now)                (hourly granularity)
    - '3days' => [today 00:00 - 3d, today 00:00)   (daily granularity; exclude today)
    - 'week'  => [today 00:00 - 7d, today 00:00)   (daily granularity; exclude today)

    Returns:
      {
        "start_utc": datetime,
        "end_utc": datetime,
        "granularity": "hour" | "day",
        "bucket": "1 hour" | "1 day",
        "tz": tz
      }
    """
    zone = ZoneInfo(tz)
    now_local = datetime.now(zone)
    today_start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)

    if range_key == "day":
        start_local = today_start_local
        end_local = now_local
        granularity = "hour"
        bucket = "1 hour"
    elif range_key == "3days":
        start_local = today_start_local - timedelta(days=3)
        end_local = today_start_local  # exclude today
        granularity = "day"
        bucket = "1 day"
    elif range_key == "week":
        start_local = today_start_local - timedelta(days=7)
        end_local = today_start_local  # exclude today
        granularity = "day"
        bucket = "1 day"
    else:
        # fallback: day
        start_local = today_start_local
        end_local = now_local
        granularity = "hour"
        bucket = "1 hour"

    # Convert to UTC for filtering
    start_utc = start_local.astimezone(timezone.utc)
    end_utc = end_local.astimezone(timezone.utc)

    return {
        "start_utc": start_utc,
        "end_utc": end_utc,
        "granularity": granularity,
        "bucket": bucket,
        "tz": tz,
    }


# ----------------------------- Aggregations (legacy) -----------------------------

def get_aggregate_telemetry(
    db: Session,
    query: schemas.AggregateQuery,
    user_id: int,
) -> List[schemas.AggregateDataPoint]:
    """
    Get aggregated telemetry data for visualization (energy, not raw watts).

    NOTE: This is the existing implementation that uses a moving window based on
    query.time_range and groups in UTC. It is preserved for backward compatibility.
    Prefer the *windowed* versions below for canonical range semantics.
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


# ------------------------ Aggregations (canonical windowed) ------------------------

def get_aggregate_telemetry_windowed(
    db: Session,
    *,
    user_id: int,
    range_key: LogicalRange,
    tz: str = "Asia/Singapore",
    device_ids: Optional[List[str]] = None,
) -> List[schemas.AggregateDataPoint]:
    """
    Canonical aggregation aligned to local calendar days in `tz`.

    - 'day'   => hourly buckets from local midnight to now (today only)
    - '3days' => daily buckets for last 3 full days ending yesterday (exclude today)
    - 'week'  => daily buckets for last 7 full days ending yesterday (exclude today)

    Bucketing is performed on local time in SQL (via timezone(:tz, timestamp))
    and then converted back to UTC for output. Missing buckets are omitted (0),
    which the frontend can render as 0s if needed.
    """
    win = _compute_local_window(range_key, tz)
    start_utc: datetime = win["start_utc"]
    end_utc: datetime = win["end_utc"]
    granularity: str = win["granularity"]  # 'hour'|'day'

    # ---- Optional device filter ----
    device_filter_sql = ""
    params: Dict[str, Any] = {
        "user_id": user_id,
        "start_time": start_utc,
        "end_time": end_utc,
        "max_gap_seconds": DEFAULT_MAX_GAP_SECONDS,
        "tz": tz,
    }
    if device_ids:
        device_filter_sql = " AND t.device_id = ANY(:device_ids) "
        params["device_ids"] = device_ids

    # Choose bucket expression in LOCAL time
    if granularity == "hour":
        bucket_expr = "date_trunc('hour', timezone(:tz, timestamp))"
    else:
        bucket_expr = "date_trunc('day', timezone(:tz, timestamp))"

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
          AND t.timestamp <  :end_time
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
            {bucket_expr} AS bucket_local,           -- TIMESTAMP (local time)
            SUM(power_w_for_interval * delta_s / 3600.0) AS energy_wh,
            COUNT(DISTINCT device_id) AS device_count
        FROM intervals_capped
        GROUP BY bucket_local
    )
    SELECT
        (bucket_local AT TIME ZONE :tz) AS bucket_utc,  -- convert local back to timestamptz (UTC)
        energy_wh,
        device_count
    FROM per_bucket
    ORDER BY bucket_utc;
    """

    rows = db.execute(text(sql), params).fetchall()

    out: List[schemas.AggregateDataPoint] = []
    for r in rows:
        e_wh = float(r.energy_wh or 0.0)
        if e_wh < 0:
            continue
        out.append(
            schemas.AggregateDataPoint(
                timestamp=r.bucket_utc,  # timestamptz (UTC)
                value=e_wh,
                device_count=int(r.device_count or 0),
            )
        )
    return out


# ------------------------ Energy summary (canonical windowed) ------------------------

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
          AND t.timestamp <  :end_time
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


def get_device_energy_summary_windowed(
    db: Session,
    *,
    user_id: int,
    range_key: LogicalRange,
    tz: str = "Asia/Singapore",
    device_ids: Optional[List[str]] = None,
) -> List[schemas.DeviceEnergySummary]:
    """
    Canonical per-device totals using the same local-window semantics as charts.
    """
    win = _compute_local_window(range_key, tz)
    return get_device_energy_summary(
        db,
        start_time=win["start_utc"],
        end_time=win["end_utc"],
        user_id=user_id,
        device_ids=device_ids,
    )