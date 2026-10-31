import { create } from 'zustand';
import { PathStep, GenTask, pathSteps as initialPathSteps, genTasks as initialGenTasks } from '../app/data';

interface AdaptiveState {
  steps: PathStep[];
  tasks: GenTask[];
  isGenerating: boolean;
  triggerGenerate: (stepId: string) => void;
  updateTaskProgress: (taskId: string, progress: number) => void;
  unlockStep: (stepId: string) => void;
}

export const useAdaptiveStore = create<AdaptiveState>((set, get) => ({
  steps: initialPathSteps,
  tasks: initialGenTasks, // load some initial tasks for demonstration
  isGenerating: false,

  triggerGenerate: (stepId) => {
    const { steps, tasks } = get();
    const step = steps.find((s) => s.id === stepId);
    if (!step || step.state !== 'todo') return;

    set({ isGenerating: true });

    // Add a couple of simulated background tasks
    const taskId1 = `gen-${Date.now()}-1`;
    const taskId2 = `gen-${Date.now()}-2`;
    
    const newTasks: GenTask[] = [
      { id: taskId1, agent: 'Writer', label: `生成讲义: ${step.title}`, progress: 0 },
      { id: taskId2, agent: 'Examiner', label: `题库抽组: ${step.title}`, progress: 0 },
    ];

    set({ tasks: [...newTasks, ...tasks] });

    // Simulate progress
    const interval = setInterval(() => {
      const currentTasks = get().tasks;
      let allDone = true;

      const updatedTasks = currentTasks.map(t => {
        if (t.id === taskId1 || t.id === taskId2) {
          const newProgress = Math.min(100, t.progress + Math.floor(Math.random() * 12) + 6); // Add 6-17% per tick
          if (newProgress < 100) allDone = false;
          return { ...t, progress: newProgress };
        }
        return t;
      });

      set({ tasks: updatedTasks });

      if (allDone) {
        clearInterval(interval);
        get().unlockStep(stepId);
        set({ isGenerating: false });
      }
    }, 600);
  },

  updateTaskProgress: (taskId, progress) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, progress } : t)),
    })),

  unlockStep: (stepId) =>
    set((state) => ({
      steps: state.steps.map((s) =>
        s.id === stepId ? { ...s, state: 'active' } : s.state === 'active' ? { ...s, state: 'done' } : s
      ),
    })),
}));
