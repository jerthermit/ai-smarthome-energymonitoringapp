import random
import time
import sys
import asyncio
import aiohttp
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from tqdm import tqdm

# Add parent directory to path for app imports
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from app.core.database import SessionLocal
from app.telemetry.models import Device, Telemetry
from app.auth.models import User

# Device profiles with realistic power consumption patterns (in watts)
DEVICE_PROFILES = {
    "Living Room AC": {
        "base": 100.0,
        "range": (800.0, 1500.0),  # Higher during day, lower at night
        "active_hours": (8, 22),    # Active between 8 AM and 10 PM
        "variation": 0.2,           # Random variation
    },
    "Kitchen Fridge": {
        "base": 150.0,
        "range": (100.0, 200.0),    # Cycles on/off
        "active_hours": (0, 24),    # Always on
        "variation": 0.1,
        "cycle_minutes": 30,        # Compressor cycle time
    },
    "Bedroom Light": {
        "base": 10.0,
        "range": (5.0, 60.0),       # Higher when in use
        "active_hours": (18, 23),   # Evening hours
        "variation": 0.3,
    },
    "Home Office PC": {
        "base": 50.0,
        "range": (30.0, 300.0),     # Varies with usage
        "active_hours": (9, 18),    # Work hours
        "variation": 0.4,
        "weekend_usage": 0.3,       # Less usage on weekends
    },
    "Water Heater": {
        "base": 200.0,
        "range": (1500.0, 4500.0),  # High power when heating
        "active_hours": (6, 9, 18, 22),  # Morning and evening peaks
        "variation": 0.25,
    }
}

def create_test_devices():
    """Create test devices for test@test.com if none exist"""
    db = SessionLocal()
    try:
        # Get the test@test.com user
        user = db.query(User).filter(User.email == 'test@test.com').first()
        if not user:
            print("test@test.com user not found. Please create this user first.")
            sys.exit(1)
            
        # Create devices based on DEVICE_PROFILES
        devices = []
        for name, profile in DEVICE_PROFILES.items():
            device = db.query(Device).filter(
                Device.name == name,
                Device.user_id == user.id
            ).first()
            
            if not device:
                device = Device(
                    id=str(uuid.uuid4()),
                    name=name,
                    user_id=user.id
                )
                db.add(device)
                print(f"Created device: {name}")
            else:
                print(f"Using existing device: {name}")
                
            devices.append(device)
            
        db.commit()
        return devices
        
    except Exception as e:
        print(f"Error setting up test devices: {e}")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()

def generate_telemetry_value(device_name: str, timestamp: datetime) -> float:
    """Generate a realistic telemetry value based on device profile and time"""
    profile = DEVICE_PROFILES[device_name]
    hour = timestamp.hour
    minute = timestamp.minute
    day = timestamp.weekday()  # 0 = Monday, 6 = Sunday
    
    # Base value with random variation
    base = profile["base"]
    min_val, max_val = profile["range"]
    variation = profile.get("variation", 0.1)
    
    # Time-based modulation
    time_factor = 1.0
    if "active_hours" in profile:
        active = profile["active_hours"]
        if len(active) == 2:  # Single active period
            start_hour, end_hour = active
            if start_hour <= hour < end_hour:
                # Ramp up/down near the edges of active period
                time_factor = min(
                    1.0,
                    (hour - start_hour + min(minute/60, 1)) * 0.5,
                    (end_hour - hour + (60-minute)/60) * 0.5
                )
            else:
                time_factor = 0.3  # Reduced usage outside active hours
        elif len(active) == 4:  # Two active periods (e.g., morning/evening)
            morning_start, morning_end, evening_start, evening_end = active
            if (morning_start <= hour < morning_end) or (evening_start <= hour < evening_end):
                time_factor = 0.8  # Active period
            else:
                time_factor = 0.2  # Inactive period
    
    # Day of week adjustment
    if "weekend_usage" in profile and day >= 5:  # Weekend
        time_factor *= profile["weekend_usage"]
        
    # Device-specific patterns
    if device_name == "Kitchen Fridge":
        # Simulate compressor cycles (30 minutes on, 30 minutes off)
        cycle_minutes = profile.get("cycle_minutes", 30)
        in_cycle = (minute % (cycle_minutes * 2)) < cycle_minutes
        time_factor = 1.0 if in_cycle else 0.1
        
    # Add some randomness
    time_factor *= random.uniform(1 - variation, 1 + variation)
    time_factor = max(0.1, min(1.0, time_factor))  # Clamp between 0.1 and 1.0
    
    # Calculate final value
    return round(base + (max_val - base) * time_factor, 2)

async def generate_telemetry_data(days: int = 7):
    """Generate and insert telemetry data for all devices"""
    db = SessionLocal()
    try:
        # Get all test devices
        user = db.query(User).filter(User.email == 'test@test.com').first()
        if not user:
            print("test@test.com user not found")
            return
            
        devices = db.query(Device).filter(Device.user_id == user.id).all()
        if not devices:
            print("No devices found")
            return
            
        print(f"\nGenerating {days} days of telemetry data for {len(devices)} devices...")
        
        # Calculate total points for progress tracking
        total_points = days * 24 * 60 * len(devices)
        progress_bar = tqdm(total=total_points, unit="points")
        
        # Generate data for each day
        for day in range(days):
            day_start = (datetime.now(timezone.utc) - timedelta(days=day)).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            
            # Generate data points for each minute of the day
            for minute in range(24 * 60):
                timestamp = day_start + timedelta(minutes=minute)
                
                # Generate data for each device
                for device in devices:
                    # Generate telemetry value
                    value = generate_telemetry_value(device.name, timestamp)
                    
                    # Create telemetry record
                    telemetry = Telemetry(
                        device_id=device.id,
                        timestamp=timestamp,
                        energy_watts=value
                    )
                    db.add(telemetry)
                    progress_bar.update(1)
                
                # Commit every 1000 records to avoid large transactions
                if (minute * len(devices)) % 1000 == 0:
                    db.commit()
            
            # Final commit for the day
            db.commit()
            
        progress_bar.close()
        print("\nTelemetry data generation complete!")
        
    except Exception as e:
        print(f"\nError generating telemetry data: {e}")
        db.rollback()
    finally:
        db.close()

def main():
    print("Smart Home Energy Monitor - Telemetry Data Generator")
    print("=" * 50)
    
    # Create test devices if they don't exist
    print("\nSetting up test devices...")
    create_test_devices()
    
    # Generate telemetry data
    print("\nStarting telemetry data generation...")
    start_time = time.time()
    
    # Use asyncio for the data generation
    asyncio.run(generate_telemetry_data(days=7))
    
    elapsed = time.time() - start_time
    print(f"\nTotal time: {timedelta(seconds=int(elapsed))}")

if __name__ == "__main__":
    main()