import { create } from "zustand";
import { learningRequest, type LearningPlan } from "../app/learning";

let requestVersion = 0;

interface AdaptiveState {
  plan: LearningPlan | null;
  loading: boolean;
  error: string | null;
  load: (courseId: string) => Promise<void>;
}

export const useAdaptiveStore = create<AdaptiveState>((set) => ({
  plan: null,
  loading: false,
  error: null,
  load: async (courseId) => {
    const version = ++requestVersion;
    set(state => ({ loading: true, error: null, plan: state.plan?.course_id === courseId ? state.plan : null }));
    try {
      const plan = await learningRequest<LearningPlan>(`/plan?course_id=${encodeURIComponent(courseId)}`);
      if (version === requestVersion) set({ plan, loading: false });
    } catch (error) {
      if (version === requestVersion) set({ loading: false, error: error instanceof Error ? error.message : "学习记录加载失败" });
    }
  },
}));
