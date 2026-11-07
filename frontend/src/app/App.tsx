import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Settings2, MessageCircle, Volume2, Sun, Moon } from "lucide-react";
import { Sidebar, type ViewKey } from "./components/Sidebar";
import { CanvasFrame } from "./components/CanvasFrame";
import { ResourceCards } from "./components/ResourceCards";
import { CopilotDrawer } from "./components/CopilotDrawer";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { ConsoleView } from "./components/ConsoleView";
import { AdaptiveView } from "./components/AdaptiveView";
import { NotesView } from "./components/NotesView";
import { CommunityView } from "./components/CommunityView";
import { StarMapView } from "./components/StarMapView";
import { useStudyStore } from "./store";
import { API_BASE } from "./config";
import { useSpeechState, stopAllSpeech } from "./speech";

export default function App() {
  const [view, setView] = useState<ViewKey>("canvas");
  const [selected, setSelected] = useState<string | null>(null);
  const [studyNode, setStudyNode] = useState<{ id: string; tab: "doc" | "quiz" } | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [seedText, setSeedText] = useState("");
  // Dark mode: follow system preference until the user manually overrides.
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
  const userOverride = useRef(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      if (!userOverride.current) setDark(e.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Word-selection floating copilot ball (划词喂养)
  const [sel, setSel] = useState<{ x: number; y: number; text: string } | null>(null);
  useEffect(() => {
    const onUp = () => {
      const s = window.getSelection();
      const text = s?.toString().trim() ?? "";
      if (text.length > 1 && s && s.rangeCount) {
        const rect = s.getRangeAt(0).getBoundingClientRect();
        setSel({ x: rect.left + rect.width / 2, y: rect.top - 8, text });
      } else {
        setSel(null);
      }
    };
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, []);

  const { constellation, fetchConstellation, currentScope, setCurrentScope } = useStudyStore();
  const [courses, setCourses] = useState<{id: string, title: string}[]>([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        let res = await fetch(`${API_BASE}/api/kb/tree`, { cache: 'no-store' });
        let data = await res.json();
        let tree = data.tree;

        // Auto-recover from Dify if the database is empty on restart
        if (!tree || tree.length === 0) {
          const syncRes = await fetch(`${API_BASE}/api/kb/sync`, { method: 'POST' });
          if (syncRes.ok) {
            const syncData = await syncRes.json();
            tree = syncData.tree;
          }
        }

        if (tree && tree.length > 0) {
          setCourses(tree.map((c: any) => ({ id: c.id, title: c.title })));
          fetchConstellation('all'); // Initially fetch all for global map
        } else {
          useStudyStore.getState().resetConstellation();
        }
      } catch (err) {
        console.error("Failed to load tree for constellation:", err);
      }
    };
    loadData();
  }, [fetchConstellation]);

  useEffect(() => {
    if (courses.length > 0) {
      fetchConstellation(currentScope);
    }
  }, [currentScope, fetchConstellation, courses.length]);

  const knowledgeNodes = constellation.filter(n => n.type === "node");
  const mastered = knowledgeNodes.filter(n => n.status === "mastered").length;
  const progress = knowledgeNodes.length > 0 ? Math.round((mastered / knowledgeNodes.length) * 100) : 0;

  return (
    <div className={`${dark ? "dark" : ""} relative flex h-screen w-full flex-col overflow-hidden bg-background text-foreground`}>
      {/* ===== Top bar with TTS breathing aura ===== */}
      <header className="relative z-20 shrink-0 px-4 pt-3.5">
        <div className="flex items-center justify-between rounded-2xl border border-border bg-card/70 px-4 py-2.5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-primary-foreground transition hover:opacity-90"
              style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}
              title="织星 AI · 永恒星核配置"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {/* Rising 4-point star */}
                <path d="M12 3.2 L13.4 7.6 L17.8 9 L13.4 10.4 L12 14.8 L10.6 10.4 L6.2 9 L10.6 7.6 Z" fill="currentColor" stroke="none" />
                {/* Left & Right satellite nodes + connecting lines */}
                <line x1="6.8" y1="10.2" x2="9.6" y2="9.4" strokeWidth="1.6" />
                <line x1="17.2" y1="10.2" x2="14.4" y2="9.4" strokeWidth="1.6" />
                <circle cx="5.2" cy="10.6" r="1.6" fill="var(--primary)" strokeWidth="1.7" />
                <circle cx="18.8" cy="10.6" r="1.6" fill="var(--primary)" strokeWidth="1.7" />
                {/* Open book pages below */}
                <path d="M4.5 16.2 C7 14.8 9.8 15.2 12 16.8 C14.2 15.2 17 14.8 19.5 16.2 L19.5 19.6 C17 18.2 14.2 18.6 12 20.2 C9.8 18.6 7 18.2 4.5 19.6 Z" />
                <line x1="12" y1="16.8" x2="12" y2="20.2" />
              </svg>
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[17px] leading-none">织星 AI</h1>
                <span className="rounded-md border border-border bg-secondary/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[var(--primary)]">EduWeave</span>
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">高校个性化学习 · 多智能体织星画布</p>
            </div>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <TtsAura />
            <div className="h-6 w-px bg-border" />
            <div className="text-right flex items-center gap-3">
              <select 
                value={currentScope} 
                onChange={(e) => setCurrentScope(e.target.value)}
                className="bg-transparent text-muted-foreground font-mono text-[11px] outline-none cursor-pointer border-none hover:text-foreground transition-colors"
              >
                <option value="all">🌌 宏观宇宙 (All Courses)</option>
                {courses.map(c => (
                  <option key={c.id} value={c.id}>🪐 {c.title}</option>
                ))}
              </select>
              <div className="flex flex-col items-end">
                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                  <div className="h-1 w-24 overflow-hidden rounded-full bg-secondary/60">
                    <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "linear-gradient(90deg, var(--primary), var(--primary))" }} />
                  </div>
                  <span className="font-mono text-[10px] text-foreground">{progress}%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { userOverride.current = true; setDark((d) => !d); }}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-foreground/80 transition hover:bg-secondary hover:text-foreground"
              title={dark ? "切换亮色" : "切换暗色"}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={() => { setSeedText(""); setCopilotOpen(true); }}
              className="flex items-center gap-2 rounded-xl px-3.5 py-2 text-[12px] font-medium transition hover:opacity-90"
              style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))", color: "var(--primary-foreground)" }}
            >
              <Sparkles className="h-3.5 w-3.5" /> AI 伴学
            </button>
          </div>
        </div>
      </header>

      {/* ===== Body: sidebar + main content ===== */}
      <div className="relative z-10 flex min-h-0 flex-1 gap-0 p-4 pt-3">
        <div className="hidden overflow-hidden rounded-2xl md:block">
          <Sidebar active={view} onChange={(v) => { setView(v); setSelected(null); }} />
        </div>

        <main className="ml-0 min-h-0 flex-1 md:ml-4">
          {view === "canvas" && (
            <CanvasFrame selected={selected} onSelect={setSelected}>
              <AnimatePresence>
                {selected && <ResourceCards key={selected} nodeId={selected} onClose={() => setSelected(null)} />}
              </AnimatePresence>
            </CanvasFrame>
          )}
          {view === "console" && <div className="h-full"><ConsoleView /></div>}
          {view === "adaptive" && <div className="h-full"><AdaptiveView onStudy={(id, tab) => setStudyNode({ id, tab })} /></div>}
          {view === "starmap" && <div className="h-full"><StarMapView /></div>}
          {view === "notes" && (
            <div className="h-full">
              <NotesView
                onAskAI={(prompt) => {
                  setSeedText(prompt);
                  setCopilotOpen(true);
                }}
              />
            </div>
          )}
          {view === "community" && <div className="h-full"><CommunityView /></div>}
        </main>
      </div>

      {/* ===== Mobile bottom nav ===== */}
      <MobileNav active={view} onChange={(v) => { setView(v); setSelected(null); }} />

      <AnimatePresence>
        {studyNode && <div className="fixed inset-0 z-30">
          <button aria-label="返回学习路径" className="absolute inset-0 h-full w-full bg-black/50 backdrop-blur-sm" onClick={() => setStudyNode(null)} />
          <ResourceCards key={`${studyNode.id}-${studyNode.tab}`} nodeId={studyNode.id} initialTab={studyNode.tab} onClose={() => setStudyNode(null)} />
        </div>}
      </AnimatePresence>

      {/* ===== Word-selection floating ball ===== */}
      <AnimatePresence>
        {sel && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed z-[80] flex h-9 w-9 -translate-x-1/2 -translate-y-full items-center justify-center rounded-full border border-white/20 shadow-lg"
            style={{ left: sel.x, top: sel.y, background: "linear-gradient(135deg, var(--primary), var(--destructive))" }}
            onClick={() => { setSeedText(sel.text); setCopilotOpen(true); setSel(null); }}
            title="划词向 AI 提问"
          >
            <MessageCircle className="h-4 w-4 text-white" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ===== Drawers ===== */}
      <CopilotDrawer
        open={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        seedText={seedText}
        selectedNodeId={selected || studyNode?.id || null}
        onOpenNode={(nodeId, tab) => setStudyNode({ id: nodeId, tab })}
        onNavigateView={(v) => { setView(v); setSelected(null); }}
      />
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function MobileNav({ active, onChange }: { active: ViewKey; onChange: (v: ViewKey) => void }) {
  const items: { key: ViewKey; label: string }[] = [
    { key: "canvas", label: "画布" },
    { key: "console", label: "控制台" },
    { key: "adaptive", label: "学习" },
    { key: "starmap", label: "星图" },
    { key: "notes", label: "笔记" },
    { key: "community", label: "社区" },
  ];
  return (
    <div className="relative z-20 flex shrink-0 gap-1 border-t border-border bg-card/80 px-3 py-2 backdrop-blur-xl md:hidden">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onChange(it.key)}
          className="flex-1 rounded-lg py-2 text-[12px] transition"
          style={{ background: active === it.key ? "var(--primary)" : "transparent", color: active === it.key ? "var(--primary-foreground)" : "var(--muted-foreground)" }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

// Ambient TTS aura — animates when speech is active, calm when idle.
function TtsAura() {
  const { speaking, label } = useSpeechState();
  const [bars, setBars] = useState<number[]>(Array(5).fill(0.25));
  useEffect(() => {
    if (!speaking) {
      setBars([0.22, 0.32, 0.25, 0.32, 0.22]);
      return;
    }
    let raf = 0;
    let t = 0;
    const tick = () => {
      t += 0.14;
      setBars(Array.from({ length: 5 }, (_, i) => 0.35 + Math.abs(Math.sin(t + i * 0.7)) * 0.65));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [speaking]);
  return (
    <button
      type="button"
      onClick={() => { if (speaking) stopAllSpeech(); }}
      title={speaking ? "点击停止语音播报" : "语音播报就绪（可在 AI 讲解或 AI 伴学中触发）"}
      className="flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-secondary/60"
    >
      <Volume2 className={`h-3.5 w-3.5 ${speaking ? "text-[var(--primary)]" : "text-muted-foreground"}`} />
      <div className="flex h-6 items-center gap-[3px]">
        {bars.map((b, i) => (
          <span
            key={i}
            className="w-[3px] rounded-full transition-all duration-150"
            style={{
              height: `${b * 22}px`,
              background: speaking ? "var(--primary)" : "var(--muted-foreground)",
              opacity: speaking ? 1 : 0.45,
              boxShadow: speaking ? "0 0 6px var(--primary)" : "none",
            }}
          />
        ))}
      </div>
      <span className={`font-mono text-[10px] ${speaking ? "text-[var(--primary)]" : "text-muted-foreground"}`}>
        {label}
      </span>
    </button>
  );
}
