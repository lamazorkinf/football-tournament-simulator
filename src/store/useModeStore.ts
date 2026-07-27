import { create } from 'zustand';
import type { GameMode, ModeKind } from '../types';
import { modesService } from '../services/modesService';
import { ACTIVE_MODE_STORAGE_KEY, SELECCIONES_MODE_ID } from '../constants/modes';

/**
 * Modo activo de la app. Un modo es una competición aislada (selecciones, Liga
 * Villamariense, etc.); cambiar de modo cambia el pool de equipos y los torneos
 * que ve el resto de la app. El id del modo activo se recuerda en localStorage
 * para reabrir el juego donde lo dejaste; la lista de modos vive en Supabase.
 *
 * El resto de los stores/servicios filtran por `activeModeId`. Este store NO
 * carga equipos ni torneos: sólo decide "en qué mundo estás".
 */

function readStoredModeId(): string {
  try {
    return localStorage.getItem(ACTIVE_MODE_STORAGE_KEY) ?? SELECCIONES_MODE_ID;
  } catch {
    return SELECCIONES_MODE_ID;
  }
}

function persistModeId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_MODE_STORAGE_KEY, id);
  } catch {
    // localStorage no disponible (SSR/privado): el modo vive sólo en memoria.
  }
}

interface ModeStore {
  modes: GameMode[];
  activeModeId: string;
  isLoaded: boolean;

  /** Modo activo resuelto, o null si todavía no se cargó la lista. */
  activeMode: () => GameMode | null;
  /** `kind` del modo activo; cae a 'national-cycle' hasta que carga la lista. */
  activeModeKind: () => ModeKind;

  loadModes: () => Promise<void>;
  selectMode: (id: string) => void;
  createMode: (mode: {
    id: string;
    name: string;
    kind: ModeKind;
    config?: Record<string, unknown>;
    currentYear?: number | null;
  }) => Promise<GameMode>;
}

export const useModeStore = create<ModeStore>((set, get) => ({
  modes: [],
  activeModeId: readStoredModeId(),
  isLoaded: false,

  activeMode: () => {
    const { modes, activeModeId } = get();
    return modes.find((m) => m.id === activeModeId) ?? null;
  },

  activeModeKind: () => get().activeMode()?.kind ?? 'national-cycle',

  loadModes: async () => {
    const modes = await modesService.getAllModes();
    set((state) => {
      // Si el modo recordado ya no existe (o la lista vino vacía), caer al modo
      // selecciones para no quedar apuntando a la nada.
      const stillValid = modes.some((m) => m.id === state.activeModeId);
      const activeModeId = stillValid ? state.activeModeId : SELECCIONES_MODE_ID;
      if (activeModeId !== state.activeModeId) persistModeId(activeModeId);
      return { modes, activeModeId, isLoaded: true };
    });
  },

  selectMode: (id) => {
    if (id === get().activeModeId) return;
    persistModeId(id);
    set({ activeModeId: id });
  },

  createMode: async (mode) => {
    const created = await modesService.createMode(mode);
    set((state) => ({ modes: [...state.modes, created] }));
    return created;
  },
}));
