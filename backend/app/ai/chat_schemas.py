"""
Pydantic models for the AI service.
Defines the request/response schemas for the API.
"""
from datetime import datetime
from enum import Enum
from typing import List, Dict, Any, Optional, Literal, Union
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
                "error": "Invalid input data",
                "details": {"field": "value"}
            }
        }

# Energy-related schemas
class TimeRange(str, Enum):
    """Time range options for energy queries."""
    TODAY = "today"
    YESTERDAY = "yesterday"
    LAST_WEEK = "last_week"
    LAST_MONTH = "last_month"
    CUSTOM = "custom"

class DeviceUsage(BaseModel):
    """Represents energy usage for a specific device."""
    device_id: str = Field(..., description="Unique identifier for the device")
    device_name: str = Field(..., description="Human-readable device name")
    usage_kwh: float = Field(..., description="Energy usage in kilowatt-hours")
    cost: Optional[float] = Field(None, description="Estimated cost in local currency")
    percentage: Optional[float] = Field(
        None, 
        description="Percentage of total usage this device represents"
    )

class TimeSeriesPoint(BaseModel):
    """A single data point in a time series."""
    timestamp: datetime = Field(..., description="Timestamp of the data point")
    value: float = Field(..., description="Numeric value at this timestamp")
    unit: str = Field(..., description="Unit of measurement (e.g., 'kWh', 'W')")

class EnergyQueryResponse(BaseModel):
    """Structured response for energy-related queries."""
    summary: str = Field(
        ...,
        description="Human-readable summary of the energy usage"
    )
    data: dict = Field(
        ...,
        description="Structured data about the energy usage"
    )
    time_series: Optional[List[TimeSeriesPoint]] = Field(
        None,
        description="Time-series data if applicable"
    )
    metadata: dict = Field(
        default_factory=dict,
        description="Additional metadata about the query"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "summary": "Your AC used 42.5 kWh of energy in the past week, costing approximately $5.10.",
                "data": {
                    "device": {
                        "id": "ac_123",
                        "name": "Living Room AC",
                        "type": "air_conditioner"
                    },
                    "usage": {
                        "value": 42.5,
                        "unit": "kWh",
                        "cost": 5.10,
                        "currency": "USD"
                    },
                    "time_period": {
                        "start": "2023-07-19T00:00:00",
                        "end": "2023-07-26T23:59:59",
                        "range": "last_week"
                    }
                },
                "time_series": [
                    {
                        "timestamp": "2023-07-20T00:00:00",
                        "value": 5.8,
                        "unit": "kWh"
                    },
                    {
                        "timestamp": "2023-07-21T00:00:00",
                        "value": 6.2,
                        "unit": "kWh"
                    }
                ],
                "metadata": {
                    "query_processed": {
                        "device": "ac",
                        "time_range": {"type": "last_week"},
                        "metric": "energy_usage"
                    },
                    "generated_at": "2023-07-26T14:15:30.123456"
                }
            }
        }
