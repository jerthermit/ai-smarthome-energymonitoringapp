from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.database import SessionLocal
from app.telemetry.models import Device, Telemetry

def check_data():
    db = SessionLocal()
    try:
        # Get count of devices
        device_count = db.query(func.count(Device.id)).scalar()
        print(f"Found {device_count} devices in the database")
        
        # Get count of telemetry records
        telemetry_count = db.query(func.count(Telemetry.id)).scalar()
        print(f"Found {telemetry_count} telemetry records in total")
        
        # Get telemetry count per device
        print("\nTelemetry records per device:")
        devices = db.query(Device).all()
        for device in devices:
            count = db.query(func.count(Telemetry.id))\
                     .filter(Telemetry.device_id == device.id)\
                     .scalar()
            print(f"- {device.name} ({device.id}): {count} records")
        
        # Show sample telemetry data
        print("\nSample telemetry data (first 5 records):")
        sample = db.query(Telemetry).limit(5).all()
        for record in sample:
            print(f"- {record.timestamp}: {record.energy_watts:.2f}W (Device: {record.device_id})")
        
    except Exception as e:
        print(f"Error checking data: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_data()
