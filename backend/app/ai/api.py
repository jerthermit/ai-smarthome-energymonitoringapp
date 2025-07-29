# backend/app/ai/api.py
"""
API endpoints for the Conversational AI Service.
Handles chat interactions with the AI model.
"""
import logging
from typing import Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.auth.dependencies import get_current_user
from app.auth.models import User
from app.core.database import get_db
from .chat_schemas import ChatRequest, ChatResponse, ErrorResponse
from .service import AIService

# Setup router
router = APIRouter(prefix="/ai", tags=["AI Conversation Engine"])
logger = logging.getLogger(__name__)


@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Main conversational endpoint",
    responses={
        200: {"description": "Successful response from the AI.", "model": ChatResponse},
        429: {"description": "Rate limit exceeded.", "model": ErrorResponse},
        500: {"description": "Internal server error.", "model": ErrorResponse},
    },
)
async def chat_endpoint(
    request: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Handles chat requests and returns an AI-generated response.

    This single endpoint orchestrates the entire AI response flow:
    - **Interprets Intent**: Determines if the query is about energy, small talk, or general questions.
    - **Fetches Data**: If energy-related, it queries the database for usage data.
    - **Generates Response**: Provides a natural language summary and optional structured data.
    """
    try:
        # Initialize the service with a request-scoped database session
        ai_service = AIService(db_session=db)
        
        # The main service call that handles all logic
        response = await ai_service.chat(user_id=current_user.id, request=request)
        
        # FastAPI will automatically format the response based on the response_model
        return response

    except HTTPException:
        # Re-raise HTTPException directly, so FastAPI can handle it (e.g., for 429 rate limit)
        raise
    except Exception as e:
        # Catch any other unexpected errors, log them, and return a generic 500
        logger.exception(f"Unexpected error in chat endpoint for user {current_user.id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while processing your request.",
        )


@router.get(
    "/health",
    summary="Service Health Check",
    response_model=Dict[str, str],
    responses={
        200: {"description": "Service is healthy and database is reachable."},
        503: {"description": "Service is unavailable or cannot reach the database.", "model": ErrorResponse},
    },
)
async def health_check(db: Session = Depends(get_db)):
    """
    Verifies that the API is running and can connect to the database.

    This is a lightweight check and does **not** test connectivity to the
    external AI provider.
    """
    try:
        # A simple, fast query to ensure the database connection is alive.
        db.execute(text("SELECT 1"))
        return {"status": "healthy"}
    except Exception as e:
        logger.error(f"Health check failed: Database connection error. {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service is unhealthy: could not connect to the database.",
        )