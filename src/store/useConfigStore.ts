import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface EngineConfig {
  kFactor: number;
  homeAdvantage: number;
  skillMin: number;
  skillMax: number;
}

interface ConfigStore {
  config: EngineConfig;
  updateKFactor: (value: number) => void;
  updateHomeAdvantage: (value: number) => void;
  updateSkillLimits: (min: number, max: number) => void;
  resetToDefaults: () => void;
}

const DEFAULT_CONFIG: EngineConfig = {
  kFactor: 5,
  homeAdvantage: 3,
  skillMin: 30,
  skillMax: 100,
};

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set) => ({
      config: DEFAULT_CONFIG,

      updateKFactor: (value: number) =>
        set((state) => ({
          config: { ...state.config, kFactor: Math.max(1, Math.min(50, value)) },
        })),

      updateHomeAdvantage: (value: number) =>
        set((state) => ({
          config: { ...state.config, homeAdvantage: Math.max(0, Math.min(10, value)) },
        })),

      updateSkillLimits: (min: number, max: number) =>
        set((state) => ({
          config: {
            ...state.config,
            skillMin: Math.max(0, Math.min(min, 99)),
            skillMax: Math.min(100, Math.max(max, 1)),
          },
        })),

      resetToDefaults: () => set({ config: DEFAULT_CONFIG }),
    }),
    {
      name: 'football-engine-config',
      version: 1,
    }
  )
);

// Non-reactive getter for use in engine.ts
export const getEngineConfig = (): EngineConfig => {
  return useConfigStore.getState().config;
};
