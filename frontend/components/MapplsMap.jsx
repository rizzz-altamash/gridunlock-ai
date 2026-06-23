// frontend/components/MapplsMap.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import { cellToBoundary } from "h3-js";

const MAPPLS_KEY = process.env.NEXT_PUBLIC_MAPPLS_KEY;
const MAP_DIV_ID = "mappls-container";
const SCRIPT_ID = "mappls-sdk-script";

const IS_DEV = process.env.NODE_ENV !== "production";
const logger = {
  debug: (...args) => IS_DEV && console.log("🔵 [Mappls Debug]:", ...args),
  warn: (...args) => console.warn("🟠 [Mappls Warn]:", ...args),
  error: (...args) => console.error("🔴 [Mappls Error]:", ...args),
};

// --- Utility Functions ---
const safeNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeScore = (score) => {
  const s = safeNum(score, 0);
  if (s <= 1) return s * 100;
  return s;
};

// Color Pre-compensation for CSS Filters
const getHexColor = (score, isDark) => {
  const s = normalizeScore(score);
  if (isDark) {
    if (s >= 70) return "#990000"; // Dark Red -> Inverts to Bright Red
    if (s >= 30) return "#ff7fff"; // Light Pink -> Inverts to Dark Purple
    if (s >= 5) return "#ff7f00";  
    return "#32cd32";              
  }
  if (s >= 70) return "#ff0000";
  if (s >= 30) return "#800080";
  if (s >= 5) return "#ff7f00";  
  return "#32cd32";              
};

const getSeverity = (score) => {
  const s = normalizeScore(score);
  if (s >= 70) return "Critical";
  if (s >= 30) return "High";
  if (s >= 5) return "Moderate";
  return "Low";
};

