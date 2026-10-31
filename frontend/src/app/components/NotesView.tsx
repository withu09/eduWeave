import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { NotebookPen, Calendar, Network, Tag, Sparkles, FileQuestion, Plus, Pencil, Trash2, X, Eye, Check } from "lucide-react";
import { notes as seedNotes, type Note } from "../data";
import { Markdown } from "./Markdown";

type Tab = "timeline" | "graph" | "tags";

const STORAGE_KEY = "eduweave_notes";

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return seedNotes;
}

function saveNotes(notes: Note[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); } catch { /* ignore */ }
}

const CHAPTERS = ["线性结构", "链式结构", "树形结构", "散列", "图论", "算法策略"];

// ─── 笔记编辑 Modal ───────────────────────────────────────────────────────────
function NoteModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: Note;
  onSave: (note: Note) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [chapter, setChapter] = useState(initial?.chapter ?? CHAPTERS[0]);
  const [tagInput, setTagInput] = useState((initial?.tags ?? []).join(" "));
  const [body, setBody] = useState(initial?.excerpt ?? "");
  const [preview, setPreview] = useState(false);

  const submit = () => {
    if (!title.trim()) return;
    const tags = tagInput.trim()
      ? tagInput.trim().split(/\s+/).map((t) => t.replace(/^#/, ""))
      : [];
    const note: Note = {
      id: initial?.id ?? `no${Date.now()}`,
      title: title.trim(),
      excerpt: body.trim(),
      date: new Date().toISOString().slice(0, 10),
      chapter,
      tags,
    };
    onSave(note);
  };

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative z-10 flex w-full max-w-2xl flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-2xl"
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[16px]">{initial ? "编辑笔记" : "新建笔记"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="笔记标题…"
          className="rounded-xl border border-border bg-input-background px-3 py-2 text-[14px] text-foreground outline-none transition focus:border-[var(--primary)] placeholder:text-muted-foreground"
        />

        <div className="flex gap-3">
          <select
            value={chapter}
            onChange={(e) => setChapter(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-input-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-[var(--primary)]"
          >
            {CHAPTERS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="标签（空格分隔，如 AI整理 易错点）"
            className="flex-[2] rounded-xl border border-border bg-input-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-[var(--primary)] placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">正文 · 支持 Markdown 与 LaTeX 公式</span>
          <button
            onClick={() => setPreview((p) => !p)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            {preview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {preview ? "编辑" : "预览"}
          </button>
        </div>

        {preview ? (
          <div className="min-h-[140px] rounded-xl border border-border bg-input-background p-3">
            {body.trim() ? <Markdown>{body}</Markdown> : <span className="text-[12px] text-muted-foreground">暂无内容</span>}
          </div>
        ) : (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder={"在此输入笔记正文，支持 **加粗**、`代码`、LaTeX 公式 $\\theta$ 等…"}
            className="resize-none rounded-xl border border-border bg-input-background p-3 text-[13px] text-foreground outline-none transition focus:border-[var(--primary)] placeholder:text-muted-foreground"
          />
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 text-[12px] text-muted-foreground transition hover:text-foreground"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={!title.trim()}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-medium transition hover:opacity-90 disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))", color: "var(--primary-foreground)" }}
          >
            <Check className="h-3.5 w-3.5" /> {initial ? "保存修改" : "创建笔记"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── 主视图 ───────────────────────────────────────────────────────────────────
export function NotesView() {
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [tab, setTab] = useState<Tab>("timeline");
  const [modal, setModal] = useState<{ mode: "new" | "edit"; note?: Note } | null>(null);

  const persist = (next: Note[]) => { setNotes(next); saveNotes(next); };

  const handleSave = (note: Note) => {
    persist(
      modal?.mode === "edit"
        ? notes.map((n) => (n.id === note.id ? note : n))
        : [note, ...notes]
    );
    setModal(null);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("确认删除这条笔记？")) return;
    persist(notes.filter((n) => n.id !== id));
  };

  const allTags = Array.from(new Set(notes.flatMap((n) => n.tags)));

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "linear-gradient(135deg, #f2c879, var(--destructive))" }}>
            <NotebookPen className="h-5 w-5 text-white" />
          </span>
          <div>
            <h2 className="text-[18px] leading-tight">学习笔记管理</h2>
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">AI-Powered Note Manager · {notes.length} 条笔记</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModal({ mode: "new" })}
            className="flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-2 text-[12px] text-foreground transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            <Plus className="h-3.5 w-3.5" /> 新建笔记
          </button>
          <button
            className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-medium transition hover:opacity-90"
            style={{ background: "linear-gradient(135deg, var(--primary), var(--destructive))", color: "var(--primary-foreground)" }}
          >
            <Sparkles className="h-3.5 w-3.5" /> AI 整理 / 导图化
          </button>
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-1.5 rounded-xl border border-border bg-card/60 p-1 backdrop-blur-xl">
        <TabBtn on={tab === "timeline"} onClick={() => setTab("timeline")} icon={Calendar} label="时间线" />
        <TabBtn on={tab === "graph"} onClick={() => setTab("graph")} icon={Network} label="知识图谱" />
        <TabBtn on={tab === "tags"} onClick={() => setTab("tags")} icon={Tag} label="标签 · AI分类" />
      </div>

      {tab === "tags" && (
        <div className="flex flex-wrap gap-2">
          {allTags.map((t) => (
            <span key={t} className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-[11px] text-foreground/80">#{t}</span>
          ))}
          {allTags.length === 0 && <span className="text-[12px] text-muted-foreground">暂无标签，创建笔记时添加</span>}
        </div>
      )}

      {tab === "graph" ? (
        <GraphView notes={notes} />
      ) : (
        <>
          {notes.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-16 text-muted-foreground">
              <NotebookPen className="h-8 w-8 opacity-40" />
              <p className="text-[13px]">还没有笔记，点击「新建笔记」开始记录</p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <AnimatePresence>
              {notes.map((n, i) => (
                <motion.div
                  key={n.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ delay: i * 0.04 }}
                  className="group rounded-2xl border border-border bg-card p-4 backdrop-blur-xl transition hover:border-[var(--primary)]"
                >
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <span className="text-[14px] leading-snug">{n.title}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{n.date}</span>
                  </div>
                  <p className="line-clamp-3 text-[12px] leading-relaxed text-muted-foreground">{n.excerpt}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {n.tags.map((t) => (
                      <span key={t} className="rounded-md bg-secondary/50 px-1.5 py-0.5 font-mono text-[9px] text-[var(--primary)]">#{t}</span>
                    ))}
                    <div className="ml-auto flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={() => setModal({ mode: "edit", note: n })}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" /> 编辑
                      </button>
                      <button
                        onClick={() => handleDelete(n.id)}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-[var(--destructive)]"
                      >
                        <Trash2 className="h-3 w-3" /> 删除
                      </button>
                      <button className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-secondary hover:text-[var(--primary)]">
                        <FileQuestion className="h-3 w-3" /> 变考题
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      <AnimatePresence>
        {modal && (
          <NoteModal
            initial={modal.note}
            onSave={handleSave}
            onClose={() => setModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function TabBtn({ on, onClick, icon: Icon, label }: { on: boolean; onClick: () => void; icon: typeof Calendar; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] transition"
      style={{ background: on ? "var(--primary)" : "transparent", color: on ? "var(--primary-foreground)" : "var(--muted-foreground)" }}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function GraphView({ notes }: { notes: Note[] }) {
  const chapterSet = Array.from(new Set(notes.map((n) => n.chapter)));
  const rootNode = { x: 50, y: 12, label: "数据结构", root: true };

  const chapterNodes = chapterSet.map((ch, i) => ({
    x: 10 + (i / Math.max(chapterSet.length - 1, 1)) * 80,
    y: 40,
    label: ch,
    root: false,
  }));

  const noteNodes = notes.slice(0, 8).map((n, i) => ({
    x: 8 + (i / Math.max(notes.slice(0, 8).length - 1, 1)) * 84,
    y: 72,
    label: n.title.length > 8 ? n.title.slice(0, 8) + "…" : n.title,
    root: false,
  }));

  const allNodes = [rootNode, ...chapterNodes, ...noteNodes];

  const edges: [number, number][] = [
    ...chapterNodes.map((_, i) => [0, i + 1] as [number, number]),
    ...notes.slice(0, 8).map((n, i) => {
      const chIdx = chapterNodes.findIndex((c) => c.label === n.chapter);
      return [chIdx >= 0 ? chIdx + 1 : 0, chapterNodes.length + 1 + i] as [number, number];
    }),
  ];

  return (
    <div className="relative h-[380px] w-full rounded-2xl border border-border bg-input-background backdrop-blur-xl">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={allNodes[a]?.x ?? 50} y1={allNodes[a]?.y ?? 50}
            x2={allNodes[b]?.x ?? 50} y2={allNodes[b]?.y ?? 50}
            stroke="var(--border)" strokeWidth={0.3} vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {allNodes.map((n, i) => (
        <div
          key={i}
          className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] backdrop-blur-md"
          style={{
            left: `${n.x}%`, top: `${n.y}%`,
            borderColor: n.root ? "var(--primary)" : "var(--border)",
            background: n.root ? "color-mix(in srgb, var(--primary) 18%, transparent)" : "var(--card)",
            boxShadow: n.root ? "0 0 14px var(--primary)" : "none",
            color: n.root ? "var(--primary)" : "var(--foreground)",
          }}
        >
          {n.label}
        </div>
      ))}
      {notes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-[12px] text-muted-foreground">
          创建笔记后自动生成知识图谱
        </div>
      )}
    </div>
  );
}
