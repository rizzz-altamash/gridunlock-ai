// frontend/components/LeafletMap.jsx 
"use client";

import { MapContainer, TileLayer, Polygon, Tooltip } from "react-leaflet";
import { cellToBoundary } from "h3-js";
import "leaflet/dist/leaflet.css";

// Updated to perfectly match your Folium notebook logic
const getHexColor = (score) => {
  if (score >= 70) return "#ff0000"; // Red (Critical)
  if (score >= 30) return "#800080"; // Purple (Warning)
  if (score >= 5) return "#ff7f00"; // Orange (Moderate)
  return "#32cd32";                  // Green (Low)
};

export default function LeafletMap({ hotspots }) {
  // Center over Bangalore
  const center = [12.9716, 77.5946];

  return (
    <MapContainer 
      center={center} 
      zoom={13} 
      style={{ height: "100%", width: "100%", borderRadius: "0.5rem" }}
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
      />

      {[...hotspots]
        .sort((a, b) => a.impact_score - b.impact_score)
        .map((spot, idx) => {
        // Convert H3 hex_id to LatLng array
        const boundary = cellToBoundary(spot.hex_id);
        
        return (
          <Polygon
            key={idx}
            positions={boundary}
            pathOptions={{
              color: getHexColor(spot.impact_score),
              fillColor: getHexColor(spot.impact_score),
              fillOpacity: 0.6,
              weight: 2,
            }}
          >
            <Tooltip sticky>
              <div className="min-w-60 p-3 text-sm font-sans bg-white text-slate-800 rounded-lg shadow-md">

                <p className="font-bold text-blue-600 mb-2">
                  {spot.primary_junction && spot.primary_junction !== "No Junction"
                    ? spot.primary_junction
                    : "Parking Hotspot"}
                </p>

                <p>
                  <b>Impact Score:</b>{" "}
                  {Number(spot.impact_score).toFixed(2)}
                </p>

                <p>
                  <b>Severity:</b>{" "}
                  {spot.impact_score >= 75
                    ? "Critical"
                    : spot.impact_score >= 30
                    ? "High"
                    : spot.impact_score >= 5
                    ? "Moderate"
                    : "Low"}
                </p>

                {spot.peak_day && spot.peak_hour !== undefined && (
                  <p>
                    <b>Peak Time:</b> {spot.peak_day}, {spot.peak_hour}:00
                  </p>
                )}

                {spot.repeat_factor !== undefined && (
                  <p>
                    <b>Repeat Factor:</b>{" "}
                    {Number(spot.repeat_factor).toFixed(2)}
                  </p>
                )}

                {/* Show normalized volume as percentage */}
                {spot.total_volume !== undefined && (
                  <p>
                    <b>Relative Violation Volume:</b>{" "}
                    {(spot.total_volume * 100).toFixed(1)}%
                  </p>
                )}

                {/* Show normalized violation diversity as percentage */}
                {spot.unique_violation_types !== undefined && (
                  <p>
                    <b>Violation Diversity:</b>{" "}
                    {(spot.unique_violation_types * 100).toFixed(1)}%
                  </p>
                )}

                {(spot.dominant_violation ||
                  spot.dominant_violation_y ||
                  spot.dominant_violation_x) && (
                  <p>
                    <b>Main Issue:</b>{" "}
                    {(
                      spot.dominant_violation ||
                      spot.dominant_violation_y ||
                      spot.dominant_violation_x
                    )
                      .replace(/[\[\]"]/g, "")
                      .replace(/,/g, ", ")}
                  </p>
                )}

              </div>
            </Tooltip>
          </Polygon>
        );
      })}
    </MapContainer>
  );
}
