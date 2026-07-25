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
  // Energía de ENTRADA de cada equipo, resuelta al simular (viaja desde
  // `MatchdayOutcome`). El partido ya está comprometido cuando se arma esta
  // sesión (commit-then-replay), así que `cycle.energy` ya tiene el valor
  // POSTERIOR al costo del partido — no sirve para mostrar "con cuánta
  // energía llegaron", que es lo que la tarjeta necesita mientras el partido
  // "se sigue jugando" en pantalla.
  homeEnergy: number;
  awayEnergy: number;
}

export interface LiveMatchdaySession {
  /** Título del overlay (ej: 'Jornada 7 — Clasificatorias'). */
  title: string;
  /** Los partidos que se muestran en vivo (hasta LIVE_MATCH_CAP). */
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
