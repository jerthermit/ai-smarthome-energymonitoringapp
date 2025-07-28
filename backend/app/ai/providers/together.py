# backend/app/ai/providers/together.py
"""
Together AI provider implementation matching AIProvider interface.
- Adds short retries + tighter timeouts to reduce read timeouts.
- Preserves the existing API contract so the service layer doesn't change.

Env:
  TOGETHER_API_KEY          - required
  TOGETHER_MODEL            - optional (defaults shown below)
  TOGETHER_TIMEOUT_SECONDS  - optional (defaults 12)
"""

from __future__ import annotations

import os
import json
import time
import random
import logging
from typing import Dict, List, Any, Optional, Literal

import httpx

from .base import AIProvider

logger = logging.getLogger(__name__)


class TogetherAIProvider(AIProvider):
    BASE_URL = "https://api.together.xyz/v1"

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout: int = 12,
        max_retries: int = 2,
    ):
        """
        Initialize the Together AI provider.

        Args:
            api_key: Together AI API key. If not provided, will use TOGETHER_API_KEY env var.
            model: Model name to use. Can be overridden by TOGETHER_MODEL.
            timeout: per-request read timeout seconds (connect/read/write/pool tuned).
            max_retries: short retry attempts for transient errors/timeouts.
        """
        self.api_key = api_key or os.getenv("TOGETHER_API_KEY")
        if not self.api_key:
            raise ValueError(
                "API key is required. Either pass it directly or set TOGETHER_API_KEY."
            )

        self.model = (
            model
            or os.getenv("TOGETHER_MODEL")
            or "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free"
        )

        # Allow env override for timeouts
        timeout_env = os.getenv("TOGETHER_TIMEOUT_SECONDS")
        if timeout_env:
            try:
                timeout = int(timeout_env)
            except Exception:
                logger.warning("Invalid TOGETHER_TIMEOUT_SECONDS; using default %s", timeout)

        self.timeout = int(timeout)
        self.max_retries = int(max_retries)
        self._client: Optional[httpx.AsyncClient] = None

    @property
    def client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client with tuned timeouts."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(
                    connect=5.0,  # fail fast on connect
                    read=self.timeout,  # main limiter
                    write=self.timeout,
                    pool=5.0,
                ),
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
            )
        return self._client

    # ---------------- Public API ----------------

    async def chat_completion(
        self,
        messages: List[Dict[Literal["role", "content"], str]],
        temperature: float = 0.7,
        max_tokens: int = 1000,
        **kwargs: Any
    ) -> Dict[str, Any]:
        """
        Generate a chat completion using Together AI.

        Returns:
            Raw Together response dict, or {"error": "...", "status_code": int} on failure.
        """
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": max(0.0, min(2.0, float(temperature))),
            "max_tokens": max(1, min(4000, int(max_tokens))),  # reasonable cap
            **kwargs,
        }
        path = f"{self.BASE_URL}/chat/completions"
        return await self._post_with_retries(path, payload)

    async def get_structured_response(
        self,
        prompt: str,
        response_format: Dict[str, Any],
        temperature: float = 0.2,
        max_tokens: int = 2000
    ) -> Dict[str, Any]:
        """
        Generate a structured JSON response using Together AI.
        Raises on failure; callers already handle exceptions.
        """
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": max(0.0, min(2.0, float(temperature))),
            "max_tokens": max(1, min(4000, int(max_tokens))),
            # Together forwards response_format; many models follow OpenAI JSON mode.
            "response_format": response_format or {"type": "json_object"},
        }
        path = f"{self.BASE_URL}/chat/completions"

        resp = await self._post_with_retries(path, payload)
        if "error" in resp:
            raise RuntimeError(resp.get("error") or "Together request failed")

        try:
            content = resp.get("choices", [{}])[0].get("message", {}).get("content")
            if content is None:
                raise ValueError("Empty content from Together")
            return json.loads(content)
        except json.JSONDecodeError as e:
            logger.error(f"Together JSON decode failed: {e}; content={content!r}")
            raise
        except Exception as e:
            logger.exception("Together structured response failed")
            raise

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    # ---------------- Internals ----------------

    async def _post_with_retries(self, url: str, json_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Small retry loop for transient errors/timeouts to reduce read timeouts seen in logs.
        Retries on: 408, 429, and 5xx, plus network/timeout exceptions.
        """
        attempt = 0
        backoffs = [0.15, 0.4]  # seconds
        last_status: Optional[int] = None
        last_err: Optional[str] = None

        while True:
            try:
                r = await self.client.post(url, json=json_payload)
                if 200 <= r.status_code < 300:
                    return r.json()

                # retry on 408/429/5xx
                if r.status_code in (408, 429) or (500 <= r.status_code < 600):
                    last_status = r.status_code
                    last_err = r.text
                    if attempt < self.max_retries:
                        await self._sleep_with_jitter(backoffs[attempt] if attempt < len(backoffs) else backoffs[-1])
                        attempt += 1
                        continue

                # non-retryable
                return {"error": f"Together HTTP {r.status_code}: {r.text}", "status_code": r.status_code}

            except (httpx.TimeoutException, httpx.NetworkError) as e:
                last_err = str(e)
                last_status = 599
                if attempt < self.max_retries:
                    await self._sleep_with_jitter(backoffs[attempt] if attempt < len(backoffs) else backoffs[-1])
                    attempt += 1
                    continue
                return {"error": f"Together network error: {e}", "status_code": 599}
            except Exception as e:
                logger.exception("Together request unexpected error")
                return {"error": f"Unexpected error: {e}", "status_code": 500}

    async def _sleep_with_jitter(self, base: float) -> None:
        import asyncio
        await asyncio.sleep(base + random.uniform(0, base / 2.0))