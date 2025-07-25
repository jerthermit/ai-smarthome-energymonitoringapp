from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

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
