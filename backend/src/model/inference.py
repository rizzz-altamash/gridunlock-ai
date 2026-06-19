# backend/src/model/inference.py 
import joblib
import json
import h3
import math
import pandas as pd
import os

class ParkingImpactPredictor:
    def __init__(self, artifacts_dir: str):
        self.model = joblib.load(os.path.join(artifacts_dir, 'xgb_master.pkl'))
        self.encoder = joblib.load(os.path.join(artifacts_dir, 'junction_encoder.pkl'))
        self.meta = joblib.load(os.path.join(artifacts_dir, 'meta.pkl'))
        
        with open(os.path.join(artifacts_dir, 'final_hotspots.json'), 'r') as f:
            self.hotspots = json.load(f)
        
        self.hotspot_hex_ids = {item['hex_id'] for item in self.hotspots}
            
    def predict(self, lat: float, lon: float, hour: int, day_of_week: str, junction: str):
        # 1. Spatial Hashing & Center Extraction
        hex_resolution = 9 
        hex_id = h3.latlng_to_cell(lat, lon, hex_resolution)
        center_lat, center_lon = h3.cell_to_latlng(hex_id)
        
        # 2. Safely Encode Junction 
        if junction in self.encoder.classes_:
            junc_enc = self.encoder.transform([junction])[0]
        else:
            junc_enc = self.encoder.transform([self.meta['unknown_junction_label']])[0]
            
        # 3. Temporal Feature Engineering (Matching your Notebook)
        day_map = {"Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6}
        day_enc = day_map.get(day_of_week, 0)
        
        # Boolean Flags
        is_weekend = 1 if day_of_week in ["Saturday", "Sunday"] else 0
        is_peak_hour = 1 if hour in [8, 9, 10, 11, 17, 18, 19, 20] else 0
        
        # Cyclical Encodings (so the model knows 23:00 is close to 01:00)
        hour_sin = math.sin(2 * math.pi * hour / 24)
        hour_cos = math.cos(2 * math.pi * hour / 24)
        day_sin = math.sin(2 * math.pi * day_enc / 7)
        day_cos = math.cos(2 * math.pi * day_enc / 7)
        
        # 4. Distance to City Center Calculation (Haversine in KM)
        # Using the exact mean center from my notebook's Folium map
        CITY_CENTER_LAT = 12.9774265
        CITY_CENTER_LON = 77.6023761
        
        dist_to_center = math.sqrt((center_lat - CITY_CENTER_LAT)**2 + (center_lon - CITY_CENTER_LON)**2)
        
        # 5. Construct Feature DataFrame ensuring exact matching columns
        input_data = {
            'center_lat': center_lat,
            'center_lon': center_lon,
            'is_weekend': is_weekend,
            'is_peak_hour': is_peak_hour,
            'hour_sin': hour_sin,
            'hour_cos': hour_cos,
            'day_sin': day_sin,
            'day_cos': day_cos,
            'dist_to_center': dist_to_center,
            'junction_encoded': junc_enc
        }
        
        features = pd.DataFrame([input_data])
        # Strict enforcement of column order based on the metadata
        features = features[self.meta['feature_order']]

        print("EXPECTED COLUMNS:", self.meta['feature_order'])
        print("GIVEN COLUMNS:", features.columns.tolist())
        print("DATA FED TO MODEL:", features.iloc[0].to_dict())
        
        # 6. Inference (Raw Score)
        input_array = features.to_numpy()
        raw_score = float(self.model.predict(input_array)[0])
        
        # 7. Dynamic Scaling (Mapping raw XGBoost output to a 0-100 Impact Score)
        # Assuming the max raw score we expect is around 400 based on my tests 
        # We clip the floor to 0 so we never return negative numbers 
        ESTIMATED_MAX_RAW_SCORE = 350.0 
        
        # Normalize to 0-100 range
        normalized_score = (max(0.0, raw_score) / ESTIMATED_MAX_RAW_SCORE) * 100.0
        
        # Cap at 100 just in case a freak prediction goes over
        final_impact_score = min(100.0, normalized_score)
        
        # 8. Severity Thresholds 
        if final_impact_score >= 75.0:
            severity = "Critical"
        elif final_impact_score >= 30.0:
            severity = "High"
        elif final_impact_score >= 5.0:
            severity = "Moderate"
        else:
            severity = "Low"
        
        return {
            "impact_score": round(final_impact_score, 2),
            "impact_level": severity,
            "hex_id": hex_id,
            "is_hotspot": hex_id in self.hotspot_hex_ids
        }
    
