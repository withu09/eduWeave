import { create } from "zustand";
import { StarNode, constellation as initialConstellation } from "./data";
import { NodeStatus } from "./data";
import dagre from "dagre";
import { API_BASE } from "./config";
import { learningRequest, type LearningPlan } from "./learning";

export interface RecommendedResource {
  id: string;
  title: string;
  source: string;
  reason: string;
  url: string;
}

interface StudyStore {
  constellation: StarNode[];
  resources: RecommendedResource[];
  loading: boolean;
  currentScope: string;
  setCurrentScope: (scope: string) => void;
  updateNodeStatus: (titles: string[], status: NodeStatus) => void;
  updateNodeStatusByIds: (ids: string[], status: NodeStatus) => void;
  resetConstellation: () => void;
  setResources: (resources: RecommendedResource[] | ((prev: RecommendedResource[]) => RecommendedResource[])) => void;
  fetchConstellation: (courseId: string) => Promise<void>;
  applyLearningPlan: (plan: LearningPlan) => void;
}

function withLearningProgress(nodes: StarNode[], plan: LearningPlan): StarNode[] {
  const steps = new Map(plan.steps.map(step => [step.id, step]));
  return nodes.map(node => {
    const step = steps.get(node.id);
    if (!step) return node;
    const status: NodeStatus = step.status === "mastered" ? "mastered"
      : step.status === "weakness" ? "weakness" : step.blocked_by.length ? "locked" : "unlocked";
    return { ...node, status, mastery: step.mastery };
  });
}

function applyDagreLayout(nodes: StarNode[]): StarNode[] {
  if (nodes.length === 0) return nodes;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', align: 'UL', nodesep: 60, ranksep: 100 });
  g.setDefaultEdgeLabel(() => ({}));

  nodes.forEach(n => {
    g.setNode(n.id, { label: n.id, width: 80, height: 80 });
  });

  nodes.forEach(n => {
    n.deps.forEach(d => {
      g.setEdge(d, n.id);
    });
  });

  dagre.layout(g);

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  g.nodes().forEach(v => {
    const node = g.node(v);
    if (node) {
      if (node.x < minX) minX = node.x;
      if (node.x > maxX) maxX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.y > maxY) maxY = node.y;
    }
  });

  const cx = minX === Infinity ? 0 : (minX + maxX) / 2;
  const cy = minY === Infinity ? 0 : (minY + maxY) / 2;

  const canvasW = 1500;
  const canvasH = 920;

  return nodes.map(n => {
    const dNode = g.node(n.id);
    let x = n.x;
    let y = n.y;
    
    // Treat 0,0 as unset for auto layout
    if (!x && !y && dNode) {
       x = 50 + ((dNode.x - cx) / canvasW) * 100;
       y = 50 + ((dNode.y - cy) / canvasH) * 100;
    }
    
    return { ...n, x, y };
  });
}

export const useStudyStore = create<StudyStore>((set) => ({
  constellation: [], // Default to empty instead of mock data
  resources: [],
  loading: false,
  currentScope: 'all',

  setCurrentScope: (scope: string) => {
    set({ currentScope: scope });
  },

  applyLearningPlan: (plan) => {
    set(state => ({ constellation: withLearningProgress(state.constellation, plan) }));
  },

  setResources: (updater) => {
    set((state) => ({
      resources: typeof updater === "function" ? updater(state.resources) : updater,
    }));
  },

  updateNodeStatus: (titles: string[], status: NodeStatus) => {
    set((state) => ({
      constellation: state.constellation.map((node) => {
        if (titles.includes(node.title)) {
          return { ...node, status };
        }
        return node;
      }),
    }));
  },

  updateNodeStatusByIds: (ids: string[], status: NodeStatus) => {
    set((state) => ({
      constellation: state.constellation.map((node) => {
        if (ids.includes(node.id)) {
          return { ...node, status };
        }
        return node;
      }),
    }));
  },

  resetConstellation: () => {
    set({ constellation: [] });
  },

  fetchConstellation: async (courseId: string) => {
    set({ loading: true });
    try {
      const url = courseId === 'all' 
        ? `${API_BASE}/api/kb/starmap/all`
        : `${API_BASE}/api/kb/starmap/${courseId}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const nodes: StarNode[] = data.data;
        if (nodes && nodes.length > 0) {
          let progressNodes = nodes;
          try {
            const plan = await learningRequest<LearningPlan>(`/plan?course_id=${encodeURIComponent(courseId)}`);
            progressNodes = withLearningProgress(nodes, plan);
          } catch (error) { console.error("Failed to load learning progress", error); }
          const laidOutNodes = applyDagreLayout(progressNodes);
          set({ constellation: laidOutNodes });
        } else {
          set({ constellation: [] });
        }
      }
    } catch (e) {
      console.error("Failed to fetch constellation", e);
    } finally {
      set({ loading: false });
    }
  }
}));
