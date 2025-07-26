"""
AI Module for Conversational AI Service.

This module provides an interface for interacting with various AI providers
and processing natural language queries about energy usage and smart home data.
"""
from .api import router as ai_router
from .service import AIService
from .chat_schemas import ChatRequest, ChatResponse, ErrorResponse
from .providers import AIProvider, TogetherAIProvider

# Export the router for FastAPI app inclusion
router = ai_router

__all__ = [
    # Core components
    'AIService',
    'AIProvider',
    'TogetherAIProvider',
    
    # API Router
    'router',
    
    # Schemas
    'ChatRequest',
    'ChatResponse',
    'ErrorResponse',
]
