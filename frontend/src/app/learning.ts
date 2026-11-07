import { API_BASE } from "./config";

export interface LearningStep {
  id: string; title: string; module: string; course_id: string; course: string;
  status: "unstarted" | "learning" | "weakness" | "mastered";
  attempts: number; recent_count: number; accuracy: number | null; mastery: number;
  has_resources: boolean; prerequisites: string[]; blocked_by: string[];
  recommended: boolean; reason: string;
}

export interface LearningPlan {
  course_id: string; steps: LearningStep[]; next_node_id: string | null; rule: string;
  summary: {
    total_nodes: number; mastered_nodes: number; practiced_nodes: number;
    weak_nodes: number; answered_count: number; recent_accuracy: number | null; progress: number;
  };
}

export function learnerId(): string {
  const key = "eduweave_learner_id";
  const stored = localStorage.getItem(key);
  if (stored && /^[a-zA-Z0-9_-]{8,80}$/.test(stored)) return stored;
  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "learner-" + Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
  localStorage.setItem(key, id);
  return id;
}

export async function learningRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}/api/adaptive${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", "X-Learner-ID": learnerId(), ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : `请求未完成（${response.status}）`);
  return data as T;
}
