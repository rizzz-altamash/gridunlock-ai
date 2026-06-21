<h1 align="center">
  🚦 GridUnlock AI: Proactive Parking Intelligence Engine
</h1>

<p align="center">
  <a href="https://gridunlock-ai.vercel.app/" target="_blank">
    <img src="https://img.shields.io/badge/🌐_L I V E - VISIT_WEBSITE-success?style=plastic" />
  </a>
</p>

<div align="center">
  
[![My Skills](https://skillicons.dev/icons?i=fastapi,react,nextjs,tailwind,postgres,py,nodejs,js,npm,vercel,github,git)](https://skillicons.dev)

[![XGBoost](https://img.shields.io/badge/XGBoost-17A2B8?style=plastic)](https://xgboost.readthedocs.io/)
[![Optuna](https://img.shields.io/badge/Optuna-0066CC?style=plastic)](https://optuna.org/)
[![Uber H3](https://img.shields.io/badge/Uber_H3-000000?style=plastic&logo=uber&logoColor=white)](https://h3geo.org/)
[![LangGraph](https://img.shields.io/badge/LangGraph-02569B?style=plastic&logo=python&logoColor=white)](https://python.langchain.com/docs/langgraph)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-4285F4?style=plastic&logo=google&logoColor=white)](https://ai.google.dev/)
[![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=plastic&logo=leaflet&logoColor=white)](https://leafletjs.com/)
[![Railway](https://img.shields.io/badge/Railway-0B0D0E?style=plastic&logo=railway&logoColor=white)](https://railway.app/)
[![OpenWeatherMap](https://img.shields.io/badge/OpenWeatherMap-EB6E4B?style=plastic&logo=icloud&logoColor=white)](https://openweathermap.org/)

</div>

**GridUnlock AI** is an enterprise-grade, spatio-temporal machine learning platform designed to solve urban traffic congestion caused by illegal and spillover parking. By transitioning traffic enforcement from a reactive, patrol-based approach to a proactive, AI-driven deployment strategy, GridUnlock allows city commanders to predict choke points before they happen.

---

## 🛑 The GridLock Problem

### 1. Reactive Enforcement
Traffic police rely on blind patrols and only respond *after* carriageways are choked.

### 2. Poor Visibility
No unified heatmap linking isolated parking violations to systemic congestion impact.

### 3. Resource Misallocation
Difficult to prioritize limited enforcement units across a massive urban grid.

---

## 🟢 My GridUnlock Solution

GridUnlock AI ingests raw municipal traffic data, indexes it using **O(1) geospatial hashing**, and passes it through a GPU-tuned XGBoost predictive engine. The result is a dynamic **Congestion Impact Score (0-100)** visualized on a live tactical dashboard, guided by an autonomous Multi-Agent AI Commander.

---

# 🏗️ System Architecture & Key Features

## 1. Spatio-Temporal ML Engine

### 🔹 H3 Geospatial Indexing
Bypasses computationally heavy **O(N²)** density algorithms (such as DBSCAN) in favor of Uber's H3 Hexagonal Spatial Hashes.

Maps over **300,000 localized parking violations** into standardized patrol beats in **O(N)** time.

### 🔹 Contextual XGBoost Prediction
A Spatio-Temporal Regressor engineered with:

- Cyclical temporal features (Sine/Cosine encoding for hours and days)
- Haversine distance calculations
- Spatial awareness of commercial zones, metro stations, and suburban regions

This allows the model to distinguish between routine parking activity and high-impact spillover congestion.

### 🔹 GPU-Accelerated Optuna Tuning
Hyperparameter optimization executed on an **NVIDIA RTX 4060** using:

- Optuna
- 5-Fold Cross Validation

Designed to maximize out-of-sample accuracy while reducing overfitting.

---

## 2. MLOps & Continuous Training (CT) Pipeline

### 🔹 Zero-Downtime Hot Swapping

As urban infrastructure evolves, the model evolves with it.
The backend features a CT pipeline that retrains the XGBoost architecture.

Uploading a new traffic dataset automatically triggers:

- Background retraining using FastAPI `BackgroundTasks`
- Isolated model rebuilding
- Automatic hot-loading of updated weights into memory

All without dropping a single API request.

### 🔹 OpenBLAS Thread Safety

Engineered to prevent container out-of-memory crashes by restricting excessive thread spawning from:

- NumPy
- XGBoost
- OpenBLAS

at the operating-system level.

---

## 3. Tactical Command Interface (Multi-Agent AI)

### 🔹 LangGraph Autonomous Officer

A stateful AI agent equipped with custom tools:

- `get_coordinates`
- `check_parking_impact`
- `get_weather_conditions`
- `get_top_hotspots`

allowing it to perform actionable traffic intelligence tasks.

### 🔹 Memory & Resilience

Powered by:

- LangGraph Checkpointing
- PostgreSQL Memory Store

Features include:

- API key rotation
- Persistent conversation memory
- Database cold-start recovery
- Cloud deployment resiliency

### 🔹 Interactive Next.js Dashboard

The frontend command center provides:

- Interactive Leaflet maps
- Dynamic H3 hexagon rendering
- Real-time congestion visualization
- Streaming AI responses
- Terminal-style intelligence reports

---

# 🖥️ Tactical Command Interface (Frontend)

The GridUnlock AI frontend is not a conventional web dashboard—it is a **Real-Time Tactical Command Interface** engineered for city commanders and traffic enforcement teams.

Built using **Next.js** and **Tailwind CSS**, the interface seamlessly combines geospatial intelligence, temporal machine learning visualization, and an autonomous AI officer into a unified, low-latency operational viewport.

---

## 🗺️ Geospatial Visualization Engine

Rendering hundreds of thousands of traffic records directly on a browser map would create severe performance bottlenecks. GridUnlock solves this by visualizing **Uber H3 Spatial Hashes** rather than raw coordinate points.

### 🔹 SSR Hydration Strategy

To eliminate the common `window is not defined` issues associated with React geospatial libraries, the Leaflet map is isolated to client-side execution using a carefully configured Next.js dynamic import strategy.

### 🔹 Algorithmic Geometry

The frontend dynamically decodes backend-provided `hex_id` values using **h3-js**, instantly generating precise polygon boundaries and rendering them on top of a CartoDB tile layer.

### 🔹 Data-Rich Tooltips

Each H3 polygon contains interactive tooltips that expose key machine learning insights on hover, including:

- Congestion Impact Score
- Severity Estimation
- Relative Violation Volume (%)
- Peak Choke Time
- Dominant Violation Type

---

## ⏱️ 4D Temporal ML Scrubbing

One of GridUnlock's most powerful capabilities is the visualization of the fourth dimension: **Time**.

### 🔹 Predictive Radar

A premium frosted-glass control panel allows commanders to switch between:

- **Global Heatmap** (Historical Data)
- **Predictive Radar** (Current/Future Forecasts)

### 🔹 Cinematic Auto-Play

A time slider enables users to scrub through the full 24-hour day:

```text
00:00 → 23:00
```

An integrated Auto-Play mode advances time automatically, allowing commanders to watch congestion zones evolve dynamically as rush-hour patterns emerge across the city.

### 🔹 Debounced Orchestration

To prevent excessive backend requests during timeline scrubbing, a strict **400ms debounce mechanism** ensures simulation APIs are only queried after user interaction stabilizes.

This dramatically reduces unnecessary XGBoost inference calls while maintaining a smooth user experience.

---

## 🤖 Autonomous Intelligence Terminal

Traditional filter-heavy dashboards have been replaced by a conversational command center powered by **LangGraph Agent**.

### 🔹 Tactical Quick Actions

A horizontally scrollable command palette provides rapid-access prompts such as:

```text
Initiate radar sweep for worst hotspots
```

```text
Analyze parking impact at Elite Junction
```

```text
Generate deployment recommendations
```

Selecting a quick action automatically populates the command field and focuses the cursor for rapid operational workflows.

---

## 📡 Data-Driven Live Telemetry Ticker

To ensure the dashboard remains operationally active even during idle periods, GridUnlock AI includes a continuously updating telemetry feed.

### 🔹 Observer Pattern Architecture

The ticker acts as an observer over the live XGBoost prediction payloads currently rendered on the map.

It continuously samples active congestion zones and generates real-time situational updates.

### 🔹 Dynamic Threat Assignment

Telemetry messages are automatically categorized based on the Machine Learning impact score.

Examples include:

```text
[ALERT] Target Lock: Safina Plaza (Severity: 84.2)
```

```text
[WARNING] Spillover Parking Escalation Detected
```

```text
[INFO] Routine Clearance Patrol Recommended
```

### 🔹 Organic Animation Flow

Using Tailwind CSS animation utilities, new telemetry events smoothly slide into view while older entries are pushed upward, creating an authentic dispatch-style operational feed.

---

## ⚙️ Integrated MLOps (Continuous Training Interface)

GridUnlock AI is not a static prototype.

The platform includes a fully integrated **Continuous Training (CT) Interface**, allowing administrators to update the Machine Learning engine directly from the dashboard.

### 🔹 Drag-and-Drop Retraining Pipeline

Users can securely upload new anonymized traffic datasets through a drag-and-drop upload zone.

Dataset submission automatically triggers:

1. Validation
2. Background Retraining
3. ML Model Rebuilding
4. Hot Weight Swapping
5. Dashboard Refresh

without interrupting active operations.

### 🔹 Live Architecture Status

The CT dashboard exposes real-time machine learning metadata including:

- Active Model Status
- Last Training Timestamp
- Total Records Processed
- Active H3 Hash Count
- Current Deployment Version

This transparency transforms the machine learning pipeline from a black box into an observable operational system.

---

## 🌟 Frontend Highlights

- Real-Time Tactical Command Interface
- Dynamic H3 Hex Rendering
- Temporal Congestion Forecast Visualization
- Live Telemetry Ticker
- LangGraph-Powered AI Officer
- Streaming Intelligence Reports
- Continuous Training Dashboard
- Premium Frosted-Glass UI Design
- Debounced ML Simulation Engine
- High-Performance Client-Side Rendering

# 🛠️ Technology Stack

| Domain | Technologies Used |
|----------|------------------|
| **Machine Learning** | XGBoost, Scikit-Learn, Optuna, H3 (Uber), Pandas, NumPy |
| **Backend / API** | Python, FastAPI, Pydantic, Joblib |
| **AI Agent** | LangChain, LangGraph, Google Gemini, PostgreSQL |
| **Frontend / UI** | Next.js, React, Tailwind CSS, React-Leaflet, Axios |
| **External APIs** | OpenStreetMap (Nominatim), OpenWeatherMap API |

---

# 🚀 Getting Started (Local Development)

Follow these steps to deploy GridUnlock AI locally.

---

## 📋 Prerequisites

- Python 3.10+
- Node.js 18+
- PostgreSQL Database (Neon, Supabase, or Local)

---

# 1️⃣ Backend Setup (FastAPI + ML)

```bash
# Clone the repository
git clone https://github.com/yourusername/gridunlock-ai.git

# Move into backend
cd gridunlock-ai/backend

# Create virtual environment
python -m venv venv

# Activate environment

# Linux / macOS
source venv/bin/activate

# Windows
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create environment file
cp .env.example .env
```

### Configure `.env`

```env
DATABASE_URL=postgresql://user:password@host:port/dbname

API_URL=http://127.0.0.1:8000

GEMINI_API_KEY_1=your_gemini_key_1
GEMINI_API_KEY_2=your_gemini_key_2
GEMINI_API_KEY_3=your_gemini_key_3

OPENWEATHERMAP_API_KEY=your_owm_key
```

### Start Backend

```bash
uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000
```

The backend will:

- Initialize database pools
- Load trained XGBoost artifacts
- Start prediction services
- Launch AI agent endpoints

---

# 2️⃣ Frontend Setup (Next.js)

Open a new terminal.

```bash
cd gridunlock-ai/frontend

npm install

cp .env.local.example .env.local
```

### Configure `.env.local`

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

### Start Frontend

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

to access the GridUnlock Command Center.

---

# 🎮 Usage Guide

## 1. Explore the Grid

Hover over color-coded H3 hexagons on the map to inspect:

- Congestion Impact Score
- Relative Violation Volume
- Peak Choke Time
- Junction Information

---

## 2. Talk to the AI Officer

Use the chat panel to request intelligence reports.

### Example Prompts

```text
What is the parking situation near KR Market Junction today?
```

```text
Run a global radar sweep for the top 5 worst hotspots right now.
```

```text
How will the weather affect deployment near Windsor Circle?
```

---

## 3. Trigger the Continuous Training Pipeline

Click:

```text
Update Dataset
```

in the navigation bar and upload a new anonymized traffic dataset.

The backend will:

1. Validate the dataset
2. Launch background retraining
3. Rebuild the XGBoost model
4. Hot-swap updated weights
5. Refresh dashboard predictions

without downtime.

---

# 🌟 Key Innovations

- H3-based O(N) spatial aggregation
- GPU-Accelerated XGBoost optimization
- Continuous Training (CT) Pipeline
- Multi-Agent LangGraph Traffic Commander
- Real-Time Tactical Dashboard
- Weather-Aware Congestion Intelligence
- Zero-Downtime Model Updates

---

# 📈 Future Roadmap

- Live CCTV Integration
- ANPR (Automatic Number Plate Recognition)
- Reinforcement Learning for Patrol Optimization
- Multi-City Deployment Framework
- Predictive Event-Based Congestion Forecasting
- Smart Traffic Signal Integration

---

## Built for the Future of Urban Mobility 🚦
