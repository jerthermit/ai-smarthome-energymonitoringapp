"""
Base provider interface for AI services.
Defines the contract that all AI providers must implement.
"""
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any, Literal

class AIProvider(ABC):
    """Abstract base class for AI providers."""
    
    @abstractmethod
    async def chat_completion(
        self,
        messages: List[Dict[Literal["role", "content"], str]],
        temperature: float = 0.7,
        max_tokens: int = 1000,
        **kwargs: Any
    ) -> Dict[str, Any]:
        """
        Generate a chat completion using the provider's API.
        
        Args:
            messages: List of message dictionaries with 'role' and 'content'
            temperature: Controls randomness (0.0 to 1.0)
            max_tokens: Maximum number of tokens to generate
            **kwargs: Additional provider-specific parameters
            
        Returns:
            Dictionary containing the model's response
        """
        pass
    
    @abstractmethod
    async def close(self) -> None:
        """Clean up any resources used by the provider."""
        pass
    
    async def __aenter__(self):
        """Support async context manager."""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Ensure resources are cleaned up."""
        await self.close()
