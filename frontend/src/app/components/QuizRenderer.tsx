import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { learningRequest, type LearningPlan } from "../learning";
import { useAdaptiveStore } from "../../store/adaptiveStore";
import { useStudyStore } from "../store";

interface Question { question: string; options: string[] }
interface Grade { selected_answer: string; correct: boolean; correct_answer: string; explanation: string }
interface Quiz { quiz_id: string; questions: Question[]; answers: Record<string, Grade>; sources?: {document_name: string}[] }

export function QuizRenderer({ nodeId }: { nodeId: string }) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [fresh, setFresh] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true); setQuiz(null); setError(""); setFeedback("");
    learningRequest<Quiz>(`/nodes/${encodeURIComponent(nodeId)}/quiz`, { method: "POST", body: JSON.stringify({ fresh }) })
      .then(data => {
        if (!active) return;
        setQuiz(data);
        const first = data.questions.findIndex((_, idx) => !data.answers[String(idx)]);
        setIndex(first < 0 ? 0 : first);
      }).catch(error => { if (active) setError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [nodeId, reload]);

  const answer = async (option: string) => {
    if (!quiz || submitting || quiz.answers[String(index)]) return;
    setSubmitting(true); setError("");
    try {
      const data = await learningRequest<{ answer: Grade; plan: LearningPlan }>(`/quizzes/${encodeURIComponent(quiz.quiz_id)}/answers`, {
        method: "POST", body: JSON.stringify({ question_index: index, selected_answer: option }),
      });
      setQuiz(current => current ? { ...current, answers: { ...current.answers, [String(index)]: data.answer } } : current);
      const step = data.plan.steps.find(step => step.id === nodeId);
      const next = data.plan.steps.find(step => step.id === data.plan.next_node_id);
      setFeedback(`答题已保存。${step?.reason ?? ""}${next && next.id !== nodeId ? ` 下一步建议：${next.title}。` : ""}`);
      useStudyStore.getState().applyLearningPlan(data.plan);
      void useAdaptiveStore.getState().load(useStudyStore.getState().currentScope);
    } catch (error) { setError(error instanceof Error ? error.message : "保存失败，请重试"); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" />正在准备测验，首次生成可能需要稍等…</div>;
  if (!quiz) return <div className="flex h-full flex-col items-center justify-center gap-3 p-5 text-center"><p role="alert" className="text-sm text-muted-foreground">{error || "暂无题目"}</p><button onClick={() => setReload(value => value + 1)} className="rounded-xl border border-border px-4 py-2 text-sm">重新加载</button></div>;
  const question = quiz.questions[index];
  const grade = quiz.answers[String(index)];
  const complete = Object.keys(quiz.answers).length === quiz.questions.length;
  return (
    <div className="dark mx-auto flex h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto p-4 text-[#e8ecff]">
      <div className="flex items-center justify-between"><h4 className="font-medium">知识点测验</h4><span className="text-xs text-muted-foreground">已保存 {Object.keys(quiz.answers).length} / {quiz.questions.length} 题</span></div>
      {quiz.sources?.length ? <p className="text-xs text-muted-foreground">Dify 资料来源：{[...new Set(quiz.sources.map(source => source.document_name))].join("、")}</p> : null}
      <div className="flex flex-wrap gap-2">{quiz.questions.map((_, idx) => <button key={idx} aria-label={`第 ${idx + 1} 题`} onClick={() => { setIndex(idx); setError(""); }} disabled={submitting}
        className={`h-8 w-8 rounded-lg border ${index === idx ? "border-primary" : "border-border"} ${quiz.answers[String(idx)] ? quiz.answers[String(idx)].correct ? "text-green-500" : "text-red-400" : "text-muted-foreground"}`}>{idx + 1}</button>)}</div>
      <h5 className="text-base leading-relaxed">{question.question}</h5>
      <div className="space-y-2">{question.options.map((option, idx) => <button key={idx} disabled={Boolean(grade) || submitting} onClick={() => void answer(option)}
        className={`flex w-full items-center justify-between rounded-xl border p-3 text-left text-sm disabled:cursor-default ${grade ? option === grade.correct_answer ? "border-green-500/50 bg-green-500/10 text-green-400" : option === grade.selected_answer ? "border-red-500/50 bg-red-500/10 text-red-400" : "border-border opacity-60" : "border-border hover:border-primary"}`}>
        <span>{option}</span>{grade && option === grade.correct_answer && <CheckCircle2 className="ml-2 h-4 w-4 shrink-0" />}{grade && !grade.correct && option === grade.selected_answer && <XCircle className="ml-2 h-4 w-4 shrink-0" />}
      </button>)}</div>
      {submitting && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />正在保存并更新学习建议…</p>}
      {error && <p role="alert" className="text-sm text-red-400">{error}，可以重新选择答案提交。</p>}
      {grade && <div className="rounded-xl border border-border bg-secondary/40 p-4"><p className={grade.correct ? "text-green-400" : "text-red-400"}>{grade.correct ? "回答正确" : "需要再巩固一下"}</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{grade.explanation}</p></div>}
      {feedback && <p role="status" className="rounded-xl bg-primary/10 p-3 text-xs leading-relaxed">{feedback}</p>}
      <div className="mt-auto flex flex-wrap justify-end gap-2 pt-2">
        {index < quiz.questions.length - 1 && <button disabled={!grade || submitting} onClick={() => setIndex(value => value + 1)} className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-40">下一题</button>}
        {complete && <>
          <button onClick={() => { setFresh(false); setReload(value => value + 1); }} className="rounded-xl border border-border px-4 py-2 text-sm">再练一轮</button>
          <button onClick={() => { setFresh(true); setReload(value => value + 1); }} className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground">生成新题</button>
        </>}
      </div>
      <p className="text-xs text-muted-foreground">结果保存在服务器中，重新打开可继续未完成的测验。当前题目使用现有出题功能，内容准确性仍需核对。</p>
    </div>
  );
}
