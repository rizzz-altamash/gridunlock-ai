import os
import requests
from dotenv import load_dotenv

# Automatically check for the .env file inside the backend folder
if os.path.exists("backend/.env"):
    load_dotenv("backend/.env")
else:
    load_dotenv()

CLIENT_ID = os.getenv("MAPMYINDIA_CLIENT_ID")
CLIENT_SECRET = os.getenv("MAPMYINDIA_CLIENT_SECRET")

# Fallback manual input if environment variables aren't found
if not CLIENT_ID or not CLIENT_SECRET:
    print("🚨 Could not automatically locate keys in backend/.env")
    CLIENT_ID = input("Paste your Mappls Client ID: ").strip()
    CLIENT_SECRET = input("Paste your Mappls Client Secret: ").strip()

def run_diagnostic():
    print("\n" + "="*60)
    print("🗺️ MAPPLS (MAPMYINDIA) ISOLATED API DIAGNOSTIC")
    print("="*60)

    # Browser signature to bypass Windows 10054 Connection Resets
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
    }

    try:
        # ---------------------------------------------------------
        # PHASE 1: Token Generation (OAuth 2.0)
        # ---------------------------------------------------------
        print("\n[1/2] Authenticating with Mappls Server...")
        token_url = "https://outpost.mappls.com/api/security/oauth/token"
        token_data = {
            "grant_type": "client_credentials",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET
        }
        
        token_response = requests.post(token_url, data=token_data, headers=headers)
        
        if token_response.status_code != 200:
            print(f"❌ AUTHENTICATION FAILED (Status {token_response.status_code})")
            print(f"Reason: {token_response.text}")
            return
            
        access_token = token_response.json().get("access_token")
        print("✅ SUCCESS: OAuth Token Generated!")

        # ---------------------------------------------------------
        # PHASE 2: Geocoding (Testing Elite Junction)
        # ---------------------------------------------------------
        test_location = "Elite Junction, Bengaluru"
        print(f"\n[2/2] Searching Mappls Database for: '{test_location}'...")
        
        geocode_url = "https://atlas.mappls.com/api/places/geocode"
        auth_headers = {
            "Authorization": f"bearer {access_token}",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"
        }
        params = {
            "address": test_location
        }
        
        geo_response = requests.get(geocode_url, headers=auth_headers, params=params)
        
        if geo_response.status_code != 200:
            print(f"❌ GEOCODING FAILED (Status {geo_response.status_code})")
            print(f"Reason: {geo_response.text}")
            return
            
        geo_data = geo_response.json()

        # ---------------------------------------------------------
        # PHASE 3: Bulletproof Data Parsing
        # ---------------------------------------------------------
        results = geo_data.get("copResults")
        
        print("\n--- Raw Response Received ---")
        print(geo_data)
        print("-----------------------------\n")

        best_match = None
        if isinstance(results, list) and len(results) > 0:
            best_match = results[0]
        elif isinstance(results, dict):
            best_match = results

        if best_match:
            lat = best_match.get("latitude", best_match.get("lat"))
            lon = best_match.get("longitude", best_match.get("lng"))
            address = best_match.get("formattedAddress", test_location)
            
            if lat is not None and lon is not None:
                print("*"*60)
                print("🎯 THE API IS WORKING PERFECTLY. COORDINATES FOUND!")
                print("*"*60)
                print(f"📍 Matched Address : {address}")
                print(f"🌍 Latitude        : {lat}")
                print(f"🌍 Longitude       : {lon}")
                print("*"*60)
            else:
                print("❌ Structure matched but 'latitude'/'longitude' keys missing inside copResults.")
        else:
            print("❌ Mappls connected, but returned no matching data for this location.")

    except Exception as e:
        print(f"\n🚨 SCRIPT EXCEPTION CAUGHT: {str(e)}")

if __name__ == "__main__":
    run_diagnostic()