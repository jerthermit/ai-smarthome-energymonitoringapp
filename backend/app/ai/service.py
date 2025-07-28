# backend/app/ai/service.py
"""
AI Service Layer.
- Orchestrator (deterministic parse + optional LLM structured extraction) for intent routing.
- Routes energy questions to deterministic code (EnergyQueryProcessor).
- Other prompts go to the LLM with a minimal prompt.
- Known-device boosting (cached) for better NL parsing.
- Latency metrics on every response.
- Robust error wrapping so we always return a valid ChatResponse shape.
- NEW: Lightweight memory:
    * follow-up TTL for ENERGY (devices/rank),
    * rolling recap,
    * small chat window for GENERAL/SMALLTALK coherence.
"""

from __future__ import annotations

import logging
import re
import time
import uuid
from typing import Dict, Any, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from .providers import TogetherAIProvider
from .chat_schemas import ChatRequest, EnergyQueryResponse
from .energy_service import EnergyQueryProcessor
from .orchestrator import Orchestrator, RouteIntent
from .memory import MemoryManager, is_time_only_followup
from app.core.rate_limiter import RateLimiter

# For known device names
from app.telemetry.models import Device

logger = logging.getLogger(__name__)


class _DeviceNameCache:
    """Very small in-process cache for device names per user (TTL 60s)."""
    def __init__(self, ttl_seconds: int = 60):
        self.ttl = max(1, int(ttl_seconds))
        self._store: Dict[int, Tuple[float, List[str]]] = {}

    def get(self, db: Session, user_id: int) -> List[str]:
        now = time.time()
        entry = self._store.get(user_id)
        if entry and (now - entry[0] < self.ttl):
            return entry[1]

        names = [r[0] for r in db.query(Device.name).filter(Device.user_id == user_id).all()]
        uniq, seen = [], set()
        for n in names:
            s = (n or "").strip()
            if s and s.lower() not in seen:
                uniq.append(s)
                seen.add(s.lower())
        self._store[user_id] = (now, uniq)
        return uniq


def _latest_user_text(messages: List[Any]) -> str:
    for m in reversed(messages or []):
        if getattr(m, "role", None) == "user":
            return getattr(m, "content", "") or ""
    return ""


def _looks_like_recap_question(text: str) -> bool:
    t = (text or "").lower().strip()
    if not t:
        return False
    return bool(
        re.search(r"\b(what\s+have\s+we\s+(discussed|talked)\s+(so\s+far|today)?|recap|summary)\b", t)
    )


