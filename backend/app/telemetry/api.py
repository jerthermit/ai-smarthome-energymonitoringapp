# backend/app/telemetry/api.py

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.auth.models import User
from . import models, schemas, service

router = APIRouter(prefix="/telemetry", tags=["telemetry"])


def _to_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """
    Ensure datetime is timezone-aware in UTC.
    If None, return None. If naive, assume UTC. If tz-aware, convert to UTC.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _normalize_device_ids(device_ids: Optional[List[str]]) -> Optional[List[str]]:
    """
    Accept both repeated query params (?device_ids=a&device_ids=b) and
    a single comma-separated value (?device_ids=a,b). Returns a flat list
    or None.
    """
    if not device_ids:
        return None
    out: List[str] = []
    for item in device_ids:
        if item is None:
            continue
        parts = [p.strip() for p in item.split(",") if p.strip()]
        out.extend(parts)
    return out or None


# --- helpers for canonical ranges ---
_VALID_LOGICAL_RANGES = {"day", "3days", "week"}

def _parse_logical_range(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    v = value.strip().lower()
    if v not in _VALID_LOGICAL_RANGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid range '{value}'. Valid values: day, 3days, week."
        )
    return v


@router.post("", response_model=schemas.TelemetryInDB, status_code=status.HTTP_201_CREATED)
async def create_telemetry(
    telemetry: schemas.TelemetryCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new telemetry reading.
    """
    # In a real app, you might want to verify the device exists and is active
    return service.create_telemetry(db=db, telemetry=telemetry)


