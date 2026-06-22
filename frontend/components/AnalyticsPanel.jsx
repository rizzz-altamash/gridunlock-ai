// frontend/components/AnalyticsPanel.jsx 
"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { 
    ScatterChart, Scatter, ZAxis,
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer 
} from "recharts";
import { Activity, AlertTriangle, PieChart as PieIcon, Loader2, Crosshair, CalendarDays } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const COLORS = ['#ef4444', '#f97316', '#eab308', '#3b82f6'];

// Custom Tooltip for the Scatter Plot
const ScatterTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900 border border-slate-700 p-3 rounded-lg shadow-xl text-xs text-slate-100 z-50">
        <p className="font-bold text-blue-400 mb-1">{data.name}</p>
        <p>Impact Severity: <span className="font-semibold text-red-400">{data.impact.toFixed(1)}</span></p>
        <p>Chronicity (Repeat %): <span className="font-semibold text-orange-400">{data.chronicity}%</span></p>
      </div>
    );
  }
  return null;
};

// Custom Label Renderer for the Pie Chart
const renderPremiumPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index, name }) => {
  const RADIAN = Math.PI / 180;
  // Push the label significantly outside the outer edge of the doughnut
  const radius = outerRadius * 1.55; 
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  if (percent < 0.05) return null;

  return (
    <text 
      x={x} 
      y={y} 
      fill="#94a3b8" 
      fontSize={11} 
      fontWeight={600}
      textAnchor={x > cx ? 'start' : 'end'} 
      dominantBaseline="central"
    >
      <tspan x={x} dy="-4">{name}</tspan>
      <tspan x={x} dy="12" fill="#3b82f6">{(percent * 100).toFixed(0)}%</tspan>
    </text>
  );
};

