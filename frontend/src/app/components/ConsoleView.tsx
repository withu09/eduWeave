import { useEffect, useRef, useState } from "react";
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell, LabelList } from "recharts";
import { Cpu, Activity, Coins, Gauge, ShieldAlert } from "lucide-react";
import { agents } from "../data";
import { useConsoleStore } from "../../store/consoleStore";
import { useRobustWebSocket } from "../../hooks/useRobustWebSocket";
import { ConsoleGraph } from "./ConsoleGraph";

// 智能协同控制台 — multi-agent collaboration monitor.
export function ConsoleView() {
  const { thoughts: log, agentStatuses, tokenUsage: tokensState, ragMetrics, addThought, updateAgentStatus, updateTokenUsage, updateRagMetrics, clearConsole } = useConsoleStore();
  const [agentsState, setAgentsState] = useState(agents);
  
  const scroller = useRef<HTMLDivElement>(null);

  // Sync static agent info with dynamic status from store
  useEffect(() => {
    setAgentsState(agents.map(a => ({
      ...a,
      status: agentStatuses[a.role] || 'idle'
    })));
  }, [agentStatuses]);

  const handleMessage = (payload: any) => {
    if (payload.type === 'thought') {
      addThought(payload.data);
    } else if (payload.type === 'agent_status') {
      updateAgentStatus(payload.data.name, payload.data.status);
    } else if (payload.type === 'token_usage') {
      updateTokenUsage(payload.data.agent, {
        prompt_tokens: payload.data.tokens / 2,
        completion_tokens: payload.data.tokens / 2,
        total_tokens: payload.data.tokens
      });
    } else if (payload.type === 'rag_metrics') {
      updateRagMetrics({
        hitRate: payload.data.hitRate,
        latency: payload.data.latency
      });
    }
  };

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;
  const wsUrl = `${protocol}//${host}:8000/api/console/ws`;

  const { isConnected, sendMessage } = useRobustWebSocket({
    url: wsUrl,
    onMessage: handleMessage
  });

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [log]);

  const handleKill = async () => {
    try {
      await fetch(`${protocol}//${host}:8000/api/console/kill`, { method: 'POST' });
      addThought({ id: Date.now().toString(), agent: 'System', message: '收到终止信号，所有运行中的 Agent 已强制中断。', timestamp: new Date().toLocaleTimeString() });
      updateAgentStatus('Writer', 'idle');
      updateAgentStatus('Presenter', 'idle');
      updateAgentStatus('Coder', 'idle');
    } catch (e) {
      console.error(e);
    }
  };

  const activeCount = agentsState.filter(a => a.status !== 'idle').length;
  const totalTokensRaw = Object.values(tokensState).reduce((sum, item) => sum + (item.total_tokens || 0), 0);
  const totalTokens = (totalTokensRaw / 1000).toFixed(1) + 'k';

  // Format token chart data
  const chartData = agentsState.map(a => ({
    agent: a.name,
    tokens: tokensState[a.role]?.total_tokens || 0
  }));

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      <Header icon={Cpu} title="智能协同控制台" sub="Multi-Agent Console · LangGraph State Machine" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Activity} label="活跃 Agent" value={`${activeCount} / ${agentsState.length}`} tint={isConnected ? "var(--primary)" : "var(--muted-foreground)"} />
        <Stat icon={Coins} label="Token 消耗" value={totalTokens} tint="var(--primary)" />
        <Stat icon={Gauge} label="RAG 平均时延" value={ragMetrics.latency > 0 ? `${ragMetrics.latency.toFixed(2)}s` : "0.00s"} tint="#7ce0b0" />
        <Stat icon={ShieldAlert} label="RAG 命中率" value={ragMetrics.hitRate > 0 ? `${(ragMetrics.hitRate * 100).toFixed(0)}%` : "0%"} tint="var(--destructive)" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* React Flow Graph */}
        <section className="h-[250px] rounded-2xl border border-border bg-card overflow-hidden backdrop-blur-xl">
          <ConsoleGraph />
        </section>
        <section className="rounded-2xl border border-border bg-card p-4 backdrop-blur-xl">
          <h3 className="mb-3 text-[14px]">智能体状态矩阵</h3>
          <div className="grid grid-cols-2 gap-2.5">
            {agentsState.map((a) => (
              <div key={a.role} className="rounded-xl border border-border bg-secondary/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: a.color, boxShadow: a.status !== "idle" ? `0 0 8px ${a.color}` : "none" }} />
                    <span className="text-[13px]">{a.name}</span>
                  </span>
                  <span className="font-mono text-[9px] uppercase text-muted-foreground">{a.status}</span>
                </div>
                <div className="mt-1 font-mono text-[10px] text-muted-foreground">{a.role} Agent</div>
              </div>
            ))}
          </div>
        </section>

        {/* token chart */}
        <section className="rounded-2xl border border-border bg-card p-4 backdrop-blur-xl">
          <h3 className="mb-3 text-[14px]">Token 消耗分布</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="agent" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Bar dataKey="tokens" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={["var(--primary)", "var(--primary)", "#7ce0b0", "var(--destructive)", "#f2c879", "var(--destructive)"][i % 6]} />
                  ))}
                  <LabelList dataKey="tokens" position="top" fill="var(--muted-foreground)" fontSize={10} formatter={(val: number) => val > 0 ? (val >= 1000 ? (val/1000).toFixed(1) + 'k' : val) : ''} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      {/* Control Panel */}
      <section className="flex gap-3">
        <button onClick={clearConsole} className="px-4 py-2 rounded-lg bg-secondary text-xs hover:bg-secondary/80 transition-colors">
          清空控制台
        </button>
        <button onClick={handleKill} disabled={activeCount === 0} className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-xs hover:bg-destructive/90 transition-colors disabled:opacity-50">
          强制中断 (Kill Task)
        </button>
      </section>

      {/* thought stream */}
      <section className="rounded-2xl border border-border bg-card p-4 backdrop-blur-xl">
        <h3 className="mb-3 flex items-center gap-2 text-[14px]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--destructive)]" /> 智能体思绪流 · Live
        </h3>
        <div ref={scroller} className="max-h-[220px] space-y-2 overflow-y-auto rounded-xl border border-border bg-input-background p-3">
          {log.map((l, i) => (
            <div key={i} className="font-mono text-[11px] leading-relaxed">
              <span className="text-muted-foreground">{l.t} </span>
              <span className="text-[var(--primary)]">[{l.agent}]</span>{" "}
              <span className="text-foreground/80">{l.text}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function liveTime() {
  return new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

function Header({ icon: Icon, title, sub }: { icon: typeof Cpu; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "linear-gradient(135deg, var(--primary), var(--destructive))" }}>
        <Icon className="h-5 w-5 text-white" />
      </span>
      <div>
        <h2 className="text-[18px] leading-tight">{title}</h2>
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tint }: { icon: typeof Cpu; label: string; value: string; tint: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3.5 backdrop-blur-xl">
      <Icon className="mb-2 h-4 w-4" style={{ color: tint }} />
      <div className="text-[20px] leading-none" style={{ fontFamily: "var(--font-display)" }}>{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
