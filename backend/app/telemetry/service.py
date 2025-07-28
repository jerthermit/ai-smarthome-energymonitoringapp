from datetime import datetime
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

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

def get_aggregate_telemetry(
    db: Session,
    query: schemas.AggregateQuery,
    user_id: int
) -> List[schemas.AggregateDataPoint]:
    """
    Get aggregated telemetry data for visualization
    
    Args:
        db: Database session
        query: Query parameters including time range and resolution
        user_id: ID of the user making the request
        
    Returns:
        List of aggregated data points with timestamps and values
    """
    from sqlalchemy import func, text
    from datetime import datetime, timedelta
    
    # Calculate time window based on the selected range
    now = datetime.utcnow()
    time_windows = {
        schemas.TimeRange.HOUR: now - timedelta(hours=1),
        schemas.TimeRange.DAY: now - timedelta(days=1),
        schemas.TimeRange.WEEK: now - timedelta(weeks=1),
        schemas.TimeRange.MONTH: now - timedelta(days=30)
    }
    
    start_time = time_windows.get(query.time_range, now - timedelta(days=1))
    
    # Build the base query
    base_query = db.query(
        func.date_trunc('minute', models.Telemetry.timestamp).label('time_bucket'),
        func.sum(models.Telemetry.energy_watts).label('total_energy'),
        func.count(models.Telemetry.device_id.distinct()).label('device_count')
    ).join(
        models.Device,
        models.Device.id == models.Telemetry.device_id
    ).filter(
        models.Device.user_id == user_id,
        models.Telemetry.timestamp >= start_time
    )
    
    # Apply device filter if specified
    if query.device_ids:
        base_query = base_query.filter(models.Telemetry.device_id.in_(query.device_ids))
    
    # Add time bucketing and grouping
    time_bucket = f"{query.resolution_minutes} minutes"
    
    # Build the base SQL query
    sql = """
    SELECT 
        time_bucket(:time_bucket, timestamp) as bucket,
        SUM(energy_watts) as total_energy,
        COUNT(DISTINCT device_id) as device_count
    FROM telemetry
    JOIN devices ON telemetry.device_id = devices.id
    WHERE 
        devices.user_id = :user_id 
        AND timestamp >= :start_time
    """
    
    # Initialize parameters
    params = {
        'time_bucket': time_bucket,
        'user_id': user_id,
        'start_time': start_time
    }
    
    # Add device filter if needed
    if query.device_ids:
        sql += " AND device_id = ANY(:device_ids)"
        params['device_ids'] = query.device_ids
    
    # Complete the SQL query
    sql += """
    GROUP BY bucket
    ORDER BY bucket
    """
    
    # Execute raw SQL for time_bucket function
    result = db.execute(text(sql), params)
    
    # Convert to Pydantic models
    return [
        schemas.AggregateDataPoint(
            timestamp=row.bucket,
            value=row.total_energy or 0,
            device_count=row.device_count
        )
        for row in result
    ]
