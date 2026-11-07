import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Send, X, Volume2, VolumeX, BookOpen, FileQuestion, Compass, BookmarkPlus, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { copilotSeed, notes as seedNotes, type Note } from "../data";
import { useStudyStore } from "../store";
import { conversationHistory } from "../conversation";
import { API_BASE } from "../config";
import { speakWithBrowserTTS, stopAllSpeech, useSpeechState } from "../speech";
import type { ViewKey } from "./Sidebar";

interface PlanNodeItem {
  id?: string | null;
  title: string;
}

interface Msg {
  role: "user" | "agent";
  agent?: string;
  text: string;
  status?: "pending" | "complete" | "error";
  planNodes?: PlanNodeItem[];
}

const STORAGE_KEY = "eduweave_copilot_messages";
const NOTES_STORAGE_KEY = "eduweave_notes";

function loadMessages(): Msg[] {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    if (Array.isArray(stored) && stored.length && stored.every((m) => (m.role === "user" || m.role === "agent") && typeof m.text === "string")) {
      return stored.map((m: Msg) => m.status === "pending" ? { ...m, status: "error", text: "上一条回复未完成，请重新发送问题。" } : m);
    }
  } catch { /* use the greeting if storage is unavailable */ }
  return copilotSeed;
}

function appendNoteFromCopilot(title: string, content: string, chapter: string) {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY);
    const existing: Note[] = raw ? JSON.parse(raw) : seedNotes;
    const newNote: Note = {
      id: `no${Date.now()}`,
      title: title.slice(0, 36),
      excerpt: content.trim(),
      date: new Date().toISOString().slice(0, 10),
      chapter: chapter || "AI 伴学笔记",
      tags: ["AI伴学", "智能整理"],
    };
    const next = [newNote, ...existing];
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("eduweave-notes-updated"));
  } catch { /* ignore storage errors */ }
}

