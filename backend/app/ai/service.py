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
from .memory import MemoryManager, is_time_only_followup, RankedDevice
# NEW: Import EnergyQueryType
from .orchestrator import Decision, Orchestrator, RouteIntent, ParsedSlots, TimeRangeParams, EnergyQueryType
from .providers.base import AIProvider
from .providers.together import TogetherAIProvider
from app.core.rate_limiter import RateLimiter
from app.telemetry.models import Device

logger = logging.getLogger(__name__)


class _DeviceNameCache:
    """
    A simple, in-memory cache for user-specific device names.
    Stores device_id -> name mapping with a TTL.
    """
    def __init__(self, ttl_seconds: int = 120):
        self.ttl = ttl_seconds
        self._store: Dict[int, tuple[float, Dict[str, str]]] = {}

    def get(self, db: Session, user_id: int) -> Dict[str, str]: # Return a dict (id -> name)
        now = time.time()
        entry = self._store.get(user_id)
        if entry and (now - entry[0] < self.ttl):
            return entry[1] # Return the cached map

        logger.debug(f"Device name cache miss for user_id: {user_id}. Fetching from DB.")
        query = db.query(Device.id, Device.name).filter(Device.user_id == user_id)
        
        device_map = {}
        for device_id, device_name in query.all():
            if device_name: # Ensure name exists
                device_map[device_id] = device_name
        
        self._store[user_id] = (now, device_map)
        return device_map # Return the newly built map


