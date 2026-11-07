import { useEffect, useMemo, useState } from "react";
import { Cpu, Activity, Coins, Clock, RefreshCw, Network, BarChart3 } from "lucide-react";
import { API_BASE, wsUrl } from "../config";
import { useRobustWebSocket } from "../../hooks/useRobustWebSocket";
import { ConsoleGraph } from "./ConsoleGraph";

interface Call {
  id: string;
  agent: string;
  task: string;
  status: "running" | "completed" | "error" | "cancelled";
  started_at: string;
  finished_at?: string;
  duration_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  model: string;
  error_type?: string;
}

const labels = { running: "处理中", completed: "已完成", error: "失败", cancelled: "已取消" };

function mergeCalls(previous: Call[], incoming: Call[]): Call[] {
  const records = new Map(previous.map((call) => [call.id, call]));
  for (const call of incoming) {
    const old = records.get(call.id);
    if (!old?.finished_at || call.finished_at) records.set(call.id, call);
  }
  return [...records.values()]
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, 100);
}

export function ConsoleView() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [wsStatuses, setWsStatuses] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/console/calls`, { cache: "no-store" });
      if (!response.ok) throw new Error("调用记录加载失败，请稍后重试");
      const data = await response.json();
      setCalls((previous) => mergeCalls(previous, data.calls));
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "读取失败");
    } finally {
      setLoading(false);
    }
  };

  const { isConnected } = useRobustWebSocket({
    url: wsUrl("/api/console/ws"),
    onMessage: (payload) => {
      if (payload.type === "call") {
        setCalls((previous) => mergeCalls(previous, [payload.data]));
      } else if (payload.type === "agent_status" && payload.data?.name) {
        setWsStatuses((prev) => ({ ...prev, [payload.data.name]: payload.data.status }));
      }
    },
  });

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
  }, []);

  const completed = calls.filter((call) => call.status === "completed");
  const timed = completed.filter((call) => call.duration_ms !== null);
  const average = timed.length
    ? (timed.reduce((sum, call) => sum + (call.duration_ms ?? 0), 0) / timed.length / 1000).toFixed(2) + " 秒"
    : "暂无记录";
  const tokens = calls.reduce((sum, call) => sum + (call.total_tokens ?? 0), 0);

  const { agentStatuses, callCounts, tokenByAgent } = useMemo(() => {
    const statuses: Record<string, string> = { ...wsStatuses };
    const counts: Record<string, number> = {};
    const tokMap: Record<string, number> = {};
    for (const c of calls) {
      counts[c.agent] = (counts[c.agent] || 0) + 1;
      tokMap[c.agent] = (tokMap[c.agent] || 0) + (c.total_tokens ?? 0);
      if (c.status === "running") {
        statuses[c.agent] = "working";
      } else if (!statuses[c.agent]) {
        statuses[c.agent] = "idle";
      }
    }
    return { agentStatuses: statuses, callCounts: counts, tokenByAgent: tokMap };
  }, [calls, wsStatuses]);

  const maxAgentTokens = Math.max(1, ...Object.values(tokenByAgent));

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1 pb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Cpu className="h-8 w-8 text-primary" />
          <div>
            <h2 className="text-xl font-semibold">智能协同控制台</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              多智能体实时拓扑 · 真实调用实例 · {isConnected ? "实时连接正常" : "定时更新中"}
            </p>
          </div>
        </div>
        <button
          aria-label="刷新调用记录"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl border border-border p-2 transition hover:bg-secondary"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [Activity, "进行中的任务", String(calls.filter((call) => call.status === "running").length)],
          [Cpu, "已记录调用", String(calls.length)],
          [Coins, "已上报 Token 总数", tokens.toLocaleString()],
          [Clock, "完成调用平均耗时", average],
        ].map(([Icon, label, value]) => {
          const MetricIcon = Icon as typeof Cpu;
          return (
            <div key={String(label)} className="rounded-2xl border border-border bg-card/80 p-4">
              <MetricIcon className="mb-2 h-4 w-4 text-primary" />
              <div className="text-xl font-semibold">{String(value)}</div>
              <p className="mt-1 text-xs text-muted-foreground">{String(label)}</p>
            </div>
          );
        })}
      </div>

      {/* Multi-Agent Topology Graph + Token Distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card/80 p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Network className="h-4 w-4 text-primary" />
              <span>多智能体协同拓扑图 (Multi-Agent DAG)</span>
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">
              状态联动：伴学 / 建课 / 讲义 / 测验 / 实训 / 讲解
            </span>
          </div>
          <ConsoleGraph agentStatuses={agentStatuses} callCounts={callCounts} />
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-border bg-card/80 p-4">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span>各智能体 Token 消耗与调用分布</span>
            </div>
            {Object.keys(callCounts).length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                暂无智能体调用数据，触发 AI 伴学或知识节点生成后自动统计
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(callCounts).map(([agent, count]) => {
                  const agentTok = tokenByAgent[agent] || 0;
                  const pct = Math.max(8, Math.round((agentTok / maxAgentTokens) * 100));
                  const running = agentStatuses[agent] === "working";
                  return (
                    <div key={agent} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">
                          {agent}
                          {running && <span className="ml-1.5 text-[10px] text-primary">● 处理中</span>}
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {count} 次 · {agentTok.toLocaleString()} tok
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            background: "linear-gradient(90deg, var(--primary), var(--accent))",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-muted-foreground">
            展示最近最多 100 次实际模型调用。耗时来自实际执行计时，Token 来自百炼/星火大模型真实返回；读取缓存不增加模型调用数。
          </p>
        </div>
      </div>

      {calls.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/80 p-10 text-center text-sm text-muted-foreground">
          {loading ? "正在读取调用记录…" : "暂时没有实际调用。发送 AI 伴学消息、生成测验或实践练习后，这里会显示执行记录。"}
        </div>
      ) : (
        <section className="overflow-x-auto rounded-2xl border border-border bg-card/80">
          <table className="w-full min-w-[780px] text-left text-xs">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                {["智能体 / 时间", "实际任务", "状态", "耗时", "输入 / 输出 Token", "总 Token"].map((label) => (
                  <th key={label} className="px-4 py-3 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => (
                <tr key={call.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium">{call.agent}</div>
                    <div className="mt-1 text-muted-foreground">{new Date(call.started_at).toLocaleTimeString()}</div>
                  </td>
                  <td className="max-w-xs px-4 py-3">
                    <div className="break-words leading-relaxed">{call.task}</div>
                    <div className="mt-1 text-[10px] text-muted-foreground">{call.model}</div>
                  </td>
                  <td
                    className={`px-4 py-3 ${
                      call.status === "error"
                        ? "text-destructive"
                        : call.status === "running"
                          ? "text-primary"
                          : "text-muted-foreground"
                    }`}
                  >
                    {labels[call.status]}
                    {call.error_type && <div className="mt-1 text-[10px]">{call.error_type}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {call.duration_ms === null ? "—" : `${(call.duration_ms / 1000).toFixed(2)} 秒`}
                  </td>
                  <td className="px-4 py-3">
                    {call.input_tokens ?? "—"} / {call.output_tokens ?? "—"}
                  </td>
                  <td className="px-4 py-3">{call.total_tokens ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
