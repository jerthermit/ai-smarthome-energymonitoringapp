# backend/app/telemetry/schemas.py
from pydantic import BaseModel, Field, validator, condecimal
from datetime import datetime, timedelta
from typing import Optional, List
import uuid
from enum import Enum

# ---------- Telemetry ----------

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


# ---------- Devices ----------

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


# ---------- Aggregation (time series) ----------

class TimeRange(str, Enum):
    HOUR = "hour"
    DAY = "day"
    WEEK = "week"
    MONTH = "month"


class AggregateDataPoint(BaseModel):
    timestamp: datetime
    value: condecimal(gt=0)  # Ensure positive values
    device_count: int


class AggregateQuery(BaseModel):
    time_range: TimeRange = TimeRange.DAY
    resolution_minutes: int = Field(15, ge=1, le=1440)  # 1 minute to 24 hours
    device_ids: Optional[List[str]] = None  # None means all devices

    @validator('resolution_minutes')
    def validate_resolution(cls, v, values):
        time_range = values.get('time_range')
        max_resolution = {
            TimeRange.HOUR: 1,
            TimeRange.DAY: 15,
            TimeRange.WEEK: 60,
            TimeRange.MONTH: 240
        }.get(time_range, 15)

        if v < max_resolution:
            raise ValueError(f"Resolution too high for {time_range} range. Minimum is {max_resolution} minutes.")
        return v


# ---------- Per-device energy summary (kWh over a window) ----------

class DeviceEnergySummary(BaseModel):
    """
    Per-device integrated energy over a time window.
    JSON field names are camelCase to match frontend expectations.
    """
    device_id: str = Field(..., alias="deviceId")
    energy_kwh: float = Field(..., gt=0, alias="energyKwh")

    class Config:
        populate_by_name = True
        from_attributes = True