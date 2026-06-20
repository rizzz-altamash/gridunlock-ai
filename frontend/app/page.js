// frontend/app/page.js 
"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { UploadCloud, Map as MapIcon, Database, Loader2, DatabaseZap, CalendarClock, HardDrive, Hexagon } from "lucide-react";
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
    <div className="h-full w-full flex items-center justify-center bg-slate-50 text-slate-400 gap-2">
      <Loader2 className="w-5 h-5 animate-spin" /> Initializing Map Engine...
    </div>
  )
});

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function Dashboard() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isTraining, setIsTraining] = useState(false);
  const [hotspots, setHotspots] = useState([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [modelStatus, setModelStatus] = useState(null);

  // 1. Fetch live global hotspots on component mount
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const mapResponse = await axios.get(`${API_BASE}/api/v1/hotspots/all`);
        setHotspots(mapResponse.data.hotspots);

        // Fetch model metadata
        const statusResponse = await axios.get(`${API_BASE}/api/v1/model/status`);
        setModelStatus(statusResponse.data);
      } catch (error) {
        console.error("Failed to fetch initial map data:", error);
      } finally {
        setMapLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const handleFileUpload = (e) => setSelectedFile(e.target.files[0]);

  // 2. Wire up the Continuous Training Pipeline
  const triggerCTPipeline = async () => {
    if (!selectedFile) return;
    setIsTraining(true);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      await axios.post(`${API_BASE}/api/v1/train`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      
      alert("Dataset uploaded successfully.\n\nCT Pipeline has been initiated in the background.\nThe prediction engine and hotspot database will update automatically after retraining completes.");
      setSelectedFile(null); // Clear form
    } catch (error) {
      alert("Failed to initiate CT pipeline.");
      console.error(error);
    } finally {
      setIsTraining(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
      
      {/* LEFT PANE */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Navbar */}
        <header className="h-16 px-6 bg-blue-100 border-b border-slate-200 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center gap-2">
            <MapIcon className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold tracking-tight">Bengaluru <span className="text-blue-600 tracking-wide">GridUnlock AI</span></h1>
            <Badge variant="outline" className="ml-2 bg-slate-100 text-slate-600 border-blue-600">v1.3</Badge>
            <Badge className="bg-blue-600 text-white">AI Engine Online</Badge>
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="default" className="group gap-2 bg-white border-slate-200 text-slate-700 hover:text-white hover:bg-blue-600 shadow-sm">
                <Database className="w-4 h-4 text-blue-600 group-hover:text-white" />
                Update Dataset
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-120 bg-blue-100">
              <DialogHeader>
                <DialogTitle className="text-lg font-semibold text-blue-600">Continuous Training Pipeline</DialogTitle>
                <DialogDescription className="text-sm text-slate-600">
                  Upload the latest traffic violation CSV. The automated MLOps architecture will trigger a background XGBoost retraining sequence and dynamically recalculate the predictive risk weights and hot-swap the updated H3 spatial hashes.
                </DialogDescription>
              </DialogHeader>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mt-2">
                <h4 className="text-xs text-center font-bold text-blue-500 uppercase tracking-wider mb-3">Current Architecture Status</h4>
                
                {/* UPGRADED: 2x2 CSS Grid Layout */}
                <div className="grid grid-cols-2 gap-y-5 gap-x-4">
                  
                  {/* Grid Item 1 */}
                  <div className="flex items-start gap-3 text-sm">
                    <div className="p-2 bg-blue-100 text-blue-600 rounded-md mt-0.5"><DatabaseZap className="w-4 h-4" /></div>
                    <div>
                      <p className="font-semibold text-slate-700 leading-tight">Engine Status</p>
                      <p className="text-slate-500 text-xs mt-0.5">{modelStatus?.status === "Online" ? "XGBoost - Active" : "Awaiting Data"}</p>
                    </div>
                  </div>

                  {/* Grid Item 2 */}
                  <div className="flex items-start gap-3 text-sm">
                    <div className="p-2 bg-purple-100 text-purple-600 rounded-md mt-0.5"><HardDrive className="w-4 h-4" /></div>
                    <div>
                      <p className="font-semibold text-slate-700 leading-tight">Dataset Volume</p>
                      <p className="text-slate-500 text-xs mt-0.5">
                        {modelStatus?.total_records_processed 
                          ? `${modelStatus.total_records_processed.toLocaleString()} records` 
                          : "Loading..."}
                      </p>
                    </div>
                  </div>

                  {/* Grid Item 3 */}
                  <div className="flex items-start gap-3 text-sm">
                    <div className="p-2 bg-emerald-100 text-emerald-600 rounded-md mt-0.5"><CalendarClock className="w-4 h-4" /></div>
                    <div>
                      <p className="font-semibold text-slate-700 leading-tight">Last Trained</p>
                      <p className="text-slate-500 text-xs mt-0.5">{modelStatus?.last_trained_date || "Loading..."}</p>
                    </div>
                  </div>

                  {/* Grid Item 4 (The New Metric) */}
                  <div className="flex items-start gap-3 text-sm">
                    <div className="p-2 bg-orange-100 text-orange-600 rounded-md mt-0.5"><Hexagon className="w-4 h-4" /></div>
                    <div>
                      <p className="font-semibold text-slate-700 leading-tight">H3 Hashes</p>
                      <p className="text-slate-500 text-xs mt-0.5">
                        {modelStatus?.active_monitored_zones 
                          ? `${modelStatus.active_monitored_zones} critical hexes` 
                          : "Loading..."}
                      </p>
                    </div>
                  </div>

                </div>
              </div>
              
              <div className="grid gap-4 py-4">
                <div className="flex items-center justify-center w-full">
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <UploadCloud className="w-8 h-8 mb-2 text-slate-400" />
                      <p className="text-sm text-slate-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                    </div>
                    <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
                  </label>
                </div>
                {selectedFile && <p className="text-sm text-green-600 font-medium truncate">Selected: {selectedFile.name}</p>}
                <Button 
                  onClick={triggerCTPipeline} 
                  disabled={!selectedFile || isTraining}
                  className="bg-blue-600 hover:bg-blue-700 w-full flex gap-2"
                >
                  {isTraining && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isTraining ? "Initializing Pipeline..." : "Retrain Architecture"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </header>

        {/* Map Area */}
        <main className="flex-1 p-4 bg-slate-100/50">
          <div className="h-full rounded-xl shadow-sm border border-slate-200 overflow-hidden bg-white relative isolate z-0">
             {mapLoading ? (
               <div className="h-full w-full flex flex-col items-center justify-center text-slate-400 gap-3">
                 <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                 <p className="text-sm font-medium">Synchronizing H3 Spatial Intelligence Grid...</p>
               </div>
             ) : (
               <DynamicMap hotspots={hotspots} />
             )}
             
             {/* Map Legend Overlay */}
             <div className="absolute bottom-6 right-6 z-400 bg-blue-50 backdrop-blur-sm p-4 rounded-lg shadow-md border border-slate-200">
               <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">Impact Severity</h4>
               <div className="space-y-2 text-sm text-slate-700 font-medium">
                 <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500 shadow-sm"></div> Critical (70+)</div>
                 <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-purple-500 shadow-sm"></div> High (30-74)</div>
                 <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500 shadow-sm"></div> Moderate (5-29)</div>
                 <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500 shadow-sm"></div> Low (0-4)</div>
               </div>
             </div>
          </div>
        </main>
      </div>

      {/* RIGHT PANE */}
      <aside className="w-110 shadow-xl z-20">
        <AgentChat />
      </aside>

    </div>
  );
}
