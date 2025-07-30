# backend/tests/integration/test_energy_flow.py

import pytest
from httpx import AsyncClient
from datetime import datetime
import uuid

from app.main import app
from app.core.config import settings


@pytest.mark.asyncio
async def test_end_to_end_flow():
    async with AsyncClient(app=app, base_url="http://test") as client:
        # Step 1: Register
        email = f"testuser_{uuid.uuid4().hex[:6]}@example.com"
        register_data = {
            "email": email,
            "password": "strongpassword123",
            "full_name": "Test User"
        }
        res = await client.post(f"{settings.API_V1_STR}/auth/register", json=register_data)
        assert res.status_code == 200
        user = res.json()
        assert user["email"] == email

        # Step 2: Login
        login_data = {
            "username": email,
            "password": register_data["password"]
        }
        res = await client.post(f"{settings.API_V1_STR}/auth/login", data=login_data)
        assert res.status_code == 200
        token = res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Step 3: Create a device
        res = await client.post(
            f"{settings.API_V1_STR}/telemetry/devices",
            headers=headers,
            json={"name": "Living Room AC"}
        )
        assert res.status_code == 201
        device = res.json()
        device_id = device["id"]

        # Step 4: Send telemetry
        now = datetime.utcnow().isoformat()
        res = await client.post(
            f"{settings.API_V1_STR}/telemetry",
            headers=headers,
            json={
                "device_id": device_id,
                "timestamp": now,
                "energy_watts": 123.45
            }
        )
        assert res.status_code == 201

        # Step 5: Ask the assistant (with proper ChatRequest structure)
        res = await client.post(
            f"{settings.API_V1_STR}/ai/chat",
            headers=headers,
            json={
                "messages": [
                    {"role": "user", "content": "How much energy did my AC use today?"}
                ],
                "temperature": 0.7,
                "max_tokens": 1024,
                "stream": False
            }
        )
        assert res.status_code == 200
        data = res.json()
        assert "energy_data" in data
        assert "summary" in data["energy_data"]