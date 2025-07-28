# backend/app/ai/data/energy_repository.py

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional
from enum import Enum

from sqlalchemy.orm import Session
from sqlalchemy import text

from app.telemetry.models import Device, Telemetry

# ---------------- Configuration ----------------
# If Telemetry.energy_watts is instantaneous power (W), leave True.
# If your samples are already energy per interval (Wh), set False and simplify.
USE_PREVIOUS_POWER = True
DEFAULT_MAX_GAP_SECONDS = 15 * 60  # 15 minutes cap for Δt


class TimeGroup(str, Enum):
    HOUR = "hour"
    DAY = "day"
    WEEK = "week"
    MONTH = "month"


class MetricType(str, Enum):
    ENERGY_USAGE = "energy_usage"
    POWER_CONSUMPTION = "power_consumption"
    COST = "cost"
    COMPARISON = "comparison"


class TimeRange:
    """Helper class for handling time ranges in queries."""

    def __init__(self, start: Optional[datetime] = None, end: Optional[datetime] = None):
        now = datetime.now(timezone.utc)
        self.start = start or (now - timedelta(days=7))
        self.end = end or now

    def to_dict(self) -> Dict[str, datetime]:
        return {"start": self.start, "end": self.end}

    @classmethod
    def from_string(cls, time_range_str: str) -> "TimeRange":
        now = datetime.now(timezone.utc)
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        if time_range_str == "today":
            return cls(start=today, end=now)
        elif time_range_str == "yesterday":
            yesterday_start = today - timedelta(days=1)
            yesterday_end = today - timedelta(seconds=1)
            return cls(start=yesterday_start, end=yesterday_end)
        elif time_range_str == "last_week":
            return cls(start=now - timedelta(days=7), end=now)
        elif time_range_str == "last_month":
            return cls(start=now - timedelta(days=30), end=now)
        else:
            return cls(start=now - timedelta(days=7), end=now)


