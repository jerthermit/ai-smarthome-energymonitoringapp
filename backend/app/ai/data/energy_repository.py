"""
Energy Data Repository.
Handles database operations for energy-related queries.
"""
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple, Union
from enum import Enum
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, case, text

from app.telemetry.models import Device, Telemetry
from app.auth.models import User

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
        self.start = start or (datetime.utcnow() - timedelta(days=7))
        self.end = end or datetime.utcnow()
    
    def to_dict(self) -> Dict[str, datetime]:
        return {"start": self.start, "end": self.end}
    
    @classmethod
    def from_string(cls, time_range_str: str) -> 'TimeRange':
        """Create TimeRange from string like 'today', 'yesterday', 'last_week', etc."""
        now = datetime.utcnow()
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        if time_range_str == "today":
            return cls(start=today, end=now)
        elif time_range_str == "yesterday":
            yesterday = today - timedelta(days=1)
            return cls(start=yesterday, end=today - timedelta(seconds=1))
        elif time_range_str == "last_week":
            return cls(start=now - timedelta(days=7), end=now)
        elif time_range_str == "last_month":
            return cls(start=now - timedelta(days=30), end=now)
        else:
            return cls()  # Default to last 7 days

class EnergyRepository:
    """
    Repository for energy data access operations.
    
    This class provides methods to query energy usage data with various filters
    and aggregations, supporting both high-level summaries and detailed time-series data.
    """
    
    def __init__(self, db: Session):
        """
        Initialize with database session.
        
        Args:
            db: SQLAlchemy database session
        """
        self.db = db
        
    def _get_time_group_expression(self, time_group: TimeGroup, column):
        """Get SQL expression for time-based grouping."""
        if time_group == TimeGroup.HOUR:
            return func.date_trunc('hour', column)
        elif time_group == TimeGroup.DAY:
            return func.date(column)
        elif time_group == TimeGroup.WEEK:
            return func.date_trunc('week', column)
        elif time_group == TimeGroup.MONTH:
            return func.date_trunc('month', column)
        return func.date(column)  # Default to daily
    
    async def get_energy_usage(
        self,
        user_id: int,
        device_name: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        time_group: TimeGroup = TimeGroup.DAY,
        metric: MetricType = MetricType.ENERGY_USAGE
    ) -> Dict[str, Any]:
        """
        Get energy usage data with flexible filtering and grouping.
        
        Args:
            user_id: ID of the user
            device_name: Optional device name filter (partial match, case-insensitive)
            start_time: Start of time range (default: 7 days ago)
            end_time: End of time range (default: now)
            time_group: Time period to group results by
            metric: Type of metric to return
            
        Returns:
            Dictionary containing:
            - summary: Aggregated statistics
            - data: List of data points
            - metadata: Query metadata
        """
        # Initialize time range
        time_range = TimeRange(start_time, end_time)
        
        # Build base query
        query = self.db.query(
            Device.id.label('device_id'),
            Device.name.label('device_name'),
            self._get_time_group_expression(time_group, Telemetry.timestamp).label('time_period'),
            func.sum(Telemetry.energy_watts).label('total_energy_wh'),
            func.avg(Telemetry.energy_watts).label('avg_power_w'),
            func.count(Telemetry.id).label('data_points')
        ).join(
            Telemetry,
            Device.id == Telemetry.device_id
        ).filter(
            Device.user_id == user_id,
            Telemetry.timestamp.between(time_range.start, time_range.end)
        )
        
        # Apply device filter if provided
        if device_name and device_name.lower() != 'all':
            query = query.filter(Device.name.ilike(f'%{device_name}%'))
        
        # Group by device and time period
        query = query.group_by(
            Device.id,  # Use the actual column reference instead of string
            Device.name,
            'time_period'  # This is a SQL expression, so we keep it as string
        ).order_by(
            'time_period',
            Device.name
        )
        
        # Execute query
        results = query.all()
        
        # Calculate summary statistics
        total_energy = sum(r.total_energy_wh or 0 for r in results)
        avg_power = sum((r.avg_power_w or 0) * (r.data_points or 0) for r in results) / \
                   sum(r.data_points or 0 for r in results) if results else 0
        
        # Format response
        return {
            'summary': {
                'total_energy_wh': total_energy,
                'avg_power_w': avg_power,
                'device_count': len({r.device_id for r in results}),
                'time_period': {
                    'start': time_range.start.isoformat(),
                    'end': time_range.end.isoformat(),
                    'group_by': time_group
                }
            },
            'data': [{
                'device_id': r.device_id,
                'device_name': r.device_name,
                'time_period': r.time_period.isoformat() if r.time_period else None,
                'total_energy_wh': float(r.total_energy_wh) if r.total_energy_wh is not None else 0.0,
                'avg_power_w': float(r.avg_power_w) if r.avg_power_w is not None else 0.0,
                'data_points': r.data_points or 0
            } for r in results],
            'metadata': {
                'query': {
                    'device_name': device_name,
                    'time_range': time_range.to_dict(),
                    'time_group': time_group,
                    'metric': metric
                },
                'generated_at': datetime.utcnow().isoformat()
            }
        }
    
    async def get_highest_consuming_device(
        self,
        user_id: int,
        time_range_str: str = "today"
    ) -> Optional[Dict[str, Any]]:
        """
        Get the highest energy-consuming device for a user in the given time range.
        
        Args:
            user_id: ID of the user
            time_range_str: Time range as string (e.g., 'today', 'yesterday', 'last_week')
            
        Returns:
            Dictionary with device and usage info, or None if no data
        """
        time_range = TimeRange.from_string(time_range_str)
        
        # Subquery to get total energy per device
        device_energy = self.db.query(
            Device.id.label('device_id'),
            Device.name.label('device_name'),
            func.sum(Telemetry.energy_watts).label('total_energy_wh'),
            func.avg(Telemetry.energy_watts).label('avg_power_w'),
            func.count(Telemetry.id).label('data_points')
        ).join(
            Telemetry,
            Device.id == Telemetry.device_id
        ).filter(
            Device.user_id == user_id,
            Telemetry.timestamp.between(time_range.start, time_range.end)
        ).group_by(
            Device.id,
            Device.name
        ).subquery()
        
        # Get the device with maximum energy usage
        result = self.db.query(
            device_energy
        ).order_by(
            device_energy.c.total_energy_wh.desc()
        ).first()
        
        if not result:
            return None
            
        # Get top 3 devices for comparison
        top_devices = self.db.query(
            device_energy
        ).order_by(
            device_energy.c.total_energy_wh.desc()
        ).limit(3).all()
        
        # Calculate total energy across all devices
        total_energy = sum(d.total_energy_wh or 0 for d in top_devices)
        
        return {
            'device': {
                'id': result.device_id,
                'name': result.device_name,
                'total_energy_wh': float(result.total_energy_wh) if result.total_energy_wh else 0.0,
                'avg_power_w': float(result.avg_power_w) if result.avg_power_w else 0.0,
                'data_points': result.data_points or 0,
                'percentage_of_total': (float(result.total_energy_wh) / total_energy * 100) 
                                     if total_energy > 0 else 0.0
            },
            'time_period': {
                'start': time_range.start.isoformat(),
                'end': time_range.end.isoformat(),
                'readable': time_range_str.replace('_', ' ').title()
            },
            'comparison': [{
                'device_name': d.device_name,
                'total_energy_wh': float(d.total_energy_wh) if d.total_energy_wh else 0.0,
                'percentage': (float(d.total_energy_wh) / total_energy * 100) 
                            if total_energy > 0 else 0.0
            } for d in top_devices]
        }
