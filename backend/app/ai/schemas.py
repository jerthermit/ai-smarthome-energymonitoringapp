"""
Pydantic models for the AI service.
Defines the request/response schemas for the API.
"""
from datetime import datetime
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field

class ChatMessage(BaseModel):
    """A single message in a chat conversation."""
    role: Literal["system", "user", "assistant"]
    content: str
    
    class Config:
        json_schema_extra = {
            "example": {
                "role": "user",
                "content": "How much energy did I use yesterday?"
            }
        }

class ChatRequest(BaseModel):
    """Request model for chat completion."""
    messages: List[ChatMessage] = Field(
        ...,
        description="List of messages in the conversation"
    )
    temperature: float = Field(
        default=0.7,
        ge=0.0,
        le=2.0,
        description="Controls randomness in the response generation"
    )
    max_tokens: int = Field(
        default=1000,
        gt=0,
        description="Maximum number of tokens to generate"
    )
    stream: bool = Field(
        default=False,
        description="Whether to stream the response"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant for a smart home energy monitoring system."},
                    {"role": "user", "content": "How much energy did I use yesterday?"}
                ],
                "temperature": 0.7,
                "max_tokens": 1000,
                "stream": False
            }
        }

class ChatResponse(BaseModel):
    """Response model for chat completion."""
    id: str = Field(
        ...,
        description="Unique identifier for the chat completion"
    )
    object: str = Field(
        default="chat.completion",
        description="Object type, always 'chat.completion'"
    )
    created: int = Field(
        default_factory=lambda: int(datetime.now().timestamp()),
        description="Unix timestamp of when the response was created"
    )
    model: str = Field(
        ...,
        description="The model used for the completion"
    )
    choices: List[Dict[str, Any]] = Field(
        ...,
        description="List of completion choices"
    )
    usage: Dict[str, int] = Field(
        ...,
        description="Token usage statistics"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "chatcmpl-123",
                "object": "chat.completion",
                "created": 1677652288,
                "model": "meta-llama/llama-3-70b-instruct",
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": "You used 12.5 kWh of energy yesterday."
                    },
                    "finish_reason": "stop"
                }],
                "usage": {
                    "prompt_tokens": 25,
                    "completion_tokens": 10,
                    "total_tokens": 35
                }
            }
        }

class ErrorResponse(BaseModel):
    """Standard error response model."""
    error: str = Field(..., description="Error message")
    details: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional error details"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "error": "Invalid API key",
                "details": {"status_code": 401}
            }
        }
