import requests
import time

API_URL = "http://127.0.0.1:8000/api/v1/predict"

# Utilizing the 300K Dataset true peaks for validation
test_cases = [
    {
        "name": "[SEVERE] Elite Junction - Night Enforcement Sweep",
        "payload": {
            "latitude": 12.9764090874,
            "longitude": 77.5759204607,
            "hour": 3,
            "day_of_week": "Saturday",
            "junction_name": "BTP040 - Elite Junction"
        },
        "expected_level": "Severe" # Target impact ~ 100.0
    },
    {
        "name": "[SEVERE] KR Market - Evening Commercial Gridlock",
        "payload": {
            "latitude": 12.9646511644,
            "longitude": 77.5763250836,
            "hour": 19,
            "day_of_week": "Sunday",
            "junction_name": "BTP082 - KR Market Junction"
        },
        "expected_level": "Severe" # Target impact ~ 84.3
    },
    {
        "name": "[SEVERE] Safina Plaza - Early Morning Infractions",
        "payload": {
            "latitude": 12.9816459673,
            "longitude": 77.6079040749,
            "hour": 5,
            "day_of_week": "Sunday",
            "junction_name": "BTP051 - Safina Plaza Junction"
        },
        "expected_level": "Severe" # Target impact ~ 54.1
    },
    {
        "name": "[MODERATE] Modi Bridge - Low Volume, Secondary Peak",
        "payload": {
            "latitude": 13.000003176,
            "longitude": 77.5498434668,
            "hour": 2,
            "day_of_week": "Friday",
            "junction_name": "BTP027 - Modi Bridge Junction"
        },
        "expected_level": "Severe" # Target impact ~ 34.2 (Assuming threshold > 25)
    },
    {
        "name": "[LOW] KR Market - Temporal Drop-off (Off-Peak Control)",
        "payload": {
            "latitude": 12.9646511644,
            "longitude": 77.5763250836,
            "hour": 4,          # Changed from peak 19:00 to dead 04:00
            "day_of_week": "Wednesday", # Changed from peak Sunday to Wednesday
            "junction_name": "BTP082 - KR Market Junction"
        },
        "expected_level": "Low" # Score should crash dynamically due to temporal feature weights
    }
]

def run_hotspot_validation():
    print(f"{'TEST SCENARIO':<55} | {'SCORE':<8} | {'SEVERITY':<10} | {'HOTSPOT'}")
    print("-" * 95)
    
    for case in test_cases:
        try:
            start_time = time.time()
            response = requests.post(API_URL, json=case["payload"])
            response.raise_for_status()
            
            data = response.json()
            latency = (time.time() - start_time) * 1000
            
            score = data.get("impact_score")
            level = data.get("impact_level")
            is_hotspot = "✅ TRUE" if data.get("is_hotspot") else "❌ FALSE"
            
            # Formatting color/indicators for pass/fail on expected thresholds
            status_indicator = "🟢" if level == case["expected_level"] or (case["expected_level"] == "Severe" and score >= 25.0) else "🟡"
            
            print(f"{status_indicator} {case['name']:<53} | {score:<8.2f} | {level:<10} | {is_hotspot} ({latency:.1f}ms)")
            
        except Exception as e:
            print(f"🔴 {case['name']:<53} | FAILED: {str(e)}")

if __name__ == "__main__":
    run_hotspot_validation()