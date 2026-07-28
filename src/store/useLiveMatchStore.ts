import { create } from 'zustand';

/**
 * Tipo de partido: las etapas del ciclo mundialista (coinciden con el
 * MatchStage del colector del Match Center) más `season`, que cubre cualquier
 * partido de un modo de temporada (liga, grupos o cuadro).
 */
export type LiveMatchKind =
  | 'qualifier'
  | 'world-cup'
  | 'knockout'
  | 'continental'
  | 'confederations'
  | 'season';

/** Lo que necesita el modal para simular y reproducir un partido. */
export interface LiveMatchDescriptor {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  kind: LiveMatchKind;
  groupId?: string; // requerido para kind 'qualifier' | 'world-cup'
  tournamentId?: string; // requerido para kind 'season'
}

interface LiveMatchState {
  activeMatch: LiveMatchDescriptor | null;
  openLiveMatch: (descriptor: LiveMatchDescriptor) => void;
  closeLiveMatch: () => void;
}

export const useLiveMatchStore = create<LiveMatchState>((set) => ({
  activeMatch: null,
  openLiveMatch: (descriptor) => set({ activeMatch: descriptor }),
  closeLiveMatch: () => set({ activeMatch: null }),
}));
