from fastapi import WebSocket
from typing import Dict, Set
import uuid

class ConnectionManager:
    def __init__(self):
        """Manages WebSocket connections and channel subscriptions."""
        # Maps client IDs to their WebSocket connection objects
        self.active_connections: Dict[str, WebSocket] = {}
        # Maps channel names to sets of client IDs subscribed to that channel
        self.subscriptions: Dict[str, Set[str]] = {}
        # Maps client IDs to the set of channels they are subscribed to
        self.client_channels: Dict[str, Set[str]] = {}

    async def connect(self, websocket: WebSocket, client_id: str = None) -> str:
        """Accepts a new WebSocket connection and assigns it a unique ID."""
        client_id = client_id or str(uuid.uuid4())
        await websocket.accept()
        self.active_connections[client_id] = websocket
        self.client_channels[client_id] = set()
        return client_id

    def disconnect(self, client_id: str):
        """Removes a client's connection and all their subscriptions."""
        # Remove the client from all channels they were subscribed to
        if client_id in self.client_channels:
            for channel in list(self.client_channels[client_id]):
                if channel in self.subscriptions and client_id in self.subscriptions[channel]:
                    self.subscriptions[channel].remove(client_id)
            del self.client_channels[client_id]
        
        # Remove the client from the active connections list
        if client_id in self.active_connections:
            del self.active_connections[client_id]

    async def subscribe(self, client_id: str, channel: str) -> bool:
        """Subscribes a connected client to a channel."""
        if client_id not in self.active_connections:
            # Or raise an exception, depending on desired strictness
            return False
            
        if channel not in self.subscriptions:
            self.subscriptions[channel] = set()
            
        self.subscriptions[channel].add(client_id)
        if client_id not in self.client_channels:
            self.client_channels[client_id] = set()
        self.client_channels[client_id].add(channel)
        
        return True

    async def unsubscribe(self, client_id: str, channel: str) -> bool:
        """Unsubscribes a client from a channel."""
        if channel in self.subscriptions and client_id in self.subscriptions[channel]:
            self.subscriptions[channel].remove(client_id)
            
        if client_id in self.client_channels and channel in self.client_channels[client_id]:
            self.client_channels[client_id].remove(channel)
            
        return True

    async def broadcast(self, channel: str, message: dict):
        """Sends a JSON message to all clients subscribed to a channel."""
        if channel not in self.subscriptions:
            return
            
        # Iterate over a copy of the set in case of disconnections during broadcast
        for client_id in list(self.subscriptions.get(channel, set())):
            websocket = self.active_connections.get(client_id)
            if websocket:
                try:
                    await websocket.send_json(message)
                except Exception:
                    # Clean up broken connections if sending fails
                    self.disconnect(client_id)

# Singleton instance for global access
manager = ConnectionManager()