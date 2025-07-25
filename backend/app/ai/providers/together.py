"""
Together AI provider implementation.
Handles communication with the Together AI API.
"""
import os
import logging
from typing import Dict, List, Any, Optional, Literal
import httpx

from .base import AIProvider

logger = logging.getLogger(__name__)

class TogetherAIProvider(AIProvider):
    """Together AI provider implementation."""
    
    BASE_URL = "https://api.together.xyz/v1"
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
        timeout: int = 30
    ):
        """
        Initialize the Together AI provider.
        
        Args:
            api_key: Together AI API key. If not provided, will use TOGETHER_API_KEY env var.
            model: Model name to use.
            timeout: Request timeout in seconds.
        """
        self.api_key = api_key or os.getenv("TOGETHER_API_KEY")
        if not self.api_key:
            raise ValueError(
                "API key is required. Either pass it directly or set the "
                "TOGETHER_API_KEY environment variable."
            )
            
        self.model = model
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None
    
    @property
    def client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=self.timeout,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json"
                }
            )
        return self._client
    
    async def chat_completion(
        self,
        messages: List[Dict[Literal["role", "content"], str]],
        temperature: float = 0.7,
        max_tokens: int = 1000,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Generate a chat completion using Together AI.
        
        Args:
            messages: List of message dictionaries with 'role' and 'content'.
            temperature: Controls randomness (0.0 to 1.0).
            max_tokens: Maximum number of tokens to generate.
            **kwargs: Additional parameters to pass to the API.
            
        Returns:
            Dictionary containing the model's response.
        """
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": max(0.0, min(2.0, temperature)),
            "max_tokens": min(max_tokens, 4000),  # Enforce reasonable limit
            **kwargs
        }
        
        try:
            response = await self.client.post(
                f"{self.BASE_URL}/chat/completions",
                json=payload
            )
            response.raise_for_status()
            return response.json()
            
        except httpx.HTTPStatusError as e:
            error_msg = f"API request failed with status {e.response.status_code}: {e.response.text}"
            logger.error(error_msg)
            return {"error": error_msg, "status_code": e.response.status_code}
            
        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            logger.exception(error_msg)
            return {"error": error_msg, "status_code": 500}
    
    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None
