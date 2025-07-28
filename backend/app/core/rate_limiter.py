# backend/app/core/rate_limiter.py
"""
Simple in-process rate limiter (per user) for requests/minute and tokens/minute.

Notes
- Uses a 60s fixed window per user (not sliding). Good enough for dev/single-process.
- Thread-safe within one process via threading.Lock.
- If you run multiple workers/processes, switch to Redis or another shared store.
"""

from __future__ import annotations

import time
import threading
from dataclasses import dataclass
from typing import Dict, Optional

from app.core.config import settings


@dataclass
class _Counters:
    window_start_minute: int  # unix_time // 60
    requests: int
    tokens: int


class RateLimiter:
    _instance: Optional["RateLimiter"] = None
    _lock = threading.Lock()

    def __init__(self, requests_per_minute: int, tokens_per_minute: int) -> None:
        self.requests_per_minute = max(1, int(requests_per_minute))
        self.tokens_per_minute = max(1, int(tokens_per_minute))
        self._users: Dict[int, _Counters] = {}
        self._users_lock = threading.Lock()

    @classmethod
    def get_instance(cls) -> "RateLimiter":
        # Double-checked locking to avoid recreating
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = RateLimiter(
                        requests_per_minute=settings.RATE_LIMIT_REQUESTS_PER_MINUTE,
                        tokens_per_minute=settings.RATE_LIMIT_TOKENS_PER_MINUTE,
                    )
        return cls._instance

    def _current_minute(self) -> int:
        return int(time.time() // 60)

    def _get_user_counters(self, user_id: int) -> _Counters:
        now_min = self._current_minute()
        with self._users_lock:
            c = self._users.get(user_id)
            if c is None or c.window_start_minute != now_min:
                c = _Counters(window_start_minute=now_min, requests=0, tokens=0)
                self._users[user_id] = c
            return c

    def allow_request(self, user_id: int, requested_tokens: int = 0) -> bool:
        """
        Reserve capacity for a request. Returns True if allowed, False otherwise.
        Increments counters immediately when allowed to avoid race bursts.
        """
        requested_tokens = max(0, int(requested_tokens))
        c = self._get_user_counters(user_id)

        with self._users_lock:
            # Refresh after lock in case window rolled while waiting
            now_min = self._current_minute()
            if c.window_start_minute != now_min:
                c.window_start_minute = now_min
                c.requests = 0
                c.tokens = 0

            # Check limits
            if c.requests + 1 > self.requests_per_minute:
                return False
            if c.tokens + requested_tokens > self.tokens_per_minute:
                return False

            # Reserve
            c.requests += 1
            c.tokens += requested_tokens
            return True

    def add_usage(self, user_id: int, actual_tokens: int, allocated_tokens: int = 0) -> None:
        """
        Optionally adjust token usage after an LLM call if actual != allocated.
        Won’t go negative; won’t exceed the minute window cap.
        """
        actual = max(0, int(actual_tokens))
        allocated = max(0, int(allocated_tokens))

        if actual == allocated:
            return

        delta = actual - allocated
        if delta == 0:
            return

        c = self._get_user_counters(user_id)
        with self._users_lock:
            now_min = self._current_minute()
            if c.window_start_minute != now_min:
                c.window_start_minute = now_min
                c.requests = 0
                c.tokens = 0

            new_tokens = c.tokens + delta
            # Clamp between 0 and tokens_per_minute
            if new_tokens < 0:
                new_tokens = 0
            elif new_tokens > self.tokens_per_minute:
                new_tokens = self.tokens_per_minute
            c.tokens = new_tokens