# backend/app/ai/orchestrator.py
"""
Lean, deterministic orchestrator for routing user queries.

- Routes to ENERGY, SMALLTALK, or GENERAL intents without LLM calls.
- Extracts key entities: time range, device candidates, and ranking.
- Prioritizes speed, predictability, and being provider-agnostic.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, List, Optional, Sequence
from zoneinfo import ZoneInfo

# -------- Public Data Structures --------


class RouteIntent(str, Enum):
    """Enumeration for the classified intent of a user query."""

    ENERGY = "energy"
    SMALLTALK = "smalltalk"
    GENERAL = "general"
    UNSURE = "unsure"


@dataclass
class TimeRangeParams:
    """Represents a parsed time range with UTC start/end and granularity."""

    label: str
    start_utc: datetime
    end_utc: datetime
    granularity: str  # "minute" | "hour" | "day"


@dataclass
class ParsedSlots:
    """Holds all entities extracted from the user query."""

    time: Optional[TimeRangeParams] = None
    devices: List[str] = field(default_factory=list)
    rank: Optional[str] = None  # "highest" | "lowest"
    needs_clarification: bool = False
    clarification_question: Optional[str] = None


@dataclass
class Decision:
    """The final output of the orchestrator's decision process."""

    intent: RouteIntent
    parsed: ParsedSlots
    user_text: str
    confidence: float


# -------- Orchestrator Implementation --------


