# backend/app/ai/service.py
"""
AI Service Layer.
- Orchestrates intent routing using a deterministic orchestrator.
- Routes energy questions to a dedicated EnergyQueryProcessor.
- Handles small talk and general queries via an LLM provider.
- Caches known device names for performance.
- Includes latency metrics, robust error handling, and conversation memory.
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import asdict
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from .chat_schemas import ChatRequest, EnergyQueryResponse
from .energy_service import EnergyQueryProcessor
from .memory import MemoryManager, is_time_only_followup
from .orchestrator import Decision, Orchestrator, RouteIntent
from .providers.base import AIProvider
from .providers.together import TogetherAIProvider
from app.core.rate_limiter import RateLimiter
from app.telemetry.models import Device

logger = logging.getLogger(__name__)


class _DeviceNameCache:
    """A simple, in-memory cache for user-specific device names with a TTL."""
    def __init__(self, ttl_seconds: int = 120):
        self.ttl = ttl_seconds
        self._store: Dict[int, tuple[float, List[str]]] = {}

    def get(self, db: Session, user_id: int) -> List[str]:
        now = time.time()
        entry = self._store.get(user_id)
        if entry and (now - entry[0] < self.ttl):
            return entry[1]

        logger.debug(f"Device name cache miss for user_id: {user_id}. Fetching from DB.")
        query = db.query(Device.name).filter(Device.user_id == user_id)
        names = [row[0] for row in query.all() if row[0]]
        
        seen = set()
        unique_names = []
        for name in names:
            if name.lower() not in seen:
                seen.add(name.lower())
                unique_names.append(name)

        self._store[user_id] = (now, unique_names)
        return unique_names


class AIService:
    """Service layer for AI operations with orchestrated routing, memory, and metrics."""
    def __init__(self, db_session: Session):
        self.db_session = db_session
        self.provider: AIProvider = TogetherAIProvider()
        self.orchestrator = Orchestrator()
        
        from app.telemetry.service import get_user_devices
        self.energy_processor = EnergyQueryProcessor(db=db_session)
        self._device_cache = _DeviceNameCache()
        self.mem = MemoryManager.instance()

    async def chat(self, user_id: int, request: ChatRequest) -> Dict[str, Any]:
        t0 = time.perf_counter()
        limiter = RateLimiter.get_instance()
        user_text = request.latest_user_content()
        response: Dict[str, Any]

        try:
            if not user_text:
                response = self._simple_assistant_completion("Please type a message and try again.")
                response["metrics"] = self._metrics(branch="empty_input", start=t0)
                return response

            known_devices = self._device_cache.get(self.db_session, user_id)
            messages_as_dicts = [m.model_dump() for m in request.messages]
            decision = await self.orchestrator.decide(messages_as_dicts, known_devices)

            decision = self._handle_follow_up(user_id, user_text, decision)

            if decision.intent == RouteIntent.ENERGY:
                response = await self._handle_energy_intent(
                    user_id, decision, known_devices, limiter, t0, self.orchestrator.local_tz.key
                )
            elif decision.intent in (RouteIntent.SMALLTALK, RouteIntent.GENERAL, RouteIntent.UNSURE):
                response = await self._handle_llm_intent(user_id, request, decision, known_devices, limiter, t0)
            else:
                response = self._simple_assistant_completion("I'm not sure how to handle that.")
                response["metrics"] = self._metrics(branch="unhandled_intent", start=t0, extra={"intent": decision.intent})

        except HTTPException:
            raise
        except Exception:
            logger.exception("Core AI service chat flow failed. Providing a fallback response.")
            response = self._simple_assistant_completion("Sorry, I encountered an unexpected error. Please try again.")
            response["metrics"] = self._metrics(branch="service_error", start=t0)

        self._update_chat_history(user_id, user_text, response)
        
        return response

    def _handle_follow_up(self, user_id: int, user_text: str, decision: Decision) -> Decision:
        if is_time_only_followup(user_text):
            last_energy_context = self.mem.followups.get_if_fresh(user_id)
            if last_energy_context and decision.parsed.time:
                logger.info(f"Handling follow-up for user {user_id}. Reusing last context.")
                decision.intent = RouteIntent.ENERGY
                if not decision.parsed.devices:
                    decision.parsed.devices = last_energy_context.devices
                if not decision.parsed.rank:
                    decision.parsed.rank = last_energy_context.rank
        return decision

    async def _handle_energy_intent(
        self, user_id: int, decision: Decision, known_devices: List[str], limiter: RateLimiter, t0: float, local_tz: str
    ) -> Dict[str, Any]:
        if not limiter.allow_request(user_id, 0):
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded")

        try:
            energy_response = await self.energy_processor.process_with_params(
                user_id=user_id, 
                # --- FIX: Use asdict for dataclasses, not model_dump ---
                parsed=asdict(decision.parsed), 
                local_tz=local_tz
            )
            
            response = self._format_energy_response(energy_response)
            response["metrics"] = self._metrics(
                branch="energy", start=t0, 
                extra={"known_devices": len(known_devices), "parse_confidence": decision.confidence}
            )

            self._update_energy_memory(user_id, decision)
            return response
        except Exception:
            logger.exception("Energy query processing failed.")
            response = self._simple_assistant_completion("Sorry, I couldn't retrieve your energy data right now.")
            response["metrics"] = self._metrics(branch="energy_error", start=t0)
            return response

    async def _handle_llm_intent(
        self, user_id: int, request: ChatRequest, decision: Decision, known_devices: List[str], limiter: RateLimiter, t0: float
    ) -> Dict[str, Any]:
        if decision.intent == RouteIntent.SMALLTALK:
            system_prompt = "You are a friendly assistant for a smart home app. Keep replies to greetings very brief."
            context_window = 0
            branch = "smalltalk"
        else:
            base_prompt = (
                "You are a helpful assistant for a smart home energy app. "
                "Your primary function is to answer questions based on the provided conversation context. "
                "You MUST NOT invent, hallucinate, or make up any data, especially energy data. "
                "If you don't know the answer or the context is empty, just say you don't have that information."
            )
            if known_devices:
                device_list_str = ", ".join(known_devices)
                system_prompt = f"{base_prompt} For context, the user owns the following devices: {device_list_str}."
            else:
                system_prompt = base_prompt
            context_window = 2
            branch = "general"

        max_tokens = 150
        temperature = 0.7
        allocated_tokens = min(request.max_tokens, max_tokens)

        if not limiter.allow_request(user_id, allocated_tokens):
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded")

        llm_messages = [{"role": "system", "content": system_prompt}]
        if context_window > 0:
            llm_messages.extend(self.mem.history.window(user_id, take=context_window))
        llm_messages.append({"role": "user", "content": decision.user_text})

        try:
            provider_resp = await self.provider.chat_completion(
                messages=llm_messages, temperature=temperature, max_tokens=max_tokens,
            )
            response = self._wrap_or_fallback(provider_resp, "I'm not sure how to respond to that.")
        except Exception:
            logger.exception("LLM provider call failed.")
            response = self._simple_assistant_completion("Sorry, I'm having trouble connecting right now.")
        
        self._attach_metrics_and_track(limiter, user_id, allocated_tokens, response, t0, branch)
        return response

    def _format_energy_response(self, energy_response: EnergyQueryResponse) -> Dict[str, Any]:
        ed = energy_response.model_dump()
        return {
            "id": f"chatcmpl-energy-{uuid.uuid4().hex}", "object": "chat.completion",
            "created": int(time.time()), "model": "energy-query-processor",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": ed.get("summary", "Here is your data.")}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, "energy_data": ed
        }

    def _update_energy_memory(self, user_id: int, decision: Decision):
        self.mem.followups.set_state(
            user_id=user_id,
            intent="rank" if decision.parsed.rank else "usage",
            devices=(decision.parsed.devices or []),
            rank=decision.parsed.rank
        )
        time_label = decision.parsed.time.label if decision.parsed.time else "the requested period"
        if decision.parsed.rank:
            line = f"Looked up the {decision.parsed.rank}-consuming device for {time_label}."
        else:
            dev_phrase = "all devices"
            if decision.parsed.devices:
                dev_phrase = f"device(s): {', '.join(decision.parsed.devices)}"
            line = f"Checked energy usage for {dev_phrase} over {time_label}."
        self.mem.recap.add_line(user_id, line)

    def _update_chat_history(self, user_id: int, user_text: str, response: Dict[str, Any]):
        assistant_text = "..."
        try:
            assistant_text = response["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            logger.warning("Could not extract assistant content for history tracking.")
        
        self.mem.history.add(user_id, "user", user_text)
        self.mem.history.add(user_id, "assistant", assistant_text)
        
    def _metrics(self, branch: str, start: float, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        metrics_data = {
            "branch": branch, "latency_ms": int(round((time.perf_counter() - start) * 1000)),
            "provider_model": getattr(self.provider, "model", "N/A"),
        }
        if extra: metrics_data.update(extra)
        return metrics_data

    def _attach_metrics_and_track(
        self, limiter: RateLimiter, user_id: int, allocated_tokens: int,
        response: Dict[str, Any], start_t: float, branch: str
    ):
        usage = response.get("usage", {})
        
        if isinstance(usage, dict) and usage.get("total_tokens") is not None:
            prompt_tokens = usage.get("prompt_tokens", 0)
            completion_tokens = usage.get("completion_tokens", 0)
            total_tokens = usage.get("total_tokens", 0)
            logger.info(
                f"AI Token Usage - Branch: {branch}, "
                f"Prompt: {prompt_tokens}, Completion: {completion_tokens}, Total: {total_tokens}"
            )

        extra_metrics = {
            "total_tokens": usage.get("total_tokens"),
            "prompt_tokens": usage.get("prompt_tokens"),
            "completion_tokens": usage.get("completion_tokens"),
        }
        response["metrics"] = self._metrics(branch=branch, start=start_t, extra=extra_metrics)
        
        if isinstance(usage.get("total_tokens"), int):
            limiter.add_usage(user_id, allocated_tokens, usage["total_tokens"])

    def _wrap_or_fallback(self, provider_resp: Dict[str, Any], default_text: str) -> Dict[str, Any]:
        try:
            if isinstance(provider_resp, dict) and provider_resp.get("choices"):
                _ = provider_resp["choices"][0]["message"]["content"]
                return provider_resp
        except (KeyError, IndexError, TypeError): pass
        logger.warning(f"Provider response was invalid or errored. Using fallback. Response: {provider_resp}")
        return self._simple_assistant_completion(default_text)

    def _simple_assistant_completion(self, text: str) -> Dict[str, Any]:
        return {
            "id": f"chatcmpl-fallback-{uuid.uuid4().hex}", "object": "chat.completion",
            "created": int(time.time()), "model": "fallback-generator",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": text}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        }

    async def close(self) -> None:
        await self.provider.close()