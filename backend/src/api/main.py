# backend/src/api/main.py 

import os
import sys

# MUST BE AT THE VERY TOP: Suppress OpenBLAS memory allocation crashes
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"

from fastapi import FastAPI, HTTPException
from fastapi import BackgroundTasks, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langchain_core.messages import HumanMessage
from redis import Redis
from langgraph.checkpoint.postgres import PostgresSaver
from psycopg_pool import ConnectionPool
from datetime import datetime
import subprocess
import shutil
from dotenv import load_dotenv

# 1. PATH SETUP: Do this FIRST so Python can find your custom modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 2. LOCAL IMPORTS: Now we can safely import everything
from model.inference import ParkingImpactPredictor
from agent.graph import get_chat_agent
from api.schemas import PredictionRequest, PredictionResponse

# Load environment variables
load_dotenv()

app = FastAPI(title="Parking Intelligence Engine", version="1.0.0")

# CORS Middleware for Frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://gridunlock-ai.vercel.app", # The exact Vercel URL 
        "http://localhost:3000"              # Keep local testing alive 
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the XGBoost "Brain"
ARTIFACTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "model", "artifacts")
predictor = ParkingImpactPredictor(artifacts_dir=ARTIFACTS_DIR)

# --- Postgres Global Connection Pool ---
DB_URI = os.getenv("DATABASE_URL")
if not DB_URI:
    raise ValueError("DATABASE_URL is missing from .env")

# This pool handles the connections safely without locking your server
connection_pool = ConnectionPool(conninfo=DB_URI, max_size=15)

# Use a dedicated connection string temporarily just to build the tables
with PostgresSaver.from_conn_string(DB_URI) as setup_db:
    setup_db.setup()

# --- REST ENDPOINTS ---

@app.get("/health")
def health_check():
    return {"status": "online", "model": "loaded", "postgres": "connected", "feature_count": predictor.meta["feature_count"], "hex_resolution": 9, "version": "1.3"}


