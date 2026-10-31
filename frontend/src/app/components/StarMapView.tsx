import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Telescope, Send, Globe, ChevronDown, Check, Sparkles, Loader2,
  ExternalLink, Trash2, GraduationCap, Brain, Rocket, ShieldCheck, X,
  Plus, MessageSquare, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { Markdown } from "./Markdown";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./ui/accordion";
import { useTypewriter } from "../hooks/useTypewriter";
import {
  MODE_META, runDefaultMode, runSocraticMode, runProMode, runWebSearch,
  type StarMode, type SocraticStage, type DefaultResult, type SocraticResult,
  type ProResult,
} from "../starmap/engine";
import type { RecommendedResource } from "../data";

// ---- Message model --------------------------------------------------------
type Msg =
  | { id: string; role: "user"; text: string; web?: boolean }
  | { id: string; role: "assistant"; kind: "text"; agent: string; text: string }
  | { id: string; role: "assistant"; kind: "default"; result: DefaultResult }
  | { id: string; role: "assistant"; kind: "socratic"; result: SocraticResult }
  | { id: string; role: "assistant"; kind: "pro"; result: ProResult }
  | { id: string; role: "assistant"; kind: "websearch"; query: string; results: RecommendedResource[] };

const STORAGE_KEY = "eduweave_starmap_sessions";
const MODE_ICON: Record<StarMode, typeof GraduationCap> = {
  default: GraduationCap,
  socratic: Brain,
  pro: Rocket,
};

const uid = () => Math.random().toString(36).slice(2, 9);

// ---- Session model --------------------------------------------------------
interface Session {
  id: string;
  title: string;
  createdAt: number;
  mode: StarMode;
  socraticStage: SocraticStage;
  msgs: Msg[];
}

function welcomeMsg(): Msg {
  return {
    id: "welcome",
    role: "assistant",
    kind: "text",
    agent: "xfyun织星",
    text: "欢迎来到**星图百科** 🌌\n\n左上角可切换三种织星模式，右上角可开启**联网搜索**让我「长眼睛」。直接输入一句话，例如「C语言怎么学习」，我会为你编织结构化的知识星图。",
  };
}

function newSession(): Session {
  return { id: uid(), title: "新的会话", createdAt: Date.now(), mode: "default", socraticStage: "inquire", msgs: [welcomeMsg()] };
}

interface Store { sessions: Session[]; activeId: string }

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Store;
      if (parsed.sessions?.length) return parsed;
    }
  } catch { /* ignore */ }
  const s = newSession();
  return { sessions: [s], activeId: s.id };
}

