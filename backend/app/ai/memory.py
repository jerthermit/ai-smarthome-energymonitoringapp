# backend/app/ai/memory.py
"""
Lightweight, in-process conversational memory utilities.

Provides:
- FollowUpMemory: short-lived ENERGY context (devices/rank/last intent) with TTL.
- RecapMemory: rolling recap lines for deterministic "what have we discussed?" replies.
- ChatHistoryBuffer: small window of recent messages for NON-ENERGY LLM prompts.

Notes:
- In-process (cleared on restart). For multi-worker, back with Redis later.
- Minimal locking needs; FastAPI single worker is fine for the coding challenge.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, List, Optional, Tuple

# Required for type hinting FollowUpState.time_context
from app.ai.orchestrator import TimeRangeParams 


# NEW: Data structure for a ranked device in memory
@dataclass
class RankedDevice:
    device_id: str
    kwh: float
    name: Optional[str] = None # Added name for easier use

# -------------------------- Follow-up state --------------------------

@dataclass
class FollowUpState:
    ts: float
    intent: str                          # "usage" | "rank" | etc.
    devices: List[str] = field(default_factory=list)
    rank: Optional[str] = None           # "highest" | "lowest" | None
    rank_num: Optional[int] = None       # Added rank_num to FollowUpState
    # NEW: Store the list of ranked devices
    ranked_devices: List[RankedDevice] = field(default_factory=list)
    time_context: Optional[TimeRangeParams] = None # CHANGED: Renamed 'time' to 'time_context'


class FollowUpMemory:
    """
    Short-lived memory for ENERGY follow-ups ("yesterday?", "past 3 days?").
    Stores minimal slots from the last answered ENERGY query per user.
    """

    def __init__(self, ttl_seconds: int = 120):
        self.ttl = max(5, int(ttl_seconds))
        self._store: Dict[int, FollowUpState] = {}

    def set_state(
        self,
        user_id: int,
        intent: str,
        devices: List[str],
        rank: Optional[str],
        rank_num: Optional[int], # Added rank_num parameter
        ranked_devices: Optional[List[RankedDevice]] = None,
        time_context: Optional[TimeRangeParams] = None 
    ) -> None:
        self._store[user_id] = FollowUpState(
            ts=time.time(), 
            intent=intent,
            devices=list(devices or []),
            rank=rank,
            rank_num=rank_num,
            ranked_devices=list(ranked_devices or []), # Ensure a copy is stored
            time_context=time_context 
        )

    def get_if_fresh(self, user_id: int) -> Optional[FollowUpState]:
        st = self._store.get(user_id)
        if not st:
            return None
        if time.time() - st.ts > self.ttl:
            self._store.pop(user_id, None)
            return None
        return st

    def clear(self, user_id: int) -> None:
        self._store.pop(user_id, None)


# -------------------------- Recap memory --------------------------

class RecapMemory:
    """
    Rolling recap per user. Keep concise, human-readable lines.
    Example lines:
      - "Checked usage: AC, last_week"
      - "Top device today: Water Heater"
    """

    def __init__(self, max_lines: int = 12):
        self.max_lines = max(4, int(max_lines))
        self._store: Dict[int, Deque[str]] = {}

    def add_line(self, user_id: int, line: str) -> None:
        q = self._store.setdefault(user_id, deque(maxlen=self.max_lines))
        s = (line or "").strip()
        if not s:
            return
        # avoid consecutive duplicates
        if len(q) == 0 or q[-1] != s:
            q.append(s)

    def get_recap(self, user_id: int) -> str:
        q = self._store.get(user_id)
        if not q:
            return "No prior discussion yet."
        return "So far:\n- " + "\n- ".join(q)

    def clear(self, user_id: int) -> None:
        self._store.pop(user_id, None)


# -------------------------- Chat window --------------------------

@dataclass
class ChatMsg:
    role: str
    content: str


class ChatHistoryBuffer:
    """
    Small sliding window of recent messages (user/assistant) per user.
    Used ONLY for NON-ENERGY LLM prompts to maintain coherence cheaply.
    """

    def __init__(self, max_messages: int = 8):
        # max_messages counts individual messages (not pairs)
        self.max_messages = max(4, int(max_messages))
        self._store: Dict[int, Deque[ChatMsg]] = {}

    def add(self, user_id: int, role: str, content: str) -> None:
        if not content:
            return
        q = self._store.setdefault(user_id, deque(maxlen=self.max_messages))
        q.append(ChatMsg(role=role, content=content))

    def window(self, user_id: int, take: Optional[int] = None) -> List[Dict[str, str]]:
        q = self._store.get(user_id)
        if not q:
            return []
        k = min(len(q), int(take) if take else self.max_messages)
        return [{"role": m.role, "content": m.content} for m in list(q)[-k:]]

    def clear(self, user_id: int) -> None:
        self._store.pop(user_id, None)


# -------------------------- Singleton facade --------------------------

class MemoryManager:
    """
    Convenience facade to access all memory types.
    """

    _instance: Optional["MemoryManager"] = None

    def __init__(self):
        self.followups = FollowUpMemory(ttl_seconds=120)
        self.recap = RecapMemory(max_lines=12)
        self.history = ChatHistoryBuffer(max_messages=8)

    @classmethod
    def instance(cls) -> "MemoryManager":
        if cls._instance is None:
            cls._instance = MemoryManager()
        return cls._instance


# -------------------------- Tiny helpers --------------------------

TIME_FOLLOWUP_PAT = r"\b(yesterday|today|tonight|now|this week|this month|past\s+\d+\s+(minutes?|hours?|days?|weeks?|months?)|last\s+\d+\s+(minutes?|hours?|days?|weeks?|months?)|last week|past week|last 7 days|past 7 days)\b"

def is_time_only_followup(text: str) -> bool:
    """
    True if the text looks like a time refinement without specifying devices/energy explicitly.
    """
    if not text:
        return False
    t = text.lower()
    has_time = bool(__import__("re").search(TIME_FOLLOWUP_PAT, t))
    has_energy_words = any(w in t for w in ["energy", "usage", "consumption", "kwh", "power"])
    has_device_words = any(w in t for w in ["device", "devices", "ac", "aircon", "heater", "fridge", "light", "tv", "pc", "fan"])
    # treat as time-only if time present and no explicit energy/device words
    return has_time and not (has_energy_words or has_device_words)