import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, UploadCloud, SlidersHorizontal, Activity, FileUp } from "lucide-react";
import { agents, thoughtStream } from "../data";

export function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [temp, setTemp] = useState(0.6);
  const [topP, setTopP] = useState(0.9);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="absolute inset-0 z-40 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="absolute left-0 top-0 z-50 flex h-full w-[min(440px,94vw)] flex-col border-r border-border bg-popover/95 backdrop-blur-2xl"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border" style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}>
                  <SlidersHorizontal className="h-4 w-4 text-white" />
                </div>
                <div>
                  <div className="text-[14px] font-medium">永恒星核 · 配置面板</div>
                  <div className="font-mono text-[10px] text-muted-foreground">Eternal Core · Settings</div>
                </div>
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
              {/* Model config */}
              <section>
                <h4 className="mb-3 flex items-center gap-2 text-[13px] text-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" /> 模型配置 · 讯飞星火
                </h4>
                <label className="mb-1 block text-[11px] text-muted-foreground">API Key</label>
                <input
                  type="password"
                  defaultValue="YOUR_SPARK_API_KEY_HERE"
                  className="mb-3 w-full rounded-xl border border-border bg-input-background px-3 py-2 font-mono text-[12px] text-foreground outline-none focus:border-[var(--primary)]"
                />
                <Slider label="Temperature" value={temp} onChange={setTemp} />
                <Slider label="Top P" value={topP} onChange={setTopP} />
              </section>

              {/* Knowledge base */}
              <section>
                <h4 className="mb-3 flex items-center gap-2 text-[13px] text-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" /> 星尘导入 · 知识库挂载
                </h4>
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-input-background/40 px-4 py-7 text-center transition hover:border-[var(--primary)]">
                  <UploadCloud className="mb-2 h-7 w-7 text-[var(--primary)]" />
                  <p className="text-[12px] text-foreground">拖拽专业课 PDF / Markdown 到此处</p>
                  <p className="text-[10px] text-muted-foreground">上传后自动切片 (Chunking) 并向量化入库</p>
                </div>
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2">
                  <FileUp className="h-4 w-4 text-[var(--primary)]" />
                  <span className="flex-1 text-[12px]">数据结构与算法.pdf</span>
                  <span className="font-mono text-[10px] text-[#7ce0b0]">已向量化 · 312 chunks</span>
                </div>
              </section>

              {/* Agent thought streaming */}
              <section>
                <h4 className="mb-3 flex items-center gap-2 text-[13px] text-foreground">
                  <Activity className="h-3.5 w-3.5 text-[var(--destructive)]" /> 智能体思绪流
                </h4>
                <div className="mb-3 grid grid-cols-3 gap-2">
                  {agents.map((a) => (
                    <div key={a.role} className="rounded-xl border border-border bg-secondary/30 px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: a.color, boxShadow: a.status !== "idle" ? `0 0 6px ${a.color}` : "none" }}
                        />
                        <span className="text-[11px]">{a.name}</span>
                      </div>
                      <span className="font-mono text-[9px] uppercase tracking-wide text-muted-foreground">{a.status}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-2 rounded-xl border border-border bg-input-background p-3">
                  {thoughtStream.map((l, i) => (
                    <div key={i} className="font-mono text-[11px] leading-relaxed">
                      <span className="text-muted-foreground">{l.t} </span>
                      <span className="text-[var(--primary)]">[{l.agent}]</span>{" "}
                      <span className="text-foreground/80">{l.text}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-foreground">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[var(--primary)]"
      />
    </div>
  );
}
