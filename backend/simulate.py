import requests, random, time, uuid
from datetime import datetime, timedelta

def main():
    print("Starting telemetry simulation...")
    print("Press Ctrl+C to stop the simulation")
    
    start_of_today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    BASE = "http://localhost:8000/api/v1/telemetry"
    
    # Generate 5 random device IDs
    devices = [str(uuid.uuid4()) for _ in range(5)]
    print(f"Generated {len(devices)} device IDs:")
    for dev in devices:
        print(f"- {dev}")
    
    total_requests = 24 * 60 * 5  # 24h * 60min * 5 devices
    current_request = 0
    start_time = time.time()
    
    try:
        for t in range(0, 24*60*60, 60):  # one reading per minute for 24h
            ts = (start_of_today + timedelta(seconds=t)).isoformat() + "Z"
            
            for dev in devices:
                payload = {
                    "deviceId": dev,
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
    print(f"  GET http://localhost:8000/api/v1/telemetry?deviceId={devices[0]}")
    print("  (Use one of the device IDs shown above)")

if __name__ == "__main__":
    main()
