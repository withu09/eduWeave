import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { API_BASE } from "../config";
import { learnerId } from "../learning";
import { CodeRenderer, type CodeTask } from "./CodeRenderer";
import { Markdown } from "./Markdown";

interface Exercise { title: string; scenario: string; task: string; hints: string[]; criteria: string[]; reference_answer: string; code?: CodeTask; sources?: {document_name: string; position?: number}[] }
interface Practice { id: string; subject: string; exercise: Exercise; student_answer: string; feedback: string }
interface Info { subject: string; subjects: Record<string, string>; context: string; record: Practice | null }

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}/api/practice${path}`, {
    ...options, headers: { "Content-Type": "application/json", "X-Learner-ID": learnerId() },
  });
  const data = await response.json().catch(() => ({ detail: "服务暂未完成请求，请稍后重试" }));
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "练习请求未完成，请稍后重试");
  return data;
}

export function PracticeRenderer({ nodeId }: { nodeId: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [subject, setSubject] = useState("");
  const [record, setRecord] = useState<Practice | null>(null);
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showReference, setShowReference] = useState(false);
  const version = useRef(0);

  const load = async (selected = "") => {
    const current = ++version.current;
    setLoading(true); setError(""); setRecord(null); setShowReference(false);
    try {
      const data = await request<Info>(`/nodes/${encodeURIComponent(nodeId)}${selected ? `?subject=${selected}` : ""}`);
      if (current !== version.current) return;
      setInfo(data); setSubject(data.subject); setRecord(data.record); setAnswer(data.record?.student_answer ?? "");
    } catch (error) { if (current === version.current) setError(error instanceof Error ? error.message : "加载失败"); }
    finally { if (current === version.current) setLoading(false); }
  };
  useEffect(() => { void load(); return () => { ++version.current; }; }, [nodeId]);

  const generate = async () => {
    setLoading(true); setError(""); setShowReference(false);
    try {
      const data = await request<Practice>(`/nodes/${encodeURIComponent(nodeId)}`, { method: "POST", body: JSON.stringify({ subject }) });
      setRecord(data); setAnswer("");
    } catch (error) { setError(error instanceof Error ? error.message : "生成失败"); }
    finally { setLoading(false); }
  };
  const feedback = async () => {
    if (!record || !answer.trim()) return;
    setLoading(true); setError("");
    try {
      const data = await request<Practice>(`/${record.id}/feedback`, { method: "POST", body: JSON.stringify({ answer: answer.trim() }) });
      setRecord(data);
    } catch (error) { setError(error instanceof Error ? error.message : "点评失败"); }
    finally { setLoading(false); }
  };

  return <div className="dark flex h-full flex-col gap-4 overflow-y-auto p-2 text-[#e8ecff]">
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={`practice-${nodeId}`} className="text-sm">练习学科</label>
      <select id={`practice-${nodeId}`} disabled={loading} value={subject} onChange={event => { setSubject(event.target.value); void load(event.target.value); }} className="max-w-full rounded-xl border border-border bg-card px-3 py-2 text-sm">
        {info && Object.entries(info.subjects).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <button disabled={loading || !subject} onClick={() => void generate()} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-40"><Sparkles className="h-4 w-4" />{record ? "生成新练习" : "生成练习"}</button>
    </div>
    {info && <p className="text-xs text-muted-foreground">课程：{info.context}。练习将检索对应的 Dify 资料生成。</p>}
    {loading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在处理，请稍等…</p>}
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {!record && !loading && <p className="p-6 text-center text-sm text-muted-foreground">选择适合这门课程的练习形式，再点击“生成练习”。</p>}
    {record?.exercise.code ? <div className="min-h-[420px] flex-1"><CodeRenderer task={record.exercise.code} /></div> : record && <>
      <h4 className="text-base font-medium">{record.exercise.title}</h4>
      {record.exercise.sources && <p className="text-xs text-muted-foreground">资料来源：{[...new Set(record.exercise.sources.map(source => source.document_name))].join("、")}</p>}
      <Markdown>{record.exercise.scenario}</Markdown>
      <div className="rounded-xl border border-border p-4"><Markdown>{record.exercise.task}</Markdown></div>
      <details className="text-sm"><summary className="cursor-pointer text-primary">查看提示</summary><ul className="mt-2 list-disc space-y-1 pl-5">{record.exercise.hints.map((hint, index) => <li key={index}>{hint}</li>)}</ul></details>
      <label className="text-sm" htmlFor={`answer-${record.id}`}>你的作答</label>
      <textarea id={`answer-${record.id}`} value={answer} maxLength={8000} onChange={event => setAnswer(event.target.value)} rows={5} className="w-full shrink-0 rounded-xl border border-border bg-input-background p-3 text-sm" placeholder="写下分析过程、计算步骤或观点…" />
      <div className="flex flex-wrap gap-2"><button disabled={loading || !answer.trim()} onClick={() => void feedback()} className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-40">提交作答并获取点评</button><button onClick={() => setShowReference(value => !value)} className="rounded-xl border border-border px-4 py-2 text-sm">{showReference ? "收起参考解析" : "查看参考解析"}</button></div>
      {record.feedback && <section className="rounded-xl border border-primary/40 p-4"><h5 className="mb-2 font-medium">AI 点评 · 作答已保存</h5><Markdown>{record.feedback}</Markdown></section>}
      {showReference && <section className="rounded-xl border border-border p-4"><h5 className="mb-2 font-medium">参考解析</h5><Markdown>{record.exercise.reference_answer}</Markdown><h5 className="mb-2 mt-4 text-sm">评价要点</h5><ul className="list-disc space-y-1 pl-5 text-sm">{record.exercise.criteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul></section>}
      <p className="text-xs text-muted-foreground">实践点评用于学习反馈；自适应掌握状态目前由“题库”中的测验记录更新。</p>
    </>}
  </div>;
}
