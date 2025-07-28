# backend/app/ai/energy_service.py
"""
Energy Query Processing Service.
- Deterministic handling when parsed slots are provided (no LLM).
- Fallback `process_query` retains simple parse with optional LLM assist as last resort.
- Produces structured EnergyQueryResponse used by the chat API.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from .chat_schemas import EnergyQueryResponse, TimeSeriesPoint
from .providers.base import AIProvider
from .data.energy_repository import EnergyRepository, TimeRange as RepoTimeRange, TimeGroup

logger = logging.getLogger(__name__)


def _ordinal_suffix(n: int) -> str:
    return "th" if 11 <= (n % 100) <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")


class EnergyQueryProcessor:
    """Processes natural language energy queries and generates structured responses."""

    def __init__(self, ai_provider: AIProvider, energy_repo: EnergyRepository):
        self.ai_provider = ai_provider
        self.energy_repo = energy_repo

    # -------------------------------------------------------------------------
    # MAIN: Deterministic path when orchestrator already parsed slots
    # -------------------------------------------------------------------------
    async def process_with_params(self, user_id: int, user_query: str, parsed: Dict[str, Any]) -> EnergyQueryResponse:
        """
        Deterministic handling using parsed slots from the orchestrator.
        parsed format:
        {
          "time": { "label": str, "start_utc": iso8601|None, "end_utc": iso8601|None, "granularity": "minute|hour|day" },
          "devices": [str],
          "rank": "highest"|"lowest"|None
        }
        """
        time_info = (parsed or {}).get("time") or {}
        label = (time_info.get("label") or "").strip().lower()
        start_utc = _parse_iso_dt(time_info.get("start_utc"))
        end_utc = _parse_iso_dt(time_info.get("end_utc"))
        gran = (time_info.get("granularity") or "day").lower()

        # Device handling
        devices: List[str] = list((parsed or {}).get("devices") or [])
        device_keyword = _normalize_device_keyword(devices)
        rank: Optional[str] = (parsed or {}).get("rank")

        # If no time provided, default last 7 days
        if not start_utc or not end_utc:
            now = datetime.now(timezone.utc)
            start_utc = start_utc or (now - timedelta(days=7))
            end_utc = end_utc or now
            if not label:
                label = "last_7_days"
        time_group = _map_granularity_to_timegroup(gran)

        # If rank requested (highest/lowest), compute across devices for the window
        if rank in {"highest", "lowest"}:
            # If label is one of the repo's fast paths, you could use get_highest/lowest_consuming_device.
            # But to support arbitrary start/end, compute deterministically from usage data:
            top = await self._compute_rank_from_usage(
                user_id=user_id,
                start=start_utc,
                end=end_utc,
                time_group=time_group,
                direction="desc" if rank == "highest" else "asc",
            )
            if not top:
                return self._no_data_response(label, parsed)

            dev = top["device"]
            kwh = dev["total_energy_wh"] / 1000.0
            suffix = _ordinal_suffix(1)
            summary = (
                f"Your 1{suffix} {rank} device for {label.replace('_', ' ')} is "
                f"{dev['name']}, using {kwh:.2f} kWh."
            )
            return EnergyQueryResponse(
                summary=summary,
                data=top,
                time_series=None,
                metadata={
                    "query_processed": {
                        "time": {
                            "label": label,
                            "start_utc": start_utc.isoformat(),
                            "end_utc": end_utc.isoformat(),
                            "granularity": gran,
                        },
                        "devices": devices,
                        "rank": rank,
                    }
                },
            )

        # Usage path (optionally filtered by device)
        usage = await self.energy_repo.get_energy_usage(
            user_id=user_id,
            device_name=device_keyword,  # "all" or specific
            start_time=start_utc,
            end_time=end_utc,
            time_group=time_group,
        )

        points: List[TimeSeriesPoint] = [
            TimeSeriesPoint(
                timestamp=_coerce_iso_to_dt(row.get("time_period")),
                value=float(row.get("total_energy_wh", 0.0)) / 1000.0,
                unit="kWh",
            )
            for row in usage.get("data", [])
            if row.get("time_period")
        ]

        summary_obj = usage.get("summary") or {}
        total_kwh = float(summary_obj.get("total_energy_wh", 0.0)) / 1000.0
        device_count = int(summary_obj.get("device_count", 0))
        tp = summary_obj.get("time_period") or {}
        start_s = (tp.get("start") or start_utc.isoformat())[:10]
        end_s = (tp.get("end") or end_utc.isoformat())[:10]

        device_phrase = (
            f"devices matching '{device_keyword}'" if device_keyword and device_keyword != "all" else "all devices"
        )
        summary_text = (
            f"You used {total_kwh:.2f} kWh from {start_s} to {end_s} across "
            f"{device_count} device{'s' if device_count != 1 else ''} ({device_phrase})."
        )

        return EnergyQueryResponse(
            summary=summary_text,
            data=summary_obj,
            time_series=points or None,
            metadata={
                "query_processed": {
                    "time": {
                        "label": label,
                        "start_utc": start_utc.isoformat(),
                        "end_utc": end_utc.isoformat(),
                        "granularity": gran,
                    },
                    "devices": devices,
                    "rank": None,
                }
            },
        )

    # -------------------------------------------------------------------------
    # Fallback path (existing behavior kept, but preferring simple parse first)
    # -------------------------------------------------------------------------
    async def process_query(self, user_id: int, user_query: str) -> EnergyQueryResponse:
        """
        Handle a user query with best-effort parsing:
        - Prefer simple deterministic parse.
        - If that fails catastrophically, try LLM JSON once; then fallback to simple.
        """
        try:
            parsed = self._simple_parse(user_query)
            return await self.process_with_params(
                user_id=user_id,
                user_query=user_query,
                parsed={
                    "time": {
                        "label": parsed["time_range_type"],
                        "start_utc": parsed.get("start_utc"),
                        "end_utc": parsed.get("end_utc"),
                        "granularity": parsed.get("granularity") or "day",
                    },
                    "devices": [parsed.get("device_keyword")] if parsed.get("device_keyword") else [],
                    "rank": parsed.get("intent") if parsed.get("intent") in {"highest_consuming", "lowest_consuming"} else None,
                },
            )
        except Exception as e1:
            logger.warning(f"simple parse failed, trying LLM: {e1}")
            try:
                parsed_llm = await self._parse_with_llm(user_query)
                # Convert to params for deterministic execution
                tr = parsed_llm.get("time_range_type") or "today"
                start_utc, end_utc = _range_from_label(tr)
                return await self.process_with_params(
                    user_id=user_id,
                    user_query=user_query,
                    parsed={
                        "time": {
                            "label": tr,
                            "start_utc": start_utc.isoformat() if start_utc else None,
                            "end_utc": end_utc.isoformat() if end_utc else None,
                            "granularity": "day",
                        },
                        "devices": [parsed_llm.get("device_keyword")] if parsed_llm.get("device_keyword") else [],
                        "rank": "highest" if parsed_llm.get("intent") == "highest_consuming"
                                else ("lowest" if parsed_llm.get("intent") == "lowest_consuming" else None),
                    },
                )
            except Exception as e2:
                logger.error(f"LLM parse also failed: {e2}")
                return self._create_error_response("I couldn't interpret the question, please try again.")

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------

    async def _compute_rank_from_usage(
        self,
        user_id: int,
        start: datetime,
        end: datetime,
        time_group: TimeGroup,
        direction: str = "desc",  # "desc" for highest, "asc" for lowest
    ) -> Optional[Dict[str, Any]]:
        """
        Compute the top/bottom device by summing `total_energy_wh` per device over the window.
        Uses existing get_energy_usage to avoid new repository code.
        """
        usage = await self.energy_repo.get_energy_usage(
            user_id=user_id,
            device_name="all",
            start_time=start,
            end_time=end,
            time_group=time_group,
        )
        rows = usage.get("data") or []
        # Aggregate per device
        agg: Dict[str, Dict[str, Any]] = {}
        for r in rows:
            did = r.get("device_id")
            if not did:
                continue
            a = agg.setdefault(did, {
                "device_id": did,
                "device_name": r.get("device_name"),
                "total_energy_wh": 0.0,
                "avg_power_w_acc": 0.0,
                "points": 0,
            })
            a["total_energy_wh"] += float(r.get("total_energy_wh", 0.0))
            # For avg power, approximate by averaging the per-row avg weighted by points
            dp = int(r.get("data_points", 0))
            a["avg_power_w_acc"] += float(r.get("avg_power_w", 0.0)) * dp
            a["points"] += dp

        if not agg:
            return None

        # finalize avg power
        for a in agg.values():
            pts = max(1, int(a.pop("points", 0)))
            a["avg_power_w"] = a.pop("avg_power_w_acc", 0.0) / pts

        # pick device
        sorted_devs = sorted(
            agg.values(),
            key=lambda x: x["total_energy_wh"],
            reverse=(direction == "desc"),
        )
        best = sorted_devs[0]
        total_energy = sum(d["total_energy_wh"] for d in sorted_devs) or 0.0
        pct = (best["total_energy_wh"] / total_energy * 100.0) if total_energy > 0 else 0.0

        return {
            "device": {
                "id": best["device_id"],
                "name": best["device_name"],
                "total_energy_wh": float(best["total_energy_wh"]),
                "avg_power_w": float(best["avg_power_w"]),
                "percentage_of_total": pct,
            },
            "time_period": {
                "start": start.isoformat(),
                "end": end.isoformat(),
                "readable": "custom",
            },
            "comparison": [
                {
                    "device_name": d["device_name"],
                    "total_energy_wh": float(d["total_energy_wh"]),
                    "percentage": (d["total_energy_wh"] / total_energy * 100.0) if total_energy > 0 else 0.0,
                }
                for d in sorted_devs[:3]
            ],
        }

    async def _parse_with_llm(self, query: str) -> Dict[str, Any]:
        """
        Use LLM to parse the user query into:
        { intent: usage|highest_consuming|lowest_consuming,
          time_range_type: today|yesterday|last_week|last_month,
          device_keyword: string }
        """
        schema = {
            "type": "object",
            "properties": {
                "intent": {"type": "string", "enum": ["usage", "highest_consuming", "lowest_consuming"]},
                "time_range_type": {"type": "string", "enum": ["today", "yesterday", "last_week", "last_month"]},
                "device_keyword": {"type": "string"},
            },
            "required": ["intent", "time_range_type"],
        }
        prompt = (
            f"Parse this into JSON matching schema: {schema}\n"
            f"Query: {query}\n"
            "Reply only with the JSON object."
        )
        parsed = await self.ai_provider.get_structured_response(
            prompt=prompt,
            response_format={"type": "json_object", "schema": schema},
            temperature=0.0,
            max_tokens=400,
        )
        if not isinstance(parsed, dict):
            raise ValueError("Invalid LLM JSON")
        return parsed

    def _simple_parse(self, q: str) -> Dict[str, Any]:
        ql = q.lower()
        # intent
        if any(kw in ql for kw in ["highest", "top", "most"]):
            intent = "highest_consuming"
        elif any(kw in ql for kw in ["lowest", "least"]):
            intent = "lowest_consuming"
        else:
            intent = "usage"
        # time range
        if "today" in ql:
            tr = "today"
        elif "yesterday" in ql:
            tr = "yesterday"
        elif "week" in ql or "7 days" in ql:
            tr = "last_week"
        elif "month" in ql or "30 days" in ql:
            tr = "last_month"
        else:
            tr = "last_week"
        # device
        dk = None
        for d in ["ac", "aircon", "fridge", "light", "pc", "heater", "water heater", "tv", "fan"]:
            if d in ql:
                dk = "ac" if d in {"ac", "aircon"} else d
                break

        # concrete timestamps for deterministic execution
        start_utc, end_utc = _range_from_label(tr)
        return {
            "intent": intent,
            "time_range_type": tr,
            "device_keyword": dk or "all",
            "start_utc": start_utc.isoformat() if start_utc else None,
            "end_utc": end_utc.isoformat() if end_utc else None,
            "granularity": "day" if tr in {"last_week", "last_month"} else "hour",
        }

    def _create_error_response(self, msg: str) -> EnergyQueryResponse:
        return EnergyQueryResponse(
            summary=f"Error: {msg}",
            data={"error": msg},
            time_series=None,
            metadata={"error": True, "timestamp": datetime.now(timezone.utc).isoformat()},
        )


# ----------------------- local utils -----------------------

def _map_granularity_to_timegroup(gran: str) -> TimeGroup:
    g = (gran or "day").lower()
    if g.startswith("min"):
        return TimeGroup.HOUR  # repository groups at hour/day/week/month; minute → hour is safer
    if g.startswith("hour"):
        return TimeGroup.HOUR
    if g.startswith("day"):
        return TimeGroup.DAY
    if g.startswith("week"):
        return TimeGroup.WEEK
    if g.startswith("month"):
        return TimeGroup.MONTH
    return TimeGroup.DAY


def _normalize_device_keyword(devs: List[str]) -> str:
    if not devs:
        return "all"
    # If multiple provided, treat as "all" to avoid unexpected filtering
    d = devs[0].strip().lower()
    if d in {"all", ""}:
        return "all"
    if d in {"aircon", "air con", "air conditioner", "a/c"}:
        return "ac"
    return d


def _parse_iso_dt(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        ss = s.replace("Z", "+00:00")
        dt = datetime.fromisoformat(ss)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def _coerce_iso_to_dt(s: Optional[str]) -> datetime:
    if not s:
        return datetime.now(timezone.utc)
    try:
        ss = str(s).replace("Z", "+00:00")
        dt = datetime.fromisoformat(ss)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return datetime.now(timezone.utc)


def _range_from_label(label: str) -> Tuple[Optional[datetime], Optional[datetime]]:
    now = datetime.now(timezone.utc)
    if label == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return start, now
    if label == "yesterday":
        y = now - timedelta(days=1)
        start = y.replace(hour=0, minute=0, second=0, microsecond=0)
        end = y.replace(hour=23, minute=59, second=59, microsecond=999999)
        return start, end
    if label == "last_week":
        return now - timedelta(days=7), now
    if label == "last_month":
        return now - timedelta(days=30), now
    # default
    return now - timedelta(days=7), now