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
from dataclasses import asdict
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

# Import the trusted telemetry service
import app.telemetry.service as telemetry_service
from .chat_schemas import EnergyQueryResponse, TimeSeriesPoint
from app.telemetry.models import Device
from app.ai.memory import RankedDevice # Import RankedDevice from memory module

logger = logging.getLogger(__name__)

# Mapping from the AI Orchestrator's time labels to the telemetry service's range keys
LABEL_TO_RANGE_KEY_MAP = {
    "today": "day",
    "this_week_so_far": "week",
    "last_7_days": "week",
    "last_week": "week",
    "last_3_days": "3days",
    "this_month_so_far": "month", # Added for completeness with orchestrator
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
        rank_num = parsed.get("rank_num")

        range_key = LABEL_TO_RANGE_KEY_MAP.get(time_label, "day")

        device_names_map = self._get_device_names(user_id)
        device_ids_filter = self._get_device_ids_filter(devices, user_id)

        if rank in {"highest", "lowest"} or rank_num is not None:
            return await self._handle_rank_query(user_id, rank, rank_num, range_key, local_tz, device_ids_filter, device_names_map, parsed)
        else:
            return await self._handle_usage_query(user_id, range_key, local_tz, devices, device_ids_filter, parsed)

    async def _handle_rank_query(
        self, user_id: int, rank: Optional[str], rank_num: Optional[int], range_key: str, tz: str,
        device_ids: Optional[List[str]], device_names_map: Dict[str, str], parsed_meta: Dict[str, Any]
    ) -> EnergyQueryResponse:
        """Handles highest/lowest queries using the device energy summary service."""

        # Step 1: Fetch ALL device summaries for the given period.
        # This is the crucial part: we need data for *all* devices to correctly rank them.
        all_device_summaries = await asyncio.to_thread(
            telemetry_service.get_device_energy_summary_windowed,
            db=self.db, user_id=user_id, range_key=range_key, tz=tz,
            # Pass device_ids filter ONLY IF the user explicitly mentioned specific devices.
            # If the user asks "highest device", we want to rank ALL devices, so device_ids should be None.
            # If the user asks "highest AC", then device_ids should filter to only ACs.
            device_ids=device_ids
        )

        if not all_device_summaries:
            return self._create_no_data_response(range_key, parsed_meta)
        
        # Filter out devices with 0 kWh if we want to rank based on actual consumption
        # This is a common requirement to avoid "lowest" being a device that wasn't used.
        # However, for true "lowest" if there are non-used devices, we might keep them.
        # For this scenario, let's keep all for now to reflect actual data from DB.
        # If simulation data has devices with 0 kWh, they will appear.

        # Step 2: Determine sorting order based on 'rank' parameter.
        is_lowest_rank_query = (rank == "lowest")
        
        # Step 3: Sort the *entire list* of summaries based on energy consumption.
        # If 'lowest' is requested, sort ascending. Otherwise (highest, or any specific rank Nth without explicit type), sort descending.
        all_device_summaries.sort(key=lambda x: x.energy_kwh, reverse=not is_lowest_rank_query)

        # Step 4: Identify the target device for the summary response.
        target_summary = None
        if rank_num is not None:
            # Adjust for 0-based indexing: 1st is index 0, 2nd is index 1, etc.
            if 1 <= rank_num <= len(all_device_summaries):
                target_summary = all_device_summaries[rank_num - 1]
        elif rank == "highest":
            target_summary = all_device_summaries[0]
        elif rank == "lowest":
            target_summary = all_device_summaries[0] # If sorted for lowest, the first element is indeed the lowest.
        
        # Fallback if specific target not found (e.g., rank_num out of bounds, or a generic rank query without explicit type in some edge cases)
        if not target_summary:
            logger.warning(f"[_handle_rank_query] Could not find specific target for rank='{rank}', rank_num={rank_num}. Defaulting to first in the sorted list.")
            target_summary = all_device_summaries[0] 

        device_name = device_names_map.get(target_summary.device_id, "Unknown Device")
        readable_range_label = self._get_readable_range_label(range_key)
        
        # Step 5: Craft the summary string.
        summary_prefix = ""
        if rank_num is not None:
            # Determine ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
            suffix = "th"
            if 10 <= rank_num % 100 <= 20: # Handles 11th, 12th, 13th
                pass
            else:
                suffix = {1: "st", 2: "nd", 3: "rd"}.get(rank_num % 10, "th")
            rank_phrase = f"{rank_num}{suffix}"
            
            # Infer rank type for the phrase if not explicitly provided (e.g., "2nd highest" vs "2nd lowest")
            rank_type_for_phrase = rank if rank else ("lowest" if is_lowest_rank_query else "highest")
            summary_prefix = f"Your {rank_phrase} {rank_type_for_phrase}-consuming device"
        elif rank: # e.g., "highest", "lowest" (implies 1st)
             summary_prefix = f"Your 1st {rank}-consuming device"
        else: # Fallback if no rank or rank_num, but somehow routed here
            summary_prefix = "The top-consuming device"

        summary = (
            f"{summary_prefix} for {readable_range_label} was the "
            f"**{device_name}**, using **{target_summary.energy_kwh:.2f} kWh**."
        )

        # Step 6: Construct the full list of RankedDevice objects for memory.
        # This list MUST be built from the `all_device_summaries` which is already correctly sorted.
        all_devices_ranked_objects = [
            RankedDevice(
                device_id=d.device_id,
                kwh=d.energy_kwh,
                name=device_names_map.get(d.device_id, d.device_id) # Ensure friendly name is used
            )
            for d in all_device_summaries
        ]
        
        logger.debug(f"[_handle_rank_query] Generated all_devices_ranked_objects (first 5): {[asdict(d) for d in all_devices_ranked_objects[:5]]}")

        data = {
            "top_device": {"name": device_name, "kwh": target_summary.energy_kwh},
            # Convert RankedDevice objects to dicts for the API response schema
            "all_devices_ranked": [asdict(r) for r in all_devices_ranked_objects]
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

        readable_range_label = self._get_readable_range_label(range_key)
        summary = (
            f"Over {readable_range_label}, you used **{total_kwh:.2f} kWh** "
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

    def _get_readable_range_label(self, range_key: str) -> str:
        if range_key == "day": return "the day"
        if range_key == "3days": return "the last 3 days"
        if range_key == "week": return "the week"
        if range_key == "month": return "the month" # Added for completeness
        return range_key

    def _create_no_data_response(self, range_key: str, parsed_meta: Dict[str, Any]) -> EnergyQueryResponse:
        readable_range_label = self._get_readable_range_label(range_key)
        summary = f"I couldn't find any energy data for {readable_range_label}. Please try a different time period."
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