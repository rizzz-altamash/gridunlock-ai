// frontend/components/LeafletMap.jsx 
"use client";

import { MapContainer, TileLayer, Polygon, Tooltip } from "react-leaflet";
import { cellToBoundary } from "h3-js";
import "leaflet/dist/leaflet.css";

// Updated to perfectly match your Folium notebook logic
const getHexColor = (score) => {
  if (score >= 75) return "#FF0000"; // Red (Severe)
  if (score >= 30) return "#FF7300"; // Orange (Warning)
  if (score >= 5) return "#FFE866"; // Yellow (Moderate)
  return "#80FF80";                  // Green (Low)
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
              <div className="p-2 text-sm font-sans bg-white text-slate-800 border-none shadow-sm rounded">
                <p><b>Impact Score:</b> {Number(spot.impact_score).toFixed(2)}</p>
                {/* Fallbacks added just in case the JSON keys differ slightly */}
                {spot.total_volume && <p><b>Violations:</b> {spot.total_volume}</p>}
                {spot.peak_hour !== undefined && <p><b>Peak Hour:</b> {spot.peak_hour}:00</p>}
                {spot.dominant_violation && <p><b>Main Issue:</b> {spot.dominant_violation.substring(0, 30)}</p>}
              </div>
            </Tooltip>
          </Polygon>
        );
      })}
    </MapContainer>
  );
}
