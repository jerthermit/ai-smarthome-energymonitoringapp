import requests, random, time, uuid, sys
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine
from app.telemetry.models import Device
from app.auth.models import User

def create_test_devices():
    """Create test devices if none exist"""
    db = SessionLocal()
    try:
        # Check if we have any users
        user = db.query(User).first()
        if not user:
            print("No users found in the database. Please create a user first.")
            print("You can do this by registering through the frontend.")
            sys.exit(1)
            
        # Check if we have any devices
        devices = db.query(Device).all()
        if not devices:
            print("No devices found. Creating test devices...")
            device_names = ["Living Room AC", "Kitchen Fridge", "Bedroom Light", 
                          "Home Office PC", "Water Heater"]
            devices = []
            for name in device_names:
                device = Device(
                    id=str(uuid.uuid4()),
                    name=name,
                    user_id=user.id
                )
                db.add(device)
                devices.append(device)
            db.commit()
            print(f"Created {len(devices)} test devices")
        else:
            print(f"Found {len(devices)} existing devices")
            
        return [str(device.id) for device in devices]
        
    except Exception as e:
        print(f"Error setting up test devices: {e}")
        db.rollback()
        sys.exit(1)
    finally:
        db.close()

def main():
    print("Starting telemetry simulation...")
    print("Press Ctrl+C to stop the simulation")
    
    # First, ensure we have devices
    device_ids = create_test_devices()
    
    print(f"Using {len(device_ids)} devices:")
    for dev_id in device_ids:
        print(f"- {dev_id}")
    
    start_of_today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    BASE = "http://localhost:8000/api/v1/telemetry"
    
    total_requests = 24 * 60 * len(device_ids)  # 24h * 60min * number of devices
    current_request = 0
    start_time = time.time()
    
    try:
        for t in range(0, 24*60*60, 60):  # one reading per minute for 24h
            ts = (start_of_today + timedelta(seconds=t)).isoformat() + "Z"
            
            for dev_id in device_ids:
                payload = {
                    "deviceId": dev_id,
                    "timestamp": ts,
                    "energyWatts": round(random.uniform(5, 250), 2)
                }
                
                try:
                    response = requests.post(BASE, json=payload)
                    response.raise_for_status()
                    current_request += 1
                    
                    # Show progress every 50 requests
                    if current_request % 50 == 0:
                        elapsed = time.time() - start_time
                        req_per_sec = current_request / elapsed if elapsed > 0 else 0
                        print(f"Progress: {current_request}/{total_requests} requests "
                              f"({(current_request/total_requests)*100:.1f}%) - "
                              f"{req_per_sec:.1f} req/sec")
                except requests.exceptions.RequestException as e:
                    print(f"Error sending request: {e}")
                
                time.sleep(0.1)  # Small delay between requests
                
    except KeyboardInterrupt:
        print("\nSimulation stopped by user\n")
    
    elapsed = time.time() - start_time
    print(f"\nSimulation complete!")
    print(f"Total requests: {current_request}")
    print(f"Time taken: {elapsed:.2f} seconds")
    print(f"Average speed: {current_request/elapsed:.2f} requests/second")
    print("\nYou can now query the data using:")
    print(f"  GET http://localhost:8000/api/v1/telemetry?deviceId={device_ids[0]}")
    print("  (Use one of the device IDs shown above)")

if __name__ == "__main__":
    main()
