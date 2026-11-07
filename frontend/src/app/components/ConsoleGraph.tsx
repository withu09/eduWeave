import { useEffect } from "react";
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  Position,
  Handle,
  BackgroundVariant,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface AgentNodeData extends Record<string, unknown> {
  label: string;
  role: string;
  status: string;
  color: string;
  emoji: string;
  count: number;
}

function AgentNode({ data }: { data: AgentNodeData }) {
  const isWorking = data.status === "working" || data.status === "running";
  return (
    <div
      className={`relative min-w-[168px] rounded-2xl border px-3.5 py-2.5 text-white transition-all duration-300 ${
        isWorking
          ? "border-[var(--primary)] bg-[#171a2e] shadow-[0_0_20px_rgba(139,125,255,0.45)]"
          : "border-white/10 bg-[#121424]/95 hover:border-white/25"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-none !bg-white/25" />
      <div className="flex items-center gap-2.5">
        <div
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base"
          style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${data.color}44` }}
        >
          <span>{data.emoji}</span>
          {isWorking && (
            <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                style={{ backgroundColor: data.color }}
              />
              <span
                className="relative inline-flex h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: data.color }}
              />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1.5">
            <span className="truncate text-[12px] font-semibold tracking-tight">{data.label}</span>
            {data.count > 0 && (
              <span
                className="shrink-0 rounded-full px-1.5 py-0.2 font-mono text-[9px]"
                style={{ background: `${data.color}25`, color: data.color }}
              >
                {data.count}次
              </span>
            )}
          </div>
          <div className="truncate text-[10px] text-white/55">{data.role}</div>
          <div className="mt-0.5 flex items-center gap-1 font-mono text-[9px] uppercase">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: isWorking ? data.color : data.count > 0 ? "#7ce0b0" : "#64748b" }}
            />
            <span className={isWorking ? "text-[var(--primary)]" : "text-white/45"}>
              {isWorking ? "WORKING" : data.count > 0 ? "READY · 已调用" : "STANDBY"}
            </span>
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-none !bg-white/25" />
    </div>
  );
}

const nodeTypes = {
  agent: AgentNode,
};

const AGENT_DEFS = [
  { id: "api", key: "API", label: "Dify RAG & Gateway", role: "知识检索与中枢路由", emoji: "🌐", color: "#8b7dff", x: 310, y: 15 },
  { id: "profiler", key: "Profiler", label: "Profiler Agent", role: "学情画像与薄弱项诊断", emoji: "🧭", color: "#f2c879", x: 70, y: 135 },
  { id: "director", key: "Director", label: "Director Agent", role: "伴学决策与路径规划", emoji: "🎯", color: "#8b7dff", x: 310, y: 135 },
  { id: "builder", key: "CourseBuilder", label: "CourseBuilder", role: "教材解析与星图构建", emoji: "🪐", color: "#5ec8f2", x: 550, y: 135 },
  { id: "writer", key: "Writer", label: "Writer Agent", role: "结构化讲义与导图生成", emoji: "✍️", color: "#a78bfa", x: 20, y: 265 },
  { id: "examiner", key: "Examiner", label: "Examiner Agent", role: "动态题库命制与判卷", emoji: "📝", color: "#f472b6", x: 215, y: 265 },
  { id: "practice", key: "Practice", label: "Practice / Coder", role: "案例推演与编程实训", emoji: "💻", color: "#7ce0b0", x: 410, y: 265 },
  { id: "presenter", key: "Presenter", label: "Presenter Agent", role: "互动课件与语音讲稿", emoji: "🎤", color: "#fb923c", x: 605, y: 265 },
];

const EDGE_DEFS = [
  { id: "e-api-profiler", source: "api", target: "profiler", agentKey: "Profiler", color: "#f2c879" },
  { id: "e-api-director", source: "api", target: "director", agentKey: "Director", color: "#8b7dff" },
  { id: "e-api-builder", source: "api", target: "builder", agentKey: "CourseBuilder", color: "#5ec8f2" },
  { id: "e-profiler-director", source: "profiler", target: "director", agentKey: "Director", color: "#f2c879" },
  { id: "e-director-writer", source: "director", target: "writer", agentKey: "Writer", color: "#a78bfa" },
  { id: "e-director-examiner", source: "director", target: "examiner", agentKey: "Examiner", color: "#f472b6" },
  { id: "e-director-practice", source: "director", target: "practice", agentKey: "Practice", color: "#7ce0b0" },
  { id: "e-director-presenter", source: "director", target: "presenter", agentKey: "Presenter", color: "#fb923c" },
];

export function ConsoleGraph({
  agentStatuses = {},
  callCounts = {},
}: {
  agentStatuses?: Record<string, string>;
  callCounts?: Record<string, number>;
}) {
  const buildNodes = (): Node<AgentNodeData>[] =>
    AGENT_DEFS.map((def) => {
      const count =
        def.key === "API"
          ? Object.values(callCounts).reduce((a, b) => a + b, 0)
          : def.key === "Practice"
            ? (callCounts["Practice"] || 0) + (callCounts["Coder"] || 0) + (callCounts["PracticeFeedback"] || 0)
            : callCounts[def.key] || 0;
      const status =
        def.key === "API"
          ? Object.values(agentStatuses).some((s) => s === "working" || s === "running")
            ? "working"
            : "idle"
          : def.key === "Practice"
            ? agentStatuses["Practice"] === "working" || agentStatuses["Coder"] === "working"
              ? "working"
              : "idle"
            : agentStatuses[def.key] || "idle";

      return {
        id: def.id,
        type: "agent",
        position: { x: def.x, y: def.y },
        data: {
          label: def.label,
          role: def.role,
          status,
          color: def.color,
          emoji: def.emoji,
          count,
        },
      };
    });

  const buildEdges = (): Edge[] =>
    EDGE_DEFS.map((e) => {
      const isActive =
        e.agentKey === "Practice"
          ? agentStatuses["Practice"] === "working" || agentStatuses["Coder"] === "working"
          : agentStatuses[e.agentKey] === "working" || agentStatuses[e.agentKey] === "running";
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        animated: isActive,
        style: {
          stroke: isActive ? e.color : "rgba(148, 163, 184, 0.32)",
          strokeWidth: isActive ? 2.2 : 1.3,
        },
      };
    });

  const [nodes, setNodes, onNodesChange] = useNodesState(buildNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState(buildEdges());

  useEffect(() => {
    setNodes(buildNodes());
    setEdges(buildEdges());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentStatuses, callCounts]);

  return (
    <div className="h-[340px] w-full overflow-hidden rounded-2xl border border-border bg-[#0b0d1a]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.16 }}
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={14} size={1} color="rgba(255,255,255,0.12)" />
      </ReactFlow>
    </div>
  );
}
