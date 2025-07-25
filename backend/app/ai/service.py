"""
AI Service Layer.
Handles business logic for AI interactions and coordinates between providers.
"""
import logging
from typing import Dict, Any, List, Optional

from .providers import AIProvider
from .schemas import ChatRequest, ChatResponse, ErrorResponse

logger = logging.getLogger(__name__)

class AIService:
    """Service layer for AI operations."""
    
    def __init__(self, provider: AIProvider):
        """
        Initialize the AI service with a provider.
        
        Args:
            provider: An instance of an AI provider.
        """
        self.provider = provider
    
    async def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: int = 1000,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Process a chat message and return the AI's response.
        
        Args:
            messages: List of message dictionaries with 'role' and 'content'.
            temperature: Controls randomness (0.0 to 1.0).
            max_tokens: Maximum number of tokens to generate.
            **kwargs: Additional parameters for the provider.
            
        Returns:
            Dictionary containing the model's response.
        """
        try:
            # Add any pre-processing of messages here
            response = await self.provider.chat_completion(
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                **kwargs
            )
            
            # Add any post-processing of the response here
            if "error" in response:
                return {
                    "error": response["error"],
                    "status_code": response.get("status_code", 500)
                }
                
            return response
            
        except Exception as e:
            logger.exception("Error in AI service chat")
            return {
                "error": f"Failed to process chat: {str(e)}",
                "status_code": 500
            }
    
    async def close(self) -> None:
        """Clean up resources used by the service and its provider."""
        await self.provider.close()
    
    @classmethod
    def create_default(cls) -> 'AIService':
        """Create a default instance with Together AI provider."""
        from .providers import TogetherAIProvider
        
        provider = TogetherAIProvider()
        return cls(provider=provider)
