import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Send, X, Volume2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { copilotSeed } from "../data";
import { useStudyStore } from "../store";

interface Msg {
  role: "user" | "agent";
  agent?: string;
  text: string;
}

export function CopilotDrawer({
  open,
  onClose,
  seedText,
}: {
  open: boolean;
  onClose: () => void;
  seedText?: string;
}) {
  const [msgs, setMsgs] = useState<Msg[]>(copilotSeed);
  const [input, setInput] = useState(seedText ?? "");
  const updateNodeStatus = useStudyStore((state) => state.updateNodeStatus);

  // When opened via a 划词 selection, pre-fill the composer with that text.
  useEffect(() => {
    if (open && seedText) setInput(seedText);
  }, [open, seedText]);

  const send = async () => {
    if (!input.trim()) return;
    const q = input.trim();
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput("");

    // Add initial agent pending message
    const tempId = msgs.length + 1;
    setMsgs((m) => [
      ...m,
      {
        role: "agent",
        agent: "织星 AI",
        text: "正在初始化路径规划器...",
      },
    ]);

    let chatText = "";
    let assistantText = "";
    try {
      const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiBaseUrl}/api/chat?user_input=${encodeURIComponent(q)}`);
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
          let dataStr = trimmed.substring(colonIdx + 1);

          if (type === "0") {
            // Text logs
            let parsedText = dataStr;
            try {
              parsedText = JSON.parse(dataStr);
            } catch (e) {
              if (parsedText.startsWith('"') && parsedText.endsWith('"')) {
                parsedText = parsedText.substring(1, parsedText.length - 1);
              }
            }
            
            // Only use logs for the loading animation if the final plan hasn't arrived
            // Only use logs for the loading animation if the final plan and chat haven't arrived
            if (!assistantText && !chatText) {
              setMsgs((m) => {
                const updated = [...m];
                updated[updated.length - 1] = {
                  role: "agent",
                  agent: "织星 AI",
                  text: `_✨ ${parsedText}_`,
                };
                return updated;
              });
            }
          } else if (type === "1") {
            // Standard chat stream yields accumulated string
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
              };
              return updated;
            });
          } else if (type === "9") {
            // Plan schema
            try {
              const plan = JSON.parse(dataStr);
              const nodesList = plan.nodes.map((n: string, i: number) => `- **第 ${i+1} 步：** ${n}`).join("\n");
              
              // Replace the temporary loading text entirely
              assistantText = `### 🎯 专属学习路径\n\n${nodesList}\n\n> 💡 **学习指导：**\n> ${plan.description}`;
              
              // Highlight the recommended nodes
              updateNodeStatus(plan.nodes, "weakness");

              setMsgs((m) => {
                const updated = [...m];
                updated[updated.length - 1] = {
                  role: "agent",
                  agent: "织星 AI",
                  text: chatText + (assistantText ? `\n\n${assistantText}` : ""),
                };
                return updated;
              });
            } catch (e) {
              console.error("Failed to parse plan payload:", e);
            }
          }
        }
      }
    } catch (err) {
      console.error("SSE stream error:", err);
      assistantText += `\n\n❌ [连接已断开: ${err instanceof Error ? err.message : err}]`;
      setMsgs((m) => {
        const updated = [...m];
        updated[updated.length - 1] = {
          role: "agent",
          agent: "织星 AI",
          text: chatText + (assistantText ? `\n\n${assistantText}` : ""),
        };
        return updated;
      });
    }
  };

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
            className="absolute right-0 top-0 z-50 flex h-full w-[min(420px,92vw)] flex-col border-l border-border bg-popover/95 backdrop-blur-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 32 }}
          >
            <header className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "linear-gradient(135deg, var(--primary), var(--primary))" }}>
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div>
                  <div className="text-[14px] font-medium">全局 AI 伴学</div>
                  <div className="font-mono text-[10px] text-muted-foreground">Global Copilot · 划词喂养</div>
                </div>
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {msgs.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed"
                    style={
                      m.role === "user"
                        ? { background: "var(--primary)", color: "var(--primary-foreground)" }
                        : { background: "var(--secondary)", color: "var(--foreground)", border: "1px solid var(--border)" }
                    }
                  >
                    {m.role === "agent" && (
                      <div className="mb-1 flex items-center gap-1.5">
                        <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--primary)]">{m.agent}</span>
                        <Volume2 className="h-3 w-3 text-muted-foreground" />
                      </div>
                    )}
                    <div className="prose-sm prose-invert text-current max-w-none [&>p]:mb-2 last:[&>p]:mb-0 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4 [&_strong]:font-semibold">
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{m.text}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-border p-3">
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
                  placeholder="选中知识点划词提问，或在此输入…"
                  className="max-h-28 flex-1 resize-none bg-transparent px-2 py-1 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                />
                <button
                  onClick={send}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition hover:opacity-90"
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
