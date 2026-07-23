import { create } from 'zustand';
import { queueSettingsSave } from '../lib/persistSettings';

export type ImportanceKey =
  | 'qualifier'
  | 'continentalEarly'
  | 'continentalLate'
  | 'confedGroup'
  | 'confedKnockout'
  | 'wcGroup'
  | 'wcKnockout';

export interface EngineConfig {
  kFactor: number;
  eloDivisor: number;
  homeAdvantage: number;
  skillMin: number;
  skillMax: number;
  importanceByStage: Record<ImportanceKey, number>;
}

interface ConfigStore {
  config: EngineConfig;
  updateKFactor: (value: number) => void;
  updateEloDivisor: (value: number) => void;
  updateHomeAdvantage: (value: number) => void;
  updateSkillLimits: (min: number, max: number) => void;
  updateImportance: (key: ImportanceKey, value: number) => void;
  resetToDefaults: () => void;
  scanlines: boolean;
  toggleScanlines: () => void;
  /** Aplica las preferencias traídas de la DB (ver hydrateSettings). */
  applySettings: (settings: { engineConfig?: EngineConfig; scanlines?: boolean }) => void;
}

const DEFAULT_IMPORTANCE: Record<ImportanceKey, number> = {
  qualifier: 0.75,
  continentalEarly: 0.9,
  continentalLate: 1.2,
  confedGroup: 1.1,
  confedKnockout: 1.4,
  wcGroup: 1.25,
  wcKnockout: 1.6,
};

// kFactor 1.5 + eloDivisor 75: calibrados por simulación para que los
// rankings sigan siendo reconocibles tras 50 temporadas (el divisor 75
// hace que la expectativa Elo coincida con la probabilidad real de
// victoria del modelo de goles en la escala de skills 30-100)
export const DEFAULT_CONFIG: EngineConfig = {
  kFactor: 1.5,
  eloDivisor: 75,
  homeAdvantage: 3,
  skillMin: 30,
  skillMax: 100,
  importanceByStage: DEFAULT_IMPORTANCE,
};

/**
 * Config del motor + preferencias visuales. NO se persiste en localStorage: el
 * estado inicial son los defaults en memoria y la hidratación desde la DB lo
 * pisa al arrancar (ver lib/hydrateSettings). Mantener el estado en memoria es
 * lo que permite que `getEngineConfig()` siga siendo síncrono, cosa que el
 * motor necesita en el hot path de cada partido.
 */
export const useConfigStore = create<ConfigStore>()((set) => ({
  config: DEFAULT_CONFIG,

  updateKFactor: (value: number) =>
    set((state) => {
      const config = { ...state.config, kFactor: Math.max(0.5, Math.min(50, value)) };
      queueSettingsSave({ engineConfig: config });
      return { config };
    }),

  updateEloDivisor: (value: number) =>
    set((state) => {
      const config = { ...state.config, eloDivisor: Math.max(10, Math.min(400, value)) };
      queueSettingsSave({ engineConfig: config });
      return { config };
    }),

  updateHomeAdvantage: (value: number) =>
    set((state) => {
      const config = { ...state.config, homeAdvantage: Math.max(0, Math.min(10, value)) };
      queueSettingsSave({ engineConfig: config });
      return { config };
    }),

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

      const config = { ...state.config, skillMin, skillMax };
      queueSettingsSave({ engineConfig: config });
      return { config };
    }),

  updateImportance: (key: ImportanceKey, value: number) =>
    set((state) => {
      const safe = Number.isFinite(value)
        ? Math.max(0, Math.min(5, value))
        : state.config.importanceByStage[key];
      const config = {
        ...state.config,
        importanceByStage: { ...state.config.importanceByStage, [key]: safe },
      };
      queueSettingsSave({ engineConfig: config });
      return { config };
    }),

  resetToDefaults: () => {
    queueSettingsSave({ engineConfig: DEFAULT_CONFIG });
    set({ config: DEFAULT_CONFIG });
  },

  scanlines: true,

  toggleScanlines: () =>
    set((state) => {
      const scanlines = !state.scanlines;
      queueSettingsSave({ scanlines });
      return { scanlines };
    }),

  // Escritura directa sin re-guardar: los valores vienen de la DB, mandarlos de
  // vuelta sería un round-trip inútil.
  applySettings: ({ engineConfig, scanlines }) =>
    set((state) => ({
      config: engineConfig ?? state.config,
      scanlines: scanlines ?? state.scanlines,
    })),
}));

// Non-reactive getter for use in engine.ts
export const getEngineConfig = (): EngineConfig => {
  return useConfigStore.getState().config;
};
