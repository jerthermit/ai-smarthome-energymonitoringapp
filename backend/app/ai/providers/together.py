# backend/app/ai/providers/together.py
"""
Together AI provider implementation matching AIProvider interface.
- Adds short retries + tighter timeouts to reduce read timeouts.
- Preserves the existing API contract so the service layer doesn't change.

Env Vars:
  TOGETHER_API_KEY          - Required API key.
  TOGETHER_MODEL            - Optional model name.
  TOGETHER_TIMEOUT_SECONDS  - Optional request timeout.
"""
from __future__ import annotations

import asyncio
import logging
import os
import random
from typing import Any, Dict, List, Literal, Optional

import httpx
from .base import AIProvider

logger = logging.getLogger(__name__)


class TogetherAIProvider(AIProvider):
    """A robust client for the Together AI API."""

    BASE_URL = "https://api.together.xyz/v1"

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout: int = 15,
        max_retries: int = 2,
    ):
        self.api_key = api_key or os.getenv("TOGETHER_API_KEY")
        if not self.api_key:
            raise ValueError("API key must be provided or set via TOGETHER_API_KEY.")

        # --- FINAL FIX: Switching to a faster model with permissive rate limits ---
        self.model = model or os.getenv("TOGETHER_MODEL", "mistralai/Mistral-7B-Instruct-v0.2")

        self.max_retries = int(max_retries)
        
        try:
            self.timeout = int(os.getenv("TOGETHER_TIMEOUT_SECONDS", timeout))
        except (ValueError, TypeError):
            self.timeout = timeout
            logger.warning("Invalid TOGETHER_TIMEOUT_SECONDS. Using default: %s", timeout)

        self._client: Optional[httpx.AsyncClient] = None

    @property
    def client(self) -> httpx.AsyncClient:
        """Lazily initializes and returns an httpx.AsyncClient."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(self.timeout, connect=5.0),
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
            )
        return self._client

    async def chat_completion(
        self,
        messages: List[Dict[Literal["role", "content"], str]],
        temperature: float = 0.7,
        max_tokens: int = 1024,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """
        Generates a chat completion, with retries for transient errors.
        """
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": max(0.0, min(2.0, temperature)),
            "max_tokens": max(1, min(4096, max_tokens)),
            **kwargs,
        }
        return await self._post_with_retries(f"{self.BASE_URL}/chat/completions", payload)

    async def close(self) -> None:
        """Closes the underlying httpx client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
        self._client = None

    async def _post_with_retries(self, url: str, json_payload: Dict[str, Any]) -> Dict[str, Any]:
        """Sends a POST request with a retry mechanism for transient errors."""
        for attempt in range(self.max_retries + 1):
            try:
                response = await self.client.post(url, json=json_payload)
                if 200 <= response.status_code < 300:
                    return response.json()

                if response.status_code in {429, 500, 502, 503, 504}:
                    if attempt == self.max_retries:
                        return {"error": response.text, "status_code": response.status_code}
                    await self._sleep_with_jitter(0.2 * (2**attempt))
                else:
                    return {"error": response.text, "status_code": response.status_code}

            except (httpx.TimeoutException, httpx.NetworkError) as e:
                if attempt == self.max_retries:
                    return {"error": f"Network error: {e}", "status_code": 599}
                await self._sleep_with_jitter(0.2 * (2**attempt))
            except Exception as e:
                logger.exception("An unexpected error occurred in TogetherAIProvider.")
                return {"error": str(e), "status_code": 500}
        
        return {"error": "Max retries exceeded", "status_code": 500}

    async def _sleep_with_jitter(self, base_delay: float):
        """Sleeps for a base delay plus a random jitter."""
        jitter = random.uniform(0, base_delay * 0.5)
        await asyncio.sleep(base_delay + jitter)