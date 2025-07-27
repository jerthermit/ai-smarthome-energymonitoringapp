from fastapi import WebSocket
from typing import Dict, Set, List, Any
import json
from datetime import datetime, timedelta
import asyncio
import uuid

class ConnectionManager:
    def __init__(self):
        # Maps client IDs to their WebSocket connections
        self.active_connections: Dict[str, WebSocket] = {}
        # Maps channels to sets of client IDs
        self.subscriptions: Dict[str, Set[str]] = {}
        # Maps client IDs to their subscribed channels
        self.client_channels: Dict[str, Set[str]] = {}

    async def connect(self, websocket: WebSocket, client_id: str = None):
        client_id = client_id or str(uuid.uuid4())
        await websocket.accept()
        self.active_connections[client_id] = websocket
        self.client_channels[client_id] = set()
        return client_id

    def disconnect(self, client_id: str):
        # Remove from all subscriptions
        if client_id in self.client_channels:
            for channel in self.client_channels[client_id]:
                if channel in self.subscriptions and client_id in self.subscriptions[channel]:
                    self.subscriptions[channel].remove(client_id)
            del self.client_channels[client_id]
        
        # Remove from active connections
        if client_id in self.active_connections:
            del self.active_connections[client_id]

    async def subscribe(self, client_id: str, channel: str):
        if client_id not in self.active_connections:
            raise ValueError("Client not connected")
            
        if channel not in self.subscriptions:
            self.subscriptions[channel] = set()
            
        self.subscriptions[channel].add(client_id)
        self.client_channels[client_id].add(channel)
        
        return True

    async def unsubscribe(self, client_id: str, channel: str):
        if channel in self.subscriptions and client_id in self.subscriptions[channel]:
            self.subscriptions[channel].remove(client_id)
            
        if client_id in self.client_channels and channel in self.client_channels[client_id]:
            self.client_channels[client_id].remove(channel)
            
        return True

    async def broadcast(self, channel: str, message: dict):
        if channel not in self.subscriptions:
            return
            
        for client_id in list(self.subscriptions[channel]):
            if client_id in self.active_connections:
                try:
                    await self.active_connections[client_id].send_json(message)
                except:
                    # Clean up if sending fails
                    self.disconnect(client_id)

# Singleton instance
manager = ConnectionManager()

# Background task to simulate energy data updates
async def simulate_energy_updates():
    while True:
        try:
            # Simulate energy data for multiple devices
            for device_id in ['device1', 'device2', 'device3']:
                message = {
                    'type': 'energyUpdate',
                    'deviceId': device_id,
                    'timestamp': datetime.utcnow().isoformat(),
                    'value': round(0.5 + (0.5 * (datetime.utcnow().second / 60)), 2)  # Simulate value between 0.5 and 1.0
                }
                await manager.broadcast(f'energy_{device_id}', message)
            
            # Wait before next update
            await asyncio.sleep(5)
        except Exception as e:
            print(f"Error in energy updates simulation: {e}")
            await asyncio.sleep(5)

# Start the simulation when the module loads
import asyncio
loop = asyncio.get_event_loop()
if not loop.is_running():
    asyncio.create_task(simulate_energy_updates())