export function StarMapView() {
  const [store, setStore] = useState<Store>(loadStore);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [web, setWeb] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = store.sessions.find((s) => s.id === store.activeId) ?? store.sessions[0];
  const msgs = active.msgs;
  const mode = active.mode;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch { /* ignore */ }
  }, [store]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, loading, store.activeId]);

  // Patch the active session immutably.
  const patchActive = (fn: (s: Session) => Session) =>
    setStore((st) => ({ ...st, sessions: st.sessions.map((s) => (s.id === st.activeId ? fn(s) : s)) }));

  const push = (m: Msg) => patchActive((s) => ({ ...s, msgs: [...s.msgs, m] }));
  const setMode = (m: StarMode) => patchActive((s) => ({ ...s, mode: m, socraticStage: m === "socratic" ? "inquire" : s.socraticStage }));

  const startNew = () => setStore((st) => { const s = newSession(); return { sessions: [s, ...st.sessions], activeId: s.id }; });
  const selectSession = (id: string) => setStore((st) => ({ ...st, activeId: id }));
  const deleteSession = (id: string) => setStore((st) => {
    const remaining = st.sessions.filter((s) => s.id !== id);
    if (remaining.length === 0) { const s = newSession(); return { sessions: [s], activeId: s.id }; }
    const activeId = id === st.activeId ? remaining[0].id : st.activeId;
    return { sessions: remaining, activeId };
  });

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    const isFirst = active.msgs.filter((m) => m.role === "user").length === 0;
    patchActive((s) => ({
      ...s,
      title: isFirst ? q.slice(0, 18) : s.title,
      msgs: [...s.msgs, { id: uid(), role: "user", text: q, web }],
    }));
    setInput("");
    setLoading(true);
    try {
      if (web) {
        const results = await runWebSearch(q);
        push({ id: uid(), role: "assistant", kind: "websearch", query: q, results });
      }
      if (mode === "default") {
        const result = await runDefaultMode(q);
        push({ id: uid(), role: "assistant", kind: "default", result });
      } else if (mode === "socratic") {
        const history = active.msgs.map(m => ({ role: m.role, text: m.role === 'user' ? (m as any).text : (m.kind === 'socratic' ? (m as any).result.markdown : '') })).filter(m => m.text);
        const result = await runSocraticMode(q, active.socraticStage, history);
        patchActive((s) => ({ ...s, socraticStage: result.nextStage, msgs: [...s.msgs, { id: uid(), role: "assistant", kind: "socratic", result }] }));
      } else {
        const result = await runProMode(q);
        push({ id: uid(), role: "assistant", kind: "pro", result });
      }
    } finally {
      setLoading(false);
    }
  };

  const ModeIcon = MODE_ICON[mode];

  return (
    <div className="flex h-full overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur-xl">
      {/* ===== Sessions panel ===== */}
      <AnimatePresence initial={false}>
        {listOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 248, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="flex shrink-0 flex-col overflow-hidden border-r border-border bg-background/40"
          >
            <div className="flex w-[248px] flex-col" style={{ height: "100%" }}>
              <div className="p-3">
                <button
                  onClick={startNew}
                  className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium text-[var(--primary-foreground)] transition hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}
                >
                  <Plus className="h-4 w-4" /> 开启新会话
                </button>
              </div>
              <div className="px-3 pb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">会话 · {store.sessions.length}</div>
              <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
                {store.sessions.map((s) => {
                  const on = s.id === store.activeId;
                  return (
                    <div
                      key={s.id}
                      onClick={() => selectSession(s.id)}
                      className="group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition hover:bg-secondary"
                      style={{ background: on ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent" }}
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0" style={{ color: on ? "var(--primary)" : "var(--muted-foreground)" }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] text-foreground">{s.title}</div>
                        <div className="font-mono text-[9px] text-muted-foreground">{MODE_META[s.mode].label}</div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                        className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                        title="删除会话"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ===== Chat column ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
      {/* ===== Header: mode switcher + web toggle ===== */}
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
        <button
          onClick={() => setListOpen((o) => !o)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          title={listOpen ? "收起会话列表" : "展开会话列表"}
        >
          {listOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2.5 rounded-xl border border-border bg-secondary/50 px-3 py-2 text-left transition hover:bg-secondary"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}>
              <ModeIcon className="h-3.5 w-3.5 text-white" />
            </span>
            <span>
              <span className="block text-[13px] leading-none text-foreground">{MODE_META[mode].label}</span>
              <span className="mt-0.5 block font-mono text-[9px] text-muted-foreground">{MODE_META[mode].sub}</span>
            </span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition ${menuOpen ? "rotate-180" : ""}`} />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="absolute left-0 top-full z-40 mt-1.5 w-[300px] rounded-xl border border-border bg-popover p-1.5 shadow-2xl backdrop-blur-2xl"
                >
                  {(Object.keys(MODE_META) as StarMode[]).map((k) => {
                    const Icon = MODE_ICON[k];
                    const on = k === mode;
                    return (
                      <button
                        key={k}
                        onClick={() => { setMode(k); setMenuOpen(false); }}
                        className="flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left transition hover:bg-secondary"
                        style={{ background: on ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent" }}
                      >
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border" style={{ borderColor: on ? "var(--primary)" : "var(--border)" }}>
                          <Icon className="h-3.5 w-3.5" style={{ color: on ? "var(--primary)" : "var(--muted-foreground)" }} />
                        </span>
                        <span className="flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="text-[13px] text-foreground">{MODE_META[k].label}</span>
                            {on && <Check className="h-3.5 w-3.5 text-[var(--primary)]" />}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{MODE_META[k].desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setWeb((w) => !w)}
            className="flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[12px] transition"
            style={{
              borderColor: web ? "var(--primary)" : "var(--border)",
              background: web ? "color-mix(in srgb, var(--primary) 14%, transparent)" : "transparent",
              color: web ? "var(--primary)" : "var(--muted-foreground)",
            }}
            title="开启后由 Dify 智能体联网检索"
          >
            <Globe className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">联网搜索</span>
            <span className="font-mono text-[9px]">{web ? "ON" : "OFF"}</span>
          </button>
          <button
            onClick={() => deleteSession(active.id)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive"
            title="删除当前会话"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* ===== Message stream ===== */}
      <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-5 md:px-8">
        <div className="mx-auto max-w-[760px] space-y-5">
          {msgs.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-md px-4 py-2.5 text-[13px] leading-relaxed" style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}>
                  {m.web && (
                    <span className="mb-1 flex items-center gap-1 font-mono text-[9px] opacity-80"><Globe className="h-2.5 w-2.5" /> 联网提问</span>
                  )}
                  {m.text}
                </div>
              </div>
            ) : (
              <AssistantMessage key={m.id} msg={m} onFollow={ask} />
            )
          )}
          {loading && (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" />
              {web ? "智能体联网检索 & 编织中…" : "织星编织中…"}
            </div>
          )}
        </div>
      </div>

      {/* ===== Composer ===== */}
      <div className="border-t border-border p-3 md:px-8">
        <div className="mx-auto flex max-w-[760px] items-end gap-2 rounded-2xl border border-border bg-input-background p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); }
            }}
            rows={1}
            placeholder={
              mode === "pro" ? "描述你想生成的学习网站，例如：帮我做一个量子力学的基础网站"
              : mode === "socratic" ? "提出你的疑问，我会用反问引导你思考…"
              : "输入一句话，例如：C语言怎么学习"
            }
            className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={() => ask(input)}
            disabled={loading || !input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--primary)" }}
          >
            <Send className="h-4 w-4" style={{ color: "var(--primary-foreground)" }} />
          </button>
        </div>
        <p className="mx-auto mt-1.5 max-w-[760px] px-1 font-mono text-[9px] text-muted-foreground">
          {MODE_META[mode].sub} · 当前为前端模拟，真实回答将由讯飞星火{web ? " + Dify 联网" : ""}经后端代理生成
        </p>
      </div>
      </div>
    </div>
  );
}

// ===========================================================================
function AssistantMessage({ msg, onFollow }: { msg: Extract<Msg, { role: "assistant" }>; onFollow: (t: string) => void }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
      <div className="w-full max-w-[92%] rounded-2xl rounded-bl-md border border-border bg-secondary/40 p-4">
        {msg.kind === "text" && <TextBody agent={msg.agent} text={msg.text} />}
        {msg.kind === "default" && <DefaultModules result={msg.result} onFollow={onFollow} />}
        {msg.kind === "socratic" && (
          <>
            <AgentTag name={msg.result.agent} />
            <Markdown>{msg.result.markdown}</Markdown>
          </>
        )}
        {msg.kind === "pro" && <ProPipeline result={msg.result} />}
        {msg.kind === "websearch" && <WebSearchResults query={msg.query} results={msg.results} />}
      </div>
    </motion.div>
  );
}

function AgentTag({ name }: { name: string }) {
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <Sparkles className="h-3 w-3 text-[var(--primary)]" />
      <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--primary)]">{name}</span>
    </div>
  );
}

// Streamed plain-markdown body (typewriter on mount).
function TextBody({ agent, text }: { agent: string; text: string }) {
  const typed = useTypewriter(text, true, 12, 3);
  return (
    <>
      <AgentTag name={agent} />
      <Markdown>{typed}</Markdown>
    </>
  );
}

function DefaultModules({ result, onFollow }: { result: DefaultResult; onFollow: (t: string) => void }) {
  return (
    <div>
      <AgentTag name="xfyun织星 · learnanything" />
      <div className="mb-3 rounded-xl border border-border bg-background/50 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
        <span className="text-[var(--primary)]">意图解析</span> · Subject: {result.intent.subject} ｜ Audience: {result.intent.audience} ｜ Duration: {result.intent.duration} ｜ Goal: {result.intent.goal}
      </div>
      <Accordion type="multiple" defaultValue={[result.modules[0]?.id]} className="space-y-1.5">
        {result.modules.map((mod) => (
          <AccordionItem key={mod.id} value={mod.id} className="overflow-hidden rounded-xl border border-border bg-background/40 px-3">
            <AccordionTrigger className="text-[13px] hover:no-underline">{mod.title}</AccordionTrigger>
            <AccordionContent>
              <Markdown>{mod.markdown}</Markdown>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {mod.followUps.map((f) => (
                  <button
                    key={f.label}
                    onClick={() => onFollow(f.prompt)}
                    className="rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[11px] text-foreground/80 transition hover:border-[var(--primary)] hover:text-foreground"
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

function ProPipeline({ result }: { result: ProResult }) {
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState(false);
  const done = step >= result.steps.length;

  useEffect(() => {
    if (done) return;
    const id = setTimeout(() => setStep((s) => s + 1), 700);
    return () => clearTimeout(id);
  }, [step, done]);

  return (
    <div>
      <AgentTag name="xfyun织星 Pro · 建站流水线" />
      <div className="space-y-1.5">
        {result.steps.map((s, i) => {
          const state = i < step ? "done" : i === step ? "active" : "wait";
          return (
            <div key={s.key} className="flex items-center gap-2.5 rounded-lg border border-border bg-background/40 px-3 py-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px]" style={{
                background: state === "done" ? "var(--primary)" : state === "active" ? "color-mix(in srgb, var(--primary) 20%, transparent)" : "var(--secondary)",
                color: state === "done" ? "var(--primary-foreground)" : "var(--muted-foreground)",
              }}>
                {state === "done" ? <Check className="h-3 w-3" /> : state === "active" ? <Loader2 className="h-3 w-3 animate-spin" /> : i + 1}
              </span>
              <span className="text-[13px] text-foreground">{s.label}</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">{s.detail}</span>
            </div>
          );
        })}
      </div>
      {done && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 rounded-xl border border-[var(--primary)] bg-background/50 p-3">
          <p className="mb-2 text-[13px] text-foreground">✅ 织星页面已生成</p>
          <button
            onClick={() => setPreview(true)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] text-[var(--primary-foreground)] transition hover:opacity-90"
            style={{ background: "var(--primary)" }}
          >
            <ExternalLink className="h-3.5 w-3.5" /> 打开 {result.siteTitle}
          </button>
        </motion.div>
      )}
      <AnimatePresence>
        {preview && <SitePreview title={result.siteTitle} html={result.html} onClose={() => setPreview(false)} />}
      </AnimatePresence>
    </div>
  );
}

// 内嵌浏览器预览 — 用 iframe srcDoc 渲染生成的 HTML（sandbox 防护）。
function SitePreview({ title, html, onClose }: { title: string; html: string; onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-[90] flex flex-col bg-black/70 backdrop-blur-sm"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="m-auto flex h-[88%] w-[min(960px,94vw)] flex-col overflow-hidden rounded-2xl border border-border bg-[#0a0c1a] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-[rgba(140,150,220,0.18)] px-3 py-2">
          <div className="flex flex-1 items-center gap-2 truncate rounded-lg bg-white/5 px-2.5 py-1.5">
            <Globe className="h-3.5 w-3.5 shrink-0 text-[#5ad1e8]" />
            <span className="truncate font-mono text-[11px] text-[#9aa0c8]">weave://{title}</span>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-[#9aa0c8] transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="relative flex-1">
          <iframe title={title} srcDoc={html} className="h-full w-full bg-white" sandbox="allow-scripts" />
          <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 font-mono text-[9px] text-[#7ce0b0]">
            <ShieldCheck className="h-3 w-3" /> sandboxed
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function WebSearchResults({ query, results }: { query: string; results: RecommendedResource[] }) {
  return (
    <div>
      <AgentTag name="Dify 联网检索 · Search Agent" />
      <p className="mb-2 flex items-center gap-1.5 text-[12px] text-foreground/80">
        <Globe className="h-3.5 w-3.5 text-[var(--primary)]" /> 为「{query}」检索到的优质资源
      </p>
      <div className="space-y-1.5">
        {results.map((r) => (
          <a
            key={r.id}
            href={r.url}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl border border-border bg-background/40 p-2.5 transition hover:border-[var(--primary)]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-foreground">{r.title}</span>
              <span className="shrink-0 font-mono text-[9px] text-muted-foreground">{r.source}</span>
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{r.reason}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
