import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface EngineConfig {
  kFactor: number;
  eloDivisor: number;
  homeAdvantage: number;
  skillMin: number;
  skillMax: number;
}

interface ConfigStore {
  config: EngineConfig;
  updateKFactor: (value: number) => void;
  updateEloDivisor: (value: number) => void;
  updateHomeAdvantage: (value: number) => void;
  updateSkillLimits: (min: number, max: number) => void;
  resetToDefaults: () => void;
  scanlines: boolean;
  toggleScanlines: () => void;
}

// kFactor 1.5 + eloDivisor 75: calibrados por simulación para que los
// rankings sigan siendo reconocibles tras 50 temporadas (el divisor 75
// hace que la expectativa Elo coincida con la probabilidad real de
// victoria del modelo de goles en la escala de skills 30-100)
const DEFAULT_CONFIG: EngineConfig = {
  kFactor: 1.5,
  eloDivisor: 75,
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
          config: { ...state.config, kFactor: Math.max(0.5, Math.min(50, value)) },
        })),

      updateEloDivisor: (value: number) =>
        set((state) => ({
          config: { ...state.config, eloDivisor: Math.max(10, Math.min(400, value)) },
        })),

      updateHomeAdvantage: (value: number) =>
        set((state) => ({
          config: { ...state.config, homeAdvantage: Math.max(0, Math.min(10, value)) },
        })),

      // Los límites se clampeaban por separado y sin validar que min < max.
      // Borrar el campo "Máximo" en la UI producía Number('') === 0 y dejaba
      // skillMin 30 / skillMax 1: a partir de ahí updateTeamSkill devolvía
      // siempre 30 y los 210 equipos quedaban con el mismo skill. Además
      // persiste, así que el motor quedaba inutilizado tras recargar.
      updateSkillLimits: (min: number, max: number) =>
        set((state) => {
          const safeMin = Number.isFinite(min) ? min : state.config.skillMin;
          const safeMax = Number.isFinite(max) ? max : state.config.skillMax;

          const skillMin = Math.max(0, Math.min(safeMin, 99));
          const skillMax = Math.min(100, Math.max(safeMax, 1));

          // Un rango invertido rompe el motor: se descarta el cambio.
          if (skillMin >= skillMax) return state;

          return { config: { ...state.config, skillMin, skillMax } };
        }),

      resetToDefaults: () => set({ config: DEFAULT_CONFIG }),

      scanlines: true,

      toggleScanlines: () => set((state) => ({ scanlines: !state.scanlines })),
    }),
    {
      name: 'football-engine-config',
      version: 2,
      migrate: (persistedState, version) => {
        const state = persistedState as ConfigStore;
        if (version < 2) {
          // v2: nuevo motor Elo calibrado — resetear config a los nuevos defaults
          return { ...state, config: DEFAULT_CONFIG };
        }
        return state;
      },
    }
  )
);

// Non-reactive getter for use in engine.ts
export const getEngineConfig = (): EngineConfig => {
  return useConfigStore.getState().config;
};
