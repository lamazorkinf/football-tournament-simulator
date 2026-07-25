import { create } from 'zustand';
import { queueSettingsSave } from '../lib/persistSettings';
import { DEFAULT_FATIGUE, ENERGY_MAX, type FatigueConfig } from '../core/energy';

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
  fatigue: FatigueConfig;
}

interface ConfigStore {
  config: EngineConfig;
  updateKFactor: (value: number) => void;
  updateEloDivisor: (value: number) => void;
  updateHomeAdvantage: (value: number) => void;
  updateSkillLimits: (min: number, max: number) => void;
  updateImportance: (key: ImportanceKey, value: number) => void;
  updateFatigue: (patch: Partial<FatigueConfig>) => void;
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
  fatigue: DEFAULT_FATIGUE,
};

/**
 * Sanea los campos de fatiga que se pueden mover desde Ajustes (Task 9),
 * un único lugar para las dos vías por las que `fatigue` cambia:
 * `updateFatigue` (sliders, que ya emiten valores dentro de rango) y
 * `applySettings` (hidratación desde la DB, que copia lo que haya guardado
 * sin ninguna garantía — un registro corrupto o escrito por una versión con
 * otros límites entra tal cual si nadie lo valida acá).
 *
 * `energyMin` en particular no puede llegar o superar `ENERGY_MAX`: eso deja
 * a `EnergyMeter` en un estado ARIA inválido (`aria-valuemin` por encima de
 * `aria-valuemax`, que está fijo en `ENERGY_MAX`) y a `commitEnergy`
 * (`core/energy.ts`) clampeando la energía guardada por encima de 100.
 *
 * Se completa con `DEFAULT_FATIGUE` ANTES de clampear porque el saneo de
 * arriba sólo toca `energyMin`/`clutchGain`/`recovery`: si un `fatigue`
 * guardado llegara con otra sub-clave ausente (`extraTimeShare`, por
 * ejemplo, que no tiene su propio clamp), quedaría `undefined` sin que nada
 * lo note. El motor no lanza en ese caso: `generateGoals(NaN)` da
 * `Math.exp(-NaN)` (`NaN`) y el `do/while` de la generación de goles corta
 * en la primera vuelta, así que el partido termina en 0 goles en silencio.
 * Hoy es inalcanzable porque `updateFatigue`/`resetToDefaults` siempre
 * escriben el objeto entero, pero un `applySettings` con un registro viejo
 * o corrupto de la DB es la vía por la que sí podría pasar.
 */
function sanitizeFatigue(fatigue: FatigueConfig): FatigueConfig {
  const merged = { ...DEFAULT_FATIGUE, ...fatigue };

  const energyMin = Number.isFinite(merged.energyMin)
    ? Math.max(0, Math.min(ENERGY_MAX - 1, merged.energyMin))
    : DEFAULT_FATIGUE.energyMin;

  const clutchGain = Number.isFinite(merged.clutchGain)
    ? Math.max(0, Math.min(2, merged.clutchGain))
    : DEFAULT_FATIGUE.clutchGain;

  const recovery = Number.isFinite(merged.recovery)
    ? Math.max(0, Math.min(50, merged.recovery))
    : DEFAULT_FATIGUE.recovery;

  return { ...merged, energyMin, clutchGain, recovery };
}

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

  updateFatigue: (patch: Partial<FatigueConfig>) =>
    set((state) => {
      const fatigue = sanitizeFatigue({ ...state.config.fatigue, ...patch });
      const config = { ...state.config, fatigue };
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
  // vuelta sería un round-trip inútil. Un engineConfig guardado por una
  // versión anterior de la app puede no traer `fatigue`: sin este relleno
  // quedaría `undefined` y el motor explotaría en tiempo de ejecución.
  // `sanitizeFatigue` sanea lo que venga (ver su comentario): es la vía por
  // la que un valor corrupto o fuera de rango entraría sin que ningún slider
  // lo haya tocado.
  applySettings: ({ engineConfig, scanlines }) =>
    set((state) => ({
      config: engineConfig
        ? { ...engineConfig, fatigue: sanitizeFatigue(engineConfig.fatigue ?? DEFAULT_FATIGUE) }
        : state.config,
      scanlines: scanlines ?? state.scanlines,
    })),
}));

// Non-reactive getter for use in engine.ts
export const getEngineConfig = (): EngineConfig => {
  return useConfigStore.getState().config;
};
