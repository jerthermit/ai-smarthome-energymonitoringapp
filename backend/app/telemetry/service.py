from datetime import datetime
from typing import List, Optional
from sqlalchemy.orm import Session

from . import models, schemas

def create_telemetry(db: Session, telemetry: schemas.TelemetryCreate) -> models.Telemetry:
    """Create a new telemetry reading"""
    db_telemetry = models.Telemetry(
        device_id=telemetry.device_id,
        timestamp=telemetry.timestamp,
        energy_watts=telemetry.energy_watts
    )
    db.add(db_telemetry)
    db.commit()
    db.refresh(db_telemetry)
    return db_telemetry

def get_telemetry(
    db: Session,
    query: schemas.TelemetryQuery
) -> List[models.Telemetry]:
    """Query telemetry data with filters"""
    q = db.query(models.Telemetry)
    
    if query.device_id:
        q = q.filter(models.Telemetry.device_id == query.device_id)
    if query.start_time:
        q = q.filter(models.Telemetry.timestamp >= query.start_time)
    if query.end_time:
        q = q.filter(models.Telemetry.timestamp <= query.end_time)
    
    return q.order_by(models.Telemetry.timestamp.desc()).limit(query.limit).all()

def create_device(db: Session, device: schemas.DeviceCreate, user_id: int) -> models.Device:
    """Create a new device"""
    db_device = models.Device(
        name=device.name,
        user_id=user_id
    )
    db.add(db_device)
    db.commit()
    db.refresh(db_device)
    return db_device

def get_user_devices(db: Session, user_id: int) -> List[models.Device]:
    """Get all devices for a user"""
    return db.query(models.Device).filter(models.Device.user_id == user_id).all()

def get_device(db: Session, device_id: str, user_id: int) -> Optional[models.Device]:
    """Get a specific device for a user"""
    return db.query(models.Device).filter(
        models.Device.id == device_id,
        models.Device.user_id == user_id
    ).first()
