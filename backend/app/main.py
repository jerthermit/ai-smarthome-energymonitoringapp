import os
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import logging

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

from app.core.config import settings
from app.core.database import engine, Base
from app.auth import models as auth_models
from app.auth.api import router as auth_router
from app.telemetry import models as telemetry_models
from app.ai import router as ai_router
from app.websocket import router as websocket_router

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router, prefix=settings.API_V1_STR)

# Include telemetry router
from app.telemetry.api import router as telemetry_router
app.include_router(telemetry_router, prefix=settings.API_V1_STR)

# Include AI router
app.include_router(ai_router, prefix=settings.API_V1_STR)

# Include WebSocket router (no prefix for WebSocket routes)
app.include_router(websocket_router)

@app.get("/")
async def read_root():
    """Root endpoint with API information."""
    return {
        "message": "Welcome to Smart Home Energy Monitor API",
        "version": settings.VERSION,
        "docs": "/docs",
        "api_v1_docs": f"{settings.API_V1_STR}/docs",
        "ai_endpoint": f"{settings.API_V1_STR}/ai/chat"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