const buildTooltipHTML = (spot) => {
  try {
    const dominant = spot.dominant_violation || spot.dominant_violation_y || spot.dominant_violation_x;
    const impact = normalizeScore(spot.impact_score);

    return `
      <div style="min-width:180px;max-width:260px;padding:10px 12px;
                  font-family:sans-serif;font-size:13px;line-height:1.8; color:#000;">
        <p style="font-weight:700;color:#2563eb;margin:0 0 6px">
          ${spot.primary_junction && spot.primary_junction !== "No Junction" ? spot.primary_junction : "Parking Hotspot"}
        </p>
        <p style=""><b>Impact Score:</b> ${impact.toFixed(2)}</p>
        <p style=""><b>Severity:</b> ${getSeverity(spot.impact_score)}</p>
        ${spot.peak_day != null && spot.peak_hour != null ? `<p style=""><b>Peak Time:</b> ${spot.peak_day}, ${spot.peak_hour}:00</p>` : ""}
        ${spot.repeat_factor != null ? `<p style=""><b>Repeat Factor:</b> ${safeNum(spot.repeat_factor).toFixed(2)}</p>` : ""}
        ${spot.total_volume != null ? `<p style=""><b>Relative Violation Volume:</b> ${(safeNum(spot.total_volume) * 100).toFixed(1)}%</p>` : ""}
        ${spot.unique_violation_types != null ? `<p style=""><b>Violation Diversity:</b> ${(safeNum(spot.unique_violation_types) * 100).toFixed(1)}%</p>` : ""}
        ${dominant ? `<p style=""><b>Main Issue:</b> ${String(dominant).replace(/[\[\]"]/g, "").replace(/,/g, ", ")}</p>` : ""}
      </div>`;
  } catch (e) {
    return `<div>Error loading spot data.</div>`;
  }
};

export default function MapplsMap({ hotspots = [] }) {
  const mapInstanceRef = useRef(null);
  const infoWinRef = useRef(null);
  const parsedFeaturesRef = useRef([]); // Stores parsed geometry for animation
  const animFrameRef = useRef(null);    // Controls the animation loop

  const [mapReady, setMapReady] = useState(false);
  const [showLoader, setShowLoader] = useState(true);

  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : false
  );

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 640 : false
  );

  // --- 3-Second Skeleton Timer ---
  useEffect(() => {
    const timer = setTimeout(() => setShowLoader(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Theme Syncing
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setIsDark(root.classList.contains("dark")));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Responsive Syncing
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 640px)");
    const onChange = (e) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);


  // --- PROGRESSIVE ANIMATION ENGINE ---
  const triggerAnimation = (map) => {
    const source = map.getSource("hotspots-source");
    if (!source) return;

    cancelAnimationFrame(animFrameRef.current);

    const allFeatures = parsedFeaturesRef.current;
    const total = allFeatures.length;
    if (total === 0) return;

    let currentCount = 0;
    // Calculate batches to finish exactly in ~1.5 seconds (90 frames at 60fps)
    const batchSize = Math.max(1, Math.ceil(total / 90));

    const drawFrame = () => {
      currentCount += batchSize;
      if (currentCount >= total) currentCount = total;

      source.setData({
        type: "FeatureCollection",
        features: allFeatures.slice(0, currentCount),
      });

      if (currentCount < total) {
        animFrameRef.current = requestAnimationFrame(drawFrame);
      }
    };

    animFrameRef.current = requestAnimationFrame(drawFrame);
  };


  // --- GEOJSON PARSING & LAYER SETUP ---
  const updateMapLayers = (M, map, spots, isDark) => {
    if (!Array.isArray(spots) || spots.length === 0) return;

    try {
      const sortedSpots = [...spots].sort(
        (a, b) => normalizeScore(a.impact_score) - normalizeScore(b.impact_score)
      );

      // Pre-calculate all geometry and colors
      parsedFeaturesRef.current = sortedSpots.map((spot) => {
        if (!spot?.hex_id) return null;
        const boundary = cellToBoundary(spot.hex_id);
        if (!Array.isArray(boundary) || boundary.length < 3) return null;

        const coordinates = boundary.map(([lat, lng]) => [safeNum(lng), safeNum(lat)]);
        coordinates.push(coordinates[0]);

        return {
          type: "Feature",
          properties: {
            ...spot,
            color: getHexColor(spot.impact_score, isDark),
          },
          geometry: {
            type: "Polygon",
            coordinates: [coordinates],
          },
        };
      }).filter(Boolean);

      const existingSource = map.getSource("hotspots-source");
      if (!existingSource) {
        // Initialize with EMPTY data so the layers are ready for the animation
        map.addSource("hotspots-source", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] }, 
        });

        map.addLayer({
          id: "hotspots-layer",
          type: "fill",
          source: "hotspots-source",
          paint: {
            "fill-color": ["get", "color"],
            "fill-opacity": 0.5,
          },
        });

        map.addLayer({
          id: "hotspots-layer-outline",
          type: "line",
          source: "hotspots-source",
          paint: {
            "line-color": ["get", "color"],
            "line-width": 3,
            "line-opacity": 1,
          },
        });
      }

      // If the skeleton loader is already gone (e.g., data updated later), play animation immediately
      if (!showLoader) {
        triggerAnimation(map);
      }
    } catch (e) {
      logger.error("WebGL parsing/drawing context failed:", e);
    }
  };


  // --- FIRE ANIMATION WHEN SKELETON ENDS ---
  useEffect(() => {
    if (!showLoader && mapReady && mapInstanceRef.current) {
      triggerAnimation(mapInstanceRef.current);
    }
  }, [showLoader, mapReady]);


  // --- INITIALIZATION ---
  useEffect(() => {
    let cancelled = false;

    const initMap = () => {
      if (cancelled) return;
      const M = window.mappls;
      if (!M) return;

      let map;
      try {
        map = new M.Map(MAP_DIV_ID, {
          center: [12.9716, 77.5946],
          zoom: 12,
          zoomControl: !isMobile,
          logoPosition: "top-left",
          pitch: 60, // loads map in 3D 
          // bearing: -15, // tilts map 
        });
      } catch (e) {
        logger.error("M.Map initialization failed:", e);
        return;
      }

      mapInstanceRef.current = map;

      try {
        infoWinRef.current = new M.InfoWindow({ 
          content: "<div></div>",
          position: { lat: 12.9716, lng: 77.5946 } 
        });
        infoWinRef.current.close();
      } catch (e) {}

      map.addListener("load", () => {
        if (cancelled) return;
        setMapReady(true);

        // --- Interaction Handlers ---
        const handleHexagonClick = (e) => {
          if (!e.features || e.features.length === 0) return;
          const spotData = e.features[0].properties;
          const pos = { lat: Number(e.lngLat.lat), lng: Number(e.lngLat.lng) };
          const iw = infoWinRef.current;
          if (iw) {
            try {
              iw.setContent(buildTooltipHTML(spotData));
              iw.setPosition(pos);
              iw.open(map);
            } catch (err) {}
          }
        };

        const handleMouseEnter = () => { map.getCanvas().style.cursor = "pointer"; };
        const handleMouseLeave = () => { map.getCanvas().style.cursor = ""; };

        map.on("click", "hotspots-layer", handleHexagonClick);
        map.on("mouseenter", "hotspots-layer", handleMouseEnter);
        map.on("mouseleave", "hotspots-layer", handleMouseLeave);
      });
    };

    if (window.mappls) {
      setTimeout(initMap, 200);
    } else {
      const existingScript = document.getElementById(SCRIPT_ID);
      if (existingScript) {
        existingScript.addEventListener("load", () => setTimeout(initMap, 200), { once: true });
      } else {
        const script = document.createElement("script");
        script.id = SCRIPT_ID;
        script.src = `https://apis.mappls.com/advancedmaps/api/${MAPPLS_KEY}/map_sdk?layer=vector&v=3.0`;
        script.async = true;
        script.onload = () => setTimeout(initMap, 200);
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      if (mapInstanceRef.current && typeof mapInstanceRef.current.remove === "function") {
        try { mapInstanceRef.current.remove(); } catch {}
      }
      mapInstanceRef.current = null;
      infoWinRef.current = null;
      setMapReady(false);
      cancelAnimationFrame(animFrameRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  // --- Data & Theme Watcher ---
  useEffect(() => {
    const M = window.mappls;
    const map = mapInstanceRef.current;
    if (!M || !map || !mapReady) return;
    updateMapLayers(M, map, hotspots, isDark);
  }, [hotspots, mapReady, isDark]);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <style>{`
        /* Skeleton Animations */
        @keyframes pan-grid {
          0% { background-position: 0% 0%, 0 0, 0 0; }
          100% { background-position: 0% 0%, 30px 30px, 30px 30px; }
        }
        @keyframes draw-hex {
          0% { stroke-dashoffset: 300; fill: transparent; filter: drop-shadow(0 0 0px rgba(59, 130, 246, 0)); }
          50% { stroke-dashoffset: 0; fill: transparent; filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.5)); }
          100% { stroke-dashoffset: 0; fill: rgba(59, 130, 246, 0.1); filter: drop-shadow(0 0 12px rgba(59, 130, 246, 0.8)); }
        }
        @keyframes shimmer-text {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes fade-pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* --- SKELETON LOADER OVERLAY --- */}
      {showLoader && (
        <div
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 50,
            borderRadius: "0.5rem",
            backgroundColor: isDark ? "#0f172a" : "#dbeafe", 
            backgroundImage: isDark
              ? "radial-gradient(circle at center, transparent 0%, #0f172a 100%), linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)"
              : "radial-gradient(circle at center, transparent 0%, #f8fafc 100%), linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)",
            backgroundSize: "100% 100%, 30px 30px, 30px 30px",
            animation: "pan-grid 15s linear infinite",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden", 
          }}
        >
          <svg width="56" height="56" viewBox="0 0 100 100" style={{ marginBottom: "24px", overflow: "visible" }}>
            <polygon
              points="50 3, 93 25, 93 75, 50 97, 7 75, 7 25"
              fill="transparent"
              stroke={isDark ? "#3b82f6" : "#2563eb"}
              strokeWidth="4"
              strokeLinejoin="round"
              strokeDasharray="300"
              strokeDashoffset="300"
              style={{ animation: "draw-hex 2s cubic-bezier(0.4, 0, 0.2, 1) infinite alternate" }}
            />
          </svg>
          <div
            style={{
              fontFamily: "sans-serif", fontSize: "16px", fontWeight: 600, letterSpacing: "0.5px",
              background: isDark ? "linear-gradient(90deg, #9ca3af 20%, #ffffff 50%, #9ca3af 80%)" : "linear-gradient(90deg, #6b7280 20%, #111827 50%, #6b7280 80%)",
              backgroundSize: "200% auto", color: "transparent", WebkitBackgroundClip: "text", backgroundClip: "text",
              animation: "shimmer-text 2.5s linear infinite", marginBottom: "8px"
            }}
          >
            Initializing Hotspot Engine
          </div>
          <div style={{ fontFamily: "sans-serif", fontSize: "13px", fontWeight: 400, color: isDark ? "#64748b" : "#808080", animation: "fade-pulse 1.5s ease-in-out infinite" }}>
            rendering MAPPLS map...
          </div>
        </div>
      )}

      {/* --- THE ACTUAL MAP --- */}
      <div
        id={MAP_DIV_ID}
        style={{ 
          height: "100%", width: "100%", borderRadius: "0.5rem",
          filter: isDark ? "invert(1) hue-rotate(180deg) saturate(1.5)" : "none",
          transition: "filter 0.5s ease-in-out" 
        }}
      />
    </div>
  );
}




// MAPLLS TESTING 
// "use client";

// import { useEffect } from "react";
// export default function LeafletMap() {
//   useEffect(() => {
//     const mapId = "mappls-container";

//     const initMap = () => {
//       const el = document.getElementById(mapId);

//       console.log("Container:", el);

//       if (!el) {
//         console.error("Map container not found");
//         return;
//       }

//       if (!window.mappls) {
//         console.error("Mappls SDK not found");
//         return;
//       }

//       new window.mappls.Map(mapId, {
//         center: [12.9716, 77.5946],
//         zoom: 13,
//       });

//       console.log("✅ Map created");
//     };

//     if (window.mappls) {
//       setTimeout(initMap, 200);
//       return;
//     }

//     const script = document.createElement("script");
//     script.src =
//       "https://apis.mappls.com/advancedmaps/api/fddb8bfdbae5cc3f9331ee06acea9fae/map_sdk?layer=vector&v=3.0";

//     script.async = true;

//     script.onload = () => {
//       console.log("✅ SDK Loaded");
//       setTimeout(initMap, 200);
//     };

//     script.onerror = () => {
//       console.error("❌ SDK Load Failed");
//     };

//     document.head.appendChild(script);
//   }, []);

//   return (
//     <div
//       id="mappls-container"
//       style={{
//         width: "100%",
//         height: "700px",
//         border: "1px solid red",
//       }}
//     />
//   );
// }