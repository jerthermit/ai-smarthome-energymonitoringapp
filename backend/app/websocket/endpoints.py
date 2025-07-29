from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json
import logging
from .manager import manager

# Create a router, which main.py will import
router = APIRouter()
logger = logging.getLogger(__name__)

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Handle WebSocket connections and messages."""
    client_id = None
    try:
        # Accept the WebSocket connection and get client ID
        client_id = await manager.connect(websocket)
        logger.info(f"Client connected: {client_id}")
        
        # Send initial connection confirmation
        await websocket.send_json({
            'type': 'connection_established',
            'clientId': client_id,
            'message': 'Successfully connected to WebSocket server'
        })
        
        # Handle incoming messages
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Handle different message types
            if message.get('type') == 'subscribe':
                channel = message.get('channel')
                if channel:
                    await manager.subscribe(client_id, channel)
                    await websocket.send_json({
                        'type': 'subscription_confirmation',
                        'channel': channel,
                        'status': 'subscribed'
                    })
            
            elif message.get('type') == 'unsubscribe':
                channel = message.get('channel')
                if channel:
                    await manager.unsubscribe(client_id, channel)
                    await websocket.send_json({
                        'type': 'unsubscription_confirmation',
                        'channel': channel,
                        'status': 'unsubscribed'
                    })
            
            elif message.get('type') == 'ping':
                await websocket.send_json({'type': 'pong'})

    except WebSocketDisconnect:
        logger.info(f"Client disconnected: {client_id}")
    except Exception as e:
        logger.error(f"WebSocket error for client {client_id}: {e}")
    finally:
        if client_id:
            manager.disconnect(client_id)
            logger.info(f"Cleaned up client: {client_id}")