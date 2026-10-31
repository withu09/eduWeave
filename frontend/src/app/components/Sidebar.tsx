import { useState } from "react";
import { motion } from "motion/react";
import { Compass, Cpu, Layers, NotebookPen, Users, Telescope, PanelLeftClose, PanelLeftOpen, Database, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router";

export type ViewKey = "canvas" | "console" | "adaptive" | "notes" | "community" | "starmap";

const ITEMS: { key: ViewKey; label: string; sub: string; icon: LucideIcon }[] = [
  { key: "canvas", label: "织星画布", sub: "Weave Canvas", icon: Compass },
  { key: "console", label: "智能协同控制台", sub: "Agent Console", icon: Cpu },
  { key: "adaptive", label: "自适应学习空间", sub: "Adaptive Space", icon: Layers },
  { key: "starmap", label: "星图百科", sub: "Star Map Encyclopedia", icon: Telescope },
  { key: "notes", label: "学习笔记管理", sub: "Note Manager", icon: NotebookPen },
  { key: "community", label: "社区交流平台", sub: "Community", icon: Users },
];

export function Sidebar({ active, onChange }: { active: ViewKey; onChange: (v: ViewKey) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  return (
    <motion.nav
      animate={{ width: collapsed ? 68 : 230 }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className="flex h-full shrink-0 flex-col gap-1.5 overflow-hidden border-r border-sidebar-border bg-sidebar px-3 py-4"
    >
      <div className="mb-1 flex items-center justify-between px-2 pb-2">
        {!collapsed && (
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">导航 · Navigation</span>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
          title={collapsed ? "展开导航" : "收起导航"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      {ITEMS.map((it) => {
        const on = active === it.key;
        const Icon = it.icon;
        return (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            title={collapsed ? it.label : undefined}
            className={`relative flex items-center gap-3 rounded-xl py-2.5 text-left transition hover:bg-sidebar-accent ${collapsed ? "justify-center px-0" : "px-3"}`}
            style={{ background: on ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent" }}
          >
            {on && (
              <motion.span
                layoutId="nav-active"
                className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full"
                style={{ background: "var(--primary)" }}
              />
            )}
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
              style={{
                borderColor: on ? "var(--primary)" : "var(--border)",
                background: on ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "transparent",
              }}
            >
              <Icon className="h-4 w-4" style={{ color: on ? "var(--primary)" : "var(--muted-foreground)" }} />
            </span>
            {!collapsed && (
              <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap">
                <span className="block text-[13px] text-foreground">{it.label}</span>
                <span className="block font-mono text-[9px] uppercase tracking-wide text-muted-foreground">{it.sub}</span>
              </span>
            )}
          </button>
        );
      })}

      {!collapsed && (
        <div className="mt-auto space-y-3">
          <button
            onClick={() => navigate("/admin/knowledge-base")}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card/50 p-2.5 transition hover:bg-sidebar-accent"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
              <Database className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            <div className="flex-1 text-left">
              <span className="block text-[12px] text-foreground">知识库管理</span>
              <span className="block font-mono text-[9px] uppercase tracking-wide text-muted-foreground">Knowledge Base</span>
            </div>
          </button>
          
          <div className="rounded-xl border border-border bg-secondary/50 p-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-2)" }} />
              <span className="text-[11px]">系统在线</span>
            </div>
            <p className="font-mono text-[9px] leading-relaxed text-muted-foreground">Spark · LangGraph<br />6 Agents · RAG ready</p>
          </div>
        </div>
      )}
      {collapsed && (
        <div className="mt-auto flex flex-col items-center gap-3 pb-1">
          <button
            onClick={() => navigate("/admin/knowledge-base")}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card/50 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
            title="知识库管理"
          >
            <Database className="h-4 w-4" />
          </button>
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-2)" }} title="系统在线" />
        </div>
      )}
    </motion.nav>
  );
}
