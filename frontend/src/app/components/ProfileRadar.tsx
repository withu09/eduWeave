import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { profileRadar } from "../data";

// Six-dimension dynamic student profile (画像可视化)
export function ProfileRadar() {
  return (
    <div className="rounded-2xl border border-border bg-card/80 p-5 backdrop-blur-xl relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative z-10">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[15px] font-medium">六维动态画像</h3>
          <span className="font-mono text-[10px] uppercase tracking-widest text-primary bg-primary/10 px-2 py-0.5 rounded-full">Profiler · live</span>
        </div>
        <p className="mb-4 text-[11px] text-muted-foreground">随学随新 · 由画像分析 Agent 实时维护</p>
        <div className="h-[210px] w-full" style={{ filter: 'drop-shadow(0 0 10px rgba(var(--primary-rgb), 0.3))' }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={profileRadar} outerRadius="72%">
              <PolarGrid stroke="rgba(140,150,220,0.15)" strokeDasharray="3 3" />
              <PolarAngleAxis
                dataKey="dim"
                tick={{ fill: "var(--foreground)", fontSize: 11, fontFamily: "var(--font-body)", opacity: 0.8 }}
              />
              <Radar
                dataKey="value"
                stroke="var(--primary)"
                fill="url(#colorUv)"
                fillOpacity={0.4}
                strokeWidth={2}
                animationDuration={1200}
                animationEasing="ease-out"
              />
              <defs>
                <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
