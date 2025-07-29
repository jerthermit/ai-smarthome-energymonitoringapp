import asyncio
import random
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.telemetry import service as telemetry_service, schemas as telemetry_schemas
# The manager is no longer needed here
# from app.websocket.manager import manager 

async def run_simulation():
    """
    A background task that simulates energy data and saves it to the database.
    This version is for HTTP polling clients and does not use WebSockets.
    """
    print("🚀 Starting energy data simulation (for HTTP Polling)...")
    
    SIMULATION_USER_ID = 1
    NUM_DEVICES = 3
    device_ids_to_simulate = []

    db: Session = SessionLocal()
    try:
        print("  - Checking/creating simulated devices in the database...")
        user_devices = telemetry_service.get_user_devices(db=db, user_id=SIMULATION_USER_ID)
        simulated_devices = [d for d in user_devices if d.name.startswith("Simulated Device")]
        
        if len(simulated_devices) < NUM_DEVICES:
            for i in range(NUM_DEVICES - len(simulated_devices)):
                device_payload = telemetry_schemas.DeviceCreate(name=f"Simulated Device {len(simulated_devices) + i + 1}")
                print(f"    - Creating '{device_payload.name}' for user {SIMULATION_USER_ID}...")
                telemetry_service.create_device(db=db, device=device_payload, user_id=SIMULATION_USER_ID)

        all_user_devices = telemetry_service.get_user_devices(db=db, user_id=SIMULATION_USER_ID)
        device_ids_to_simulate = [d.id for d in all_user_devices if d.name.startswith("Simulated Device")]
        
        print("  - Simulation will run for these device IDs:")
        for device_id in device_ids_to_simulate:
            print(f"    - {device_id}")

    except Exception as e:
        print(f"An error occurred during simulation setup: {e}")
        return
    finally:
        db.close()
    
    if not device_ids_to_simulate:
        print("  - No simulated devices found to run the simulation. Exiting task.")
        return

    while True:
        db: Session = SessionLocal()
        try:
            for device_id in device_ids_to_simulate:
                telemetry_payload = telemetry_schemas.TelemetryCreate(
                    deviceId=device_id,
                    timestamp=datetime.now(timezone.utc),
                    energyWatts=round(random.uniform(50.0, 750.0), 2)
                )
                # The only job is to save to the database
                telemetry_service.create_telemetry(db=db, telemetry=telemetry_payload)

        except Exception as e:
            print(f"An error occurred in the simulation loop: {e}")
        finally:
            db.close()

        # We can poll more frequently now if needed
        await asyncio.sleep(5)