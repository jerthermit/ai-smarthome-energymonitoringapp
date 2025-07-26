"""
API endpoints for the Conversational AI Service.
Handles chat interactions with the AI model.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any, Optional

from sqlalchemy.orm import Session
from app.core.database import get_db
from app.auth.dependencies import get_current_user
from app.auth.models import User
from .service import AIService
from .chat_schemas import ChatRequest, ChatResponse, ErrorResponse
from app.core.config import settings

router = APIRouter(prefix="/ai", tags=["AI"])



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
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Handle chat requests and return AI responses.
    
    For energy-related queries, returns a structured JSON response with:
    - summary: Natural language summary
    - data: Structured information
    - time_series: Optional time-series data
    
    Parameters:
    - messages: List of messages in the conversation
    - temperature: Controls randomness (0.0 to 1.0)
    - max_tokens: Maximum number of tokens to generate
    """
    try:
        ai_service = AIService(db_session=db)
        response = await ai_service.chat(
            user_id=current_user.id,
            request=request
        )
        
        # If this is an energy query response, include the raw data
        if hasattr(response, 'get') and 'energy_data' in response:
            return {
                **response,
                'energy_data': response['energy_data']
            }
            
        return response
        
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
async def health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint to verify the service is running and can communicate
    with the AI provider.
    """
    try:
        ai_service = AIService(db_session=db)
        # Test the AI service with a simple prompt
        response = await ai_service.chat(
            user_id=1, # Use a dummy user for health check
            request=ChatRequest(messages=[{"role": "user", "content": "Hello"}])
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
