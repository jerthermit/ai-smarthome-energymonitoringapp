# backend/app/ai/orchestrator.py
"""
Lean, deterministic orchestrator:
- Routes to ENERGY / SMALLTALK / GENERAL without calling the LLM.
- Extracts time range (UTC), device candidates, and rank (highest/lowest).
- Keeps logic fast and predictable for production-ish performance.

This file is provider-agnostic. No network calls here.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, List, Optional, Sequence
from enum import Enum
from zoneinfo import ZoneInfo


# -------- Public enums / dataclasses expected by service.py --------

class RouteIntent(str, Enum):
    ENERGY = "energy"
    SMALLTALK = "smalltalk"
    GENERAL = "general"


@dataclass
class TimeRangeParams:
    label: str
    start_utc: Optional[datetime]
    end_utc: Optional[datetime]
    granularity: str  # "minute" | "hour" | "day"


@dataclass
class ParsedSlots:
    time: Optional[TimeRangeParams] = None
    devices: List[str] = field(default_factory=list)
    rank: Optional[str] = None              # "highest" | "lowest" | None
    needs_clarification: bool = False
    clarifying_question: Optional[str] = None


@dataclass
class Decision:
    intent: RouteIntent
    parsed: ParsedSlots
    user_text: str
    confidence: float


# -------- Orchestrator implementation --------

class Orchestrator:
    ENERGY_TERMS = {
        "energy", "usage", "consumption", "power", "kwh", "kilowatt", "watt", "bill", "cost"
    }
    TIME_TERMS = {
        "today", "yesterday", "week", "month", "hour", "hours", "days", "past", "last", "this"
    }
    RANK_HIGH = {"highest", "top", "most", "max"}
    RANK_LOW = {"lowest", "least", "min"}

    # light smalltalk detector (no DB/LLM)
    SMALLTALK_PATTERNS = [
        r"^\s*hi\b.*$",
        r"^\s*hello\b.*$",
        r"^\s*hey\b.*$",
        r"^\s*yo\b.*$",
        r"\bgood\s*(morning|afternoon|evening)\b",
        r"\bhow are you\b",
        r"\bwhat'?s up\b",
    ]

    # basic device synonyms to help when there are no known device names
    DEVICE_SYNONYMS = {
        "ac": ["ac", "aircon", "air con", "air conditioner", "a/c"],
        "heater": ["heater", "water heater", "boiler"],
        "fridge": ["fridge", "refrigerator"],
        "light": ["light", "lights", "bulb", "lamp"],
        "tv": ["tv", "television"],
        "pc": ["pc", "computer", "desktop"],
        "fan": ["fan", "ceiling fan", "stand fan"],
        "washer": ["washer", "washing machine"],
        "dryer": ["dryer"],
        "dishwasher": ["dishwasher"],
    }

    def __init__(self, ai_provider: Any = None, local_tz: str = "Asia/Singapore"):
        # ai_provider is accepted for API compatibility; not used in this lean version.
        self.local_tz = ZoneInfo(local_tz)

    # -------- Public API --------

    async def decide(
        self,
        messages: Sequence[Any],
        known_device_names: Optional[Sequence[str]] = None,
    ) -> Decision:
        user_text = self._latest_user_text(messages).strip()
        t = user_text.lower()

        # Smalltalk (short and no energy cues)
        if self._is_smalltalk(t):
            return Decision(
                intent=RouteIntent.SMALLTALK,
                parsed=ParsedSlots(),
                user_text=user_text,
                confidence=0.9,
            )

        # Try ENERGY detection
        parsed = ParsedSlots()
        has_energy_word = any(w in t for w in self.ENERGY_TERMS)
        has_time_hint = self._contains_time_hint(t)
        device_candidates = self._extract_devices(t, known_device_names or [])
        rank = self._extract_rank(t)
        time_params = self._parse_time_range(t)

        if (has_energy_word or device_candidates) and (has_time_hint or time_params is not None):
            parsed.devices = device_candidates
            parsed.rank = rank
            parsed.time = time_params or self._default_time_range()  # if vague "this" etc.
            # confidence high if both device/energy and explicit time present
            conf = 0.85 if time_params else 0.7
            # if still no explicit time, nudge once
            if time_params is None:
                parsed.needs_clarification = True
                parsed.clarifying_question = "Use today or the last 7 days?"
            return Decision(
                intent=RouteIntent.ENERGY,
                parsed=parsed,
                user_text=user_text,
                confidence=conf,
            )

        # Explicit device query like "top device" without energy word but with time
        if (rank is not None) and (time_params is not None or "today" in t or "yesterday" in t):
            parsed.devices = device_candidates
            parsed.rank = rank
            parsed.time = time_params or self._default_time_range()
            return Decision(
                intent=RouteIntent.ENERGY,
                parsed=parsed,
                user_text=user_text,
                confidence=0.8,
            )

        # Generic but mentions time and "device" → treat as energy
        if ("device" in t or "devices" in t) and has_time_hint:
            parsed.devices = device_candidates
            parsed.time = time_params or self._default_time_range()
            return Decision(
                intent=RouteIntent.ENERGY,
                parsed=parsed,
                user_text=user_text,
                confidence=0.7,
            )

        # Otherwise GENERAL
        return Decision(
            intent=RouteIntent.GENERAL,
            parsed=ParsedSlots(),
            user_text=user_text,
            confidence=0.5,
        )

    # -------- Helpers --------

    def _latest_user_text(self, messages: Sequence[Any]) -> str:
        for m in reversed(messages or []):
            if getattr(m, "role", None) == "user":
                return getattr(m, "content", "") or ""
        return ""

    def _is_smalltalk(self, text: str) -> bool:
        if not text:
            return False
        for pat in self.SMALLTALK_PATTERNS:
            if re.search(pat, text):
                return True
        # Very short, no energy cues
        if len(text.split()) <= 3 and not any(w in text for w in self.ENERGY_TERMS):
            return True
        return False

    def _contains_time_hint(self, text: str) -> bool:
        return any(k in text for k in self.TIME_TERMS) or bool(
            re.search(r"\b(last|past)\s*\d+\s*(minutes?|hours?|days?|weeks?|months?)\b", text)
        )

    def _extract_rank(self, text: str) -> Optional[str]:
        if any(w in text for w in self.RANK_HIGH):
            return "highest"
        if any(w in text for w in self.RANK_LOW):
            return "lowest"
        return None

    def _extract_devices(self, text: str, known_device_names: Sequence[str]) -> List[str]:
        # 1) Exact substring matches for known device names
        devices = []
        text_l = text.lower()
        for name in known_device_names:
            n = (name or "").strip()
            if not n:
                continue
            if n.lower() in text_l:
                devices.append(n)

        # 2) Synonym matches if none found
        if not devices:
            for canon, syns in self.DEVICE_SYNONYMS.items():
                for s in syns:
                    if s in text_l:
                        devices.append(canon)
                        break
        # dedupe, preserve order
        seen = set()
        uniq = []
        for d in devices:
            dl = d.lower()
            if dl not in seen:
                uniq.append(d)
                seen.add(dl)
        return uniq

    def _default_time_range(self) -> TimeRangeParams:
        # last 7 days, local tz → UTC
        now_local = datetime.now(self.local_tz)
        start_local = now_local - timedelta(days=7)
        return self._to_utc_range("last_7_days", start_local, now_local, "day")

    def _parse_time_range(self, text: str) -> Optional[TimeRangeParams]:
        t = text
        now_local = datetime.now(self.local_tz)

        # today
        if re.search(r"\btoday\b", t):
            start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
            return self._to_utc_range("today", start_local, now_local, "hour")

        # yesterday
        if re.search(r"\byesterday\b", t):
            y = (now_local - timedelta(days=1))
            start_local = y.replace(hour=0, minute=0, second=0, microsecond=0)
            end_local = y.replace(hour=23, minute=59, second=59, microsecond=999999)
            return self._to_utc_range("yesterday", start_local, end_local, "hour")

        # this week (so far, Monday-based)
        if re.search(r"\b(this|the)\s+week\b", t):
            weekday = (now_local.weekday() + 6) % 7  # Monday=0
            start_local = (now_local - timedelta(days=weekday)).replace(hour=0, minute=0, second=0, microsecond=0)
            return self._to_utc_range("this_week_so_far", start_local, now_local, "day")

        # this month (so far)
        if re.search(r"\b(this|the)\s+month\b", t):
            start_local = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            return self._to_utc_range("this_month_so_far", start_local, now_local, "day")

        # last / past week OR last / past 7 days
        if re.search(r"\b(past|last)\s+week\b", t) or re.search(r"\b(last|past)\s*7\s*days\b", t):
            start_local = now_local - timedelta(days=7)
            return self._to_utc_range("last_week", start_local, now_local, "day")

        # last|past N minutes/hours/days/weeks/months
        m = re.search(r"\b(last|past)\s*(\d+)\s*(minutes?|hours?|days?|weeks?|months?)\b", t)
        if m:
            n = int(m.group(2))
            unit = m.group(3)
            if "minute" in unit:
                start_local = now_local - timedelta(minutes=n)
                gran = "minute"
            elif "hour" in unit:
                start_local = now_local - timedelta(hours=n)
                gran = "hour"
            elif "day" in unit:
                start_local = now_local - timedelta(days=n)
                gran = "day"
            elif "week" in unit:
                start_local = now_local - timedelta(weeks=n)
                gran = "day"
            else:
                # months → approximate as 30 * n days
                start_local = now_local - timedelta(days=30 * n)
                gran = "day"
            return self._to_utc_range(f"last_{n}_{unit}", start_local, now_local, gran)

        return None

    def _to_utc_range(
        self,
        label: str,
        start_local: datetime,
        end_local: datetime,
        granularity: str,
    ) -> TimeRangeParams:
        start_utc = start_local.astimezone(timezone.utc)
        end_utc = end_local.astimezone(timezone.utc)
        return TimeRangeParams(label=label, start_utc=start_utc, end_utc=end_utc, granularity=granularity)