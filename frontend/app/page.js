// frontend/app/page.js 
"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { UploadCloud, Map as MapIcon, Database, Loader2, DatabaseZap, CalendarClock, HardDrive, Hexagon, Play, Pause, Clock, Layers, Globe, Activity, Sun, Moon, CheckCircle, Lock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import AgentChat from "@/components/AgentChat";
import axios from "axios";

// Dynamically import LeafletMap to bypass Next.js SSR window errors
const DynamicMap = dynamic(() => import("@/components/LeafletMap"), { 
  ssr: false,
  loading: () => (
    <div className="h-full w-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 gap-2 px-4 text-center transition-colors duration-300">
      <Loader2 className="w-5 h-5 animate-spin" /> Initializing Map Engine...
    </div>
  )
});

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function Dashboard() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingStep, setTrainingStep] = useState("");
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [showSuccessUI, setShowSuccessUI] = useState(false);
  const [hotspots, setHotspots] = useState([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [modelStatus, setModelStatus] = useState(null);
  const [viewMode, setViewMode] = useState("all"); // "simulate" | "all"
  const [selectedHour, setSelectedHour] = useState(new Date().getHours());
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentDay, setCurrentDay] = useState("");
  const [telemetryLogs, setTelemetryLogs] = useState([]);
  const [darkMode, setDarkMode] = useState(false);

  // Security Authentication States
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [authStatus, setAuthStatus] = useState("idle"); // "idle" | "checking" | "success" | "error"

  // --- Universal Log Dispatcher ---
  const addTelemetryLog = useCallback((type, msg) => {
    const timeString = new Date().toLocaleTimeString('en-US', {hour12: false});
    // Use Math.random to guarantee unique React keys if two logs fire simultaneously
    const newLog = { id: Date.now() + Math.random(), time: timeString, type, msg };
    setTelemetryLogs(prev => [...prev.slice(-3), newLog]); // Keep max 4 visible
  }, []);

  // 0. Theme Initialization (reads stored preference, falls back to light theme)
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const shouldUseDark = stored === "dark";
    setDarkMode(shouldUseDark);
    document.documentElement.classList.toggle("dark", shouldUseDark);
  }, []);

  const toggleDarkMode = () => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("theme", next ? "dark" : "light");
      return next;
    });
  };

  // 1. Initial Load (Day and Model Status)
  useEffect(() => {
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date());
    setCurrentDay(day);

    const fetchDashboardData = async () => {
      try {
        const statusResponse = await axios.get(`${API_BASE}/api/v1/model/status`);
        setModelStatus(statusResponse.data);
        addTelemetryLog("SYS", "XGBoost architecture connected and synchronized.");
      } catch (error) {
        console.error("Failed to fetch model status:", error);
      }
    };
    fetchDashboardData();
  }, [addTelemetryLog]);

  // 2. The Unified Map Fetching Engine (Handles both 'simulate' and 'all')
  useEffect(() => {
    const fetchMapData = async () => {
      if (!currentDay) return;
      setMapLoading(true);
      try {
        if (viewMode === "all") {
          // Fetch the entire global footprint
          const res = await axios.get(`${API_BASE}/api/v1/hotspots/all`);
          setHotspots(res.data.hotspots);
        } else {
          // Fetch the predictive hour
          const res = await axios.get(`${API_BASE}/api/v1/hotspots/simulate?hour=${selectedHour}&day=${currentDay}`);
          setHotspots(res.data.hotspots);
        }
      } catch (e) {
        console.error("Map Data API failed:", e);
        addTelemetryLog("WARN", "Data stream interrupted. Retrying connection...");
      } finally {
        setMapLoading(false);
      }
    };

    // Debounce the API call so dragging the slider doesn't spam the server
    const delay = setTimeout(fetchMapData, 400); 
    return () => clearTimeout(delay);
  }, [selectedHour, currentDay, viewMode, addTelemetryLog]);

  // 3. Cinematic Auto-Play Logic
  useEffect(() => {
    let interval;
    if (isPlaying && viewMode === "simulate") {
      interval = setInterval(() => {
        setSelectedHour((prev) => (prev === 23 ? 0 : prev + 1));
      }, 3000); // Wait 3 seconds per hour 
    }
    return () => clearInterval(interval);
  }, [isPlaying, viewMode]);

  // --- DATA-DRIVEN TELEMETRY LOGIC ---

  // Helper function to strip "BTPXXX - " prefixes 
  const formatLocationName = (spot) => {
    if (spot.primary_junction && spot.primary_junction !== "No Junction") {
      // Splits "BTP070 - KR Market" into ["BTP070", "KR Market"] and takes the second part
      return spot.primary_junction.includes(" - ") 
        ? spot.primary_junction.split(" - ")[1].trim() 
        : spot.primary_junction;
    }
    return `Hex ${spot.hex_id.substring(0, 12)}`;
  };

  // Trigger A: User scrubs the time slider
  useEffect(() => {
    if (viewMode === "simulate" && mapLoading) {
      addTelemetryLog("SYS", `Recalculating predictive weights for ${formatHour(selectedHour)}...`);
    }
  }, [selectedHour, viewMode, mapLoading, addTelemetryLog]);

  // Trigger B: ML data finishes loading
  useEffect(() => {
    if (hotspots.length > 0 && !mapLoading) {
      // Find the absolute worst hotspot in the current dataset
      const topHotspot = [...hotspots].sort((a, b) => b.impact_score - a.impact_score)[0];
      const name = formatLocationName(topHotspot);
      
      if (topHotspot.impact_score >= 70) {
        addTelemetryLog("ALERT", `Target Lock: ${name} (Severity: ${topHotspot.impact_score.toFixed(1)})`);
      } else if (topHotspot.impact_score >= 30) {
        addTelemetryLog("WARN", `Elevated volume monitored at ${name}...`);
      } else if (topHotspot.impact_score < 30) {
        addTelemetryLog("INFO", "Grid stabilized. No critical choke points detected...");
      }
    }
  }, [hotspots, mapLoading, addTelemetryLog]);

  // Trigger C: Idle polling (Creates movement even when user isn't clicking)
  useEffect(() => {
    if (hotspots.length === 0 || mapLoading) return;
    
    const interval = setInterval(() => {
      // Pick a random hotspot from the ACTUAL currently rendered map
      const randomSpot = hotspots[Math.floor(Math.random() * hotspots.length)];
      const name = formatLocationName(randomSpot);

      if (randomSpot.impact_score >= 70) {
        addTelemetryLog("ALERT", `Target Lock: ${name} (Severity: ${randomSpot.impact_score.toFixed(1)})`);
      } else if (randomSpot.impact_score >= 30 && randomSpot.impact_score < 70) {
        addTelemetryLog("WARN", `Elevated volume monitored at ${name}...`);
      } else {
        if (Math.random() > 0.5) {
          addTelemetryLog("INFO", `Routine clearance patrol at ${name}...`);
        } else {
          // Array of randomized technical system logs
          const sysLogs = [
            `H3 integrity verified for ${name}...`,
            `Calibrating traffic telemetry at ${name}...`,
            `Optimizing routing protocols near ${name}...`,
            `Grid stability confirmed at ${name}...`,
            `Synchronizing violation weights for ${name}...`
          ];
          
          // Select a random log from the array
          const randomSysLog = sysLogs[Math.floor(Math.random() * sysLogs.length)];
          addTelemetryLog("SYS", randomSysLog);
        }
      }
    }, 4500); // Fires every 4.5 seconds

    return () => clearInterval(interval);
  }, [hotspots, mapLoading, addTelemetryLog]);

  const handleFileUpload = (e) => {
    setSelectedFile(e.target.files[0]);
    setShowSuccessUI(false);
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    setAuthStatus("checking");

    // Simulate verification delay
    setTimeout(() => {
      // Dummy password for hackathon 
      if (passwordInput === "gridunlock") {
        setAuthStatus("success");
        setIsAuthorized(true);
        addTelemetryLog("SYS", "Security clearance verified. Retrain controls unlocked.");
        
        // Wait 2 seconds so they can see the "Access Granted" animation, then close
        setTimeout(() => {
          setShowAuthModal(false);
          setAuthStatus("idle");
          setPasswordInput("");
        }, 2000);
      } else {
        setAuthStatus("error");
        addTelemetryLog("ALERT", "Failed authentication attempt detected.");
      }
    }, 800);
  };

  // 5. Continuous Training Pipeline 
  const triggerCTPipeline = async () => {
    // SECURITY INTERCEPT: Check if authorized first
    if (!isAuthorized) {
      setShowAuthModal(true);
      return;
    }

    if (!selectedFile) return;
    setIsTraining(true);
    setShowSuccessUI(false);
    setTrainingProgress(0);
    setTrainingStep("Initializing MLOps Pipeline...");

    const formData = new FormData();
    formData.append("file", selectedFile);
    addTelemetryLog("SYS", "UPLOADING DATA: Triggering MLOps Continuous Training Pipeline...");

    // Stage texts for the animation (Mapped to train.py)
    const stages = [
      "Parsing Data and Coordinates...",
      "Extracting Temporal Features...",
      "Mapping Coordinates to H3 Spatial Hexagons...",
      "Scaling Heuristic Impact Scores...",
      "Engineering Cyclical Time Features...",
      "Calculating Haversine Distance to City Center...",
      "Label Encoding Junction Terminology...",
      "Generating Target Impact Multipliers..."
    ];

    let stepIndex = 0;

    // Simulate progress smoothly up to 90% while waiting for the backend
    const progressInterval = setInterval(() => {
      setTrainingProgress(prev => {
        // Approach 90% slowly
        const next = prev + (90 - prev) * 0.20;
        return next;
      });
      // Cycle through stage text every few ticks
      if (Math.random() > 0.4) {
        setTrainingStep(stages[stepIndex % stages.length]);
        stepIndex++;
      }
    }, 800);

    try {
      // Enforce a minimum 10-second delay so the user sees the animation (Just for better UX) 
      const minAnimationPromise = new Promise(resolve => setTimeout(resolve, 10000));
      
      // 1. The actual API Request
      const apiPromise = axios.post(`${API_BASE}/api/v1/train`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      // 2. Wait for the API to actually finish processing 
      await Promise.all([minAnimationPromise, apiPromise]);
      
      // 3. API is done. Clear the random text cycler.
      clearInterval(progressInterval);

      // 4. Lock in the final stage text and push the progress bar to 95%
      setTrainingStep("Training XGBoost Peak Hunter...");
      setTrainingProgress(95);

      // 5. Hold this exact state for 5 seconds
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // 6. Complete the pipeline and show the Success UI
      setTrainingProgress(100);
      setShowSuccessUI(true);
      setSelectedFile(null); // Clear form
      addTelemetryLog("SYS", "CT Pipeline successful. Dashboard synchronized.");

    } catch (error) {
      clearInterval(progressInterval);
      setTrainingStep("Pipeline Failed.");
      addTelemetryLog("ALERT", "MLOps Pipeline encountered a critical error.");
      console.error(error);
    } finally {
      setIsTraining(false);
    }
  };

  const formatHour = (h) => `${h.toString().padStart(2, '0')}:00`;

  // Helper to color-code telemetry logs
  const getLogColor = (type) => {
    switch(type) {
      case 'ALERT': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900';
      case 'WARN': return 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-900';
      case 'INFO': return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-900';
      default: return 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300">
      
      {/* LEFT PANE */}
      <div className="flex-3 lg:flex-1 flex flex-col min-w-0 min-h-0">
        
        {/* Top Navbar */}
        <header className="h-16 px-3 sm:px-6 bg-blue-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shadow-sm z-10 gap-2 transition-colors duration-300">
          <div className="flex items-center gap-2 min-w-0">
            <MapIcon className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-none" />
            <h1 className="text-base sm:text-xl font-bold tracking-tight truncate">
              Bengaluru <span className="text-blue-600 dark:text-blue-400 tracking-wide">GridUnlock AI</span>
            </h1>
            <div className="hidden sm:flex items-center gap-2 flex-none">
              <Badge variant="outline" className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-blue-600 dark:border-blue-500">v1.3</Badge>
              <Badge className="bg-blue-600 text-white">AI Engine Online</Badge>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-none">
            {/* Theme Toggle */}
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 shadow-sm transition-colors"
              title={darkMode ? "Switch to light theme" : "Switch to dark theme"}
              aria-label={darkMode ? "Switch to light theme" : "Switch to dark theme"}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="default" className="group gap-2 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:text-white hover:bg-blue-600 dark:hover:bg-blue-600 shadow-sm">
                  <Database className="w-4 h-4 text-blue-600 dark:text-blue-400 group-hover:text-white" />
                  <span className="hidden sm:inline">Update Dataset</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-120 max-h-[85vh] overflow-y-auto bg-blue-100 dark:bg-slate-900 dark:border-slate-700">
                <DialogHeader>
                  <DialogTitle className="text-lg font-semibold text-blue-600 dark:text-blue-400">Continuous Training Pipeline</DialogTitle>
                  <DialogDescription className="text-sm text-slate-600 dark:text-slate-400">
                    Upload the latest traffic violation CSV. The automated MLOps architecture will trigger a background XGBoost retraining sequence and dynamically recalculate the predictive risk weights and hot-swap the updated H3 spatial hashes.
                  </DialogDescription>
                </DialogHeader>

                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg p-4 mt-2">
                  <h4 className="text-xs text-center font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wider mb-3">Current Architecture Status</h4>
                  
                  {/* UPGRADED: 2x2 CSS Grid Layout */}
                  <div className="grid grid-cols-2 gap-y-5 gap-x-4">
                    
                    {/* Grid Item 1 */}
                    <div className="flex items-start gap-3 text-sm">
                      <div className="p-2 bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-md mt-0.5"><DatabaseZap className="w-4 h-4" /></div>
                      <div>
                        <p className="font-semibold text-slate-700 dark:text-slate-200 leading-tight">Engine Status</p>
                        <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">{modelStatus?.status === "Online" ? "XGBoost - Active" : "Awaiting Data"}</p>
                      </div>
                    </div>

                    {/* Grid Item 2 */}
                    <div className="flex items-start gap-3 text-sm">
                      <div className="p-2 bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 rounded-md mt-0.5"><HardDrive className="w-4 h-4" /></div>
                      <div>
                        <p className="font-semibold text-slate-700 dark:text-slate-200 leading-tight">Dataset Volume</p>
                        <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                          {modelStatus?.total_records_processed 
                            ? `${modelStatus.total_records_processed.toLocaleString()} records` 
                            : "Loading..."}
                        </p>
                      </div>
                    </div>

                    {/* Grid Item 3 */}
                    <div className="flex items-start gap-3 text-sm">
                      <div className="p-2 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-md mt-0.5"><CalendarClock className="w-4 h-4" /></div>
                      <div>
                        <p className="font-semibold text-slate-700 dark:text-slate-200 leading-tight">Last Trained</p>
                        <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">{modelStatus?.last_trained_date || "Loading..."}</p>
                      </div>
                    </div>

                    {/* Grid Item 4 (The New Metric) */}
                    <div className="flex items-start gap-3 text-sm">
                      <div className="p-2 bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 rounded-md mt-0.5"><Hexagon className="w-4 h-4" /></div>
                      <div>
                        <p className="font-semibold text-slate-700 dark:text-slate-200 leading-tight">H3 Hashes</p>
                        <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                          {modelStatus?.active_monitored_zones 
                            ? `${modelStatus.active_monitored_zones} critical hexes` 
                            : "Loading..."}
                        </p>
                      </div>
                    </div>

                  </div>
                </div>
                
                {/* DYNAMIC PIPELINE UI SECTION */}
                <div className="grid gap-4 py-4 min-h-55">
                  
                  {!isTraining && !showSuccessUI ? (
                    /* Default Upload State */
                    <div className="flex flex-col gap-4 animate-in fade-in duration-300">
                      <div className="flex items-center justify-center w-full">
                        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 dark:border-slate-600 border-dashed rounded-lg cursor-pointer bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/70 transition-colors">
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <UploadCloud className="w-8 h-8 mb-2 text-slate-400 dark:text-slate-500" />
                            <p className="text-sm text-slate-500 dark:text-slate-400"><span className="font-semibold">Click to upload</span></p>
                          </div>
                          <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
                        </label>
                      </div>
                      
                      {selectedFile && (
                        <p className="text-sm text-green-600 dark:text-green-400 font-medium truncate text-center">
                          Selected: {selectedFile.name}
                        </p>
                      )}
                      
                      <Button 
                        onClick={triggerCTPipeline} 
                        disabled={!selectedFile}
                        className={`${isAuthorized ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-700 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600'} text-white w-full flex gap-2 transition-colors`}
                      >
                        {!isAuthorized && <Lock className="w-4 h-4" />}
                        {isAuthorized ? "Retrain Architecture" : "Authenticate to Retrain"}
                      </Button>
                    </div>
                  ) : showSuccessUI ? (
                    /* Success Alert UI */
                    <div className="flex flex-col items-center justify-center h-full p-6 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-lg animate-in fade-in zoom-in duration-500">
                      <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center mb-3">
                        <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <h3 className="text-emerald-800 dark:text-emerald-300 font-semibold text-lg">Retraining Successful</h3>
                      <p className="text-emerald-600 dark:text-emerald-400 text-sm text-center mt-1">
                        The XGBoost engine and hotspot database have successfully synchronized with the new data.
                      </p>
                      <Button 
                        onClick={() => setShowSuccessUI(false)} 
                        className="mt-5 bg-emerald-600 hover:bg-emerald-700 text-white w-full"
                      >
                        Acknowledge & Continue
                      </Button>
                    </div>
                  ) : (
                    /* Active Training Animation UI */
                    <div className="flex flex-col items-center justify-center h-full p-6 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg animate-in fade-in duration-300">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400 mb-4" />
                      <h3 className="text-slate-700 dark:text-slate-200 font-semibold text-center mb-4 min-h-6">
                        {trainingStep}
                      </h3>
                      
                      {/* Progress Bar Container */}
                      <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mb-2">
                        <div 
                          className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-300 ease-out"
                          style={{ width: `${trainingProgress}%` }}
                        ></div>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {Math.round(trainingProgress)}% • Processing Pipeline
                      </p>
                    </div>
                  )}

                </div>
              </DialogContent>

              {/* SECURITY AUTHENTICATION MODAL */}
            <Dialog open={showAuthModal} onOpenChange={(open) => {
              if (!open && authStatus !== "success") {
                setShowAuthModal(false);
                setAuthStatus("idle");
                setPasswordInput("");
              }
            }}>
              <DialogContent className="sm:max-w-md border-red-200 dark:border-red-900/50 bg-white dark:bg-slate-950 shadow-2xl">
                <DialogHeader>
                  <div className="flex items-center gap-3 text-red-600 dark:text-red-500 mb-2">
                    <ShieldAlert className="w-6 h-6" />
                    <DialogTitle className="text-xl">Restricted Access</DialogTitle>
                  </div>
                  <DialogDescription className="text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
                    WARNING: MLOps Architecture retraining is strictly restricted to authorized Government Officials and Senior Police Officers. Unauthorized modifications are logged and strictly prohibited.
                  </DialogDescription>
                </DialogHeader>

                {authStatus === "success" ? (
                  /* Success Animation State */
                  <div className="flex flex-col items-center justify-center py-6 animate-in zoom-in duration-300">
                    <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/40 rounded-full flex items-center justify-center mb-4 border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-400">Access Granted</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Security clearance verified.</p>
                  </div>
                ) : (
                  /* Password Form State */
                  <form onSubmit={handlePasswordSubmit} className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <label className="text-xs uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
                        Departmental Authorization Code
                      </label>
                      <input
                        type="password"
                        value={passwordInput}
                        onChange={(e) => {
                          setPasswordInput(e.target.value);
                          if (authStatus === "error") setAuthStatus("idle");
                        }}
                        placeholder="Enter 10-digit clearance key..."
                        className={`w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border rounded-md outline-none focus:ring-2 transition-colors font-mono ${
                          authStatus === "error" 
                            ? "border-red-500 focus:ring-red-500 text-red-600" 
                            : "border-slate-300 dark:border-slate-700 focus:ring-slate-400 dark:focus:ring-slate-600 text-slate-900 dark:text-slate-100"
                        }`}
                        autoFocus
                      />
                      {authStatus === "error" && (
                        <p className="text-xs text-red-600 dark:text-red-400 font-medium animate-in slide-in-from-top-1">
                          Access Denied. Incorrect authorization code.
                        </p>
                      )}
                    </div>
                    <Button
                      type="submit"
                      disabled={!passwordInput || authStatus === "checking"}
                      className="w-full bg-red-600 hover:bg-red-700 text-white flex gap-2 font-bold"
                    >
                      {authStatus === "checking" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                      {authStatus === "checking" ? "Verifying Key..." : "Authenticate"}
                    </Button>
                  </form>
                )}
              </DialogContent>
            </Dialog>
            </Dialog>
          </div>
        </header>

        {/* Map Area */}
        <main className="flex-1 min-h-0 p-2 sm:p-4 bg-slate-100/50 dark:bg-slate-950/50 transition-colors duration-300">
          <div className="h-full rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 relative isolate z-0 transition-colors duration-300">
            <div className="h-full w-full relative z-0">
               <DynamicMap hotspots={hotspots} />
               {/* HUD WIDGET */}
               <div className="absolute top-3 sm:top-6 left-1/2 transform -translate-x-1/2 z-400 w-[calc(100%-1.5rem)] sm:w-[90%] max-w-162.5 bg-white/40 dark:bg-slate-900/50 backdrop-blur-sm p-3 sm:p-4 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-white dark:border-slate-700 flex flex-col gap-3 sm:gap-4 transition-all">
                 {/* Top Row: Mode Toggles & Status */}
                 <div className={`flex justify-between items-center ${viewMode === "simulate" ? "border-b border-slate-100 dark:border-slate-700 pb-3" : ""}`}>
                   {/* Pill Toggles */}
                   <div className="flex bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                     <button 
                       onClick={() => {
                         setViewMode("all");
                         setIsPlaying(false);
                       }}
                       className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all duration-200 ${viewMode === "all" ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"}`}
                     >
                       <Globe className="w-4 h-4" /> <span className="hidden sm:inline">Global Heatmap</span>
                     </button>
                     <button 
                       onClick={() => setViewMode("simulate")}
                       className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-2 rounded-lg text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all duration-200 ${viewMode === "simulate" ? "bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-sm ring-1 ring-slate-200 dark:ring-slate-600" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50"}`}
                     >
                       <Clock className="w-4 h-4" /> <span className="hidden sm:inline">Predictive Radar</span>
                     </button>
                   </div>

                   {/* Status Indicator */}
                   <div className="flex items-center gap-2 text-blue-900 dark:text-blue-200 font-mono font-semibold text-xs sm:text-sm bg-blue-50 dark:bg-blue-950/40 px-2 sm:px-3 py-1.5 rounded-lg border border-blue-100 dark:border-blue-900 shadow-inner truncate max-w-35 sm:max-w-none">
                     {mapLoading && !isPlaying ? <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400 flex-none" /> : <Layers className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-none" />}
                     <span className="truncate">{viewMode === "simulate" ? `${currentDay}, ${formatHour(selectedHour)}` : "All Historical Data"}</span>
                   </div>
                 </div>

                 {/* Bottom Row: Time Scrubber (ONLY RENDERS IF IN SIMULATE MODE) */}
                 {viewMode === "simulate" && (
                   <div className="flex items-center gap-3 sm:gap-4 animate-in fade-in slide-in-from-top-1 duration-700 ease-out">
                     <button 
                       onClick={() => setIsPlaying(!isPlaying)}
                       className="p-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 active:scale-95 flex-none"
                     >
                       {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                     </button>

                     <input 
                       type="range" 
                       min="0" 
                       max="23" 
                       value={selectedHour} 
                       onChange={(e) => {
                         setIsPlaying(false);
                         setSelectedHour(parseInt(e.target.value));
                       }}
                       className="flex-1 h-2 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                     />
                   </div>
                 )}
               </div>

               {/* DATA-DRIVEN TELEMETRY TICKER */}
               <div className="absolute bottom-3 left-3 sm:bottom-6 sm:left-6 z-400 w-[58%] sm:w-107 max-w-107 bg-white/40 dark:bg-slate-900/50 backdrop-blur-sm p-2 sm:p-3.5 rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-white dark:border-slate-700 flex flex-col gap-1.5 sm:gap-2 overflow-hidden h-28 sm:h-36 transition-colors duration-300">
                 <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-2">
                   <div className="relative flex h-2.5 w-2.5">
                     <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                     <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                   </div>
                   <Activity className="w-4 h-4 text-red-500" />
                   <span className="text-[10px] sm:text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">Live Telemetry</span>
                 </div>
                 <div className="flex flex-col gap-1.5 justify-end flex-1 overflow-hidden font-mono text-[10px] leading-tight">
                   {telemetryLogs.map((log) => (
                     <div key={log.id} className="flex items-start gap-2 animate-in slide-in-from-bottom-2 fade-in duration-300">
                       <span className="text-slate-400 dark:text-slate-500 font-medium shrink-0">[{log.time}]</span>
                       <span className={`px-1.5 py-0.5 rounded border text-[9px] font-bold shrink-0 ${getLogColor(log.type)}`}>
                         {log.type}
                       </span>
                       <span className="text-slate-700 dark:text-slate-300 truncate">{log.msg}</span>
                     </div>
                   ))}
                 </div>
               </div>
            </div>
             
             {/* Map Legend Overlay */}
             <div className="absolute bottom-3 right-3 sm:bottom-6 sm:right-6 z-400 bg-white/40 dark:bg-slate-900/50 backdrop-blur-sm p-2.5 sm:p-4 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 max-w-37.5 sm:max-w-none transition-colors duration-300">
               <h4 className="text-[10px] sm:text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2">Impact Severity</h4>
               <div className="space-y-1 sm:space-y-2 text-[11px] sm:text-sm text-slate-700 dark:text-slate-300 font-medium">
                 <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500 shadow-sm flex-none"></div> Critical (70+)</div>
                 <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-purple-500 shadow-sm flex-none"></div> High (30-74)</div>
                 <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-orange-500 shadow-sm flex-none"></div> Moderate (5-29)</div>
                 <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-green-500 shadow-sm flex-none"></div> Low (0-4)</div>
               </div>
             </div>
          </div>
        </main>
      </div>

      {/* RIGHT PANE */}
      <aside className="w-full lg:w-110 flex-2 lg:flex-none min-h-0 shadow-xl z-20">
        <AgentChat />
      </aside>

    </div>
  );
}
