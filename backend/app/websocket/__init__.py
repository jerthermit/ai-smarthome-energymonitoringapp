from fastapi import APIRouter, WebSocket
from .endpoints import websocket_endpoint

router = APIRouter()

@router.websocket("/ws")
async def websocket_route(websocket: WebSocket):
    """WebSocket endpoint for real-time communication."""
    await websocket_endpoint(websocket)
