import { create } from 'zustand';
import type { Region } from '../types';
import type { LiveTimeline } from '../core/liveMatch';
import type { MatchResult } from './useMatchResultsStore';

/** Una tarjeta de la grilla en vivo: partido ya comprometido + su timeline. */
export interface LiveMatchdayEntry {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  timeline: LiveTimeline;
  /** Contexto para el badge de la tarjeta ('Grupo A', 'Semifinales'...). */
  groupName: string;
  region?: Region;
  isFavorite: boolean;
}

export interface LiveMatchdaySession {
  /** Título del overlay (ej: 'Jornada 7 — Clasificatorias'). */
  title: string;
  /** Los ≤12 partidos que se muestran en vivo. */
  entries: LiveMatchdayEntry[];
  /** Resumen completo de la jornada (incluye los simulados en segundo plano). */
  allResults: MatchResult[];
  /** Partidos simulados en segundo plano que no entraron a la grilla. */
  hiddenCount: number;
}

interface LiveMatchdayState {
  session: LiveMatchdaySession | null;
  openSession: (session: LiveMatchdaySession) => void;
  closeSession: () => void;
}

/**
 * Sesión de "jornada en vivo". Mismo patrón commit-then-replay que
 * useLiveMatchStore pero para toda la jornada: los resultados ya están
 * comprometidos cuando se abre la sesión; el overlay solo reproduce.
 */
export const useLiveMatchdayStore = create<LiveMatchdayState>((set) => ({
  session: null,
  openSession: (session) => set({ session }),
  closeSession: () => set({ session: null }),
}));