class AIService:
    """Service layer for AI operations with orchestrated routing + memory + metrics."""

    def __init__(self, db_session: Session):
        self.db_session = db_session
        self.provider = TogetherAIProvider()
        self.orchestrator = Orchestrator(ai_provider=self.provider, local_tz="Asia/Singapore")
        from app.ai.data.energy_repository import EnergyRepository
        self.energy_query_processor = EnergyQueryProcessor(
            ai_provider=self.provider,
            energy_repo=EnergyRepository(db_session)
        )
        self._device_cache = _DeviceNameCache(ttl_seconds=60)
        self.mem = MemoryManager.instance()

    async def chat(self, user_id: int, request: ChatRequest) -> Dict[str, Any]:
        limiter = RateLimiter.get_instance()
        t0 = time.perf_counter()

        # Pull latest user text early (used by memory and recap)
        user_text = _latest_user_text(request.messages).strip()

        # Deterministic recap handler
        if _looks_like_recap_question(user_text):
            recap = self.mem.recap.get_recap(user_id)
            resp = self._simple_assistant_completion(recap)
            resp["metrics"] = self._metrics(branch="recap", start=t0)
            # track memory/history
            self.mem.history.add(user_id, "user", user_text)
            self.mem.history.add(user_id, "assistant", recap)
            return resp

        # Known devices (helps parse)
        try:
            known_devices = self._device_cache.get(self.db_session, user_id)
        except Exception:
            logger.warning("Device name fetch failed; continuing without known devices.", exc_info=True)
            known_devices = None

        # Decide route using orchestrator
        try:
            decision = await self.orchestrator.decide(
                messages=request.messages,
                known_device_names=known_devices
            )
        except Exception:
            logger.exception("Orchestrator failed; falling back to GENERAL minimal reply.")
            resp = self._simple_assistant_completion("Sorry, I had trouble understanding that. Try again?")
            resp["metrics"] = self._metrics(branch="orchestrator_error", start=t0)
            # history
            self.mem.history.add(user_id, "user", user_text)
            self.mem.history.add(user_id, "assistant", resp["choices"][0]["message"]["content"])
            return resp

        if not user_text:
            resp = self._simple_assistant_reply("Please type a message and try again.")
            resp["metrics"] = self._metrics(branch="empty", start=t0)
            # history
            self.mem.history.add(user_id, "assistant", resp["choices"][0]["message"]["content"])
            return resp

        # ---------------- Follow-up override ----------------
        # If the user asked a time-only follow-up, reuse prior ENERGY devices/rank.
        if is_time_only_followup(user_text):
            prev = self.mem.followups.get_if_fresh(user_id)
            if prev and decision.parsed and decision.parsed.time:
                # Force ENERGY with previous devices/rank
                decision.intent = RouteIntent.ENERGY
                # If no devices parsed, use previous
                if not decision.parsed.devices:
                    decision.parsed.devices = list(prev.devices or [])
                # If no rank parsed, reuse previous
                if not decision.parsed.rank:
                    decision.parsed.rank = prev.rank

        # Rate limit (allocate 0 tokens for deterministic energy branch)
        requested_tokens = 0 if decision.intent == RouteIntent.ENERGY else (request.max_tokens or 0)
        if not limiter.allow_request(user_id, requested_tokens):
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded")

        # ---------------- ENERGY ----------------
        if decision.intent == RouteIntent.ENERGY:
            try:
                # Deterministic execution using parsed slots
                model_response: EnergyQueryResponse = await self.energy_query_processor.process_with_params(
                    user_id=user_id,
                    user_query=user_text,
                    parsed={
                        "time": {
                            "label": (decision.parsed.time.label if decision.parsed.time else None),
                            "start_utc": (decision.parsed.time.start_utc.isoformat() if decision.parsed.time and decision.parsed.time.start_utc else None),
                            "end_utc": (decision.parsed.time.end_utc.isoformat() if decision.parsed.time and decision.parsed.time.end_utc else None),
                            "granularity": (decision.parsed.time.granularity if decision.parsed.time else None),
                        },
                        "devices": decision.parsed.devices,
                        "rank": decision.parsed.rank,
                    }
                )
                ed = model_response.model_dump()

                # Build response
                assistant_text = ed.get("summary", "")
                resp = {
                    "id": f"chatcmpl-energy-{uuid.uuid4().hex}",
                    "object": "chat.completion",
                    "created": int(time.time()),
                    "model": "energy-query-processor",
                    "choices": [{
                        "index": 0,
                        "message": {"role": "assistant", "content": assistant_text},
                        "finish_reason": "stop"
                    }],
                    "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
                    "energy_data": ed
                }
                resp["metrics"] = self._metrics(
                    branch="energy",
                    start=t0,
                    extra={"known_devices": len(known_devices or []), "parse_confidence": decision.confidence}
                )

                # ----- update memories -----
                # Follow-up memory: keep last ENERGY slots
                self.mem.followups.set_state(
                    user_id=user_id,
                    intent="rank" if decision.parsed.rank else "usage",
                    devices=(decision.parsed.devices or ["all"]),
                    rank=decision.parsed.rank
                )
                # Recap memory: append a concise line
                time_label = decision.parsed.time.label if decision.parsed.time else "custom"
                if decision.parsed.rank:
                    self.mem.recap.add_line(user_id, f"Top-{decision.parsed.rank} device for {time_label}")
                else:
                    dev_phrase = ", ".join(decision.parsed.devices) if decision.parsed.devices else "all"
                    self.mem.recap.add_line(user_id, f"Checked usage: {dev_phrase}, {time_label}")

                # Chat history
                self.mem.history.add(user_id, "user", user_text)
                self.mem.history.add(user_id, "assistant", assistant_text)

                return resp
            except Exception:
                logger.error("Energy flow failed", exc_info=True)
                resp = self._simple_assistant_completion(
                    "Sorry, I couldn't retrieve your energy data just now. Please try again."
                )
                resp["metrics"] = self._metrics(branch="energy_error", start=t0)
                # history
                self.mem.history.add(user_id, "user", user_text)
                self.mem.history.add(user_id, "assistant", resp["choices"][0]["message"]["content"])
                return resp

        # ---------------- SMALLTALK ----------------
        if decision.intent == RouteIntent.SMALLTALK:
            try:
                # Build short context window (helps coherence)
                ctx = self.mem.history.window(user_id, take=6)
                llm_messages = [{"role": "system", "content": (
                    "You are a concise, friendly assistant for a smart home energy app. "
                    "Respond very briefly to greetings/small talk."
                )}]
                llm_messages.extend(ctx)
                llm_messages.append({"role": "user", "content": user_text})

                provider_resp = await self.provider.chat_completion(
                    messages=llm_messages,
                    temperature=min(max(request.temperature, 0.0), 0.7),
                    max_tokens=min(max(request.max_tokens, 32), 96),
                )
            except Exception:
                logger.error("LLM smalltalk call failed", exc_info=True)
                provider_resp = {"error": "exception"}

            response = self._wrap_or_fallback(provider_resp, default_text="Hi! 👋")
            self._attach_metrics_and_track(limiter, user_id, request, response, t0, branch="smalltalk")

            # history
            self.mem.history.add(user_id, "user", user_text)
            try:
                assistant_text = response["choices"][0]["message"]["content"]
            except Exception:
                assistant_text = "Hi! 👋"
            self.mem.history.add(user_id, "assistant", assistant_text)

            return response

        # ---------------- GENERAL ----------------
        try:
            # Build short context window (helps coherence; cheap)
            ctx = self.mem.history.window(user_id, take=8)
            llm_messages = [
                {"role": "system", "content": (
                    "You are a concise, friendly assistant for a smart home energy app. "
                    "Keep responses brief and helpful. Do not invent data."
                )}
            ]
            llm_messages.extend(ctx)
            if decision.parsed.needs_clarification and decision.parsed.clarifying_question:
                llm_messages.append({
                    "role": "system",
                    "content": f"If needed, ask a single clarifying question: {decision.parsed.clarifying_question}"
                })
            llm_messages.append({"role": "user", "content": user_text})

            provider_resp = await self.provider.chat_completion(
                messages=llm_messages,
                temperature=min(max(request.temperature, 0.0), 1.0),
                max_tokens=min(max(request.max_tokens, 64), 256),
            )
        except Exception:
            logger.error("LLM general call failed", exc_info=True)
            provider_resp = {"error": "exception"}

        response = self._wrap_or_fallback(
            provider_resp,
            default_text="Sorry, I'm having trouble right now. Please try again in a few seconds."
        )
        self._attach_metrics_and_track(limiter, user_id, request, response, t0, branch="general")

        # history
        self.mem.history.add(user_id, "user", user_text)
        try:
            assistant_text = response["choices"][0]["message"]["content"]
        except Exception:
            assistant_text = "Okay."
        self.mem.history.add(user_id, "assistant", assistant_text)

        return response

    # ----------------- helpers -----------------

    def _wrap_or_fallback(self, provider_resp: Dict[str, Any], default_text: str) -> Dict[str, Any]:
        """
        Ensure we always return a ChatResponse-shaped dict, even if provider errored.
        """
        if not isinstance(provider_resp, dict) or ("error" in provider_resp):
            return self._simple_assistant_completion(default_text)

        # Check minimal shape
        if not all(k in provider_resp for k in ("id", "model", "choices", "usage")):
            return self._simple_assistant_completion(default_text)

        # Also ensure choices[0].message.content exists
        try:
            _ = provider_resp["choices"][0]["message"]["content"]
        except Exception:
            return self._simple_assistant_completion(default_text)

        return provider_resp

    def _metrics(self, branch: str, start: float, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        ms = int(round((time.perf_counter() - start) * 1000))
        m = {
            "branch": branch,
            "latency_ms": ms,
            "provider": "together",
            "model": getattr(self.provider, "model", None),
        }
        if extra:
            m.update(extra)
        return m

    def _attach_metrics_and_track(
        self,
        limiter: RateLimiter,
        user_id: int,
        request: ChatRequest,
        response: Dict[str, Any],
        start_t: float,
        branch: str
    ) -> None:
        # metrics
        try:
            response["metrics"] = self._metrics(branch=branch, start=start_t)
            usage = response.get("usage") or {}
            if isinstance(usage, dict):
                response["metrics"]["total_tokens"] = usage.get("total_tokens")
                response["metrics"]["prompt_tokens"] = usage.get("prompt_tokens")
                response["metrics"]["completion_tokens"] = usage.get("completion_tokens")
        except Exception:
            logger.debug("Failed to attach metrics", exc_info=True)

        # track tokens (if present)
        total_tokens = response.get("usage", {}).get("total_tokens")
        if isinstance(total_tokens, int):
            limiter.add_usage(
                user_id,
                actual_tokens=total_tokens,
                allocated_tokens=request.max_tokens
            )

    def _simple_assistant_completion(self, text: str) -> Dict[str, Any]:
        return {
            "id": f"chatcmpl-{uuid.uuid4().hex}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": "fallback",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": "stop"
            }],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        }

    def _simple_assistant_reply(self, text: str) -> Dict[str, Any]:
        return self._simple_assistant_completion(text)

    async def close(self) -> None:
        await self.provider.close()