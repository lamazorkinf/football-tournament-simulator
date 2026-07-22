import { create } from 'zustand';

/** Tipo de partido (coincide con MatchStage del colector del Match Center). */
export type LiveMatchKind =
  | 'qualifier'
  | 'world-cup'
  | 'knockout'
  | 'continental'
  | 'confederations';

/** Lo que necesita el modal para simular y reproducir un partido. */
export interface LiveMatchDescriptor {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  kind: LiveMatchKind;
  groupId?: string; // requerido para kind 'qualifier' | 'world-cup'
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
