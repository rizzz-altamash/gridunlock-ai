# DELETE THIS FILE -- it's been replaced by src/model/inference.py, which has the same code logic but more accurate.

import os
from pathlib import Path
import numpy as np
import pandas as pd
import joblib
import h3

HEX_RESOLUTION = 9
BENGALURU_CENTER = (12.9716, 77.5946)

# Resolved relative to this file's location (backend/src/api/services.py),
# not the current working directory -- so it works no matter where uvicorn
# is launched from. Override with the ARTIFACTS_DIR env var if needed.
DEFAULT_ARTIFACTS_DIR = Path(__file__).resolve().parent.parent / "model" / "artifacts"
ARTIFACTS_DIR = Path(os.environ.get("ARTIFACTS_DIR", DEFAULT_ARTIFACTS_DIR))


def haversine(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    c = 2 * np.arcsin(np.sqrt(np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2))
    return 6371 * c


class HotspotIntelligenceService:
    """
    Loads the trained model and the precomputed hotspot table once at startup.
    The hotspot table (final_hotspots) is the "retrospective" layer -- it's
    regenerated periodically by re-running Phases 1-3 of the notebook against
    a rolling window of fresh violation data, NOT recomputed live in the API.
    The model is the "predictive" layer -- it answers "what would the impact
    look like at this place/time" even for combinations not in that table.
    """

    def __init__(self, artifacts_dir: Path = ARTIFACTS_DIR):
        artifacts_dir = Path(artifacts_dir)
        self.model = joblib.load(artifacts_dir / "xgb_master.pkl")
        self.le_junc = joblib.load(artifacts_dir / "junction_encoder.pkl")
        self.meta = joblib.load(artifacts_dir / "meta.pkl")
        self.hotspots = pd.read_json(artifacts_dir / "final_hotspots.json")
        self.hotspots_by_hex = self.hotspots.set_index("hex_id")
        self.known_junction_classes = set(self.le_junc.classes_)

    # ---------- Hotspot listing (precomputed, no model call) ----------

    def list_hotspots(self, min_score: float = 0.0, limit: int = 100) -> list[dict]:
        df = self.hotspots[self.hotspots["impact_score"] >= min_score].copy()
        df = df.sort_values("impact_score", ascending=False).head(limit)
        return [self._hotspot_row_to_dict(row) for _, row in df.iterrows()]

    def get_hotspot(self, hex_id: str) -> dict | None:
        if hex_id not in self.hotspots_by_hex.index:
            return None
        row = self.hotspots_by_hex.loc[hex_id]
        return self._hotspot_row_to_dict(row, hex_id=hex_id)

    def _hotspot_row_to_dict(self, row, hex_id: str | None = None) -> dict:
        hid = hex_id or row["hex_id"]
        boundary = [list(coord) for coord in h3.cell_to_boundary(hid)]
        return {
            "hex_id": hid,
            "center_lat": float(row["center_lat"]),
            "center_lon": float(row["center_lon"]),
            "boundary": boundary,
            "total_volume": int(row["total_volume"]),
            "impact_score": float(row["impact_score"]),
            "peak_hour": int(row["peak_hour"]),
            "peak_day": str(row["peak_day"]),
            "dominant_violation": str(row["dominant_violation"]),
            "primary_junction": str(row["primary_junction"]),
        }

    # ---------- Prediction (model call, works for unseen locations too) ----------

    def _safe_encode_junction(self, junction_name: str) -> int:
        label = junction_name if junction_name in self.known_junction_classes else self.meta["unknown_junction_label"]
        return int(self.le_junc.transform([label])[0])

    def _resolve_location(self, hex_id=None, junction_name=None, latitude=None, longitude=None):
        """
        Returns (center_lat, center_lon, junction_name, is_known_hotspot).
        Never raises on an unseen location -- that's the whole point.
        """
        if hex_id:
            if hex_id in self.hotspots_by_hex.index:
                row = self.hotspots_by_hex.loc[hex_id]
                return float(row["center_lat"]), float(row["center_lon"]), str(row["primary_junction"]), True
            lat, lon = h3.cell_to_latlng(hex_id)
            return lat, lon, "Unknown", False

        if junction_name:
            matches = self.hotspots[self.hotspots["primary_junction"] == junction_name]
            if not matches.empty:
                row = matches.iloc[0]
                return float(row["center_lat"]), float(row["center_lon"]), junction_name, True
            if latitude is not None and longitude is not None:
                hid = h3.latlng_to_cell(latitude, longitude, HEX_RESOLUTION)
                known = hid in self.hotspots_by_hex.index
                return latitude, longitude, junction_name, known
            raise ValueError(
                f"Junction '{junction_name}' isn't in the known hotspot set. "
                "Provide latitude/longitude so the location can still be resolved."
            )

        hid = h3.latlng_to_cell(latitude, longitude, HEX_RESOLUTION)
        if hid in self.hotspots_by_hex.index:
            row = self.hotspots_by_hex.loc[hid]
            return latitude, longitude, str(row["primary_junction"]), True
        return latitude, longitude, "Unknown", False

    def predict(self, hour: int, day_of_week: str, hex_id=None, junction_name=None, latitude=None, longitude=None) -> dict:
        center_lat, center_lon, resolved_junction, is_known = self._resolve_location(
            hex_id=hex_id, junction_name=junction_name, latitude=latitude, longitude=longitude
        )
        resolved_hex_id = hex_id or h3.latlng_to_cell(center_lat, center_lon, HEX_RESOLUTION)

        day_map = {"Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6}
        day_idx = day_map[day_of_week]

        features = pd.DataFrame([{
            "center_lat": center_lat,
            "center_lon": center_lon,
            "is_weekend": int(day_of_week in ("Saturday", "Sunday")),
            "is_peak_hour": int(hour in [8, 9, 10, 11, 17, 18, 19, 20]),
            "hour_sin": np.sin(2 * np.pi * hour / 24.0),
            "hour_cos": np.cos(2 * np.pi * hour / 24.0),
            "day_sin": np.sin(2 * np.pi * day_idx / 7.0),
            "day_cos": np.cos(2 * np.pi * day_idx / 7.0),
            "dist_to_center": haversine(center_lat, center_lon, *BENGALURU_CENTER),
            "junction_encoded": self._safe_encode_junction(resolved_junction),
        }])[self.meta["feature_order"]]

        # raw_pred = float(self.model.predict(features)[0])
        # scaled_score = float(np.clip(raw_pred / self.meta["max_target_impact"] * 100, 0, 100))

        # Fetch the raw prediction
        raw_pred = float(self.model.predict(features)[0])
        raw_pred = max(0.0, raw_pred) # Prevent negative predictions
        
        # HACKATHON UX FIX: Square Root Scaling
        # This pulls moderate traffic up into the 30-60 range so the dashboard isn't completely flat,
        # while keeping the absolute worst intersections pegged at 100.
        ceiling = float(self.meta["max_target_impact"])
        if ceiling <= 0: ceiling = 1.0
        
        scaled_score = float(np.clip( (np.sqrt(raw_pred) / np.sqrt(ceiling)) * 100, 0, 100 ))

        note = None
        if not is_known:
            note = "This location wasn't part of the historical top-10% hotspot set -- treat this as an early signal, not a confirmed hotspot."

        return {
            "predicted_target_impact": raw_pred,
            "predicted_impact_score": scaled_score,
            "resolved_hex_id": resolved_hex_id,
            "resolved_junction": resolved_junction,
            "is_known_hotspot": is_known,
            "note": note,
        }