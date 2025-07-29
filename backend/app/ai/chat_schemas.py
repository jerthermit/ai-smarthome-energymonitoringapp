# backend/app/ai/chat_schemas.py
"""
Pydantic models for the AI service.
Defines the request/response schemas for the API.
"""
from __future__ import annotations

import time
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    """A single message in a chat conversation."""

    role: Literal["system", "user", "assistant"]
    content: str

    class Config:
        json_schema_extra = {
            "example": {"role": "user", "content": "How much energy did my AC use yesterday?"}
        }


class ChatRequest(BaseModel):
    """Request model for chat completion."""

    messages: List[ChatMessage] = Field(..., description="List of messages in the conversation")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0, description="Controls randomness in the response generation")
    max_tokens: int = Field(default=1024, gt=0, description="Maximum number of tokens to generate")
    stream: bool = Field(default=False, description="Whether to stream the response")

    def latest_user_content(self) -> str:
        """Extracts the content from the most recent user message."""
        for message in reversed(self.messages):
            if message.role == "user":
                return message.content
        return ""

    class Config:
        json_schema_extra = {
            "example": {
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": "How much energy did I use yesterday?"},
                ],
                "temperature": 0.7,
                "max_tokens": 1024,
                "stream": False,
            }
        }


class ChatResponse(BaseModel):
    """Response model for chat completion."""

    id: str = Field(..., description="Unique identifier for the chat completion")
    object: str = Field(default="chat.completion", description="Object type, always 'chat.completion'")
    created: int = Field(default_factory=lambda: int(time.time()), description="Unix timestamp of when the response was created")
    model: str = Field(..., description="The model used for the completion")
    choices: List[Dict[str, Any]] = Field(..., description="List of completion choices")
    usage: Dict[str, int] = Field(..., description="Token usage statistics")
    
    energy_data: Optional[Dict[str, Any]] = Field(None, description="Structured energy query response, if applicable")
    metrics: Optional[Dict[str, Any]] = Field(None, description="Internal performance and routing metrics")

    class Config:
        json_schema_extra = {
            "example": {
                "id": "chatcmpl-xyz123",
                "object": "chat.completion",
                "created": 1677652288,
                "model": "energy-query-processor",
                "choices": [{"index": 0, "message": {"role": "assistant", "content": "..."}}],
                "usage": {"prompt_tokens": 25, "completion_tokens": 10, "total_tokens": 35},
                "energy_data": {"summary": "You used 5.20 kWh today.", "data": {}},
                "metrics": {"branch": "energy", "latency_ms": 150}
            }
        }


class ErrorResponse(BaseModel):
    """Standard error response model."""

    error: str = Field(..., description="Error message")
    details: Optional[Dict[str, Any]] = Field(default=None, description="Additional error details")

    class Config:
        json_schema_extra = {
            "example": {"error": "Invalid input data", "details": {"field": "value"}}
        }


class DeviceUsage(BaseModel):
    """Represents energy usage for a specific device."""

    device_id: str = Field(..., description="Unique identifier for the device")
    device_name: str = Field(..., description="Human-readable device name")
    usage_kwh: float = Field(..., description="Energy usage in kilowatt-hours")
    cost: Optional[float] = Field(None, description="Estimated cost in local currency")
    percentage: Optional[float] = Field(None, description="Percentage of total usage")


class TimeSeriesPoint(BaseModel):
    """A single data point in a time series."""

    timestamp: datetime = Field(..., description="Timestamp of the data point")
    value: float = Field(..., description="Numeric value at this timestamp")
    unit: str = Field(default="kWh", description="Unit of measurement")


class EnergyQueryResponse(BaseModel):
    """Structured response for energy-related queries."""

    summary: str = Field(..., description="Human-readable summary of the energy usage")
    data: Dict[str, Any] = Field(..., description="Aggregated data about the energy usage (e.g., totals)")
    time_series: Optional[List[TimeSeriesPoint]] = Field(None, description="Time-series data, if applicable")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata about how the query was processed")

    class Config:
        json_schema_extra = {
            "example": {
                "summary": "Your AC used 42.5 kWh in the past week.",
                "data": {"total_kwh": 42.5, "device_count": 1},
                "time_series": [
                    {"timestamp": "2025-07-22T00:00:00Z", "value": 5.8, "unit": "kWh"},
                    {"timestamp": "2025-07-23T00:00:00Z", "value": 6.2, "unit": "kWh"},
                ],
                "metadata": {"processed_params": {"time_range": "last_7_days", "devices": ["AC"]}},
            }
        }