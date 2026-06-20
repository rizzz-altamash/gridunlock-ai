# # backend/src/model/inference.py 
# import joblib
# import json
# import h3
# import math
# import pandas as pd
# import os

# class ParkingImpactPredictor:
#     def __init__(self, artifacts_dir: str):
#         self.model = joblib.load(os.path.join(artifacts_dir, 'xgb_master.pkl'))
#         self.encoder = joblib.load(os.path.join(artifacts_dir, 'junction_encoder.pkl'))
#         self.meta = joblib.load(os.path.join(artifacts_dir, 'meta.pkl'))
        
#         with open(os.path.join(artifacts_dir, 'final_hotspots.json'), 'r') as f:
#             self.hotspots = json.load(f)
        
#         self.hotspot_hex_ids = {item['hex_id'] for item in self.hotspots}
            
#     def predict(self, lat: float, lon: float, hour: int, day_of_week: str, junction: str):
#         # 1. Spatial Hashing & Center Extraction
#         hex_resolution = 9 
#         hex_id = h3.latlng_to_cell(lat, lon, hex_resolution)
#         center_lat, center_lon = h3.cell_to_latlng(hex_id)
        
#         # 2. Safely Encode Junction 
#         if junction in self.encoder.classes_:
#             junc_enc = self.encoder.transform([junction])[0]
#         else:
#             junc_enc = self.encoder.transform([self.meta['unknown_junction_label']])[0]
            
#         # 3. Temporal Feature Engineering (Matching your Notebook)
#         day_map = {"Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6}
#         day_enc = day_map.get(day_of_week, 0)
        
#         # Boolean Flags
#         is_weekend = 1 if day_of_week in ["Saturday", "Sunday"] else 0
#         is_peak_hour = 1 if hour in [8, 9, 10, 11, 17, 18, 19, 20] else 0
        
#         # Cyclical Encodings (so the model knows 23:00 is close to 01:00)
#         hour_sin = math.sin(2 * math.pi * hour / 24)
#         hour_cos = math.cos(2 * math.pi * hour / 24)
#         day_sin = math.sin(2 * math.pi * day_enc / 7)
#         day_cos = math.cos(2 * math.pi * day_enc / 7)
        
#         # 4. Distance to City Center Calculation (Haversine in KM)
#         # Using the exact mean center from my notebook's Folium map
#         CITY_CENTER_LAT = 12.9774265
#         CITY_CENTER_LON = 77.6023761
        
#         dist_to_center = math.sqrt((center_lat - CITY_CENTER_LAT)**2 + (center_lon - CITY_CENTER_LON)**2)
        
#         # 5. Construct Feature DataFrame ensuring exact matching columns
#         input_data = {
#             'center_lat': center_lat,
#             'center_lon': center_lon,
#             'is_weekend': is_weekend,
#             'is_peak_hour': is_peak_hour,
#             'hour_sin': hour_sin,
#             'hour_cos': hour_cos,
#             'day_sin': day_sin,
#             'day_cos': day_cos,
#             'dist_to_center': dist_to_center,
#             'junction_encoded': junc_enc
#         }
        
#         features = pd.DataFrame([input_data])
#         # Strict enforcement of column order based on the metadata
#         features = features[self.meta['feature_order']]

#         print("EXPECTED COLUMNS:", self.meta['feature_order'])
#         print("GIVEN COLUMNS:", features.columns.tolist())
#         print("DATA FED TO MODEL:", features.iloc[0].to_dict())
        
#         # 6. Inference (Raw Score)
#         input_array = features.to_numpy()
#         raw_score = float(self.model.predict(input_array)[0])
        
#         # 7. Dynamic Scaling (Mapping raw XGBoost output to a 0-100 Impact Score)
#         # Assuming the max raw score we expect is around 400 based on my tests 
#         # We clip the floor to 0 so we never return negative numbers 
#         ESTIMATED_MAX_RAW_SCORE = 350.0 
        
#         # Normalize to 0-100 range
#         normalized_score = (max(0.0, raw_score) / ESTIMATED_MAX_RAW_SCORE) * 100.0
        
#         # Cap at 100 just in case a freak prediction goes over
#         final_impact_score = min(100.0, normalized_score)
        
#         # 8. Severity Thresholds 
#         if final_impact_score >= 75.0:
#             severity = "Critical"
#         elif final_impact_score >= 30.0:
#             severity = "High"
#         elif final_impact_score >= 5.0:
#             severity = "Moderate"
#         else:
#             severity = "Low"
        
#         return {
#             "impact_score": round(final_impact_score, 2),
#             "impact_level": severity,
#             "hex_id": hex_id,
#             "is_hotspot": hex_id in self.hotspot_hex_ids
#         }
    



import os
import json
import math
import joblib
import h3
import numpy as np
import pandas as pd