class EnergyRepository:
    """
    Repository for energy data access (SQL-RAG).
    Computes energy by integrating W over time with window functions and Timescale time_bucket.
    """

    def __init__(self, db: Session):
        self.db = db

    # -------------------- Public API --------------------

    async def get_energy_usage(
        self,
        user_id: int,
        device_name: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        time_group: TimeGroup = TimeGroup.DAY,
        max_gap_seconds: int = DEFAULT_MAX_GAP_SECONDS,
    ) -> Dict[str, Any]:
        """
        Return energy usage aggregated into time buckets, integrating W→Wh.
        Output shape is backward-compatible with previous implementation:
        - summary.total_energy_wh
        - data[] with per-bucket rows: device_id, device_name, time_period (ISO), total_energy_wh, avg_power_w, data_points
        """
        tr = TimeRange(start_time, end_time)
        bucket = self._bucket_from_group(time_group)

        # Build SQL for integration:
        # 1) Filter rows to user + time window (+ optional device ILIKE)
        # 2) Compute prev_ts, prev_w (LAG per device)
        # 3) Δt = epoch(timestamp - prev_ts), capped to max_gap_seconds
        # 4) energy_wh = (prev_w or current_w) * Δt / 3600
        # 5) Bucket with time_bucket(:bucket, timestamp) and sum energy_wh
        # Note: Using prev_w to model the interval [prev_ts, ts).

        sql = """
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
              {device_filter}
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
                device_id,
                time_bucket(:bucket, timestamp) AS bucket,
                SUM(power_w_for_interval * delta_s / 3600.0) AS energy_wh,
                AVG(power_w_for_interval) AS avg_power_w,
                COUNT(*) AS points
            FROM intervals_capped
            GROUP BY device_id, bucket
        )
        SELECT
            pb.bucket AS bucket,
            pb.device_id AS device_id,
            d.name AS device_name,
            pb.energy_wh AS total_energy_wh,
            pb.avg_power_w AS avg_power_w,
            pb.points AS data_points
        FROM per_bucket pb
        JOIN devices d ON d.id = pb.device_id
        ORDER BY pb.bucket, d.name
        """

        device_filter = ""
        params: Dict[str, Any] = {
            "user_id": user_id,
            "start_time": tr.start,
            "end_time": tr.end,
            "bucket": bucket,
            "max_gap_seconds": int(max_gap_seconds),
        }

        if device_name and device_name.lower() != "all":
            device_filter = " AND d.name ILIKE :device_pattern "
            params["device_pattern"] = f"%{device_name}%"

        sql = sql.format(device_filter=device_filter)

        rows = self.db.execute(text(sql), params).fetchall()

        # Assemble response
        data: List[Dict[str, Any]] = []
        total_energy_wh = 0.0
        device_ids = set()

        for r in rows:
            bucket_ts = r.bucket  # datetime from DB
            device_ids.add(r.device_id)
            e_wh = float(r.total_energy_wh or 0.0)
            total_energy_wh += e_wh

            data.append({
                "device_id": r.device_id,
                "device_name": r.device_name,
                "time_period": (bucket_ts.isoformat() if hasattr(bucket_ts, "isoformat") else str(bucket_ts)),
                "total_energy_wh": e_wh,
                "avg_power_w": float(r.avg_power_w or 0.0),
                "data_points": int(r.data_points or 0),
            })

        summary = {
            "total_energy_wh": total_energy_wh,
            "avg_power_w": self._avg_power_from_rows(rows),
            "device_count": len(device_ids),
            "time_period": {
                "start": tr.start.isoformat(),
                "end": tr.end.isoformat(),
                "group_by": time_group.value,
            },
        }

        return {
            "summary": summary,
            "data": data,
            "metadata": {
                "query": {
                    "device_name": device_name,
                    "time_range": tr.to_dict(),
                    "time_group": time_group.value,
                    "integrated": True,
                    "max_gap_seconds": max_gap_seconds,
                },
                "generated_at": datetime.now(timezone.utc).isoformat(),
            },
        }

    async def get_highest_consuming_device(
        self,
        user_id: int,
        time_range_str: str = "today",
        max_gap_seconds: int = DEFAULT_MAX_GAP_SECONDS,
    ) -> Optional[Dict[str, Any]]:
        """Return highest consuming device using integrated energy."""
        return await self._rank_device(user_id, time_range_str, highest=True, max_gap_seconds=max_gap_seconds)

    async def get_lowest_consuming_device(
        self,
        user_id: int,
        time_range_str: str = "today",
        max_gap_seconds: int = DEFAULT_MAX_GAP_SECONDS,
    ) -> Optional[Dict[str, Any]]:
        """Return lowest consuming device using integrated energy."""
        return await self._rank_device(user_id, time_range_str, highest=False, max_gap_seconds=max_gap_seconds)

    # -------------------- Internals --------------------

    def _bucket_from_group(self, tg: TimeGroup) -> str:
        return {
            TimeGroup.HOUR: "1 hour",
            TimeGroup.DAY: "1 day",
            TimeGroup.WEEK: "1 week",
            TimeGroup.MONTH: "1 month",
        }.get(tg, "1 day")

    def _avg_power_from_rows(self, rows) -> float:
        # Weighted average is tricky without uniform cadence; return simple avg of bucket avgs
        vals = [float(r.avg_power_w or 0.0) for r in rows if r.avg_power_w is not None]
        return (sum(vals) / len(vals)) if vals else 0.0

    async def _rank_device(
        self,
        user_id: int,
        time_range_str: str,
        highest: bool,
        max_gap_seconds: int,
    ) -> Optional[Dict[str, Any]]:
        tr = TimeRange.from_string(time_range_str)

        sql = """
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
                GREATEST(0, LEAST(:max_gap_seconds, COALESCE(delta_s, 0))) AS delta_s,
                power_w_for_interval
            FROM intervals
        ),
        per_device AS (
            SELECT
                device_id,
                SUM(power_w_for_interval * delta_s / 3600.0) AS energy_wh,
                AVG(power_w_for_interval) AS avg_power_w,
                COUNT(*) AS data_points
            FROM intervals_capped
            GROUP BY device_id
        )
        SELECT
            pd.device_id,
            d.name AS device_name,
            pd.energy_wh AS total_energy_wh,
            pd.avg_power_w AS avg_power_w,
            pd.data_points AS data_points
        FROM per_device pd
        JOIN devices d ON d.id = pd.device_id
        ORDER BY pd.energy_wh {order_dir}
        LIMIT 3
        """

        order_dir = "DESC" if highest else "ASC"
        sql = sql.format(order_dir=order_dir)

        params = {
            "user_id": user_id,
            "start_time": tr.start,
            "end_time": tr.end,
            "max_gap_seconds": int(max_gap_seconds),
        }

        top = self.db.execute(text(sql), params).fetchall()
        if not top:
            return None

        # First item is the target device
        first = top[0]
        total_top_wh = sum(float(r.total_energy_wh or 0.0) for r in top) or 0.0

        device = {
            "id": first.device_id,
            "name": first.device_name,
            "total_energy_wh": float(first.total_energy_wh or 0.0),
            "avg_power_w": float(first.avg_power_w or 0.0),
            "data_points": int(first.data_points or 0),
            "percentage_of_total": (float(first.total_energy_wh or 0.0) / total_top_wh * 100.0) if total_top_wh > 0 else 0.0,
        }

        comparison = [
            {
                "device_name": r.device_name,
                "total_energy_wh": float(r.total_energy_wh or 0.0),
                "percentage": (float(r.total_energy_wh or 0.0) / total_top_wh * 100.0) if total_top_wh > 0 else 0.0,
            }
            for r in top
        ]

        return {
            "device": device,
            "time_period": {
                "start": tr.start.isoformat(),
                "end": tr.end.isoformat(),
                "readable": time_range_str.replace("_", " ").title(),
            },
            "comparison": comparison,
        }