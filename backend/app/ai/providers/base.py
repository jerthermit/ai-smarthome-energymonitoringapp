# backend/app/ai/providers/base.py
"""
Base provider interface for AI services.
Defines the contract that all AI providers must implement.
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Literal

class AIProvider(ABC):
    """Abstract base class for AI providers."""

    @abstractmethod
    async def chat_completion(
        self,
        messages: List[Dict[Literal["role", "content"], str]],
        temperature: float = 0.7,
        max_tokens: int = 1000,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """
        Generate a chat completion using the provider's API.

        Args:
            messages: A list of message dictionaries, each with 'role' and 'content'.
            temperature: Controls the randomness of the output.
            max_tokens: The maximum number of tokens to generate.
            **kwargs: Additional provider-specific parameters.

        Returns:
            A dictionary containing the model's response.
        """
        pass

    @abstractmethod
    async def close(self) -> None:
        """Clean up any resources, such as network clients."""
        pass

    async def __aenter__(self):
        """Allows the provider to be used as an async context manager."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Ensures resources are cleaned up when exiting the context."""
        await self.close()