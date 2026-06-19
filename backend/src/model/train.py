# backend/src/model/train.py
import argparse
import pandas as pd
import numpy as np
import h3
import math
import joblib
import os
import xgboost as xgb
from sklearn.preprocessing import LabelEncoder
from datetime import datetime

def compute_distance(lat, lon):
    # Fixed City Center (Bengaluru)
    CITY_CENTER_LAT = 12.9774265
    CITY_CENTER_LON = 77.6023761
    return math.sqrt((lat - CITY_CENTER_LAT)**2 + (lon - CITY_CENTER_LON)**2)

def run_pipeline(data_path: str):
    print(f"-> Loading dataset: {data_path}")
    df = pd.read_csv(data_path)

    # 1. Temporal & String Parsing
    df['created_datetime'] = pd.to_datetime(df['created_datetime'])
    df['hour'] = df['created_datetime'].dt.hour
    df['day_of_week'] = df['created_datetime'].dt.day_name()
    df['junction_name'] = df['junction_name'].fillna("No Junction")
    df['violation_type'] = df['violation_type'].fillna("Unknown")
    
    # 2. Spatial Hashing (H3)
    print("-> Applying Spatial Hashing (H3)...")
    df['hex_id'] = df.apply(lambda row: h3.latlng_to_cell(row['latitude'], row['longitude'], 9), axis=1)

    # ---------------------------------------------------------
    # Isolate Spatial Hotspots (90th Percentile)
    # ---------------------------------------------------------
    print("-> Filtering noise (90th Percentile Threshold)...")
    spatial_volumes = df['hex_id'].value_counts().reset_index()
    spatial_volumes.columns = ['hex_id', 'total_volume']
    
    volume_threshold = np.percentile(spatial_volumes['total_volume'], 90)
    hotspots_base = spatial_volumes[spatial_volumes['total_volume'] >= volume_threshold].copy()
    
    # Filter dataset to only include these high-density choke points
    hotspot_records = df[df['hex_id'].isin(hotspots_base['hex_id'])].copy()

    # 3. Aggregation & Impact Scoring (For the ML Model)
    print("-> Calculating Traffic Impact Scores...")
    hourly_data = hotspot_records.groupby(['hex_id', 'hour', 'day_of_week', 'junction_name']).size().reset_index(name='volume')
    
    hourly_data['center_lat'] = hourly_data['hex_id'].apply(lambda h: h3.cell_to_latlng(h)[0])
    hourly_data['center_lon'] = hourly_data['hex_id'].apply(lambda h: h3.cell_to_latlng(h)[1])

    # Traffic rules and weights
    hourly_data['is_weekend'] = hourly_data['day_of_week'].isin(['Saturday', 'Sunday']).astype(int)
    hourly_data['is_peak_hour'] = hourly_data['hour'].isin([8, 9, 10, 11, 17, 18, 19, 20]).astype(int)
    
    hourly_data['impact_score'] = hourly_data['volume'].astype(float)
    # Apply 1.2x penalty for peak hours
    hourly_data.loc[hourly_data['is_peak_hour'] == 1, 'impact_score'] *= 1.2
    # Apply 1.2x penalty for signalized junctions
    hourly_data.loc[hourly_data['junction_name'] != "No Junction", 'impact_score'] *= 1.2

    # Capture the mathematical ceiling for dynamic scaling
    max_target_impact = float(hourly_data['impact_score'].max())

    # 4. Feature Engineering for XGBoost
    hourly_data['hour_sin'] = np.sin(2 * np.pi * hourly_data['hour'] / 24)
    hourly_data['hour_cos'] = np.cos(2 * np.pi * hourly_data['hour'] / 24)
    
    day_map = {"Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6}
    hourly_data['day_enc'] = hourly_data['day_of_week'].map(day_map)
    hourly_data['day_sin'] = np.sin(2 * np.pi * hourly_data['day_enc'] / 7)
    hourly_data['day_cos'] = np.cos(2 * np.pi * hourly_data['day_enc'] / 7)
    
    hourly_data['dist_to_center'] = hourly_data.apply(lambda r: compute_distance(r['center_lat'], r['center_lon']), axis=1)

    # Encode Junctions safely
    le_junc = LabelEncoder()
    unique_junctions = list(hourly_data['junction_name'].unique()) + ["__UNKNOWN__"]
    le_junc.fit(unique_junctions)
    hourly_data['junction_encoded'] = le_junc.transform(hourly_data['junction_name'])

    # 5. Model Training
    features = [
        'center_lat', 'center_lon', 'is_weekend', 'is_peak_hour', 
        'hour_sin', 'hour_cos', 'day_sin', 'day_cos', 
        'dist_to_center', 'junction_encoded'
    ]
    
    X = hourly_data[features]
    y = hourly_data['impact_score']

    print("-> Training XGBoost Engine...")
    xgb_model = xgb.XGBRegressor(n_estimators=100, learning_rate=0.1, max_depth=6, random_state=42)
    xgb_model.fit(X, y)

    # ---------------------------------------------------------
    # 6. Rebuild UI Tooltip Contracts
    # ---------------------------------------------------------
    print("-> Compiling City Hotspot Map for UI...")
    # Extract the categorical modes (most frequent occurrences) for the frontend
    temporal_attributes = hotspot_records.groupby('hex_id').agg(
        peak_hour=('hour', lambda x: int(x.mode().iloc[0]) if not x.mode().empty else 0),
        peak_day=('day_of_week', lambda x: x.mode().iloc[0] if not x.mode().empty else 'Unknown'),
        dominant_violation=('violation_type', lambda x: x.mode().iloc[0] if not x.mode().empty else 'Unknown'),
        primary_junction=('junction_name', lambda x: x.mode().iloc[0] if not x.mode().empty else 'No Junction')
    ).reset_index()

    # Get the max impact score achieved in each hex for the color map
    max_impacts = hourly_data.groupby('hex_id')['impact_score'].max().reset_index()

    # Merge everything together for the JSON
    base_map = pd.merge(hotspots_base, temporal_attributes, on='hex_id')
    base_map = pd.merge(base_map, max_impacts, on='hex_id')
    
    # Add coordinates for Leaflet
    base_map['center_lat'] = base_map['hex_id'].apply(lambda h: h3.cell_to_latlng(h)[0])
    base_map['center_lon'] = base_map['hex_id'].apply(lambda h: h3.cell_to_latlng(h)[1])

    # ---------------------------------------------------------
    # 7. Dynamic Thresholding & Normalization
    # ---------------------------------------------------------
    ESTIMATED_MAX_RAW_SCORE = 350.0
    def get_severity(score):
        norm_score = min(100.0, (max(0, score) / ESTIMATED_MAX_RAW_SCORE) * 100.0)
        if norm_score >= 75.0: return "Critical"
        if norm_score >= 30.0: return "High"
        if norm_score >= 5.0: return "Moderate"
        return "Low"
        
    base_map['impact_level'] = base_map['impact_score'].apply(get_severity)
    # Normalize score for the JSON output (0 to 100 scale) using the fixed anchor
    base_map['impact_score'] = base_map['impact_score'].apply(
        lambda s: min(100.0, (max(0, s) / ESTIMATED_MAX_RAW_SCORE) * 100.0)
    )

    # 8. Export Contracts
    print("-> Exporting System Artifacts...")
    artifacts_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "artifacts")
    os.makedirs(artifacts_dir, exist_ok=True)
    
    joblib.dump(xgb_model, os.path.join(artifacts_dir, 'xgb_master.pkl'))
    joblib.dump(le_junc, os.path.join(artifacts_dir, 'junction_encoder.pkl'))
    
    # Restored max_target_impact to meta.pkl
    joblib.dump({
        "feature_order": features,
        "unknown_junction_label": "__UNKNOWN__",
        "last_trained_date": datetime.now().strftime("%B %d, %Y at %I:%M %p"),
        "total_records_processed": len(df),
        "active_monitored_zones": len(base_map), # Number of unique hex_ids in the final map 
    }, os.path.join(artifacts_dir, 'meta.pkl'))
    
    base_map.to_json(os.path.join(artifacts_dir, 'final_hotspots.json'), orient="records")
    
    print("✅ Pipeline execution successful. Memory structures updated.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True, help="Path to the uploaded CSV dataset")
    args = parser.parse_args()
    run_pipeline(args.data)
