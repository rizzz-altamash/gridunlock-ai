# backend/src/model/train.py

import argparse
import os
from datetime import datetime
import h3
import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.preprocessing import LabelEncoder, MinMaxScaler

# ---------------------------------------------------
# HAVERSINE
# ---------------------------------------------------

def haversine(lat1, lon1, lat2, lon2):

    lat1, lon1, lat2, lon2 = map(
        np.radians,
        [lat1, lon1, lat2, lon2]
    )

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        np.sin(dlat / 2) ** 2
        + np.cos(lat1)
        * np.cos(lat2)
        * np.sin(dlon / 2) ** 2
    )

    c = 2 * np.arcsin(np.sqrt(a))

    return 6371 * c


# ---------------------------------------------------
# MAIN
# ---------------------------------------------------

def run_pipeline(data_path):

    print("=" * 80)
    print("PARKING IMPACT TRAINING PIPELINE")
    print("=" * 80)

    df = pd.read_csv(data_path)

    # ---------------------------------------------------
    # PHASE 1
    # ---------------------------------------------------

    df = df.dropna(
        subset=[
            "latitude",
            "longitude",
            "created_datetime"
        ]
    )

    df["created_datetime"] = pd.to_datetime(
        df["created_datetime"],
        format="ISO8601"
    )

    df["hour"] = df["created_datetime"].dt.hour

    df["day_of_week"] = (
        df["created_datetime"]
        .dt.day_name()
    )

    df["junction_name"] = (
        df["junction_name"]
        .fillna("No Junction")
    )

    # ---------------------------------------------------
    # PHASE 2
    # ---------------------------------------------------

    HEX_RESOLUTION = 9

    df["hex_id"] = [
        h3.latlng_to_cell(lat, lon, HEX_RESOLUTION)
        for lat, lon in zip(
            df.latitude,
            df.longitude
        )
    ]

    hex_stats = df.groupby(
        "hex_id"
    ).agg(
        total_volume=("id", "count"),
        unique_days=("created_datetime", "nunique"),
        unique_hours=("hour", "nunique"),
        unique_violation_types=(
            "violation_type",
            "nunique"
        ),

        dominant_violation=(
            "violation_type",
            lambda x: x.mode().iloc[0]
        ),
        center_lat=("latitude", "mean"),
        center_lon=("longitude", "mean")
    ).reset_index()

    hex_stats["repeat_factor"] = (
        hex_stats["total_volume"]
        /
        hex_stats["unique_days"]
    )

    volume_threshold = np.percentile(
        hex_stats.total_volume,
        90
    )

    hotspots_base = hex_stats[
        hex_stats.total_volume
        >=
        volume_threshold
    ].copy()
    hotspot_records = df[
        df.hex_id.isin(
            hotspots_base.hex_id
        )
    ].copy()

    # ---------------------------------------------------
    # PHASE 3
    # ---------------------------------------------------

    temporal = hotspot_records.groupby(
        "hex_id"
    ).agg(
        peak_hour=(
            "hour",
            lambda x: x.mode().iloc[0]
        ),

        peak_day=(
            "day_of_week",
            lambda x: x.mode().iloc[0]
        ),

        primary_junction=(
            "junction_name",
            lambda x: x.mode().iloc[0]
        ),

        dominant_violation=(
            "violation_type",
            lambda x: x.mode().iloc[0]
        )
    ).reset_index()

    final_hotspots = hotspots_base.merge(
        temporal,
        on="hex_id"
    )
    scaler = MinMaxScaler()
    cols = [
        "total_volume",
        "repeat_factor",
        "unique_violation_types"
    ]

    final_hotspots[cols] = scaler.fit_transform(
        final_hotspots[cols]
    )

    peak_hours = [
        8, 9, 10, 11,
        17, 18, 19, 20
    ]

    final_hotspots["peak_weight"] = (
        final_hotspots["peak_hour"]
        .isin(peak_hours)
        .astype(int)
    )

    final_hotspots["junction_weight"] = np.where(
        final_hotspots.primary_junction == "No Junction",
        0,
        1
    )

    final_hotspots["impact_score"] = (
        0.45 * final_hotspots.total_volume
        + 0.25 * final_hotspots.repeat_factor
        + 0.15 * final_hotspots.unique_violation_types
        + 0.10 * final_hotspots.peak_weight
        + 0.05 * final_hotspots.junction_weight
    ) * 100

    # ---------------------------------------------------
    # PHASE 5
    # ---------------------------------------------------

    hourly_data = hotspot_records.groupby(
        [
            "hex_id",
            "day_of_week",
            "hour"
        ]
    ).agg(
        violation_volume=(
            "id",
            "count"
        )
    ).reset_index()

    hourly_data = hourly_data.merge(
        final_hotspots[
            [
                "hex_id",
                "center_lat",
                "center_lon",
                "primary_junction",
                "repeat_factor",
                "unique_violation_types",
                "total_volume"
            ]
        ],
        on="hex_id",
        how="left"
    )

    hourly_data["is_weekend"] = (
        hourly_data.day_of_week
        .isin(
            [
                "Saturday",
                "Sunday"
            ]
        )
        .astype(int)
    )

    hourly_data["is_peak_hour"] = (
        hourly_data.hour
        .isin(peak_hours)
        .astype(int)
    )

    hourly_data["hour_sin"] = np.sin(
        2 * np.pi * hourly_data.hour / 24
    )

    hourly_data["hour_cos"] = np.cos(
        2 * np.pi * hourly_data.hour / 24
    )

    day_map = {
        "Monday": 0,
        "Tuesday": 1,
        "Wednesday": 2,
        "Thursday": 3,
        "Friday": 4,
        "Saturday": 5,
        "Sunday": 6
    }

    hourly_data["day_idx"] = (
        hourly_data.day_of_week
        .map(day_map)
    )

    hourly_data["day_sin"] = np.sin(
        2 * np.pi * hourly_data.day_idx / 7
    )

    hourly_data["day_cos"] = np.cos(
        2 * np.pi * hourly_data.day_idx / 7
    )

    hourly_data["dist_to_center"] = haversine(
        hourly_data.center_lat,
        hourly_data.center_lon,
        12.9716,
        77.5946
    )

    hourly_data["historical_density"] = np.log1p(
        hourly_data.total_volume
    )

    hourly_data["violation_diversity"] = (
        hourly_data.unique_violation_types
    )

    hourly_data["interaction"] = (
        hourly_data.is_peak_hour
        *
        hourly_data.historical_density
    )

    hourly_data["primary_junction"] = (
        hourly_data.primary_junction
        .fillna("__UNKNOWN__")
        .astype(str)
    )

    known = list(
        hourly_data.primary_junction.unique()
    )

    if "__UNKNOWN__" not in known:
        known.append("__UNKNOWN__")

    le = LabelEncoder()
    le.fit(known)
    hourly_data["junction_encoded"] = (
        le.transform(
            hourly_data.primary_junction
        )
    )

    hourly_data["time_multiplier"] = np.where(
        hourly_data.hour.isin(peak_hours),
        1.2,
        1.0
    )

    hourly_data["junction_multiplier"] = np.where(
        hourly_data.primary_junction == "No Junction",
        1.0,
        1.2
    )

    hourly_data["target_impact"] = (
        hourly_data.violation_volume
        *
        hourly_data.time_multiplier
        *
        hourly_data.junction_multiplier
    )

    hourly_data["target_impact"] = (
        hourly_data.target_impact
        /
        hourly_data.target_impact.max()
    ) * 100

    features = [
        "center_lat",
        "center_lon",
        "is_weekend",
        "is_peak_hour",
        "hour_sin",
        "hour_cos",
        "day_sin",
        "day_cos",
        "dist_to_center",
        "junction_encoded",
        "historical_density",
        "repeat_factor",
        "violation_diversity",
        "interaction"
    ]

    X = hourly_data[features]
    y = hourly_data["target_impact"]

    model = xgb.XGBRegressor(
        n_estimators=900,
        learning_rate=0.008293356933058608,
        max_depth=12,
        subsample=0.5694519618062028,
        colsample_bytree=0.7937399738922326,
        min_child_weight=4,
        random_state=42,
        n_jobs=-1
    )

    model.fit(X, y)

    # ---------------------------------------------------
    # EXPORT
    # ---------------------------------------------------

    artifacts = os.path.join(
        os.path.dirname(
            os.path.abspath(__file__)
        ),
        "artifacts"
    )

    os.makedirs(
        artifacts,
        exist_ok=True
    )

    joblib.dump(
        model,
        os.path.join(
            artifacts,
            "xgb_master.pkl"
        )
    )

    joblib.dump(
        le,
        os.path.join(
            artifacts,
            "junction_encoder.pkl"
        )
    )

    meta = {
        "feature_order": features,
        "city_center": {
            "lat": 12.9716,
            "lon": 77.5946
        },
        "hex_resolution": 9,
        "feature_count": len(features),
        "peak_hours": peak_hours,
        "unknown_junction_label": "__UNKNOWN__",
        "last_trained_date": datetime.now().strftime("%B %d, %Y at %I:%M %p"),
        "total_records_processed": len(df),
        "active_monitored_zones": len(final_hotspots)
    }

    joblib.dump(
        meta,
        os.path.join(
            artifacts,
            "meta.pkl"
        )
    )

    final_hotspots.drop(
        columns=["dominant_violation_x"],
        inplace=True,
        errors="ignore"
    )

    final_hotspots.rename(
        columns={
            "dominant_violation_y": "dominant_violation"
        },
        inplace=True
    )

    final_hotspots["primary_junction"] = (
        final_hotspots["primary_junction"].fillna("No Junction")
    )
    final_hotspots.to_json(
        os.path.join(
            artifacts,
            "final_hotspots.json"
        ),
        orient="records",
        indent=4
    )

    print("\nTraining completed successfully.")
    print(f"Artifacts saved to: {artifacts}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data",
        required=True
    )
    args = parser.parse_args()
    run_pipeline(args.data)
