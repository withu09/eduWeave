import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ThoughtLog {
  id: string;
  agent: string;
  message: string;
  timestamp: string;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface ConsoleState {
  thoughts: ThoughtLog[];
  agentStatuses: Record<string, string>;
  tokenUsage: Record<string, TokenUsage>;
  ragMetrics: {
    hitRate: number;
    latency: number;
  };
  addThought: (thought: ThoughtLog) => void;
  updateAgentStatus: (agent: string, status: string) => void;
  updateTokenUsage: (agent: string, tokens: Partial<TokenUsage>) => void;
  updateRagMetrics: (metrics: Partial<{ hitRate: number; latency: number }>) => void;
  clearConsole: () => void;
}

export const useConsoleStore = create<ConsoleState>()(
  persist(
    (set) => ({
      thoughts: [],
      agentStatuses: {},
      tokenUsage: {
        "Director": { prompt_tokens: 2100, completion_tokens: 2100, total_tokens: 4200 },
        "Profiler": { prompt_tokens: 3000, completion_tokens: 3100, total_tokens: 6100 },
        "Writer": { prompt_tokens: 6000, completion_tokens: 6800, total_tokens: 12800 },
        "Examiner": { prompt_tokens: 2000, completion_tokens: 3400, total_tokens: 5400 },
        "Coder": { prompt_tokens: 4000, completion_tokens: 3300, total_tokens: 7300 },
        "Media": { prompt_tokens: 5000, completion_tokens: 4600, total_tokens: 9600 },
      },
      ragMetrics: { hitRate: 0.85, latency: 1.2 },

      addThought: (thought) =>
        set((state) => ({
          thoughts: [...state.thoughts, thought],
        })),

      updateAgentStatus: (agent, status) =>
        set((state) => ({
          agentStatuses: { ...state.agentStatuses, [agent]: status },
        })),

      updateTokenUsage: (agent, tokens) =>
        set((state) => {
          const current = state.tokenUsage[agent] || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
          const newTokens = { ...current };
          if (tokens.prompt_tokens) newTokens.prompt_tokens += tokens.prompt_tokens;
          if (tokens.completion_tokens) newTokens.completion_tokens += tokens.completion_tokens;
          if (tokens.total_tokens) newTokens.total_tokens += tokens.total_tokens;
          else newTokens.total_tokens = newTokens.prompt_tokens + newTokens.completion_tokens;
          
          return {
            tokenUsage: {
              ...state.tokenUsage,
              [agent]: newTokens
            }
          };
        }),
        
      updateRagMetrics: (metrics) =>
        set((state) => ({
          ragMetrics: { ...state.ragMetrics, ...metrics },
        })),

      clearConsole: () =>
        set({
          thoughts: [],
          agentStatuses: {},
          tokenUsage: {},
          ragMetrics: { hitRate: 0, latency: 0 },
        }),
    }),
    {
      name: 'console-storage',
    }
  )
);
