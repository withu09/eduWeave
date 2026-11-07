import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Globe, X, ArrowLeft, ExternalLink, Maximize2, Minimize2, Sparkles, ShieldCheck, Loader2 } from "lucide-react";
import { useStudyStore, type RecommendedResource } from "../store";
import { API_BASE } from "../config";

// Sandbox 内嵌网页框 — 画中画 inline browser for Agent-recommended external resources.
export function InlineBrowser({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState<RecommendedResource | null>(null);
  const [full, setFull] = useState(false);
  const resources = useStudyStore(s => s.resources);
  const setResources = useStudyStore(s => s.setResources);
  const currentScope = useStudyStore(s => s.currentScope);
  const [loading, setLoading] = useState(false);

  const fetchResources = async (isMore = false) => {
    setLoading(true);
    try {
      const apiBaseUrl = API_BASE;
      const scopeTitle = useStudyStore.getState().currentScope === 'all' 
        ? "宏观宇宙" 
        : useStudyStore.getState().constellation.find(n => n.id === useStudyStore.getState().currentScope)?.title || "专业课程";
      const course = encodeURIComponent(scopeTitle);
      const exclude = isMore ? encodeURIComponent(resources.map(r => r.title).join(",")) : "";
      const res = await fetch(`${apiBaseUrl}/api/resources?course=${course}&exclude=${exclude}`);
      const data = await res.json();
      if (data && data.resources) {
        if (isMore) {
          setResources(prev => [...prev, ...data.resources]);
        } else {
          setResources(data.resources);
        }
      }
    } catch (e) {
      console.error("Failed to fetch resources:", e);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch resources whenever currentScope changes
  useEffect(() => {
    fetchResources(false);
  }, [currentScope]);

  return (
    <motion.div
      className={
        full
          ? "absolute inset-0 z-40 flex flex-col bg-[#0a0c1a]"
          : "absolute bottom-4 right-4 z-40 flex h-[78%] w-[min(560px,calc(100%-2rem))] flex-col overflow-hidden rounded-2xl border border-[rgba(140,150,220,0.25)] bg-[#0a0c1a] shadow-2xl"
      }
      initial={{ opacity: 0, y: 30, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 30, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 240, damping: 26 }}
    >
      {/* browser chrome */}
      <div className="flex items-center gap-2 border-b border-[rgba(140,150,220,0.18)] px-3 py-2">
        {current && (
          <button onClick={() => setCurrent(null)} className="rounded-md p-1 text-[#9aa0c8] transition hover:bg-white/10 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="flex flex-1 items-center gap-2 truncate rounded-lg bg-white/5 px-2.5 py-1.5">
          <Globe className="h-3.5 w-3.5 shrink-0 text-[#5ad1e8]" />
          <span className="truncate font-mono text-[11px] text-[#9aa0c8]">{current ? current.url : "资源推荐 · Resource Agent"}</span>
        </div>
        {current && (
          <a href={current.url} target="_blank" rel="noreferrer" className="rounded-md p-1 text-[#9aa0c8] transition hover:bg-white/10 hover:text-white" title="新标签打开">
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        <button onClick={() => setFull((f) => !f)} className="rounded-md p-1 text-[#9aa0c8] transition hover:bg-white/10 hover:text-white" title={full ? "还原" : "全屏"}>
          {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <button onClick={onClose} className="rounded-md p-1 text-[#9aa0c8] transition hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      {current ? (
        <div className="relative flex-1">
          {/* sandbox iframe — 防跨域脚本攻击 */}
          <iframe
            src={current.url}
            title={current.title}
            className="h-full w-full bg-white"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            referrerPolicy="no-referrer"
          />
          <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 font-mono text-[9px] text-[#7ce0b0]">
            <ShieldCheck className="h-3 w-3" /> sandboxed
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          <p className="mb-1 flex items-center gap-1.5 px-1 text-[12px] text-[#c3c8e8]">
            <Sparkles className="h-3.5 w-3.5 text-[#8b7dff]" /> 为你检索到的专属课程学习资源
          </p>
          {resources.map((r) => (
            <button
              key={r.id}
              onClick={() => setCurrent(r)}
              className="w-full rounded-xl border border-[rgba(140,150,220,0.18)] bg-white/5 p-3 text-left transition hover:border-[#8b7dff]"
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-white">{r.title}</span>
                <span className="font-mono text-[9px] text-[#9aa0c8]">{r.source}</span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[#9aa0c8]">推荐理由 · {r.reason}</p>
            </button>
          ))}
          
          <button
            onClick={() => fetchResources(true)}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-[rgba(140,150,220,0.3)] bg-transparent p-3 text-[12px] text-[#9aa0c8] transition hover:border-[#8b7dff] hover:text-[#8b7dff] disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "More (获取更多资源)"}
          </button>

          <p className="px-1 pt-1 font-mono text-[9px] text-[#6b7099]">
            ※ 资源由 AI 根据当前课程进度实时检索推荐，若无法嵌套请点击右上角新标签打开。
          </p>
        </div>
      )}
    </motion.div>
  );
}
