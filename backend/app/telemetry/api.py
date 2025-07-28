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
    time_range: schemas.TimeRange = Query(
        schemas.TimeRange.DAY,
        description="Aggregation window: hour, day, week, month."
    ),
    resolution_minutes: int = Query(
        15,
        ge=1,
        le=1440,
        description="Aggregation bucket size in minutes (1–1440)."
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

    Returns time-series data of total energy consumption across all or selected devices,
    aggregated into fixed time intervals. Timestamps are UTC; clients should display in
    the browser's local time.
    """
    try:
        normalized_device_ids = _normalize_device_ids(device_ids)

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
    start_time: datetime = Query(
        ..., description="ISO 8601 start time; assumed UTC if no timezone provided."
    ),
    end_time: datetime = Query(
        ..., description="ISO 8601 end time; assumed UTC if no timezone provided."
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
    Return integrated energy per device (kWh) over [start_time, end_time], scoped to the current user.

    Integration matches /aggregate:
      - Step-hold previous power reading
      - Cap gaps at 15 minutes to avoid runaway energy during outages
    """
    start_dt = _to_utc(start_time)
    end_dt = _to_utc(end_time)
    if start_dt > end_dt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_time must be <= end_time",
        )

    normalized_device_ids = _normalize_device_ids(device_ids)

    return service.get_device_energy_summary(
        db=db,
        start_time=start_dt,
        end_time=end_dt,
        user_id=current_user.id,
        device_ids=normalized_device_ids,
    )