import { Layers, AlertTriangle, FileText, Network, ListChecks, Video, Code2, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { type ResourceType } from "../data";
import { ProfileRadar } from "./ProfileRadar";
import { useAdaptiveStore } from "../../store/adaptiveStore";
import { motion } from "motion/react";

const RICON: Record<ResourceType, typeof FileText> = {
  doc: FileText, map: Network, quiz: ListChecks, video: Video, code: Code2,
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

export function AdaptiveView() {
  const { steps, tasks, isGenerating, triggerGenerate } = useAdaptiveStore();

  return (
    <motion.div 
      className="flex h-full flex-col gap-5 overflow-y-auto pr-1"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants} className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-lg shadow-primary/20" style={{ background: "linear-gradient(135deg, var(--primary), var(--primary))" }}>
          <Layers className="h-6 w-6 text-white" />
        </span>
        <div>
          <h2 className="text-[20px] font-semibold leading-tight tracking-tight">自适应学习空间</h2>
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">Adaptive Space · 动态路径规划</p>
        </div>
      </motion.div>

      {/* weakness trigger banner */}
      <motion.div variants={itemVariants} className="relative overflow-hidden flex items-start gap-3 rounded-2xl border px-4 py-4 backdrop-blur-md" style={{ borderColor: "rgba(217,163,181,0.4)", background: "rgba(217,163,181,0.06)" }}>
        <div className="absolute inset-0 bg-gradient-to-r from-destructive/10 to-transparent opacity-50" />
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--destructive)] relative z-10" />
        <div className="relative z-10">
          <p className="text-[14px] font-medium">检测到薄弱点 · <span className="text-[var(--destructive)] font-bold">单链表反转</span> 连续做错 3 次</p>
          <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">画像分析 Agent 已上报，总控 Agent 已触发路径重规划，并将该知识点提升为当前攻克重点。后台智能体正在待命为您生成定制学习包。</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] h-full min-h-0 pb-4">
        {/* path timeline kanban */}
        <motion.section variants={itemVariants} className="space-y-4 relative">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[15px] font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              动态学习路径
            </h3>
            <span className="text-[11px] text-muted-foreground font-mono">STEP-BY-STEP</span>
          </div>

          <div className="relative pl-3">
            {/* The vertical timeline line */}
            <div className="absolute top-4 bottom-4 left-[23px] w-[2px] bg-border rounded-full" />
            
            <div className="space-y-6">
              {steps.map((s, idx) => {
                const isActive = s.state === "active";
                const isDone = s.state === "done";
                
                return (
                  <motion.div 
                    key={s.id}
                    variants={itemVariants}
                    className="relative flex gap-4 items-start group"
                  >
                    {/* Timeline Node */}
                    <div className="relative z-10 mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-background transition-colors duration-300"
                         style={{ 
                           borderColor: isDone ? "var(--success)" : isActive ? "var(--primary)" : "var(--border)",
                           boxShadow: isActive ? "0 0 12px var(--primary)" : "none"
                         }}>
                      <div className={`h-2.5 w-2.5 rounded-full ${isActive ? 'animate-pulse' : ''}`}
                           style={{ background: isDone ? "var(--success)" : isActive ? "var(--primary)" : "transparent" }} />
                    </div>

                    {/* Content Card */}
                    <div
                      className="flex-1 rounded-2xl border bg-card/80 p-4 backdrop-blur-xl transition-all duration-300 group-hover:border-border/80 group-hover:shadow-lg"
                      style={{ 
                        borderColor: isActive ? "var(--primary)" : "var(--border)", 
                        boxShadow: isActive ? "0 0 24px -10px var(--primary)" : "none",
                        opacity: s.state === "todo" ? 0.7 : 1
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">{s.step}</span>
                          <span className={`text-[15px] font-medium ${isDone ? 'text-foreground' : isActive ? 'text-primary' : 'text-foreground'}`}>{s.title}</span>
                        </div>
                        <StateBadge state={s.state} />
                      </div>
                      
                      <p className="mt-2.5 text-[13px] text-muted-foreground leading-relaxed">{s.detail}</p>
                      
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {s.resources.map((r) => {
                            const Icon = RICON[r];
                            return (
                              <span key={r} className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-secondary/30 transition-transform hover:scale-110 hover:bg-secondary/60 cursor-help" title={`资源类型: ${r}`}>
                                <Icon className="h-4 w-4 text-foreground/70" />
                              </span>
                            );
                          })}
                        </div>
                        
                        <button 
                          disabled={s.state === "todo" && (isGenerating || steps.some(step => step.state === "active"))}
                          onClick={() => {
                            if (s.state === 'todo') triggerGenerate(s.id);
                          }}
                          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-medium transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed`} 
                          style={{ 
                            background: isDone ? "transparent" : s.state === "active" ? "var(--primary)" : "var(--secondary)", 
                            color: isDone ? "var(--success)" : s.state === "active" ? "var(--primary-foreground)" : "var(--foreground)",
                            border: isDone ? "1px solid var(--success)" : "1px solid transparent"
                          }}
                        >
                          {isDone ? (
                            <><CheckCircle2 className="w-3.5 h-3.5" /> 已掌握, 去复习</>
                          ) : s.state === "active" ? (
                            "进入学习"
                          ) : isGenerating && s.state === 'todo' ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 等待前置完成</>
                          ) : (
                            <><Sparkles className="w-3.5 h-3.5" /> 呼叫 Agent 生成资源</>
                          )}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.section>

        {/* right column */}
        <aside className="space-y-6">
          <motion.div variants={itemVariants}>
            <ProfileRadar />
          </motion.div>
          
          <motion.section variants={itemVariants} className="rounded-2xl border border-border bg-card/80 p-5 backdrop-blur-xl relative overflow-hidden">
            {/* Background glow if generating */}
            <div className="absolute inset-0 bg-primary/5 transition-opacity duration-1000" style={{ opacity: isGenerating ? 1 : 0 }} />
            
            <div className="relative z-10">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[15px] font-medium flex items-center gap-2">
                  {isGenerating && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                  资源生成 · 异步队列
                </h3>
                <span className="font-mono text-[10px] uppercase text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">Task Queue</span>
              </div>
              
              <div className="space-y-4">
                {tasks.length === 0 ? (
                  <div className="text-center py-6 text-sm text-muted-foreground">当前队列空闲</div>
                ) : (
                  tasks.map((t) => {
                    const isDone = t.progress === 100;
                    return (
                      <motion.div 
                        key={t.id} 
                        initial={{ opacity: 0, x: 20 }} 
                        animate={{ opacity: 1, x: 0 }}
                        className="group"
                      >
                        <div className="mb-1.5 flex items-center justify-between text-[12px]">
                          <span className="flex items-center gap-2">
                            {isDone ? <CheckCircle2 className="h-4 w-4 text-[var(--success)]" /> : <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />}
                            <span className={isDone ? "text-foreground/70" : "text-foreground font-medium"}>{t.label}</span>
                          </span>
                          <span className={`font-mono ${isDone ? "text-[var(--success)]" : "text-primary font-bold"}`}>{t.progress}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-secondary/80 border border-border/50 relative">
                          <div 
                            className="absolute top-0 left-0 h-full rounded-full transition-all duration-300 ease-out" 
                            style={{ 
                              width: `${t.progress}%`, 
                              background: isDone ? "var(--success)" : "linear-gradient(90deg, var(--primary), #a78bfa)",
                              boxShadow: isDone ? "0 0 10px var(--success)" : "0 0 10px var(--primary)"
                            }} 
                          >
                            {!isDone && (
                              <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_1.5s_infinite]" style={{ transform: 'skewX(-20deg)' }} />
                            )}
                          </div>
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-muted-foreground flex items-center gap-1">
                          <span className="text-primary/70">[{t.agent} Agent]</span> · Assigned
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>
          </motion.section>
        </aside>
      </div>
    </motion.div>
  );
}

function StateBadge({ state }: { state: "done" | "active" | "todo" }) {
  const map = {
    done: { label: "已掌握", color: "var(--success)", bg: "color-mix(in srgb, var(--success) 10%, transparent)" },
    active: { label: "攻克中", color: "var(--primary)", bg: "color-mix(in srgb, var(--primary) 10%, transparent)" },
    todo: { label: "待解锁", color: "var(--muted-foreground)", bg: "var(--secondary)" },
  }[state];
  return (
    <span className="rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider font-semibold transition-colors" 
          style={{ borderColor: map.color, color: map.color, backgroundColor: map.bg }}>
      {map.label}
    </span>
  );
}
