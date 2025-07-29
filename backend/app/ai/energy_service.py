# backend/app/ai/energy_service.py
"""
Processes energy-related queries by calling the trusted telemetry service.

This service acts as a bridge between the AI orchestrator and the application's
canonical data source (`telemetry.service`), ensuring consistent calculations
between the chatbot and dashboard charts.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

# Import the trusted telemetry service
import app.telemetry.service as telemetry_service
from .chat_schemas import EnergyQueryResponse, TimeSeriesPoint
from app.telemetry.models import Device

logger = logging.getLogger(__name__)

# Mapping from the AI Orchestrator's time labels to the telemetry service's range keys
LABEL_TO_RANGE_KEY_MAP = {
    "today": "day",
    "this_week_so_far": "week",
    "last_7_days": "week",
    "last_week": "week",
}

class EnergyQueryProcessor:
    """
    Processes parsed energy queries by delegating to the telemetry service.
    """
    def __init__(self, db: Session):
        self.db = db

    async def process_with_params(self, user_id: int, parsed: Dict[str, Any], local_tz: str) -> EnergyQueryResponse:
        """
        Handles a query using pre-parsed slots and the telemetry service.
        """
        time_info = parsed.get("time") or {}
        time_label = time_info.get("label", "today")
        devices = parsed.get("devices")
        rank = parsed.get("rank")
        
        range_key = LABEL_TO_RANGE_KEY_MAP.get(time_label, "day")

        device_names_map = self._get_device_names(user_id)
        device_ids_filter = self._get_device_ids_filter(devices, user_id)

        if rank in {"highest", "lowest"}:
            return await self._handle_rank_query(user_id, rank, range_key, local_tz, device_ids_filter, device_names_map, parsed)
        else:
            return await self._handle_usage_query(user_id, range_key, local_tz, devices, device_ids_filter, parsed)

    # --- FIX: These two methods must be async ---
    async def _handle_rank_query(
        self, user_id: int, rank: str, range_key: str, tz: str, 
        device_ids: Optional[List[str]], device_names_map: Dict[str, str], parsed_meta: Dict[str, Any]
    ) -> EnergyQueryResponse:
        """Handles highest/lowest queries using the device energy summary service."""
        
        ranked_summaries = await asyncio.to_thread(
            telemetry_service.get_device_energy_summary_windowed,
            db=self.db, user_id=user_id, range_key=range_key, tz=tz, device_ids=device_ids
        )

        if not ranked_summaries:
            return self._create_no_data_response(range_key, parsed_meta)

        target_summary = ranked_summaries[0] if rank == "highest" else ranked_summaries[-1]
        device_name = device_names_map.get(target_summary.device_id, "Unknown Device")
        
        summary = (
            f"Your {rank}-consuming device for the {range_key} was the "
            f"**{device_name}**, using **{target_summary.energy_kwh:.2f} kWh**."
        )

        data = {
            "top_device": {"name": device_name, "kwh": target_summary.energy_kwh},
            "all_devices_ranked": [
                {"name": device_names_map.get(d.device_id), "kwh": d.energy_kwh}
                for d in ranked_summaries
            ]
        }
        
        return self._create_final_response(summary, data, None, parsed_meta)

    async def _handle_usage_query(
        self, user_id: int, range_key: str, tz: str, 
        devices: List[str], device_ids: Optional[List[str]], parsed_meta: Dict[str, Any]
    ) -> EnergyQueryResponse:
        """Handles total usage queries using the aggregate telemetry service."""

        aggregate_data = await asyncio.to_thread(
            telemetry_service.get_aggregate_telemetry_windowed,
            db=self.db, user_id=user_id, range_key=range_key, tz=tz, device_ids=device_ids
        )

        if not aggregate_data:
            return self._create_no_data_response(range_key, parsed_meta)

        total_wh = sum(point.value for point in aggregate_data)
        total_kwh = float(total_wh) / 1000.0
        
        device_phrase = "all your devices"
        if devices:
            device_phrase = f"your **{', '.join(devices)}**"

        summary = (
            f"Over the {range_key}, you used **{total_kwh:.2f} kWh** "
            f"across {device_phrase}."
        )

        time_series = [
            TimeSeriesPoint(timestamp=p.timestamp, value=float(p.value) / 1000.0, unit="kWh")
            for p in aggregate_data
        ]
        data = {"total_kwh": total_kwh, "device_count": aggregate_data[0].device_count if aggregate_data else 0}
        
        return self._create_final_response(summary, data, time_series, parsed_meta)

    def _get_device_names(self, user_id: int) -> Dict[str, str]:
        devices = telemetry_service.get_user_devices(db=self.db, user_id=user_id)
        return {device.id: device.name for device in devices}

    def _get_device_ids_filter(self, device_names: Optional[List[str]], user_id: int) -> Optional[List[str]]:
        if not device_names:
            return None
        
        all_devices = telemetry_service.get_user_devices(db=self.db, user_id=user_id)
        name_to_id_map = {d.name.lower(): d.id for d in all_devices}
        
        found_ids = [name_to_id_map[name.lower()] for name in device_names if name.lower() in name_to_id_map]
        return found_ids or None

    def _create_no_data_response(self, range_key: str, parsed_meta: Dict[str, Any]) -> EnergyQueryResponse:
        summary = f"I couldn't find any energy data for the {range_key}. Please try a different time period."
        return self._create_final_response(summary, {"message": "No data available"}, None, parsed_meta, is_error=True)
    
    def _create_final_response(
        self, summary: str, data: Dict[str, Any], time_series: Optional[List[TimeSeriesPoint]], parsed_meta: Dict[str, Any], is_error: bool = False
    ) -> EnergyQueryResponse:
        metadata = {"query_processed": parsed_meta}
        if is_error:
            metadata["error"] = True
            
        return EnergyQueryResponse(
            summary=summary, data=data, time_series=time_series, metadata=metadata
        )
    
    def _get_time_range(self, time_info: Dict[str, Any]) -> tuple[datetime, datetime]:
        start_utc = _parse_iso_dt(time_info.get("start_utc"))
        end_utc = _parse_iso_dt(time_info.get("end_utc"))

        if start_utc and end_utc:
            return start_utc, end_utc

        now = datetime.now(timezone.utc)
        return now - timedelta(days=7), now
    
    def _map_granularity_to_timegroup(self, gran: str) -> TimeGroup:
        g = gran.lower()
        if g.startswith("min"): return TimeGroup.HOUR
        if g.startswith("hour"): return TimeGroup.HOUR
        if g.startswith("day"): return TimeGroup.DAY
        if g.startswith("week"): return TimeGroup.WEEK
        return TimeGroup.DAY


def _parse_iso_dt(s: Optional[str]) -> Optional[datetime]:
    if not s: return None
    try:
        dt_str = s.replace("Z", "+00:00")
        dt = datetime.fromisoformat(dt_str)
        return dt.astimezone(timezone.utc) if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError): return None


def _coerce_iso_to_dt(s: Optional[Any]) -> datetime:
    if isinstance(s, datetime): return s
    dt = _parse_iso_dt(str(s))
    return dt if dt else datetime.now(timezone.utc)