import os
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

# --- ADD THIS BLOCK ---
# Configure logging to show INFO level messages
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
# --- END OF BLOCK ---

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

from app.core.config import settings
from app.core.database import engine, Base
from app.auth.api import router as auth_router
from app.telemetry.api import router as telemetry_router
from app.ai.api import router as ai_router
from app.websocket import router as websocket_router
from app.simulation_service import run_simulation

# Create database tables
Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the application's lifespan events.
    Starts the simulation task on startup and cancels it on shutdown.
    """
    logging.info("Application startup: Starting background simulation task...")
    simulation_task = asyncio.create_task(run_simulation())
    
    yield  # The application is running during this yield
    
    logging.info("Application shutdown: Stopping simulation task...")
    simulation_task.cancel()
    try:
        await simulation_task
    except asyncio.CancelledError:
        logging.info("Simulation task cancelled successfully.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(telemetry_router, prefix=settings.API_V1_STR)
app.include_router(ai_router, prefix=settings.API_V1_STR)

# Include the WebSocket router correctly
app.include_router(websocket_router)

@app.get("/")
async def read_root():
    """Root endpoint with API information."""
    return {
        "message": "Welcome to Smart Home Energy Monitor API",
        "version": settings.VERSION,
        "docs": "/docs"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)