export function CopilotDrawer({
  open,
  onClose,
  seedText,
  selectedNodeId,
  onOpenNode,
  onNavigateView,
}: {
  open: boolean;
  onClose: () => void;
  seedText?: string;
  selectedNodeId?: string | null;
  onOpenNode?: (nodeId: string, tab: "doc" | "quiz") => void;
  onNavigateView?: (view: ViewKey) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>(loadMessages);
  const [input, setInput] = useState(seedText ?? "");
  const [isSending, setIsSending] = useState(false);
  const [savedMsgIdx, setSavedMsgIdx] = useState<number | null>(null);
  const [speakingIdx, setSpeakingIdx] = useState<number | null>(null);
  const sendLock = useRef(false);

  const constellation = useStudyStore((state) => state.constellation);
  const currentScope = useStudyStore((state) => state.currentScope);
  const updateNodeStatus = useStudyStore((state) => state.updateNodeStatus);
  const speechState = useSpeechState();

  const activeNode = selectedNodeId
    ? constellation.find((n) => n.id === selectedNodeId)
    : undefined;

  useEffect(() => {
    if (!speechState.speaking) {
      setSpeakingIdx(null);
    }
  }, [speechState.speaking]);

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(msgs)); } catch { /* storage unavailable */ }
  }, [msgs]);

  // When opened via a 划词 selection or NotesView action, pre-fill the composer with that text.
  useEffect(() => {
    if (open && seedText) setInput(seedText);
  }, [open, seedText]);

  const resolveNodeId = (item: PlanNodeItem): string | null => {
    if (item.id && constellation.some((n) => n.id === item.id)) {
      return item.id;
    }
    const exact = constellation.find((n) => n.type === "node" && n.title === item.title);
    if (exact) return exact.id;
    const fuzzy = constellation.find(
      (n) => n.type === "node" && (n.title.includes(item.title) || item.title.includes(n.title))
    );
    return fuzzy ? fuzzy.id : item.id || null;
  };

  const toggleSpeakMsg = (idx: number, text: string) => {
    if (speakingIdx === idx && speechState.speaking) {
      stopAllSpeech();
      setSpeakingIdx(null);
      return;
    }
    setSpeakingIdx(idx);
    speakWithBrowserTTS(text, {
      label: "AI 伴学朗读中",
      onEnd: () => setSpeakingIdx(null),
      onError: () => setSpeakingIdx(null),
    });
  };

  const handleSaveToNotes = (idx: number, text: string) => {
    const prevUserMsg = idx > 0 && msgs[idx - 1]?.role === "user" ? msgs[idx - 1].text : "";
    const title = activeNode?.title
      ? `${activeNode.title} · AI 伴学解析`
      : prevUserMsg
        ? `AI 解析：${prevUserMsg.slice(0, 22)}`
        : "织星 AI 伴学笔记";
    const chapter = activeNode?.chapter || "核心概念";
    appendNoteFromCopilot(title, text, chapter);
    setSavedMsgIdx(idx);
    setTimeout(() => setSavedMsgIdx((cur) => (cur === idx ? null : cur)), 2500);
  };

  const send = async (overrideQuery?: string) => {
    const queryText = (overrideQuery ?? input).trim();
    if (!queryText || sendLock.current) return;
    sendLock.current = true;
    setIsSending(true);
    const history = conversationHistory(msgs.slice(copilotSeed.length));
    setMsgs((m) => [...m, { role: "user", text: queryText, status: "complete" }]);
    if (!overrideQuery) setInput("");

    // Add initial agent pending message
    setMsgs((m) => [
      ...m,
      {
        role: "agent",
        agent: "织星 AI",
        text: "正在协同 Profiler 与 Director 智能体分析学情...",
        status: "pending",
      },
    ]);

    let chatText = "";
    let assistantText = "";
    let latestPlanNodes: PlanNodeItem[] | undefined = undefined;
    try {
      const apiBaseUrl = API_BASE;
      const response = await fetch(`${apiBaseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_input: queryText,
          history,
          course_id: useStudyStore.getState().currentScope,
          node_id: selectedNodeId || undefined,
        }),
      });
      if (!response.ok) throw new Error(`请求失败 (${response.status})`);
      if (!response.body) {
        throw new Error("No response body received from stream.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          const colonIdx = trimmed.indexOf(":");
          if (colonIdx === -1) continue;

          const type = trimmed.substring(0, colonIdx);
          const dataStr = trimmed.substring(colonIdx + 1);

          if (type === "0") {
            let parsedText = dataStr;
            try {
              parsedText = JSON.parse(dataStr);
            } catch {
              if (parsedText.startsWith('"') && parsedText.endsWith('"')) {
                parsedText = parsedText.substring(1, parsedText.length - 1);
              }
            }

            if (!assistantText && !chatText) {
              setMsgs((m) => {
                const updated = [...m];
                updated[updated.length - 1] = {
                  role: "agent",
                  agent: "织星 AI",
                  text: `_✨ ${parsedText}_`,
                  status: "pending",
                };
                return updated;
              });
            }
          } else if (type === "1") {
            let chunk = dataStr;
            try {
              chunk = JSON.parse(chunk);
            } catch (e) {
              console.error("Failed to parse chat chunk:", e);
            }
            chatText = chunk;
            setMsgs((m) => {
              const updated = [...m];
              updated[updated.length - 1] = {
                role: "agent",
                agent: "织星 AI",
                text: chatText + (assistantText ? `\n\n${assistantText}` : ""),
                status: "pending",
                planNodes: latestPlanNodes,
              };
              return updated;
            });
          } else if (type === "9") {
            try {
              const plan = JSON.parse(dataStr);
              const nodesList = plan.nodes.map((n: string, i: number) => `- **第 ${i + 1} 步：** ${n}`).join("\n");

              assistantText = `### 🎯 专属学习路径\n\n${nodesList}\n\n> 💡 **学习指导：**\n> ${plan.description}`;
              latestPlanNodes = Array.isArray(plan.node_items)
                ? plan.node_items
                : (plan.nodes || []).map((title: string) => ({ title }));

              // Highlight the recommended nodes on StarMap & AdaptiveView
              updateNodeStatus(plan.nodes, "weakness");

              setMsgs((m) => {
                const updated = [...m];
                updated[updated.length - 1] = {
                  role: "agent",
                  agent: "织星 AI",
                  text: chatText + (assistantText ? `\n\n${assistantText}` : ""),
                  status: "pending",
                  planNodes: latestPlanNodes,
                };
                return updated;
              });
            } catch (e) {
              console.error("Failed to parse plan payload:", e);
            }
          }
        }
      }
      setMsgs((messages) => {
        const updated = [...messages];
        updated[updated.length - 1] = { ...updated[updated.length - 1], status: "complete", planNodes: latestPlanNodes };
        return updated;
      });
    } catch (err) {
      console.error("SSE stream error:", err);
      assistantText += `\n\n❌ [连接已断开: ${err instanceof Error ? err.message : err}]`;
      setMsgs((m) => {
        const updated = [...m];
        updated[updated.length - 1] = {
          role: "agent",
          agent: "织星 AI",
          text: chatText + (assistantText ? `\n\n${assistantText}` : ""),
          status: "error",
        };
        return updated;
      });
    } finally {
      sendLock.current = false;
      setIsSending(false);
    }
  };

  const quickPrompts = [
    {
      label: "🧭 规划学习路径",
      prompt: activeNode
        ? `我对「${activeNode.title}」掌握不牢，请调用路径规划工具为我推荐接下来的学习路径。`
        : "我刚接触这门课程，感到有些迷茫，请调用路径规划工具为我推荐1到3个入门学习节点。",
    },
    {
      label: "📚 检索教材考点",
      prompt: activeNode
        ? `请检索教材资料，帮我总结「${activeNode.title}」的核心定义与高频考点。`
        : "请检索当前课程的 Dify 教材知识库，总结本课程最核心的概念与考点。",
    },
    {
      label: "🧪 生成随堂自测",
      prompt: activeNode
        ? `请围绕「${activeNode.title}」出2道典型练习题并附带解析，帮我检验掌握程度。`
        : "请根据当前课程的核心知识点，出2道典型辨析题并给出详细解析。",
    },
  ];

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
            className="absolute right-0 top-0 z-50 flex h-full w-[min(440px,92vw)] flex-col border-l border-border bg-popover/95 backdrop-blur-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: "linear-gradient(135deg, var(--primary), var(--accent))" }}>
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium">全局 AI 伴学</span>
                    <span className="rounded-md bg-[var(--primary)]/15 px-1.5 py-0.5 font-mono text-[9px] text-[var(--primary)]">
                      Multi-Agent
                    </span>
                  </div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground">
                    {activeNode
                      ? `🪐 当前节点：${activeNode.title}`
                      : currentScope !== "all"
                        ? "📚 已绑定当前课程 Dify 知识库"
                        : "🌌 宏观宇宙 · 自动联动主课程知识库"}
                  </div>
                </div>
              </div>
              <button
                disabled={isSending}
                onClick={() => { stopAllSpeech(); setMsgs(copilotSeed); setInput(""); }}
                className="ml-auto shrink-0 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-secondary disabled:opacity-40"
              >
                清空对话
              </button>
              <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {msgs.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className="max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed"
                    style={
                      m.role === "user"
                        ? { background: "var(--primary)", color: "var(--primary-foreground)" }
                        : { background: "var(--secondary)", color: "var(--foreground)", border: "1px solid var(--border)" }
                    }
                  >
                    {m.role === "agent" && (
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--primary)]">{m.agent}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => toggleSpeakMsg(i, m.text)}
                            title={speakingIdx === i && speechState.speaking ? "停止朗读" : "语音朗读此回复"}
                            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:bg-background/60 hover:text-[var(--primary)]"
                          >
                            {speakingIdx === i && speechState.speaking ? (
                              <>
                                <VolumeX className="h-3 w-3 text-[var(--primary)]" />
                                <span className="text-[var(--primary)]">停止</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="h-3 w-3" />
                                <span>朗读</span>
                              </>
                            )}
                          </button>
                          {m.status === "complete" && i > 0 && (
                            <button
                              type="button"
                              onClick={() => handleSaveToNotes(i, m.text)}
                              title="将此 AI 解析存入学习笔记"
                              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:bg-background/60 hover:text-[var(--primary)]"
                            >
                              {savedMsgIdx === i ? (
                                <>
                                  <Check className="h-3 w-3 text-[#7ce0b0]" />
                                  <span className="text-[#7ce0b0]">已存笔记</span>
                                </>
                              ) : (
                                <>
                                  <BookmarkPlus className="h-3 w-3" />
                                  <span>存笔记</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="prose-sm prose-invert text-current max-w-none [&>p]:mb-2 last:[&>p]:mb-0 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4 [&_strong]:font-semibold">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{m.text}</ReactMarkdown>
                    </div>

                    {/* Interactive Cross-Module Agent Action Chips when study_plan is generated */}
                    {m.role === "agent" && m.planNodes && m.planNodes.length > 0 && (
                      <div className="mt-3 space-y-2 border-t border-border/70 pt-2.5">
                        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          ⚡ 智能体联动操作 · 点击直达对应星球模块
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {m.planNodes.map((item, idx) => {
                            const targetId = resolveNodeId(item);
                            if (!targetId) return null;
                            return (
                              <div key={`${item.title}-${idx}`} className="flex flex-wrap gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onOpenNode?.(targetId, "doc");
                                    onClose();
                                  }}
                                  className="flex items-center gap-1 rounded-lg border border-[var(--primary)]/40 bg-[var(--primary)]/15 px-2.5 py-1 text-[11px] font-medium text-[var(--primary)] transition hover:bg-[var(--primary)] hover:text-white"
                                >
                                  <BookOpen className="h-3 w-3" />
                                  学习「{item.title}」讲义
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onOpenNode?.(targetId, "quiz");
                                    onClose();
                                  }}
                                  className="flex items-center gap-1 rounded-lg border border-border bg-background/60 px-2 py-1 text-[11px] text-foreground/90 transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
                                >
                                  <FileQuestion className="h-3 w-3" />
                                  测验
                                </button>
                              </div>
                            );
                          })}
                        </div>
                        {onNavigateView && (
                          <button
                            type="button"
                            onClick={() => {
                              onNavigateView("adaptive");
                              onClose();
                            }}
                            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-background/50 py-1.5 text-[11px] text-muted-foreground transition hover:border-[var(--primary)] hover:text-foreground"
                          >
                            <Compass className="h-3.5 w-3.5 text-[var(--primary)]" />
                            在「自适应学习路径」视图中查看高亮诊断序列
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border p-3 space-y-2">
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                {quickPrompts.map((qp) => (
                  <button
                    key={qp.label}
                    type="button"
                    disabled={isSending}
                    onClick={() => send(qp.prompt)}
                    className="shrink-0 rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-[var(--primary)] hover:text-foreground disabled:opacity-40"
                  >
                    {qp.label}
                  </button>
                ))}
              </div>
              <div className="flex items-end gap-2 rounded-2xl border border-border bg-input-background p-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  maxLength={8000}
                  placeholder="选中知识点划词提问，或在此输入…"
                  className="max-h-28 flex-1 resize-none bg-transparent px-2 py-1 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                />
                <button
                  onClick={() => send()}
                  disabled={isSending || !input.trim()}
                  aria-label={isSending ? "正在回复" : "发送消息"}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition hover:opacity-90 disabled:opacity-40"
                  style={{ background: "var(--primary)" }}
                >
                  <Send className="h-4 w-4" style={{ color: "var(--primary-foreground)" }} />
                </button>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