@app.post("/api/v1/predict", response_model=PredictionResponse)
def predict_impact(request: PredictionRequest):
    try:
        return predictor.predict(
            lat=request.latitude,
            lon=request.longitude,
            hour=request.hour,
            day_of_week=request.day_of_week,
            junction=request.junction_name
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")


# LangGraph Chat API Contracts
class ChatRequest(BaseModel):
    message: str
    session_id: str = "default_user_1"

class ChatResponse(BaseModel):
    reply: str


@app.post("/api/v1/chat", response_model=ChatResponse)
def chat_with_agent(request: ChatRequest):
    # --- 10-attempt loop to handle Neon DB cold starts ---
    max_attempts = 10
    
    for attempt in range(max_attempts):
        try:
            memory_db = PostgresSaver(connection_pool)
            agent = get_chat_agent(db_checkpointer=memory_db)
            
            inputs = {"messages": [HumanMessage(content=request.message)]}
            config = {"configurable": {"thread_id": request.session_id}}
            
            response = agent.invoke(inputs, config=config)
            
            # Extract final message safely
            final_message = response["messages"][-1].content
            if isinstance(final_message, list):
                final_reply = "\n".join([block["text"] for block in final_message if "text" in block])
            else:
                final_reply = str(final_message)
                
            return {"reply": final_reply}
                
        except Exception as e:
            error_msg = str(e).lower()
            
            # 1. Neon DB Cold Start Failsafe (Invisible to user)
            if attempt < max_attempts - 1 and ("administrator" in error_msg or "terminating connection" in error_msg or "psycopg" in error_msg):
                print(f"⚠️ Waking up Neon DB (Background Retry {attempt + 1})...")
                continue
            
            # 2. Log the actual raw error in your terminal for debugging
            print(f"\n🚨 ACTUAL BACKEND ERROR: {str(e)}\n")

            # 3. Graceful Frontend Degradation (Chatbot Fallback Replies)
            
            # --- API Rate Limit / Quota Exceeded ---
            if "429" in error_msg or "quota" in error_msg or "exhausted" in error_msg:
                friendly_reply = "⚠️ **System Alert:** Intelligence API key limits exceeded. Initiating safety cooldown. Please retry in 2 minutes."
            
            # --- Network / Timeout / Connection Issues ---
            elif "timeout" in error_msg or "connection" in error_msg or "network" in error_msg:
                friendly_reply = "📡 **Signal Lost:** Experiencing poor connectivity to central servers. Please check your internet connection and try again."
            
            # --- Missing Map Data or Invalid Tool Input ---
            elif "valueerror" in error_msg or "index" in error_msg:
                friendly_reply = "⚙️ **Data Parsing Error:** Received fragmented data from intelligence sensors. Please provide a more specific location."
            
            # --- The Ultimate Catch-All ---
            else:
                friendly_reply = "🚨 **Internal System Fault:** The tactical intelligence server experienced a temporary anomaly. Please hold and try again in a few moments."
            
            # Return a 200 OK with the friendly reply, preventing frontend UI crashes!
            return {"reply": friendly_reply}


# THE CONTINUOUS TRAINING BACKGROUND TASK
def run_training_pipeline(file_path: str):
    """
    Runs the ML pipeline in a separate process to prevent memory leaks 
    from Pandas/XGBoost on the main FastAPI thread.
    """
    print(f"[CT Pipeline] Starting background training with {file_path}...")
    
    try:
        # 1. DYNAMIC PATH RESOLUTION 
        # This code is inside backend/src/api/main.py
        # This navigates up one directory to backend/src/, then into model/train.py
        current_dir = os.path.dirname(os.path.abspath(__file__))
        src_dir = os.path.dirname(current_dir)
        train_script_path = os.path.join(src_dir, "model", "train.py")
        
        # 2. RUN SUBPROCESS WITH ABSOLUTE PATH
        subprocess.run(["python", train_script_path, "--data", file_path], check=True)
        print("[CT Pipeline] Training complete. Artifacts updated.")
        
        # 3. HOT RELOAD MODEL IN RAM
        global predictor
        predictor = ParkingImpactPredictor(artifacts_dir=ARTIFACTS_DIR)
        print("[CT Pipeline] Inference engine reloaded with new weights.")
        
    except subprocess.CalledProcessError as e:
        print(f"[CT Pipeline] Training script crashed: {str(e)}")
    except Exception as e:
        print(f"[CT Pipeline] System error during training: {str(e)}")
    finally:
        # Clean up the temporary CSV file
        if os.path.exists(file_path):
            os.remove(file_path)

# THE FILE UPLOAD ENDPOINT
@app.post("/api/v1/train")
async def trigger_training(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV datasets are accepted for training.")
        
    # Create a safe temporary file path using the absolute current working directory
    temp_file_path = os.path.join(os.getcwd(), f"temp_{file.filename}")
    
    with open(temp_file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # Dispatch the ML training to a background worker
    background_tasks.add_task(run_training_pipeline, temp_file_path)
    
    return {
        "status": "processing",
        "message": "Dataset accepted. Continuous Training pipeline initiated in the background. The architecture will update automatically."
    }

# GLOBAL HOTSPOTS INIT ENDPOINT (For the Next.js Map)
@app.get("/api/v1/hotspots/current")
def get_current_global_hotspots():
    """Runs live XGBoost batch inference on ALL active zones instantly."""
    now = datetime.now()
    current_hour = now.hour
    current_day = now.strftime("%A")
    
    # 1. Predict EVERYTHING in a single batch call (Takes < 0.2 seconds)
    global_predictions = predictor.predict_batch(
        zones=predictor.hotspots,
        hour=current_hour,
        day_of_week=current_day
    )
            
    # 2. Sort dynamically by the newly predicted impact score
    sorted_predictions = sorted(
        global_predictions,
        key=lambda x: x["impact_score"],
        reverse=True
    )
    
    # 3. Slice and return top 300 
    return {
        "current_hour": current_hour, 
        "day": current_day, 
        "hotspots": sorted_predictions[:100] 
    }

@app.get("/api/v1/hotspots/simulate")
def simulate_hotspots(hour: int, day: str = "Monday"):
    """
    Runs live XGBoost batch inference for a specific hour instantly.
    """
    # 1. Predict EVERYTHING in a single batch call (Takes < 0.2 seconds)
    global_predictions = predictor.predict_batch(
        zones=predictor.hotspots,
        hour=hour,
        day_of_week=day
    )
            
    # 2. Sort dynamically by the newly predicted impact score
    sorted_predictions = sorted(
        global_predictions,
        key=lambda x: x["impact_score"],
        reverse=True
    )
    
    # 3. Return top 300 
    return {
        "hour": hour, 
        "day": day, 
        "hotspots": sorted_predictions[:300]
    }

@app.get("/api/v1/hotspots/all")
def get_all_hotspots():
    """
    Returns the complete base map of all known hotspots 
    generated by the ML pipeline (from final_hotspots.json).
    """
    try:
        # predictor.hotspots contains the raw list of dictionaries from the JSON
        return {"hotspots": predictor.hotspots}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load map data: {str(e)}")

@app.get("/api/v1/model/status")
async def get_model_status():
    """Returns the metadata of the currently active XGBoost model."""
    try:
        current_dir = os.path.dirname(os.path.abspath(__file__))
        src_dir = os.path.dirname(current_dir)
        meta_path = os.path.join(src_dir, "model", "artifacts", "meta.pkl")

        # fallback_date = datetime.now().strftime("%B %d, %Y at %I:%M %p")
        fallback_date = "June 21, 2026 at 10:53 AM"  # First trained date of the initial model (hardcoded for consistency) 
        
        if os.path.exists(meta_path):
            import joblib
            meta = joblib.load(meta_path)
            return {
                "status": "Online",
                "last_trained_date": meta.get("last_trained_date", fallback_date),
                "total_records_processed": meta.get("total_records_processed", 298450),
                "active_monitored_zones": meta.get("active_monitored_zones", 254)
            }
            
        return {"status": "Offline", "last_trained_date": fallback_date, "total_records_processed": 0, "active_monitored_zones": 0}
    except Exception as e:
        return {"status": "Error", "detail": str(e)}


# Dashboard Analytics  
ANALYTICS_CACHE = {}

@app.get("/api/v1/analytics/dashboard")
def get_dashboard_analytics(day: str = "Monday"):
    """
    Generates aggregated data for the frontend charting components.
    Includes Smart Caching for instant load times.
    """
    global ANALYTICS_CACHE
    
    # Create a unique cache key based on the day AND the current model version
    model_version = predictor.meta.get("last_trained_date", "v1")
    cache_key = f"{day}_{model_version}"
    
    # RETURN CACHED DATA IF AVAILABLE (0.01 second load time)
    if cache_key in ANALYTICS_CACHE:
        print(f"⚡ [Analytics] Cache present for {day}. Returning cache...")
        return ANALYTICS_CACHE[cache_key]

    print(f"⚡ [Analytics] Cache miss for {day}. Running Vectorized inference pipeline...")

    # Vectorized method (Instantly gets all 24 hours)
    trend_data = predictor.predict_24h_trend(day)

    # Get Top 5 Critical Hotspots for the *current* hour
    current_hour = datetime.now().hour
    current_predictions = predictor.predict_batch(predictor.hotspots, current_hour, day)

    # Filter out 'No Junction' before sorting
    valid_predictions = [
        p for p in current_predictions 
        if "No Junction" not in str(predictor.hotspot_lookup.get(p["hex_id"], {}).get("primary_junction", ""))
    ]
    
    sorted_spots = sorted(valid_predictions, key=lambda x: x["impact_score"], reverse=True)

    # Deduplication 
    top_hotspots = []
    seen_names = set()
    
    for spot in sorted_spots[:5]:
        raw_name = predictor.hotspot_lookup.get(spot["hex_id"], {}).get("primary_junction", "Unknown")
        clean_name = raw_name.split(" - ")[1].strip() if " - " in raw_name else raw_name
        clean_name = clean_name.replace("Junction", "").strip()
        
        # Skip if it's a generic hex, unknown, or we already added this junction
        if "No" in clean_name or "Unknown" in clean_name or clean_name in seen_names:
            continue
            
        top_hotspots.append({
            "location": clean_name[:12] + "..." if len(clean_name) > 12 else clean_name,
            "impact": spot["impact_score"]
        })
        seen_names.add(clean_name)
        
        if len(top_hotspots) >= 5: # Stop once we have 5 unique junctions
            break

    # --- For CHART: Risk Quadrant (Scatter Plot) ---
    risk_quadrant = []
    # Take the top 40 hotspots to populate the scatter plot
    for spot in sorted_spots[:40]:
        hex_data = predictor.hotspot_lookup.get(spot["hex_id"], {})
        raw_name = hex_data.get("primary_junction", "Zone")
        clean_name = raw_name.split(" - ")[1].strip() if " - " in raw_name else raw_name
        
        # Scale repeat_factor (0 to 1) up to 100 for better chart visibility
        repeat_percentage = hex_data.get("repeat_factor", 0) * 100
        
        risk_quadrant.append({
            "name": clean_name,
            "impact": spot["impact_score"],
            "chronicity": round(repeat_percentage, 1),
            "volume": hex_data.get("total_volume", 10) # Used for bubble size
        })

    # Violation Diversity (Mocked/Aggregated)
    violation_distribution = [
        {"name": "Double Parking", "value": 45},
        {"name": "Bus Stop Blockage", "value": 25},
        {"name": "Intersection Spillover", "value": 20},
        {"name": "No Parking Zone", "value": 10},
    ]
    
    # Weekly Congestion Signature (Operational Rostering for Radar Chart)
    # Calculate a dynamic baseline from the current predictions to keep it ultra fast
    if valid_predictions:
        worst_zones = sorted(valid_predictions, key=lambda x: x["impact_score"], reverse=True)[:50]
        base_risk = sum(p["impact_score"] for p in worst_zones) / len(worst_zones)
    else:
        base_risk = 40.0

    # Apply realistic urban traffic multipliers (Fridays/Saturdays are peak)
    weekly_signature = [
        {"day": "Mon", "risk": round(base_risk * 0.85, 1)},
        {"day": "Tue", "risk": round(base_risk * 0.90, 1)},
        {"day": "Wed", "risk": round(base_risk * 0.95, 1)},
        {"day": "Thu", "risk": round(base_risk * 1.05, 1)},
        {"day": "Fri", "risk": round(base_risk * 1.45, 1)},
        {"day": "Sat", "risk": round(base_risk * 1.60, 1)},
        {"day": "Sun", "risk": round(base_risk * 1.15, 1)},
    ]

    final_payload = {
        "trend_data": trend_data,
        "top_hotspots": top_hotspots,
        "risk_quadrant": risk_quadrant,
        "weekly_signature": weekly_signature,
        "violation_distribution": violation_distribution,
    }
    
    ANALYTICS_CACHE[cache_key] = final_payload
    return final_payload
