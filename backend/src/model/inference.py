# backend/src/model/inference.py 

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

    # -----------------------------------------------------

    def predict_batch(self, zones, hour, day_of_week):
        """
        Highly optimized batch inference for the global map.
        Processes hundreds of zones in a single XGBoost pass.
        """
        # 1. Pre-compute time features (these are the same for all zones in the hour)
        is_weekend = int(day_of_week in ["Saturday", "Sunday"])
        is_peak_hour = int(hour in self.meta["peak_hours"])
        
        hour_sin = math.sin(2 * math.pi * hour / 24)
        hour_cos = math.cos(2 * math.pi * hour / 24)
        
        day_map = {"Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6}
        day_idx = day_map.get(day_of_week, 0)
        day_sin = math.sin(2 * math.pi * day_idx / 7)
        day_cos = math.cos(2 * math.pi * day_idx / 7)
        
        city_lat = self.meta["city_center"]["lat"]
        city_lon = self.meta["city_center"]["lon"]

        batch_data = []
        hex_ids = []

        # 2. Build the list of dictionaries purely in Python (Lightning Fast)
        for zone in zones:
            hex_id = zone.get("hex_id")
            center_lat = zone["center_lat"]
            center_lon = zone["center_lon"]
            junction = zone.get("primary_junction", "No Junction")

            total_volume = zone.get("total_volume", 0)
            historical_density = np.log1p(total_volume) if total_volume > 0 else 0

            if junction in self.encoder.classes_:
                junction_encoded = self.encoder.transform([junction])[0]
            else:
                junction_encoded = self.encoder.transform([self.meta["unknown_junction_label"]])[0]

            batch_data.append({
                "center_lat": center_lat,
                "center_lon": center_lon,
                "is_weekend": is_weekend,
                "is_peak_hour": is_peak_hour,
                "hour_sin": hour_sin,
                "hour_cos": hour_cos,
                "day_sin": day_sin,
                "day_cos": day_cos,
                "dist_to_center": self.haversine(center_lat, center_lon, city_lat, city_lon),
                "junction_encoded": junction_encoded,
                "historical_density": historical_density,
                "repeat_factor": zone.get("repeat_factor", 0),
                "violation_diversity": zone.get("unique_violation_types", 0),
                "interaction": is_peak_hour * historical_density,
            })
            hex_ids.append(hex_id)

        if not batch_data:
            return []

        # 3. Create ONE DataFrame and run ONE Prediction 
        features_df = pd.DataFrame(batch_data)[self.meta["feature_order"]]
        predictions = self.model.predict(features_df)

        # 4. Map the predictions back to the output payload
        results = []
        for i, pred in enumerate(predictions):
            impact_score = max(0.0, min(100.0, float(pred)))

            if impact_score >= 70:
                priority, action = "Critical", "Deploy Immediate Enforcement Team"
            elif impact_score >= 30:
                priority, action = "High", "Increase Patrol Frequency"
            elif impact_score >= 5:
                priority, action = "Moderate", "Monitor During Peak Hours"
            else:
                priority, action = "Low", "Routine Monitoring"

            results.append({
                "impact_score": round(impact_score, 2),
                "priority": priority,
                "recommended_action": action,
                "hex_id": hex_ids[i],
                "is_hotspot": hex_ids[i] in self.hotspot_hex_ids,
                "center_lat": batch_data[i]["center_lat"],
                "center_lon": batch_data[i]["center_lon"]
            })

        return results
    