@router.get("", response_model=list[schemas.TelemetryInDB])
async def get_telemetry_readings(
    device_id: Optional[str] = Query(
        None, description="Filter by a specific device ID (UUID)."
    ),
    start_time: Optional[datetime] = Query(
        None, description="ISO 8601 start time; assumed UTC if no timezone provided."
    ),
    end_time: Optional[datetime] = Query(
        None, description="ISO 8601 end time; assumed UTC if no timezone provided."
    ),
    limit: int = Query(
        1000, ge=1, le=10000, description="Maximum number of rows to return (1–10000)."
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get telemetry readings with optional filters.
    Results are scoped to the current user's devices.
    """
    # Normalise datetimes to UTC
    start_dt = _to_utc(start_time)
    end_dt = _to_utc(end_time)

    # Validate window if both provided
    if start_dt and end_dt and start_dt > end_dt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_time must be <= end_time",
        )

    query = schemas.TelemetryQuery(
        device_id=device_id,
        start_time=start_dt,
        end_time=end_dt,
        limit=limit,  # bounded by Query validator
    )
    return service.get_telemetry(db=db, query=query, user_id=current_user.id)


@router.post("/devices", response_model=schemas.DeviceInDB, status_code=status.HTTP_201_CREATED)
async def create_device(
    device: schemas.DeviceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Register a new device for the current user.
    """
    return service.create_device(db=db, device=device, user_id=current_user.id)


@router.get("/devices", response_model=list[schemas.DeviceInDB])
async def get_devices(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get all devices for the current user.
    """
    return service.get_user_devices(db=db, user_id=current_user.id)


@router.get("/devices/{device_id}", response_model=schemas.DeviceInDB)
async def get_device(
    device_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get a specific device for the current user.
    """
    device = service.get_device(db=db, device_id=device_id, user_id=current_user.id)
    if not device:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Device not found or access denied"
        )
    return device


@router.get("/aggregate", response_model=List[schemas.AggregateDataPoint])
async def get_aggregate_telemetry(
    # Legacy params (kept for backwards compatibility)
    time_range: schemas.TimeRange = Query(
        schemas.TimeRange.DAY,
        description="Aggregation window: hour, day, week, month. (legacy)"
    ),
    resolution_minutes: int = Query(
        15,
        ge=1,
        le=1440,
        description="Aggregation bucket size in minutes (1–1440). (legacy)"
    ),
    # Canonical range (new, optional)
    range: Optional[str] = Query(
        None,
        description="Canonical range: day | 3days | week. If provided, overrides legacy params."
    ),
    tz: Optional[str] = Query(
        "Asia/Singapore",
        description="IANA timezone used for local calendar alignment (default: Asia/Singapore)."
    ),
    device_ids: Optional[List[str]] = Query(
        None,
        description=(
            "Filter by specific device IDs. "
            "Use repeated params (?device_ids=a&device_ids=b) or a single comma-separated value (?device_ids=a,b)."
        ),
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get aggregated telemetry data for visualization.

    If `range` is provided, uses canonical local-time windows aligned to calendar days
    (same semantics the frontend charts expect):
      - range=day   -> [today 00:00, now) hourly
      - range=3days -> [today 00:00-3d, today 00:00) daily (exclude today)
      - range=week  -> [today 00:00-7d, today 00:00) daily (exclude today)

    Otherwise, falls back to the legacy moving-window behavior.
    """
    try:
        normalized_device_ids = _normalize_device_ids(device_ids)
        logical_range = _parse_logical_range(range)

        if logical_range:
            return service.get_aggregate_telemetry_windowed(
                db=db,
                user_id=current_user.id,
                range_key=logical_range,  # 'day' | '3days' | 'week'
                tz=tz or "Asia/Singapore",
                device_ids=normalized_device_ids,
            )

        # Legacy path
        query = schemas.AggregateQuery(
            time_range=time_range,
            resolution_minutes=resolution_minutes,
            device_ids=normalized_device_ids
        )
        return service.get_aggregate_telemetry(
            db=db,
            query=query,
            user_id=current_user.id
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/energy_summary", response_model=List[schemas.DeviceEnergySummary])
async def get_device_energy_summary(
    # Canonical option (new, optional)
    range: Optional[str] = Query(
        None,
        description="Canonical range: day | 3days | week. If provided, start_time/end_time are ignored."
    ),
    tz: Optional[str] = Query(
        "Asia/Singapore",
        description="IANA timezone used for local calendar alignment (default: Asia/Singapore)."
    ),
    # Legacy explicit window (still supported)
    start_time: Optional[datetime] = Query(
        None, description="ISO 8601 start time; assumed UTC if no timezone provided. (legacy)"
    ),
    end_time: Optional[datetime] = Query(
        None, description="ISO 8601 end time; assumed UTC if no timezone provided. (legacy)"
    ),
    device_ids: Optional[List[str]] = Query(
        None,
        description=(
            "Optional device filter. "
            "Use repeated params (?device_ids=a&device_ids=b) or a single comma-separated value (?device_ids=a,b)."
        ),
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Return integrated energy per device (kWh), scoped to the current user.

    If `range` is provided, uses canonical local-time windows (matches charts):
      - range=day   -> [today 00:00, now)
      - range=3days -> [today 00:00-3d, today 00:00)
      - range=week  -> [today 00:00-7d, today 00:00)

    Otherwise, requires start_time and end_time (legacy behavior).
    """
    normalized_device_ids = _normalize_device_ids(device_ids)
    logical_range = _parse_logical_range(range)

    if logical_range:
        return service.get_device_energy_summary_windowed(
            db=db,
            user_id=current_user.id,
            range_key=logical_range,          # 'day' | '3days' | 'week'
            tz=tz or "Asia/Singapore",
            device_ids=normalized_device_ids,
        )

    # Legacy path requires both start & end
    start_dt = _to_utc(start_time)
    end_dt = _to_utc(end_time)
    if not start_dt or not end_dt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either provide range=day|3days|week, or provide both start_time and end_time."
        )
    if start_dt > end_dt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_time must be <= end_time",
        )

    return service.get_device_energy_summary(
        db=db,
        start_time=start_dt,
        end_time=end_dt,
        user_id=current_user.id,
        device_ids=normalized_device_ids,
    )