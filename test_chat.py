# test_chat.py 
import requests
import json

API_URL = "http://127.0.0.1:8000/api/v1/chat"
SESSION_ID = "hackathon_judge_session_1"

def print_header():
    print("="*60)
    print("🚓 BENGALURU TRAFFIC POLICE - AI INTELLIGENCE TERMINAL 🚓")
    print("="*60)
    print(f"[Session ID: {SESSION_ID} | Memory: ACTIVE]")
    print("Type 'exit' or 'quit' to close the terminal.\n")

def chat_loop():
    print_header()
    
    while True:
        try:
            user_input = input("\n👤 Commander: ")
            
            if user_input.lower() in ['exit', 'quit']:
                print("\n🤖 AI Officer: Logging off. Stay safe out there.")
                break
                
            if not user_input.strip():
                continue

            # Send payload to your FastAPI backend
            payload = {
                "message": user_input,
                "session_id": SESSION_ID
            }
            
            print("🤖 AI Officer: [Thinking... Routing tools...]")
            
            response = requests.post(API_URL, json=payload)
            # response.raise_for_status()

            # --- NEW ERROR HANDLING ---
            if response.status_code != 200:
                try:
                    error_detail = response.json().get("detail", response.text)
                except:
                    error_detail = response.text
                print(f"\n🚨 THE REAL ERROR: {error_detail}\n")
                print("-" * 60)
                continue
            # --------------------------
            
            data = response.json()
            reply = data.get("reply", "No response generated.")
            
            print(f"\n🤖 AI Officer:\n{reply}\n")
            print("-" * 60)
            
        except requests.exceptions.ConnectionError:
            print("\n🚨 CRITICAL ERROR: Could not connect to the API. Is your FastAPI server running on port 8000?")
            break
        except Exception as e:
            print(f"\n🚨 ERROR: {str(e)}")

if __name__ == "__main__":
    chat_loop()