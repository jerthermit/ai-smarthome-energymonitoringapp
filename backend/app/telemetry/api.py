from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta

from app.core.database import get_db
from app.core.security import get_current_active_user
from app.auth.models import User
from . import models, schemas, service

router = APIRouter(prefix="/telemetry", tags=["telemetry"])

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
    device_id: str = None,
    start_time: str = None,
    end_time: str = None,
    limit: int = 1000,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get telemetry readings with optional filters.
    """
    query = schemas.TelemetryQuery(
        device_id=device_id,
        start_time=start_time,
        end_time=end_time,
        limit=min(limit, 10000)  # Enforce a reasonable limit
    )
    return service.get_telemetry(db=db, query=query)

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
        description="Time range for the aggregation"
    ),
    resolution_minutes: int = Query(
        15,
        ge=1,
        le=1440,
        description="Resolution in minutes (1-1440)"
    ),
    device_ids: Optional[List[str]] = Query(
        None,
        description="Filter by specific device IDs (comma-separated)"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get aggregated telemetry data for visualization
    
    Returns time-series data of total energy consumption across all or selected devices,
    aggregated into fixed time intervals.
    """
    try:
        query = schemas.AggregateQuery(
            time_range=time_range,
            resolution_minutes=resolution_minutes,
            device_ids=device_ids
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