class ParkingImpactPredictor:

    def __init__(self, artifacts_dir: str):

        self.model = joblib.load(
            os.path.join(artifacts_dir, "xgb_master.pkl")
        )

        self.encoder = joblib.load(
            os.path.join(artifacts_dir, "junction_encoder.pkl")
        )

        self.meta = joblib.load(
            os.path.join(artifacts_dir, "meta.pkl")
        )

        with open(
            os.path.join(
                artifacts_dir,
                "final_hotspots.json"
            ),
            "r",
        ) as f:
            self.hotspots = json.load(f)

        self.hotspot_lookup = {
            item["hex_id"]: item
            for item in self.hotspots
        }

        self.hotspot_hex_ids = set(
            self.hotspot_lookup.keys()
        )

    # -----------------------------------------------------

    def haversine(self, lat1, lon1, lat2, lon2):

        lat1, lon1, lat2, lon2 = map(
            np.radians,
            [
                lat1,
                lon1,
                lat2,
                lon2
            ]
        )

        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = (
            np.sin(dlat / 2) ** 2
            +
            np.cos(lat1)
            *
            np.cos(lat2)
            *
            np.sin(dlon / 2) ** 2
        )

        c = 2 * np.arcsin(np.sqrt(a))
        return 6371 * c

    # -----------------------------------------------------

    def predict(self, lat, lon, hour, day_of_week, junction):

        hex_resolution = self.meta["hex_resolution"]

        hex_id = h3.latlng_to_cell(
            lat,
            lon,
            hex_resolution
        )

        center_lat, center_lon = h3.cell_to_latlng(
            hex_id
        )

        # -------------------------

        hotspot = self.hotspot_lookup.get(
            hex_id,
            None
        )

        if hotspot:
            total_volume = hotspot["total_volume"]
            repeat_factor = hotspot["repeat_factor"]
            violation_diversity = hotspot[
                "unique_violation_types"
            ]

        else:
            total_volume = 0
            repeat_factor = 0
            violation_diversity = 0

        historical_density = np.log1p(
            total_volume
        )

        # -------------------------

        if junction in self.encoder.classes_:
            junction_encoded = (
                self.encoder.transform(
                    [junction]
                )[0]
            )

        else:
            junction_encoded = (
                self.encoder.transform(
                    [
                        self.meta[
                            "unknown_junction_label"
                        ]
                    ]
                )[0]
            )

        # -------------------------

        is_weekend = int(
            day_of_week
            in [
                "Saturday",
                "Sunday"
            ]
        )

        peak_hours = self.meta["peak_hours"]

        is_peak_hour = int(
            hour in peak_hours
        )

        interaction = (
            is_peak_hour
            *
            historical_density
        )

        # -------------------------

        hour_sin = math.sin(
            2 * math.pi * hour / 24
        )

        hour_cos = math.cos(
            2 * math.pi * hour / 24
        )

        day_map = {
            "Monday": 0,
            "Tuesday": 1,
            "Wednesday": 2,
            "Thursday": 3,
            "Friday": 4,
            "Saturday": 5,
            "Sunday": 6,
        }

        day_idx = day_map.get(
            day_of_week,
            0
        )

        day_sin = math.sin(
            2 * math.pi * day_idx / 7
        )

        day_cos = math.cos(
            2 * math.pi * day_idx / 7
        )

        # -------------------------

        city_lat = self.meta["city_center"]["lat"]
        city_lon = self.meta["city_center"]["lon"]
        dist_to_center = self.haversine(
            center_lat,
            center_lon,
            city_lat,
            city_lon
        )

        # -------------------------

        input_data = {
            "center_lat": center_lat,
            "center_lon": center_lon,
            "is_weekend": is_weekend,
            "is_peak_hour": is_peak_hour,
            "hour_sin": hour_sin,
            "hour_cos": hour_cos,
            "day_sin": day_sin,
            "day_cos": day_cos,
            "dist_to_center": dist_to_center,
            "junction_encoded": junction_encoded,
            "historical_density": historical_density,
            "repeat_factor": repeat_factor,
            "violation_diversity": violation_diversity,
            "interaction": interaction,
        }

        features = pd.DataFrame(
            [input_data]
        )

        features = features[
            self.meta["feature_order"]
        ]

        prediction = float(
            self.model.predict(features)[0]
        )

        impact_score = max(
            0.0,
            min(
                100.0,
                prediction
            ),
        )

        # -------------------------

        if impact_score >= 70:
            priority = "Critical"
            action = (
                "Deploy Immediate Enforcement Team"
            )

        elif impact_score >= 30:
            priority = "High"
            action = (
                "Increase Patrol Frequency"
            )

        elif impact_score >= 5:
            priority = "Moderate"
            action = (
                "Monitor During Peak Hours"
            )

        else:
            priority = "Low"
            action = (
                "Routine Monitoring"
            )

        return {
            "impact_score": round(
                impact_score,
                2,
            ),
            "priority": priority,
            "recommended_action": action,
            "hex_id": hex_id,
            "is_hotspot": hex_id
            in self.hotspot_hex_ids,
        }
