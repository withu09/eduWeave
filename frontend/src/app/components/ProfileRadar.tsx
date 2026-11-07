import { useEffect } from "react";
import { useAdaptiveStore } from "../../store/adaptiveStore";
import { useStudyStore } from "../store";

export function ProfileRadar() {
  const { plan, loading, error, load } = useAdaptiveStore();
  const scope = useStudyStore(state => state.currentScope);
  useEffect(() => { if (!plan || plan.course_id !== scope) void load(scope); }, [scope, load]);
  const summary = plan?.course_id === scope ? plan.summary : null;
  return (
    <section className="rounded-2xl border border-border bg-card/80 p-5">
      <h3 className="text-sm font-medium">学习概况</h3>
      <p className="mt-1 text-xs text-muted-foreground">来自已保存的测验记录</p>
      {summary ? <>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            ["已掌握知识点", `${summary.mastered_nodes} / ${summary.total_nodes}`],
            ["最近答题正确率", summary.recent_accuracy === null ? "暂无记录" : `${summary.recent_accuracy}%`],
            ["已练习知识点", `${summary.practiced_nodes}`],
            ["累计答题", `${summary.answered_count} 次`],
          ].map(([label, value]) => <div key={label} className="rounded-xl bg-secondary/50 p-3"><div className="text-lg font-semibold text-primary">{value}</div><div className="mt-1 text-xs text-muted-foreground">{label}</div></div>)}
        </div>
        <div className="mt-4 text-xs text-muted-foreground">课程掌握进度 {summary.progress}%</div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${summary.progress}%` }} /></div>
      </> : <p className="mt-4 text-xs text-muted-foreground">{error || (loading ? "正在读取学习记录…" : "完成测验后显示学习概况。")}</p>}
    </section>
  );
}
