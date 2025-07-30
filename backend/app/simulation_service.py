import asyncio
import random
import uuid
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.telemetry import service as telemetry_service, schemas as telemetry_schemas
from app.auth.models import User

logger = logging.getLogger(__name__)

async def run_simulation(poll_interval_seconds: int = 60):
    """
    A background task that simulates energy data by inserting into telemetry.
    It will only run once a real user exists in the DB.
    """
    logger.info("🚀 Starting energy data simulation…")

    # Step 1: Ensure we have at least one user, then ensure they have simulated devices.
    db: Session = SessionLocal()
    try:
        sim_user = db.query(User).order_by(User.id).first()
        if not sim_user:
            logger.warning("No users found in DB; skipping simulation until someone registers.")
            return  # We’ll be restarted on next reload, or you can loop-sleep here if you prefer

        # Ensure we have exactly 3 “Simulated Device” entries for that user
        user_devices = telemetry_service.get_user_devices(db=db, user_id=sim_user.id)
        sim_devices = [d for d in user_devices if d.name.startswith("Simulated Device")]
        needed = 3 - len(sim_devices)
        for i in range(needed):
            name = f"Simulated Device {len(sim_devices) + i + 1}"
            logger.info(f"  • Creating device '{name}' for user {sim_user.id}")
            telemetry_service.create_device(
                db=db,
                device=telemetry_schemas.DeviceCreate(name=name),
                user_id=sim_user.id
            )

        # Refresh our list of IDs
        all_devs = telemetry_service.get_user_devices(db=db, user_id=sim_user.id)
        device_ids = [d.id for d in all_devs if d.name.startswith("Simulated Device")]
        logger.info(f"  • Will simulate for device IDs: {device_ids}")

    except Exception:
        logger.exception("Failed to set up simulation devices")
        return
    finally:
        db.close()

    # Step 2: Enter the loop, emitting random readings every `poll_interval_seconds`
    while True:
        db = SessionLocal()
        try:
            for dev_id in device_ids:
                payload = telemetry_schemas.TelemetryCreate(
                    deviceId=dev_id,
                    timestamp=datetime.now(timezone.utc),
                    energyWatts=round(random.uniform(50.0, 750.0), 2)
                )
                telemetry_service.create_telemetry(db=db, telemetry=payload)
            logger.debug(f"Inserted simulated telemetry for {len(device_ids)} devices")
        except Exception:
            logger.exception("Error during simulation loop")
        finally:
            db.close()

        await asyncio.sleep(poll_interval_seconds)