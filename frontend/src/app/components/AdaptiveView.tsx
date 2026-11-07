import { useEffect, useState } from "react";
import { Layers, RefreshCw, BookOpen, ListChecks, AlertTriangle, CheckCircle2, Loader2, Sparkles, Database } from "lucide-react";
import { ProfileRadar } from "./ProfileRadar";
import { useAdaptiveStore } from "../../store/adaptiveStore";
import { useStudyStore } from "../store";
import { API_BASE } from "../config";
import { useNavigate } from "react-router";

const labels = { unstarted: "尚未测验", learning: "学习中", weakness: "需要巩固", mastered: "已掌握" };

export function AdaptiveView({ onStudy }: { onStudy: (nodeId: string, tab: "doc" | "quiz") => void }) {
  const { plan, loading, error, load } = useAdaptiveStore();
  const { currentScope, setCurrentScope } = useStudyStore();
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [coursesError, setCoursesError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/api/kb/tree`).then(async response => {
      if (!response.ok) throw new Error("课程列表加载失败");
      return response.json();
    }).then(data => { if (active) setCourses(data.tree ?? []); })
      .catch(error => { if (active) setCoursesError(error.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => { void load(currentScope); }, [currentScope, load]);
  const next = plan?.steps.find(step => step.id === plan.next_node_id);
  const weak = plan?.steps.filter(step => step.status === "weakness") ?? [];

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Layers className="h-9 w-9 text-primary" />
          <div><h2 className="text-xl font-semibold">自适应学习空间</h2>
            <p className="mt-1 text-xs text-muted-foreground">根据真实答题记录，安排下一步学习</p></div>
        </div>
        <div className="flex items-center gap-2">
          <select aria-label="选择学习课程" value={currentScope} onChange={event => setCurrentScope(event.target.value)}
            className="max-w-56 rounded-xl border border-border bg-card px-3 py-2 text-sm">
            <option value="all">全部课程</option>
            {courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}
          </select>
          <button aria-label="刷新学习记录" disabled={loading} onClick={() => void load(currentScope)} className="rounded-xl border border-border p-2 disabled:opacity-40">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {(error || coursesError) && <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">{error || coursesError}</div>}
      {loading && !plan && <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />正在读取课程和学习记录…</div>}

      {plan && <>
        <div className="rounded-2xl border border-border bg-card/80 p-5">
          <div className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4 text-primary" />{next ? `建议下一步：${next.title}` : plan.steps.length ? plan.summary.mastered_nodes === plan.steps.length ? "当前知识点均已达到掌握标准，可以继续复习。" : "请检查课程的先修关系" : "先添加课程和知识点"}</div>
          <p className="mt-2 text-sm text-muted-foreground">{next?.reason ?? (plan.steps.length ? "学习记录已保存，选择下方知识点可再次练习。" : "到知识库管理创建课程、模块和知识点，再为知识点上传学习资料。")}</p>
          {next ? <button onClick={() => onStudy(next.id, "doc")} className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground">开始学习</button>
            : !plan.steps.length && <button onClick={() => navigate("/admin/knowledge-base")} className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground">管理课程资料</button>}
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_300px]">
          <section className="space-y-3">
            <h3 className="text-sm font-medium">课程学习路径 · {plan.steps.length} 个知识点</h3>
            {plan.steps.map((step, index) => <article key={step.id} className={`rounded-2xl border bg-card/80 p-4 ${step.recommended ? "border-primary" : "border-border"}`}>
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs text-muted-foreground">{step.course} / {step.module}</p>
                  <h4 className="mt-1 font-medium">{index + 1}. {step.title}{step.recommended && <span className="ml-2 text-xs text-primary">当前推荐</span>}</h4></div>
                <span className={`shrink-0 rounded-lg bg-secondary px-2 py-1 text-xs ${step.status === "weakness" ? "text-destructive" : step.status === "mastered" ? "text-green-500" : "text-muted-foreground"}`}>{labels[step.status]}</span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{step.reason}</p>
              <div className="mt-2 text-xs text-muted-foreground">累计答题 {step.attempts} 次 · 最近正确率 {step.accuracy === null ? "暂无记录" : `${step.accuracy}%`}</div>
              {!step.has_resources && <p className="mt-2 flex items-center gap-1 text-xs text-amber-500"><Database className="h-3 w-3" />尚未上传学习资料</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => onStudy(step.id, "doc")} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs"><BookOpen className="h-4 w-4" />{step.status === "mastered" ? "复习讲义" : "进入学习"}</button>
                <button onClick={() => onStudy(step.id, "quiz")} disabled={!step.has_resources} className="flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-40"><ListChecks className="h-4 w-4" />{step.status === "weakness" ? "巩固测验" : "开始测验"}</button>
                {!step.has_resources && <button onClick={() => navigate("/admin/knowledge-base")} className="rounded-xl border border-border px-3 py-2 text-xs">去上传资料</button>}
              </div>
            </article>)}
          </section>
          <aside className="space-y-4">
            <ProfileRadar />
            <section className="rounded-2xl border border-border bg-card/80 p-5">
              <h3 className="flex items-center gap-2 text-sm font-medium">{weak.length ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-primary" />}需要巩固的知识点</h3>
              {weak.length ? <ul className="mt-3 space-y-2 text-sm">{weak.map(step => <li key={step.id}><button onClick={() => onStudy(step.id, "quiz")} className="text-left text-primary hover:underline">{step.title} · {step.accuracy}%</button></li>)}</ul>
                : <p className="mt-3 text-xs text-muted-foreground">{plan.summary.answered_count ? "暂未识别到薄弱点，继续练习积累记录。" : "完成测验后，这里会显示需要巩固的知识点。"}</p>}
            </section>
            <section className="rounded-2xl border border-border bg-card/80 p-5 text-xs leading-relaxed text-muted-foreground">
              <h3 className="mb-2 text-sm font-medium text-foreground">推荐依据</h3>{plan.rule}
              <p className="mt-3">这是当前测验表现的估计。阅读讲义不会自动记为已掌握。请使用同一浏览器和访问地址继续学习，换浏览器或入口会使用另一份记录。</p>
            </section>
          </aside>
        </div>
      </>}
    </div>
  );
}