export default function AnalyticsPanel({ currentDay }) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check initial theme
    const root = document.documentElement;
    setIsDark(root.classList.contains("dark"));

    // Listen for theme toggles
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains("dark"));
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setIsLoading(true);
      try {
        const res = await axios.get(`${API_BASE}/api/v1/analytics/dashboard?day=${currentDay}`);
        setData(res.data);
      } catch (error) {
        console.error("Failed to load analytics", error);
      } finally {
        setIsLoading(false);
      }
    };
    if (currentDay) fetchAnalytics();
  }, [currentDay]);

  // --- SKELETON LOADING STATE ---
  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-4 w-full h-full overflow-y-auto pr-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm animate-pulse shrink-0">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-4 h-4 bg-slate-200 dark:bg-slate-800 rounded-full" />
              <div className="w-40 h-3 bg-slate-200 dark:bg-slate-800 rounded-full" />
              {i === 1 && <Loader2 className="w-3 h-3 text-slate-300 dark:text-slate-700 animate-spin ml-auto" />}
            </div>
            <div className="h-48 w-full bg-slate-100 dark:bg-slate-800/50 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  // --- ACTUAL LOADED UI ---
  return (
    <div className="flex flex-col gap-4 w-full h-full overflow-y-auto pr-2 pb-6 animate-in fade-in slide-in-from-bottom-4 duration-500
        [&::-webkit-scrollbar]:w-1.5 
        [&::-webkit-scrollbar-track]:rounded-full 
        [&::-webkit-scrollbar-track]:bg-slate-300/50 
        dark:[&::-webkit-scrollbar-track]:bg-slate-700/50
        [&::-webkit-scrollbar-thumb]:bg-blue-400 
        dark:[&::-webkit-scrollbar-thumb]:bg-blue-600
        hover:[&::-webkit-scrollbar-thumb]:bg-blue-500 
        transition-colors"
    >

      {/* Chart 1: Predictive Trend - Line Plot */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-500" />
            <h3 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">24-Hour Grid Congestion</h3>
          </div>
          <span className="text-[9px] font-mono bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">Avg of Top 50</span>
        </div>
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.trend_data}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#ffffff" : "#334155"} vertical={false} opacity={0.3} />
              <XAxis dataKey="time" stroke="#64748b" fontSize={10} tickMargin={10} />
              <YAxis stroke="#64748b" fontSize={10} domain={['dataMin', 'dataMax']} hide />
              <RechartsTooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc', fontSize: '12px' }}/>
              <Line type="monotone" dataKey="avg_impact" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 0 }} activeDot={{ r: 6, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 2: Prioritization Queue - Bar Plot */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm shrink-0">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <h3 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Targeted Enforcement Queue</h3>
        </div>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.top_hotspots} layout="vertical" margin={{ top: 0, left: 30, right: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#ffffff" : "#334155"} horizontal={false} opacity={0.3} />
              <XAxis type="number" domain={[0, 'dataMax+3']} hide />
              <YAxis dataKey="location" type="category" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
              <RechartsTooltip cursor={{fill: '#334155', opacity: 0.1}} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc', fontSize: '12px' }}/>
              <Bar dataKey="impact" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 3: Risk Quadrant - Scatter Plot */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Crosshair className="w-4 h-4 text-orange-500" />
            <h3 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Policy vs. Patrol Matrix</h3>
          </div>
        </div>
        <div className="h-56 w-full relative">
          <span className="absolute -top-1 right-2.5 text-[9px] font-bold text-red-500/50 uppercase">Systemic Issue</span>
          <span className="absolute -top-1 left-10 text-[9px] font-bold text-orange-500/50 uppercase">Event Driven</span>
          
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#ffffff" : "#334155"} opacity={0.3} />
              <XAxis type="number" dataKey="chronicity" name="Chronicity" stroke="#64748b" fontSize={10} domain={['dataMin - 2', 'dataMax + 5']} tickFormatter={(val) => `${val.toFixed(0)}%`} />
              <YAxis type="number" dataKey="impact" name="Severity" stroke="#64748b" fontSize={10} domain={[0, 'dataMax + 5']} tickFormatter={(val) => `${val.toFixed(0)}`} />
              <ZAxis type="number" dataKey="volume" range={[20, 200]} />
              <RechartsTooltip content={<ScatterTooltip />} cursor={{strokeDasharray: '3 3'}} />
              <Scatter name="Zones" data={data.risk_quadrant} fill="#f97316" fillOpacity={0.7} stroke="#fff" strokeWidth={1} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 4: Weekly Risk Signature - Spider Plot */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-emerald-500" />
            <h3 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Shift Rostering Signature</h3>
          </div>
          <span className="text-[9px] font-mono bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded">Weekly Trajectory</span>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data.weekly_signature}>
              <PolarGrid stroke={isDark ? "#ffffff" : "#334155"} opacity={0.4} />
              <PolarAngleAxis dataKey="day" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }} />
              <PolarRadiusAxis angle={30} domain={[0, 'dataMax']} tick={false} axisLine={false} />
              <Radar 
                name="Congestion Risk" 
                dataKey="risk" 
                stroke="#10b981" 
                strokeWidth={2}
                fill="#10b981" 
                fillOpacity={0.3} 
              />
              <RechartsTooltip 
                contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc', fontSize: '12px' }}
                itemStyle={{ color: '#10b981', fontWeight: 'bold' }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart 5: Violation Diversity - Pie Plot */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <PieIcon className="w-4 h-4 text-purple-500" />
          <h3 className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Violation Profiling</h3>
        </div>
        <div className="h-45 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 20, right: 35, bottom: 20, left: 35 }}>
              <Pie 
                data={data.violation_distribution} 
                cx="50%" 
                cy="50%" 
                innerRadius={30} 
                outerRadius={50} 
                paddingAngle={5} 
                dataKey="value" 
                stroke="none"
                isAnimationActive={false}
                label={renderPremiumPieLabel}
                labelLine={{ stroke: '#475569', strokeWidth: 1 }}
                >
                {data.violation_distribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
                </Pie>
              <RechartsTooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc', fontSize: '12px' }}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

    </div>
  );
}
