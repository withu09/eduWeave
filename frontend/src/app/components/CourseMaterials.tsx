import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, RefreshCw, UploadCloud } from "lucide-react";
import { API_BASE } from "../config";

type BuildState = {
  status: "idle" | "queued" | "waiting" | "indexing" | "building" | "completed" | "error";
  enabled: boolean;
  error?: string | null;
  source_version?: string;
  documents: { id: string; name: string; status: string }[];
  summary: { new_modules?: number; new_nodes?: number; linked_nodes?: number; retained_nodes?: number; segment_count?: number; excerpted?: boolean };
};
const labels = { idle: "等待上传资料", queued: "等待检查资料", waiting: "等待课程资料", indexing: "Dify 正在解析", building: "AI 正在整理知识结构", completed: "星图已更新", error: "需要处理" };

export default function CourseMaterials({ courseId, title, onBuilt }: { courseId: string; title: string; onBuilt: () => void }) {
  const [state, setState] = useState<BuildState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const replaceId = useRef<string | null>(null);
  const notified = useRef<string | null>(null);
  const onBuiltRef = useRef(onBuilt);
  onBuiltRef.current = onBuilt;

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let live = true;
    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/kb/courses/${courseId}/build`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "构建状态读取失败");
        if (!live) return;
        setState(data);
        if (data.status === "completed" && data.source_version && notified.current !== data.source_version) {
          notified.current = data.source_version;
          onBuiltRef.current();
        }
      } catch (cause) {
        if (live) setError(cause instanceof Error ? cause.message : "构建状态读取失败");
      } finally {
        if (live) timer = setTimeout(poll, 5000);
      }
    };
    void poll();
    return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [courseId]);

  const configure = async (enabled: boolean, retry = false) => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${API_BASE}/api/kb/courses/${courseId}/build`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled, retry }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "构建未启动");
      setState(data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "构建未启动"); }
    finally { setBusy(false); }
  };

  const upload = async (file?: File) => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { setError("单个文件请控制在15 MB以内，可将教材按章节拆分。"); return; }
    setBusy(true); setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      if (replaceId.current) form.append("replace_id", replaceId.current);
      const response = await fetch(`${API_BASE}/api/kb/courses/${courseId}/materials`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "上传失败");
      setState(previous => ({ status: "indexing", enabled: true, documents: [...(previous?.documents || []).filter(item => item.id !== data.document_id), { id: data.document_id, name: file.name, status: "processing" }], summary: previous?.summary || {} }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "上传失败"); }
    finally { setBusy(false); replaceId.current = null; if (fileInput.current) fileInput.current.value = ""; }
  };

  const running = state && ["indexing", "building", "queued"].includes(state.status);
  return <div className="space-y-5">
    <div className="rounded-2xl border border-blue-200 bg-white p-6">
      <h3 className="text-lg font-semibold text-slate-800">上传教材，AI 创建星球</h3>
      <p className="mt-2 text-sm leading-6 text-slate-500">将「{title}」的教材、讲义或复习资料上传到这里。AI 会根据资料建立模块、知识点和先修关系，并将资料关联到相应知识点。</p>
      <p className="mt-3 text-xs leading-5 text-blue-700">上传资料 → Dify 解析 → AI 整理知识结构 → 更新星图</p>
      <input ref={fileInput} type="file" className="hidden" aria-label="上传课程资料" accept=".pdf,.txt,.md,.doc,.docx,.ppt,.pptx" onChange={event => void upload(event.target.files?.[0])} />
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button disabled={busy} onClick={() => { replaceId.current = null; fileInput.current?.click(); }} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />} 上传资料并构建星球</button>
        <button disabled={busy || !!running} onClick={() => void configure(true, true)} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600 disabled:opacity-50"><RefreshCw className="h-4 w-4" />{state?.status === "error" ? "重新构建" : "从 Dify 构建 / 更新"}</button>
      </div>
      <p className="mt-3 text-xs text-slate-400">支持 PDF、Word、PPT、Markdown、TXT，每次一份，单份不超过15 MB。扫描件需要先有可识别文字。</p>
    </div>

    <div aria-live="polite" className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">{running ? <Loader2 className="h-4 w-4 animate-spin text-blue-600" /> : state?.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : null}{state ? labels[state.status] : "正在读取构建状态"}</div>
        <label className="flex items-center gap-2 text-xs text-slate-500"><input type="checkbox" checked={state?.enabled || false} disabled={!state || busy} onChange={event => void configure(event.target.checked)} />自动跟随 Dify 资料变化</label>
      </div>
      {(error || state?.error) && <p role="alert" className="mt-3 text-sm text-red-600">{error || state?.error}</p>}
      {state?.status === "completed" && <p className="mt-3 text-sm leading-6 text-slate-600">本次新增 {state.summary.new_modules || 0} 个模块、{state.summary.new_nodes || 0} 个知识点；已关联 {state.summary.linked_nodes || 0} 个知识点。点击左上角“返回星图”查看。</p>}
      {!!state?.summary.retained_nodes && <p className="mt-2 text-xs text-slate-500">保留 {state.summary.retained_nodes} 个原知识点及其学习记录，可按需手动整理。</p>}
      {state?.summary.excerpted && <p className="mt-2 text-xs text-amber-700">资料较长，结构整理使用了各片段的节选，请检查生成的章节是否完整。</p>}
      <p className="mt-3 text-xs leading-5 text-slate-400">开启后约每45秒检查一次资料变化，发生变化时会再次调用 AI。更新使用“上传新版本”，以便保留文档关联；同名知识点沿用原记录，旧知识点保留供你检查。</p>
    </div>

    <div className="space-y-3">
      <h3 className="text-sm font-medium text-slate-700">课程资料 · {state?.documents.length || 0}</h3>
      {state?.documents.map(file => <div key={file.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex min-w-0 items-center gap-3"><FileText className="h-5 w-5 shrink-0 text-blue-500" /><span className="break-all text-sm text-slate-700">{file.name}</span></div>
        <div className="flex items-center gap-3 text-xs"><span className={file.status === "completed" ? "text-green-600" : "text-slate-500"}>{file.status === "completed" ? "解析完成" : file.status === "processing" ? "解析中" : file.status === "paused" ? "已停用" : "解析失败"}</span><button disabled={busy} onClick={() => { replaceId.current = file.id; fileInput.current?.click(); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 disabled:opacity-50">上传新版本</button></div>
      </div>)}
      {state && !state.documents.length && <p className="text-sm text-slate-400">上传第一份资料后会自动开始解析和构建，无需预先创建模块或知识点。</p>}
    </div>
  </div>;
}
