# backend/app/ai/orchestrator.py
"""
Lean, deterministic orchestrator for routing user queries.

- Routes to ENERGY, SMALLTALK, SUMMARY, or GENERAL intents without LLM calls.
- Extracts key entities: time range, device candidates, and ranking.
- Prioritizes speed, predictability, and being provider-agnostic.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, timezone
from enum import Enum
import logging
from typing import Any, Dict, List, Optional, Sequence, Tuple

from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

# -------- Public Data Structures --------


class RouteIntent(str, Enum):
    """Enumeration for the classified intent of a user query."""

    ENERGY = "energy"
    SMALLTALK = "smalltalk"
    GENERAL = "general"
    SUMMARY = "summary"
    UNSURE = "unsure"

# NEW: Enum for explicit energy query types
class EnergyQueryType(str, Enum):
    TOTAL_USAGE = "total_usage"
    DEVICE_USAGE = "device_usage"
    RANKED_DEVICES = "ranked_devices"
    UNKNOWN_ENERGY_QUERY = "unknown_energy_query"


@dataclass
class TimeRangeParams:
    """Represents a parsed time range with UTC start/end and granularity."""

    label: str
    start_utc: datetime
    end_utc: datetime
    granularity: str  # "minute" | "hour" | "day"
    defaulted: bool = False # NEW: Flag to indicate if this time was defaulted by orchestrator


@dataclass
class ParsedSlots:
    """Holds all entities extracted from the user query."""

    time: Optional[TimeRangeParams] = None
    devices: List[str] = field(default_factory=list)
    rank: Optional[str] = None      # "highest" | "lowest"
    rank_num: Optional[int] = None  # Stores the specific rank number (1, 2, 3...)
    summary_request: bool = False   # Flag for summary intent
    
    # NEW: Explicit classification of energy query type
    energy_query_type: Optional[EnergyQueryType] = None 

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

    # Expanded ENERGY_TERMS to catch more implicit energy questions
    ENERGY_TERMS = {
        "energy", "usage", "consumption", "power", "kwh", "kilowatt", "watt", "bill", "cost",
        "how much", "what did", "what was", "used", "burn", "spend"
    }
    TIME_TERMS = { 
        "today", "yesterday", "week", "month", "hour", "day", "minute", "past", "last", "this"
    }
    RANK_HIGH = {"highest", "top", "most", "max", "biggest"}
    RANK_LOW = {"lowest", "least", "min", "smallest"}

    SUMMARY_TERMS = {
        "summary", "recap", "tell me about", "overview", "what have we discussed", "what did we talk about"
    }

    SMALLTALK_PATTERNS = [
        re.compile(r"^\s*(hi|hello|hey|yo)\b.*$", re.IGNORECASE),
        re.compile(r"\b(good\s*(morning|afternoon|evening)|how are you|what'?s up)\b", re.IGNORECASE),
    ]

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
        Priority: Smalltalk -> Summary -> Energy -> General.

        Args:
            messages: A sequence of message dictionaries.
            known_device_names: A list of device names from the database.

        Returns:
            A Decision object containing the routing intent and parsed data.
        """
        user_text = self._latest_user_text(messages)
        if not user_text:
            return Decision(RouteIntent.UNSURE, ParsedSlots(), "", 0.0)

        lower_text = user_text.lower()

        # 1. Smalltalk has highest priority
        if self._is_smalltalk(lower_text):
            return Decision(RouteIntent.SMALLTALK, ParsedSlots(), user_text, 0.95)

        # 2. Extract raw slots
        # _extract_all_slots now also sets energy_query_type based on initial parsing
        slots = self._extract_all_slots(lower_text, known_device_names or [])

        # 3. Handle Summary intent (deterministic)
        if slots.summary_request:
            logger.info(f"Orchestrator identified SUMMARY intent for user: '{user_text}'")
            return Decision(RouteIntent.SUMMARY, slots, user_text, 0.9)

        # 4. Handle Energy intent
        # The key here is to use `slots.energy_query_type` set by `_extract_all_slots`
        # or other general energy triggers.
        if slots.energy_query_type: # If _extract_all_slots already classified it as an energy query type
            confidence = 0.95 # High confidence if a specific energy query type was identified
            logger.debug(f"Orchestrator identified specific ENERGY Query Type: {slots.energy_query_type}. Slots: {asdict(slots)}")
            return Decision(RouteIntent.ENERGY, slots, user_text, confidence)
        
        # General energy trigger (e.g. "how about for last 3 days?" or "how much?")
        # This is for cases where it's clearly energy-related but didn't fit a specific type yet.
        is_general_energy_trigger = (
            any(term in lower_text for term in self.ENERGY_TERMS) or
            any(phrase in lower_text for phrase in ["how much", "what did", "what was", "what is", "how about"]) and 
            (slots.time is not None or bool(slots.devices))
        )

        if is_general_energy_trigger:
            # If it's a general energy trigger but no specific type was identified, default to TOTAL_USAGE
            if slots.energy_query_type is None: # This should now set the type for queries like "energy used last 3 days?"
                slots.energy_query_type = EnergyQueryType.TOTAL_USAGE
                confidence = 0.85 # Slightly lower confidence for inferred total usage
                logger.debug(f"Orchestrator inferred TOTAL_USAGE for general energy query. Slots: {asdict(slots)}")
            
            # Orchestrator does NOT default time anymore here if it was not explicitly parsed.
            # AIService will handle clarification or defaulting if needed.
            
            return Decision(RouteIntent.ENERGY, slots, user_text, confidence)

        # 5. Default to General if no specific intent matched
        logger.debug(f"Orchestrator routed to GENERAL intent for user: '{user_text}'.")
        return Decision(RouteIntent.GENERAL, slots, user_text, 0.5)

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
        """
        Parses the text to fill all possible slots and determines an initial energy_query_type.
        """
        time_params = self._parse_time_range(text)
        devices = self._extract_devices(text, known_device_names)
        rank_type, rank_num = self._extract_rank(text) 
        summary_req = self._is_summary_request(text)
        
        # Determine initial energy_query_type based on explicit parsing.
        initial_energy_query_type: Optional[EnergyQueryType] = None
        if rank_type is not None or rank_num is not None:
            initial_energy_query_type = EnergyQueryType.RANKED_DEVICES
        elif bool(devices): # If devices are mentioned without rank
            initial_energy_query_type = EnergyQueryType.DEVICE_USAGE
        elif any(term in text for term in self.ENERGY_TERMS): # If energy terms but no device/rank, it's total
             initial_energy_query_type = EnergyQueryType.TOTAL_USAGE

        return ParsedSlots(
            time=time_params, 
            devices=devices, 
            rank=rank_type, 
            rank_num=rank_num, 
            summary_request=summary_req,
            energy_query_type=initial_energy_query_type # Populate this in extraction
        )

    def _extract_rank(self, text: str) -> Tuple[Optional[str], Optional[int]]:
        """
        Extracts 'highest' or 'lowest' ranking keywords and their numerical position.
        This is now much stricter to avoid misinterpreting numbers from values (like "168.25 kWh").
        
        Returns:
            Tuple[rank_type: "highest" | "lowest" | None, rank_number: int | None]
        """
        rank_type = None
        rank_num = None

        # 1. Detect explicit rank type (e.g., "highest", "lowest", "top", "least", "most")
        # Use regex to avoid matching "top" in "laptop"
        if re.search(r'\b(highest|top|most)\b', text, re.IGNORECASE):
            rank_type = "highest"
        elif re.search(r'\b(lowest|least)\b', text, re.IGNORECASE):
            rank_type = "lowest"
        
        # 2. Detect numerical rank (1st, 2nd, etc.) ONLY when directly preceding a rank-indicating word.
        # This prevents "168.25 kWh" from being parsed as a rank.
        # It looks for ordinals/numbers directly followed by 'highest'/'lowest'/'top'/'most'/'least'/'device'/'consumer'/'usage'.
        combined_rank_pattern = re.compile(
            r'\b(?:(first|1st)|(second|2nd)|(third|3rd)|(fourth|4th)|(fifth|5th)|(\d+)(?:st|nd|rd|th)?)\s+(?:highest|lowest|top|most|least|device|consumer|usage|burner)\b',
            re.IGNORECASE
        )
        match_combined = combined_rank_pattern.search(text)

        if match_combined:
            if match_combined.group(1): rank_num = 1
            elif match_combined.group(2): rank_num = 2
            elif match_combined.group(3): rank_num = 3
            elif match_combined.group(4): rank_num = 4
            elif match_combined.group(5): rank_num = 5
            elif match_combined.group(6): rank_num = int(match_combined.group(6))
            
            # If a number was found via combined pattern, ensure rank_type is set.
            if rank_type is None: 
                # Infer rank_type based on surrounding words in the match if not explicitly set
                if any(kw in match_combined.group(0).lower() for kw in ["top", "most", "highest", "device", "consumer", "usage"]):
                    rank_type = "highest"
                elif any(kw in match_combined.group(0).lower() for kw in ["least", "lowest"]):
                    rank_type = "lowest"
                else: 
                    rank_type = "highest" # Default to highest if ordinal found but no clear high/low context (e.g., "2nd device")

        # If a rank type (highest/lowest) is detected from explicit terms, but no specific number, assume 1st
        if rank_type is not None and rank_num is None:
            rank_num = 1 
        
        logger.debug(f"Rank extracted: type={rank_type}, num={rank_num} from text: '{text}'")
        return rank_type, rank_num


    def _extract_devices(self, text: str, known_device_names: Sequence[str]) -> List[str]:
        """
        Extracts device names from text, prioritizing known device names.
        Uses word boundaries to prevent partial matches.
        """
        found_devices = set()
        lower_text = text.lower() # Convert input text to lower case once.

        # Create a mapping of lowercased full names and potential short forms to their original full names
        # This will include mappings like "living room ac" -> "Living Room AC", "ac" -> "Living Room AC", etc.
        device_alias_map: Dict[str, str] = {}
        for original_name in known_device_names:
            lower_original_name = original_name.lower()
            device_alias_map[lower_original_name] = original_name # Map full name to itself
            
            # Add common short forms/aliases to the map pointing to the original full name
            # Make sure these are generic enough not to clash with other device types (e.g. "light" vs "bedroom light")
            if "ac" in lower_original_name:
                device_alias_map["ac"] = original_name
            if "heater" in lower_original_name:
                device_alias_map["heater"] = original_name
            if "fridge" in lower_original_name:
                device_alias_map["fridge"] = original_name
            if "pc" in lower_original_name:
                device_alias_map["pc"] = original_name
            if "light" in lower_original_name and "bedroom light" in lower_original_name: # Be specific for "light"
                device_alias_map["light"] = original_name
            elif "light" in lower_original_name: # Handle generic "light" if it's the only one
                count_generic_light = sum(1 for n in known_device_names if "light" in n.lower())
                if count_generic_light == 1:
                    device_alias_map["light"] = original_name


        # Sort longer keys first to ensure phrases like "living room ac" are matched before "ac"
        # and to prevent partial matches like "room" from "living room ac" if "room" isn't a device.
        sorted_keys = sorted(device_alias_map.keys(), key=len, reverse=True)

        for alias_key in sorted_keys:
            # Use word boundaries (\b) for precise matching of whole words/phrases (e.g., "\bac\b" will match "AC" but not "back")
            pattern = re.compile(r"\b" + re.escape(alias_key) + r"\b")
            if pattern.search(lower_text):
                found_devices.add(device_alias_map[alias_key]) # Add the original, canonical full name

        logger.debug(f"Devices extracted: {list(found_devices)} from text: '{text}'") # ADDED LOG
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

    def _is_summary_request(self, text: str) -> bool:
        """Detects if the user is asking for a summary/recap."""
        return any(term in text for term in self.SUMMARY_TERMS)


    def _to_utc_range(
        self, label: str, start_local: datetime, end_local: datetime, granularity: str, defaulted: bool = False # NEW: Added defaulted param
    ) -> TimeRangeParams:
        """Converts local start/end datetimes to a UTC TimeRangeParams object."""
        return TimeRangeParams(
            label=label,
            start_utc=start_local.astimezone(timezone.utc),
            end_utc=end_local.astimezone(timezone.utc),
            granularity=granularity,
            defaulted=defaulted # NEW: Assign defaulted
        )