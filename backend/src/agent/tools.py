# backend/src/agent/tools.py 
from langchain_core.tools import tool
from agent.coordinates import HACKATHON_COORDINATES
import requests
import os

BASE_URL = os.getenv("API_URL", "http://127.0.0.1:8000")

FASTAPI_URL = f"{BASE_URL}/api/v1/predict"

@tool
def get_coordinates(location_name: str):
    """Fetches the exact latitude and longitude for a given location name."""
    
    loc_lower = location_name.lower().strip()
    
    # ---------------------------------------------------------
    # 1. LOCAL CACHE (Zero-Latency Hackathon Coordinates)
    # ---------------------------------------------------------
    # We do a two-way substring check to ensure robust matching.
    # e.g., if user types "KR Market", it will match "kr market junction"
    for db_name, coords in HACKATHON_COORDINATES.items():
        if loc_lower in db_name or db_name in loc_lower:
            return f"Coordinates found in Local DB for '{db_name.title()}': Latitude {coords['lat']}, Longitude {coords['lon']}"

    # ---------------------------------------------------------
    # 2. OPENSTREETMAP FALLBACK (For non-hackathon locations)
    # ---------------------------------------------------------
    search_query = location_name
    if "bengaluru" not in search_query.lower() and "bangalore" not in search_query.lower():
        search_query = f"{location_name}, Bengaluru, Karnataka, India"

    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": search_query,
        "format": "json",
        "limit": 1
    }
    headers = {
        "User-Agent": "BengaluruTrafficAI_Hackathon/1.0" 
    }

    try:
        response = requests.get(url, params=params, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        if data:
            lat = float(data[0]["lat"])
            lon = float(data[0]["lon"])
            return f"Coordinates found via OpenStreetMap for '{location_name}': Latitude {lat}, Longitude {lon}"
        else:
            return f"Error: Could not locate '{location_name}'. Ask the user for a more famous landmark nearby."
            
    except Exception as e:
        return f"Error connecting to mapping service: {str(e)}"

@tool
def check_parking_impact(latitude: float, longitude: float, hour: int, day_of_week: str, junction_name: str = "No Junction") -> str:
    """
    Predicts traffic impact severity and detects illegal parking hotspots.
    Args:
        latitude: The latitude coordinate (float).
        longitude: The longitude coordinate (float).
        hour: Hour of the day in 24-hour format (0-23).
        day_of_week: Full string day of the week (e.g., 'Monday', 'Friday').
        junction_name: The name of the junction. Default is "No Junction".
    """
    payload = {
        "latitude": latitude,
        "longitude": longitude,
        "hour": hour,
        "day_of_week": day_of_week,
        "junction_name": junction_name
    }
    
    try:
        response = requests.post(FASTAPI_URL, json=payload)
        response.raise_for_status()
        result = response.json()
        
        status = (
            "IS a known persistent hotspot"
            if result["is_hotspot"]
            else "is NOT a known hotspot"
        )

        return (
            f"Impact Score: {result['impact_score']} "
            f"(Priority: {result['priority']}). "
            f"{result['recommended_action']}. "
            f"This area {status}."
        )
    except Exception as e:
        return f"Error contacting the Prediction API: {str(e)}"

@tool
def get_weather_conditions(latitude: float, longitude: float):
    """Fetches the current weather and short-term forecast for the given coordinates."""
    
    api_key = os.getenv("OPENWEATHERMAP_API_KEY")
    
    # Failsafe 1: Key not found in .env. Fails silently.
    if not api_key:
        return "Weather telemetry offline. Assume normal, dry road conditions."

    # Using the 5-day/3-hour forecast API, but limiting to 3 results (next ~6-9 hours) to save bandwidth
    url = "https://api.openweathermap.org/data/2.5/forecast"
    params = {
        "lat": latitude,
        "lon": longitude,
        "appid": api_key,
        "units": "metric", # Use Celsius
        "cnt": 3 
    }

    try:
        # Added a strict 3-second timeout. If OWM is slow, we drop it and move on.
        response = requests.get(url, params=params, timeout=3)
        response.raise_for_status()
        data = response.json()
        
        # Current conditions (closest to now)
        current = data["list"][0]
        curr_temp = current["main"]["temp"]
        curr_cond = current["weather"][0]["description"].title()
        
        # Forecast conditions (~6-9 hours from now)
        future = data["list"][-1]
        future_temp = future["main"]["temp"]
        future_cond = future["weather"][0]["description"].title()
        
        return f"Current: {curr_temp}°C, {curr_cond}. Forecast later today: {future_temp}°C, {future_cond}."
        
    except Exception as e:
        # Failsafe 2: Network drop, 429 rate limit, or timeout. Fails silently.
        # We print it to the terminal for debugging, but hide it from the LLM.
        print(f"⚠️ OWM Tool Ignored (Non-Critical Failure): {str(e)}")
        return "Weather telemetry offline. Let's proceed with the analysis."

@tool
def get_top_hotspots(day_of_week: str, hour: int, limit: int = 5):
    """
    Scans the city to find the highest-risk parking hotspots for a specific day and hour.
    Use this when the Commander asks for "top", "worst", or "most concerning" areas globally.
    """
    results = []
    
    # 1. Exact Case-Sensitive ML Categories mapped to their fuzzy search keywords
    # This guarantees the XGBoost categorical encoder receives perfect strings
    radar_zones = {
        "BTP040 - Elite Junction": "elite",
        "BTP082 - KR Market Junction": "kr market",
        "BTP211 - Central Street Junction": "central street",
        "BTP051 - Safina Plaza Junction": "safina plaza",
        "BTP027 - Modi Bridge Junction": "modi bridge",
        "BTP043 - Upparpet Junction": "upparpet",
        "BTP032 - Windsor Circle": "windsor",
        "BTP140 - Madiwala Check Post": "madiwala",
        "BTP076 - Hudson Circle": "hudson",
        "BTP057 - Anand Rao Junction": "anand rao",
        "BTP016 - 5th Main Road, RPC Layout": "rpc layout",
        "BTP048 - Shanthala Junction": "shanthala",
        "BTP054 - Shivananda Circle": "shivananda",
        "BTP008 - Navarang Theatre": "navarang",
        "BTP063 - Siddalingaiah Circle": "siddalingaiah"
    }
    
    for exact_ml_name, search_query in radar_zones.items():
        coords = None
        
        # 2. Extract coordinates using the fuzzy keyword
        for db_name, db_coords in HACKATHON_COORDINATES.items():
            if search_query in db_name.lower():
                coords = db_coords
                break
                
        if not coords:
            continue
            
        # 3. Use the EXACT string casing that the ML model was trained on
        payload = {
            "latitude": coords['lat'],
            "longitude": coords['lon'],
            "hour": hour,
            "day_of_week": day_of_week,
            "junction_name": exact_ml_name 
        }
        
        try:
            response = requests.post(FASTAPI_URL, json=payload, timeout=2)
            if response.status_code == 200:
                data = response.json()
                results.append({
                    "name": exact_ml_name,
                    "score": data["impact_score"],
                    "priority": data["priority"],
                    "action": data["recommended_action"]
                })
        except Exception as e:
            print(f"⚠️ Radar sweep skipped {exact_ml_name} due to error: {str(e)}")
            continue
            
    # 4. Sort and return
    top_results = sorted(results, key=lambda x: x["score"], reverse=True)[:limit]
    
    if not top_results:
        return "Radar sweep failed. Prediction API offline."
        
    report = f"Top {len(top_results)} Critical Hotspots for {day_of_week} at {hour:02d}:00 Hours:\n"
    for i, zone in enumerate(top_results):
        report += f"{i+1}. {zone['name']} - Impact Score: {zone['score']:.2f} ({zone['priority']})\n"
        
    return report
