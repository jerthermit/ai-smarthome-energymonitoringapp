"""
API endpoints for the Conversational AI Service.
Handles chat interactions with the AI model.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any, Optional

from .service import AIService
from .schemas import ChatRequest, ChatResponse, ErrorResponse
from ..core.config import settings

router = APIRouter(prefix="/ai", tags=["AI"])

def get_ai_service() -> AIService:
    """Dependency to get an AI service instance."""
    return AIService.create_default()

@router.post(
    "/chat",
    response_model=ChatResponse,
    responses={
        200: {"model": ChatResponse},
        400: {"model": ErrorResponse},
        500: {"model": ErrorResponse}
    }
)
async def chat_endpoint(
    chat_request: ChatRequest,
    ai_service: AIService = Depends(get_ai_service)
):
    """
    Handle chat requests and return AI responses.
    
    - **messages**: List of messages in the conversation
    - **temperature**: Controls randomness (0.0 to 1.0)
    - **max_tokens**: Maximum number of tokens to generate
    """
    try:
        # Convert Pydantic models to dict for the service
        messages = [msg.dict() for msg in chat_request.messages]
        
        # Call the AI service
        response = await ai_service.chat(
            messages=messages,
            temperature=chat_request.temperature,
            max_tokens=chat_request.max_tokens,
            stream=chat_request.stream
        )
        
        # Handle error responses
        if "error" in response:
            status_code = response.get("status_code", status.HTTP_500_INTERNAL_SERVER_ERROR)
            raise HTTPException(
                status_code=status_code,
                detail={"error": response["error"]}
            )
            
        return response
        
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
        
    except Exception as e:
        # Log the full error for debugging
        logger = logging.getLogger(__name__)
        logger.exception("Unexpected error in chat endpoint")
        
        # Return a generic error to the client
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "An unexpected error occurred while processing your request"}
        )

@router.get(
    "/health",
    responses={
        200: {"description": "Service is healthy"},
        503: {"model": ErrorResponse}
    }
)
async def health_check(ai_service: AIService = Depends(get_ai_service)):
    """
    Health check endpoint to verify the service is running and can communicate
    with the AI provider.
    """
    try:
        # Test the AI service with a simple prompt
        response = await ai_service.chat(
            messages=[{"role": "user", "content": "Hello"}],
            max_tokens=5
        )
        
        if "error" in response:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"error": f"AI service error: {response['error']}"}
            )
            
        return {"status": "healthy"}
        
    except HTTPException:
        raise
        
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.exception("Health check failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": f"Service unavailable: {str(e)}"}
        )

# Add router to FastAPI app in main.py
