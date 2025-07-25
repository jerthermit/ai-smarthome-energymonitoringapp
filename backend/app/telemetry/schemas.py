from pydantic import BaseModel, Field, validator
from datetime import datetime
from typing import Optional, List
import uuid

class TelemetryBase(BaseModel):
    device_id: str = Field(..., alias="deviceId")
    timestamp: datetime
    energy_watts: float = Field(..., gt=0, alias="energyWatts", description="Energy usage in watts")
    
    class Config:
        populate_by_name = True

class TelemetryCreate(TelemetryBase):
    @validator('device_id')
    def validate_device_id(cls, v):
        try:
            uuid.UUID(str(v))
            return str(v)
        except ValueError:
            raise ValueError('device_id must be a valid UUID')

class TelemetryInDB(TelemetryBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class TelemetryQuery(BaseModel):
    device_id: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    limit: int = 1000

class DeviceBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)

class DeviceCreate(DeviceBase):
    pass

class DeviceInDB(DeviceBase):
    id: str
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
