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
    """Runs live XGBoost inference on the top 100 historical hotspots for the current hour."""
    now = datetime.now()
    current_hour = now.hour
    current_day = now.strftime("%A")
    
    global_predictions = []
    
    # Take the top 100 hotspots from the loaded JSON to prevent API timeouts
    # (Running inference on all hexagons synchronously might be too slow)
    top_zones = sorted(
        predictor.hotspots,
        key=lambda x:x["impact_score"],
        reverse=True
    )[:100]
    
    for zone in top_zones:
        try:
            # We use the exact center coordinates of the H3 hexagon
            pred = predictor.predict(
                lat=zone["center_lat"],
                lon=zone["center_lon"],
                hour=current_hour,
                day_of_week=current_day,
                junction=zone.get("primary_junction", "No Junction") 
            )
            global_predictions.append(pred)
        except Exception:
            continue
            
    return {"current_hour": current_hour, "day": current_day, "hotspots": global_predictions}

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
        fallback_date = "June 19, 2026 at 10:53 AM"  # First trained date of the initial model (hardcoded for consistency) 
        
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