class AIService:
    """Service layer for AI operations with orchestrated routing, memory, and metrics."""
    def __init__(self, db_session: Session):
        self.db_session = db_session
        self.provider: AIProvider = TogetherAIProvider()
        self.orchestrator = Orchestrator()
        
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

            known_devices_map = self._device_cache.get(self.db_session, user_id)
            known_device_names_list = list(known_devices_map.values()) 

            messages_as_dicts = [m.model_dump() for m in request.messages]
            # Orchestrator now returns a cleaned decision based on explicit parsed terms
            decision = await self.orchestrator.decide(messages_as_dicts, known_device_names_list)

            # _handle_follow_up now primarily carries over context from memory,
            # but respects explicit new terms from orchestrator's decision.
            decision = self._handle_follow_up(user_id, decision) # Removed user_text, known_devices_map from signature

            if decision.intent == RouteIntent.ENERGY:
                response = await self._dispatch_energy_query(
                    user_id, decision, known_devices_map, limiter, t0, self.orchestrator.local_tz.key
                )
            # NEW: Handle SUMMARY intent
            elif decision.intent == RouteIntent.SUMMARY:
                response = await self._handle_summary_intent(
                    user_id, decision, known_devices_map, limiter, t0
                )
            elif decision.intent in (RouteIntent.SMALLTALK, RouteIntent.GENERAL, RouteIntent.UNSURE):
                response = await self._handle_llm_intent(user_id, request, decision, known_devices_map, limiter, t0)
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

    # SIMPLIFIED _handle_follow_up
    def _handle_follow_up(self, user_id: int, decision: Decision) -> Decision:
        """
        Injects missing (None) slots from previous energy context into the current decision.
        It never overrides an explicitly parsed slot from the current turn.
        """
        last_energy_context = self.mem.followups.get_if_fresh(user_id)
        
        # If no fresh last context, or current intent not energy/summary, no follow-up needed.
        if not last_energy_context or decision.intent not in (RouteIntent.ENERGY, RouteIntent.SUMMARY):
            logger.debug(f"[_handle_follow_up] No fresh context or intent not energy/summary. Returning original decision.")
            return decision
        
        # Summary intent does not need context injection into decision.parsed
        if decision.intent == RouteIntent.SUMMARY:
            logger.debug(f"[_handle_follow_up] Intent is SUMMARY. Returning original decision.")
            return decision

        # For ENERGY intent:
        logger.debug(f"[_handle_follow_up] Initial decision.parsed: {asdict(decision.parsed)}")

        # Fill missing time from last context
        if decision.parsed.time is None and last_energy_context.time_context:
            decision.parsed.time = last_energy_context.time_context
            logger.debug(f"[_handle_follow_up] Carried over time from memory: {decision.parsed.time.label}")
        
        # --- CRITICAL FIX START (Re-Revised) ---
        # Handle device carry-over.
        # This logic ensures that:
        # 1. If the current query explicitly mentions devices, we use those (decision.parsed.devices is not empty).
        # 2. If it's a general RANKED_DEVICES query (e.g., "highest?", "2nd highest?") AND no devices were explicitly mentioned
        #    in the current user input, then we *force* parsed.devices to None. This tells EnergyQueryProcessor to get ALL devices.
        # 3. For other query types (TOTAL_USAGE, DEVICE_USAGE) or if devices were explicitly mentioned,
        #    AND no devices were parsed in the current turn (decision.parsed.devices is empty/None),
        #    then we carry over devices from the last context.

        # Store the orchestrator's initially parsed devices
        orchestrator_parsed_devices_this_turn = decision.parsed.devices

        if decision.parsed.energy_query_type == EnergyQueryType.RANKED_DEVICES:
            if not orchestrator_parsed_devices_this_turn:
                # This is a general ranked query (e.g., "highest?", "second highest?").
                # We *must not* carry over a device filter from the previous turn.
                # Force parsed.devices to None so EnergyQueryProcessor fetches all devices for ranking.
                decision.parsed.devices = None
                logger.debug(f"[_handle_follow_up] FORCING parsed.devices to None for general RANKED_DEVICES query to ensure all devices are ranked.")
            else:
                # User explicitly mentioned devices in *this* ranked query (e.g., "highest AC?").
                # Use what the orchestrator parsed.
                logger.debug(f"[_handle_follow_up] Using explicitly parsed devices for RANKED_DEVICES query: {orchestrator_parsed_devices_this_turn}")
                decision.parsed.devices = orchestrator_parsed_devices_this_turn # Already set, but explicit
        elif not orchestrator_parsed_devices_this_turn and last_energy_context.devices:
            # For other query types (TOTAL_USAGE, DEVICE_USAGE) or if devices weren't explicitly
            # mentioned in this turn, carry over from memory if available.
            decision.parsed.devices = last_energy_context.devices
            logger.debug(f"[_handle_follow_up] Carried over devices from memory for non-ranked query or explicit-ranked query without current device: {decision.parsed.devices}")
        else:
            # Either orchestrator parsed devices for this turn, or there's no memory to carry over.
            # In either case, decision.parsed.devices already holds the correct value.
            logger.debug(f"[_handle_follow_up] No device carry-over needed. Current parsed devices: {orchestrator_parsed_devices_this_turn}")
        # --- CRITICAL FIX END ---

        # Rank context: If current query explicitly has rank info, use it.
        # Otherwise, if no rank info in current query, leave it as None (do not carry over previous rank).
        # This ensures that a query like "energy used for 3 days?" (no rank) doesn't inherit a rank.
        # The Orchestrator should set parsed.rank and parsed.rank_num correctly based on current input.
        # We only need to prevent follow-up *overriding* explicit current parsing.
        # If parsed.rank is None, and last_energy_context.rank_context is NOT None,
        # we still do NOT carry over rank context into a non-rank query.
        # The orchestrator's initial decision handles this. This section primarily ensures we don't clobber it.
        if decision.parsed.rank is None and decision.parsed.rank_num is None:
            # If orchestrator didn't parse a rank, ensure it remains None for current decision.
            # No change needed, it's already None from orchestrator if not explicitly parsed.
            pass
        
        logger.debug(f"[_handle_follow_up] Final decision.parsed after follow-up: {asdict(decision.parsed)}")
        return decision

        # This method's role is now purely to inject missing (None) slots from previous energy context.
        # It relies on the orchestrator's decision.parsed for current explicit terms.
        # It never overrides an explicitly parsed slot from the current turn.

        last_energy_context = self.mem.followups.get_if_fresh(user_id)
        
        # If no fresh last context, or current intent not energy/summary, no follow-up needed.
        if not last_energy_context or decision.intent not in (RouteIntent.ENERGY, RouteIntent.SUMMARY):
            return decision
        
        # Summary intent does not need context injection into decision.parsed
        if decision.intent == RouteIntent.SUMMARY:
            return decision

        # For ENERGY intent:
        logger.debug(f"[_handle_follow_up] Initial decision.parsed: {asdict(decision.parsed)}")

        # Fill missing time from last context
        if decision.parsed.time is None and last_energy_context.time_context:
            decision.parsed.time = last_energy_context.time_context
            logger.debug(f"[_handle_follow_up] Carried over time from memory: {decision.parsed.time.label}")
        
        # Fill missing devices from last context
        if not decision.parsed.devices and last_energy_context.devices:
            decision.parsed.devices = last_energy_context.devices
            logger.debug(f"[_handle_follow_up] Carried over devices from memory: {decision.parsed.devices}")

        # Rank context: If current query explicitly has rank info, use it.
        # Otherwise, if no rank info in current query, leave it as None (do not carry over previous rank).
        # This ensures that a query like "energy used for 3 days?" (no rank) doesn't inherit a rank.
        if decision.parsed.rank is None and decision.parsed.rank_num is None:
            # If orchestrator didn't parse a rank, ensure it remains None for current decision
            # This is correct; we don't carry over implicit rank intent from memory for usage queries.
            pass # No change needed, it's already None from orchestrator.
        
        logger.debug(f"[_handle_follow_up] Final decision.parsed after follow-up: {asdict(decision.parsed)}")
        return decision

        # This method's role is now purely to inject missing (None) slots from previous energy context.
        # It relies on the orchestrator's decision.parsed for current explicit terms.
        # It never overrides an explicitly parsed slot from the current turn.

        last_energy_context = self.mem.followups.get_if_fresh(user_id)
        
        # If no fresh last context, or current intent not energy/summary, no follow-up needed.
        if not last_energy_context or decision.intent not in (RouteIntent.ENERGY, RouteIntent.SUMMARY):
            return decision
        
        # Summary intent does not need context injection into decision.parsed
        if decision.intent == RouteIntent.SUMMARY:
            return decision

        # For ENERGY intent:
        logger.debug(f"[_handle_follow_up] Initial decision.parsed: {asdict(decision.parsed)}")

        # Fill missing time from last context
        if decision.parsed.time is None and last_energy_context.time_context:
            decision.parsed.time = last_energy_context.time_context
            logger.debug(f"[_handle_follow_up] Carried over time from memory: {decision.parsed.time.label}")
        
        # Fill missing devices from last context
        if not decision.parsed.devices and last_energy_context.devices:
            decision.parsed.devices = last_energy_context.devices
            logger.debug(f"[_handle_follow_up] Carried over devices from memory: {decision.parsed.devices}")

        # Rank context: If current query explicitly has rank info, use it.
        # Otherwise, if no rank info in current query, leave it as None (do not carry over previous rank).
        # This ensures that a query like "energy used for 3 days?" (no rank) doesn't inherit a rank.
        if decision.parsed.rank is None and decision.parsed.rank_num is None:
            # If orchestrator didn't parse a rank, ensure it remains None for current decision
            # This is correct; we don't carry over implicit rank intent from memory for usage queries.
            pass # No change needed, it's already None from orchestrator.
        
        logger.debug(f"[_handle_follow_up] Final decision.parsed after follow-up: {asdict(decision.parsed)}")
        return decision

    # NEW: Central dispatcher for ENERGY intent
    async def _dispatch_energy_query(
        self, user_id: int, decision: Decision, known_devices_map: Dict[str, str], limiter: RateLimiter, t0: float, local_tz: str
    ) -> Dict[str, Any]:
        response: Dict[str, Any]
        energy_response: Optional[EnergyQueryResponse] = None

        parsed_slots = decision.parsed # Use the potentially modified parsed_slots from _handle_follow_up

        # Step 1: Clarify if essential slots are missing for the determined query type
        if parsed_slots.energy_query_type == EnergyQueryType.TOTAL_USAGE:
            if parsed_slots.time is None:
                clarification_response = self._simple_assistant_completion(
                    "For what time period are you asking about total energy consumption? For example: 'today', 'last 3 days', or 'this week'."
                )
                clarification_response["metrics"] = self._metrics(branch="energy_clarify_total_time", start=t0)
                return clarification_response
            energy_response = await self._handle_total_usage_query(user_id, parsed_slots, local_tz)

        elif parsed_slots.energy_query_type == EnergyQueryType.DEVICE_USAGE:
            if parsed_slots.time is None:
                clarification_response = self._simple_assistant_completion(
                    "For what time period are you asking about device energy consumption? For example: 'today', 'last 3 days', or 'this week'."
                )
                clarification_response["metrics"] = self._metrics(branch="energy_clarify_device_time", start=t0)
                return clarification_response
            if not parsed_slots.devices:
                clarification_response = self._simple_assistant_completion(
                    "Which device(s) are you asking about? For example: 'AC', 'Water Heater'."
                )
                clarification_response["metrics"] = self._metrics(branch="energy_clarify_device", start=t0)
                return clarification_response
            energy_response = await self._handle_device_usage_query(user_id, parsed_slots, local_tz)

        elif parsed_slots.energy_query_type == EnergyQueryType.RANKED_DEVICES:
            if parsed_slots.time is None:
                clarification_response = self._simple_assistant_completion(
                    "For what time period are you asking about ranked energy consumers? For example: 'today', 'last 3 days', or 'this week'."
                )
                clarification_response["metrics"] = self._metrics(branch="energy_clarify_rank_time", start=t0)
                return clarification_response
            if parsed_slots.rank is None and parsed_slots.rank_num is None:
                 clarification_response = self._simple_assistant_completion(
                    "Are you asking for the highest, lowest, or a specific rank (e.g., '2nd highest')?"
                 )
                 clarification_response["metrics"] = self._metrics(branch="energy_clarify_rank_type", start=t0)
                 return clarification_response
            energy_response = await self._handle_ranked_devices_query(user_id, parsed_slots, known_devices_map, local_tz)
        else: # This path should ideally not be hit with the new orchestrator, if it's an ENERGY intent.
            logger.warning(f"Unhandled energy_query_type: {parsed_slots.energy_query_type}. Falling back to general LLM.")
            return await self._handle_llm_intent(user_id, ChatRequest(messages=[{"role": "user", "content": decision.user_text}]), decision, known_devices_map, limiter, t0)

        if not energy_response: # Should not happen if handlers return responses or clarifications
            logger.error(f"Energy handler returned no response for type: {parsed_slots.energy_query_type}")
            response = self._simple_assistant_completion("Sorry, I couldn't retrieve your energy data right now.")
            response["metrics"] = self._metrics(branch="energy_handler_fail", start=t0)
            return response
        
        # Final formatting and metrics for all energy responses
        response = self._format_energy_response(energy_response)
        response["metrics"] = self._metrics(
            branch="energy_dispatch", start=t0, 
            extra={"query_type": parsed_slots.energy_query_type.value, "parse_confidence": decision.confidence}
        )

        # Store data in memory AFTER successful processing
        # Ensure that ranked_devices is a list of RankedDevice objects
        ranked_data_for_memory = []
        if energy_response.data and "all_devices_ranked" in energy_response.data:
            # `all_devices_ranked` now comes as a list of dicts from energy_processor, so convert back to dataclass for memory
            for d_dict in energy_response.data["all_devices_ranked"]:
                ranked_data_for_memory.append(RankedDevice(
                    device_id=d_dict.get("device_id"),
                    kwh=d_dict.get("kwh"),
                    name=d_dict.get("name") # Use name from energy_processor's return, it's more accurate
                ))
            
        self._update_energy_memory(
            user_id=user_id,
            decision=decision,
            ranked_devices=ranked_data_for_memory, # Store the actual dataclass objects
            time_context=parsed_slots.time # Use the time context that was used for the query
        )
        return response

    # NEW: Handle Total Usage Queries
    async def _handle_total_usage_query(
        self, user_id: int, parsed_slots: ParsedSlots, local_tz: str
    ) -> EnergyQueryResponse:
        logger.debug(f"[_handle_total_usage_query] Querying total usage for time: {parsed_slots.time.label}")
        try:
            energy_response = await self.energy_processor.process_with_params(
                user_id=user_id,
                parsed=asdict(parsed_slots), # parsed_slots should have time, devices=[], rank=None, rank_num=None
                local_tz=local_tz
            )
            return energy_response
        except Exception:
            logger.exception("Total usage query failed.")
            raise # Re-raise to be caught by _dispatch_energy_query's outer handler

    # NEW: Handle Device Usage Queries
    async def _handle_device_usage_query(
        self, user_id: int, parsed_slots: ParsedSlots, local_tz: str
    ) -> EnergyQueryResponse:
        logger.debug(f"[_handle_device_usage_query] Querying device usage for devices: {parsed_slots.devices}, time: {parsed_slots.time.label}")
        try:
            energy_response = await self.energy_processor.process_with_params(
                user_id=user_id,
                parsed=asdict(parsed_slots), # parsed_slots should have time, devices=[...], rank=None, rank_num=None
                local_tz=local_tz
            )
            return energy_response
        except Exception:
            logger.exception("Device usage query failed.")
            raise # Re-raise to be caught by _dispatch_energy_query's outer handler

    # NEW: Handle Ranked Devices Queries (including memory fulfillment)
    async def _handle_ranked_devices_query(
        self, user_id: int, parsed_slots: ParsedSlots, known_devices_map: Dict[str, str], local_tz: str
    ) -> EnergyQueryResponse:
        
        energy_response = None

        # Attempt to fulfill from memory if it's a simple rank follow-up AND
        # the time/devices context is the SAME as the last query (implying no new time/device specified).
        last_energy_context = self.mem.followups.get_if_fresh(user_id)
        
        # Condition for memory fulfillment:
        # 1. We have a specific rank number (e.g., "2nd highest").
        # 2. Time context is unchanged (or defaulted by follow-up, which is fine).
        # 3. Devices context is unchanged (or defaulted).
        # 4. Memory has valid ranked data from a previous 'rank' query.
        is_pure_rank_follow_up_from_memory = (
            parsed_slots.rank_num is not None and # We have a specific rank number in current query
            last_energy_context and 
            last_energy_context.ranked_devices and # Memory has a list of ranked devices
            last_energy_context.intent == "rank" and # Last query was a rank type
            # Crucial: Ensure the time and device context matches, meaning the user only changed the rank number.
            # If the user asks "2nd highest LAST WEEK", it's a new query.
            parsed_slots.time == last_energy_context.time_context and 
            parsed_slots.devices == last_energy_context.devices 
        )

        if is_pure_rank_follow_up_from_memory:
            rank_idx = parsed_slots.rank_num - 1
            ranked_list = last_energy_context.ranked_devices # This list should now be RankedDevice objects!

            logger.debug(f"[_handle_ranked_devices_query] Attempting memory fulfillment. Parsed rank_num: {parsed_slots.rank_num}. len(ranked_list): {len(ranked_list)}")
            logger.debug(f"[_handle_ranked_devices_query] ranked_list (first 5): {ranked_list[:5]}")

            if 0 <= rank_idx < len(ranked_list):
                target_device = ranked_list[rank_idx] # Now this should be a RankedDevice object
                device_name = target_device.name or target_device.device_id
                
                # Determine ordinal suffix (1st, 2nd, 3rd, 4th)
                suffix = "th"
                if 10 <= parsed_slots.rank_num % 100 <= 20: # Handles 11th, 12th, 13th
                    pass
                else:
                    suffix = {1: "st", 2: "nd", 3: "rd"}.get(parsed_slots.rank_num % 10, "th")

                rank_phrase = f"{parsed_slots.rank_num}{suffix}"
                rank_type_phrase = parsed_slots.rank if parsed_slots.rank else "highest" # Fallback if rank_type not explicit

                time_label_for_response = last_energy_context.time_context.label if last_energy_context.time_context else "the last known period"
                readable_time_label = self.energy_processor._get_readable_range_label(time_label_for_response)
                
                response_summary = (
                    f"The **{device_name}** was the {rank_phrase} {rank_type_phrase} energy consumer "
                    f"for {readable_time_label}, using **{target_device.kwh:.2f} kWh**."
                )
                # Convert RankedDevice to dicts for EnergyQueryResponse schema compatibility
                all_devices_ranked_as_dicts = [asdict(d) for d in ranked_list]
                energy_response = EnergyQueryResponse(
                    summary=response_summary,
                    data={
                        "top_device": {"name": device_name, "kwh": target_device.kwh},
                        "all_devices_ranked": all_devices_ranked_as_dicts
                    },
                    time_series=None, 
                    metadata={"source": "memory", "query_processed": asdict(parsed_slots)}
                )
                logger.info(f"Fulfilled rank query from memory: {rank_phrase} {rank_type_phrase} device.")
            else:
                logger.warning(f"[_handle_ranked_devices_query] Rank index out of bounds ({parsed_slots.rank_num}). len(ranked_list): {len(ranked_list)}. Falling back to energy_processor.")
                energy_response = None # Force re-query if rank is out of bounds for stored list
        else:
            logger.debug(f"[_handle_ranked_devices_query] Not a valid pure rank follow-up from memory. Initial parsed time: {parsed_slots.time.label if parsed_slots.time else 'None'}. Falling back to energy_processor.")
            energy_response = None # Fallback if not a memory-based rank fulfillment scenario
        
        # If not fulfilled from memory, query energy_processor
        if not energy_response:
            logger.debug("[_handle_ranked_devices_query] Proceeding with energy_processor for new ranked query.")
            if parsed_slots.time is None: # Should be caught by dispatcher, but as a safeguard.
                raise ValueError("Time parameter is required for ranked device query (after follow-up logic).")
            
            try:
                energy_response = await self.energy_processor.process_with_params(
                    user_id=user_id, 
                    parsed=asdict(parsed_slots), # parsed_slots should have time, devices (optional), rank, rank_num
                    local_tz=local_tz
                )
            except Exception:
                logger.exception("Ranked device query failed in energy_processor.")
                raise # Re-raise to be caught by _dispatch_energy_query's outer handler

        return energy_response


    # Handle Summary Intent (no change as this was already working for its part)
    async def _handle_summary_intent(
        self, user_id: int, decision: Decision, known_devices_map: Dict[str, str], limiter: RateLimiter, t0: float
    ) -> Dict[str, Any]:
        if not limiter.allow_request(user_id, 0): 
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Rate limit exceeded")

        logger.info(f"Handling SUMMARY intent for user {user_id}.")
        summary_lines: List[str] = []

        recap_text = self.mem.recap.get_recap(user_id)
        if recap_text and recap_text != "No prior discussion yet.":
            formatted_recap = recap_text.replace('So far:\n- ', '- ')
            summary_lines.append(f"Here's a recap of our previous discussions:\n{formatted_recap}")

        last_energy_context = self.mem.followups.get_if_fresh(user_id)
        if last_energy_context:
            context_summary_lines = []
            if last_energy_context.intent == "usage" and last_energy_context.time_context:
                readable_time = self.energy_processor._get_readable_range_label(last_energy_context.time_context.label)
                device_phrase = "all devices"
                if last_energy_context.devices:
                    device_phrase = f"your {', '.join(last_energy_context.devices)}"
                context_summary_lines.append(f"Most recently, I checked energy usage for {device_phrase} over {readable_time}.")

            if last_energy_context.intent == "rank" and last_energy_context.ranked_devices and last_energy_context.time_context:
                readable_time = self.energy_processor._get_readable_range_label(last_energy_context.time_context.label)
                context_summary_lines.append(f"Regarding top energy consumers over {readable_time}:")
                for i, device in enumerate(last_energy_context.ranked_devices[:3]): # Summarize top 3 devices
                    # This `device` should now be a RankedDevice object because energy_service now returns them as such.
                    context_summary_lines.append(f"  - {i+1}. {device.name or device.device_id}: {device.kwh:.2f} kWh")

            if context_summary_lines:
                summary_lines.append("\n" + "\n".join(context_summary_lines))
        
        if known_devices_map:
            summary_lines.append(f"\nYour registered devices include: {', '.join(known_devices_map.values())}.")

        final_summary = "I don't have much to summarize yet."
        if summary_lines:
            final_summary = "\n".join(summary_lines)
            if not final_summary.strip(): 
                final_summary = "I can tell you about your smart home devices and their energy consumption."


        response = self._simple_assistant_completion(final_summary)
        response["metrics"] = self._metrics(branch="summary", start=t0)
        return response


    async def _handle_llm_intent( 
        self, user_id: int, request: ChatRequest, decision: Decision, known_devices_map: Dict[str, str], limiter: RateLimiter, t0: float
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
            
            recap_text = self.mem.recap.get_recap(user_id)
            system_prompt_parts = [base_prompt]
            if recap_text and recap_text != "No prior discussion yet.":
                system_prompt_parts.append(f"\n\nPrevious energy insights: {recap_text}")

            if known_devices_map: 
                device_list_str = ", ".join(known_devices_map.values())
                system_prompt_parts.append(f"\n\nFor context, the user owns the following devices: {device_list_str}.")
            
            last_energy_context = self.mem.followups.get_if_fresh(user_id)
            if last_energy_context and last_energy_context.ranked_devices:
                ranked_summary_lines = []
                for i, device in enumerate(last_energy_context.ranked_devices[:5]):
                    # This `device` should now be a RankedDevice object
                    ranked_summary_lines.append(f"{i+1}. {device.name or device.device_id}: {device.kwh:.2f} kWh")
                if ranked_summary_lines:
                    time_label = last_energy_context.time_context.label if last_energy_context.time_context else 'an unknown period'
                    readable_time_label = self.energy_processor._get_readable_range_label(time_label)
                    system_prompt_parts.append(
                        f"\n\nLatest ranked device consumption (from last energy query, valid for {readable_time_label}):"
                        + "\n" + "\n".join(ranked_summary_lines)
                    )
            
            system_prompt = "".join(system_prompt_parts)
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

    def _update_energy_memory(
        self,
        user_id: int,
        decision: Decision,
        ranked_devices: List[RankedDevice],
        time_context: Optional[TimeRangeParams]
    ):
        self.mem.followups.set_state(
            user_id=user_id,
            intent="rank" if decision.parsed.rank or decision.parsed.rank_num else "usage",
            devices=(decision.parsed.devices or []),
            rank=decision.parsed.rank,
            rank_num=decision.parsed.rank_num,
            ranked_devices=ranked_devices,
            time_context=time_context
        )
        query_time_label = decision.parsed.time.label if decision.parsed.time else "the requested period"
        
        if decision.parsed.rank or decision.parsed.rank_num:
            rank_num_str = f"the {decision.parsed.rank_num}" if decision.parsed.rank_num else "the"
            rank_type_str = decision.parsed.rank if decision.parsed.rank else "highest"
            line = f"Looked up {rank_num_str} {rank_type_str}-consuming device for {self.energy_processor._get_readable_range_label(query_time_label)}."
        else:
            dev_phrase = "all devices"
            if decision.parsed.devices:
                dev_phrase = f"device(s): {', '.join(decision.parsed.devices)}"
            line = f"Checked energy usage for {dev_phrase} over {self.energy_processor._get_readable_range_label(query_time_label)}."
        self.mem.recap.add_line(user_id, line)
    
    def _get_device_name_from_id(self, device_id: str, known_devices_map: Dict[str, str]) -> Optional[str]:
        return known_devices_map.get(device_id)

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