class Orchestrator:
    """
    A rule-based orchestrator that classifies user intent and extracts entities
    for energy-related queries.
    """

    ENERGY_TERMS = {
        "energy", "usage", "consumption", "power", "kwh", "kilowatt", "watt", "bill", "cost",
        "how much", "what did", "what was",
    }
    TIME_TERMS = {
        "today", "yesterday", "week", "month", "hour", "day", "minute", "past", "last", "this"
    }
    RANK_HIGH = {"highest", "top", "most", "max", "biggest"}
    RANK_LOW = {"lowest", "least", "min", "smallest"}

    SMALLTALK_PATTERNS = [
        re.compile(r"^\s*(hi|hello|hey|yo)\b.*$", re.IGNORECASE),
        re.compile(r"\b(good\s*(morning|afternoon|evening)|how are you|what'?s up)\b", re.IGNORECASE),
    ]

    # Pre-compiled regex for performance
    TIME_REGEX_PATTERNS = [
        ("today", re.compile(r"\btoday\b", re.IGNORECASE)),
        ("yesterday", re.compile(r"\byesterday\b", re.IGNORECASE)),
        ("this_week", re.compile(r"\bthis\s+week\b", re.IGNORECASE)),
        ("this_month", re.compile(r"\bthis\s+month\b", re.IGNORECASE)),
        ("last_week", re.compile(r"\b(last|past)\s+week\b", re.IGNORECASE)),
        ("last_7_days", re.compile(r"\b(last|past)\s+7\s*days\b", re.IGNORECASE)),
        ("relative_time", re.compile(r"\b(last|past)\s*(\d+)\s*(minutes?|hours?|days?|weeks?|months?)\b", re.IGNORECASE)),
    ]

    def __init__(self, local_tz: str = "Asia/Singapore"):
        try:
            self.local_tz = ZoneInfo(local_tz)
        except Exception:
            self.local_tz = timezone.utc

    async def decide(
        self,
        messages: Sequence[Dict[str, str]],
        known_device_names: Optional[Sequence[str]] = None,
    ) -> Decision:
        """
        Analyzes the latest user message to determine intent and extract parameters.

        Args:
            messages: A sequence of message dictionaries, e.g., [{"role": "user", "content": "..."}].
            known_device_names: A list of device names from the database.

        Returns:
            A Decision object containing the routing intent and parsed data.
        """
        user_text = self._latest_user_text(messages)
        if not user_text:
            return Decision(RouteIntent.UNSURE, ParsedSlots(), "", 0.0)

        lower_text = user_text.lower()

        # 1. Check for Smalltalk first
        if self._is_smalltalk(lower_text):
            return Decision(RouteIntent.SMALLTALK, ParsedSlots(), user_text, 0.95)

        # 2. Extract all possible signals from the text
        slots = self._extract_all_slots(lower_text, known_device_names or [])

        # 3. Decide intent based on extracted signals
        has_energy_signal = any(term in lower_text for term in self.ENERGY_TERMS) or bool(slots.devices)
        has_temporal_signal = slots.time is not None or any(term in lower_text for term in self.TIME_TERMS)

        if has_energy_signal and has_temporal_signal:
            intent = RouteIntent.ENERGY
            confidence = 0.9
            # If time was mentioned vaguely (e.g., "last week") but not parsed into a
            # concrete range, or not mentioned at all, we ask for clarification.
            if slots.time is None:
                slots.needs_clarification = True
                slots.clarification_question = "For what time period? For example: 'today', 'last 24 hours', or 'this month'."
                confidence = 0.75
        # Also catch queries like "top device today"
        elif slots.rank and has_temporal_signal:
            intent = RouteIntent.ENERGY
            confidence = 0.85
        else:
            intent = RouteIntent.GENERAL
            confidence = 0.5

        return Decision(intent, slots, user_text, confidence)

    # -------- Private Helper Methods --------

    def _latest_user_text(self, messages: Sequence[Dict[str, str]]) -> str:
        """Extracts content from the most recent user message."""
        for message in reversed(messages or []):
            if message.get("role") == "user":
                return (message.get("content") or "").strip()
        return ""

    def _is_smalltalk(self, text: str) -> bool:
        """Determines if the text is likely small talk."""
        if len(text.split()) <= 4:
            for pattern in self.SMALLTALK_PATTERNS:
                if pattern.search(text):
                    return True
        return False

    def _extract_all_slots(self, text: str, known_device_names: Sequence[str]) -> ParsedSlots:
        """Parses the text to fill all possible slots."""
        time_params = self._parse_time_range(text)
        devices = self._extract_devices(text, known_device_names)
        rank = self._extract_rank(text)
        return ParsedSlots(time=time_params, devices=devices, rank=rank)

    def _extract_rank(self, text: str) -> Optional[str]:
        """Extracts 'highest' or 'lowest' ranking keywords."""
        if any(word in text for word in self.RANK_HIGH):
            return "highest"
        if any(word in text for word in self.RANK_LOW):
            return "lowest"
        return None

    def _extract_devices(self, text: str, known_device_names: Sequence[str]) -> List[str]:
        """
        Extracts device names from text, prioritizing known device names.
        Uses word boundaries to prevent partial matches.
        """
        found_devices = set()
        
        # 1. Match against known device names from the database first
        # This is more precise. We sort by length to match longer names first ("Living Room AC" vs "AC")
        sorted_known_names = sorted(known_device_names, key=len, reverse=True)
        for name in sorted_known_names:
            # Use word boundaries to ensure we match whole words/phrases
            pattern = re.compile(r"\b" + re.escape(name.lower()) + r"\b")
            if pattern.search(text):
                found_devices.add(name)

        # 2. For now, we rely on known device names. Synonym matching can be added here if needed.
        # Example: if not found_devices: ...

        return list(found_devices)

    def _parse_time_range(self, text: str) -> Optional[TimeRangeParams]:
        """Parses a time range expression from the text using pre-compiled regex."""
        now_local = datetime.now(self.local_tz)

        for label, pattern in self.TIME_REGEX_PATTERNS:
            match = pattern.search(text)
            if not match:
                continue

            if label == "today":
                start = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
                return self._to_utc_range("today", start, now_local, "hour")

            if label == "yesterday":
                yesterday = now_local - timedelta(days=1)
                start = yesterday.replace(hour=0, minute=0, second=0, microsecond=0)
                end = yesterday.replace(hour=23, minute=59, second=59, microsecond=999999)
                return self._to_utc_range("yesterday", start, end, "hour")
            
            if label == "this_week":
                # isoweekday(): Monday is 1 and Sunday is 7
                start = now_local - timedelta(days=now_local.isoweekday() - 1)
                start = start.replace(hour=0, minute=0, second=0, microsecond=0)
                return self._to_utc_range("this_week_so_far", start, now_local, "day")

            if label == "this_month":
                start = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                return self._to_utc_range("this_month_so_far", start, now_local, "day")

            if label in ("last_week", "last_7_days"):
                start = now_local - timedelta(days=7)
                return self._to_utc_range("last_7_days", start, now_local, "day")

            if label == "relative_time":
                n = int(match.group(2))
                unit = match.group(3).rstrip('s')
                
                delta_map = {
                    "minute": timedelta(minutes=n),
                    "hour": timedelta(hours=n),
                    "day": timedelta(days=n),
                    "week": timedelta(weeks=n),
                    "month": timedelta(days=30 * n),  # Approximation
                }
                granularity_map = {"minute": "minute", "hour": "hour"}

                start = now_local - delta_map[unit]
                granularity = granularity_map.get(unit, "day")
                
                return self._to_utc_range(f"last_{n}_{unit}s", start, now_local, granularity)

        return None

    def _to_utc_range(
        self, label: str, start_local: datetime, end_local: datetime, granularity: str
    ) -> TimeRangeParams:
        """Converts local start/end datetimes to a UTC TimeRangeParams object."""
        return TimeRangeParams(
            label=label,
            start_utc=start_local.astimezone(timezone.utc),
            end_utc=end_local.astimezone(timezone.utc),
            granularity=granularity,
        )