import type { Cycle } from '../types';
import { getPhaseMatches } from '../core/calendar';

export interface PhaseProgress {
  playedMatches: number;
  totalMatches: number;
  percentage: number;
  isComplete: boolean;
}

function phaseProgress(cycle: Cycle, phase: 'continental' | 'confed', isComplete: boolean): PhaseProgress {
  const matches = getPhaseMatches(cycle, phase);
  const total = matches.length;
  const played = matches.filter((m) => m.isPlayed).length;
  return {
    playedMatches: played,
    totalMatches: total,
    percentage: total > 0 ? Math.round((played / total) * 100) : 0,
    isComplete,
  };
}

export function getContinentalProgress(cycle: Cycle): PhaseProgress {
  return phaseProgress(cycle, 'continental', cycle.continental.isComplete);
}

export function getConfederationsProgress(cycle: Cycle): PhaseProgress {
  return phaseProgress(cycle, 'confed', cycle.confederationsCup.isComplete);
}

/** ¿Ya se sortearon los brackets continentales? (algún bracket tiene R64). */
export function isContinentalDrawn(cycle: Cycle): boolean {
  return Object.values(cycle.continental.brackets).some((b) => b.roundOf64.length > 0);
}

/** ¿Ya se sortearon los grupos de la Copa Confederaciones? */
export function isConfederationsDrawn(cycle: Cycle): boolean {
  return cycle.confederationsCup.groups.length > 0;
}

export function canDrawContinental(cycle: Cycle): boolean {
  return cycle.calendar.phase === 'continental' && !isContinentalDrawn(cycle);
}

export function canDrawConfederations(cycle: Cycle): boolean {
  return cycle.continental.isComplete && !isConfederationsDrawn(cycle);
}

export function canAdvanceToQualifiers(cycle: Cycle): boolean {
  return cycle.confederationsCup.isComplete && cycle.calendar.phase !== 'wc-qualifiers';
}

export function canDrawQualifiers(cycle: Cycle): boolean {
  return (
    cycle.calendar.phase === 'wc-qualifiers' &&
    !getPhaseMatches(cycle, 'wc-qualifiers').some((m) => m.isPlayed)
  );
}

const CONTINENTAL_ROUND: Record<number, string> = {
  1: 'R64', 2: 'R32', 3: 'R16', 4: 'Cuartos', 5: 'Semis', 6: 'Final',
};
export function continentalRoundLabel(matchday: number): string {
  return CONTINENTAL_ROUND[matchday] ?? '—';
}

const CONFED_ROUND: Record<number, string> = {
  1: 'Grupos J1', 2: 'Grupos J2', 3: 'Grupos J3', 4: 'Semifinales', 5: 'Final + 3º',
};
export function confedRoundLabel(matchday: number): string {
  return CONFED_ROUND[matchday] ?? '—';
}

export interface CyclePhaseBanner {
  label: string;
  targetView: 'continental' | 'confederations';
}

/** Banner de "fase activa" para el Match Center; null si no es fase de ciclo. */
export function getCyclePhaseBanner(cycle: Cycle): CyclePhaseBanner | null {
  if (cycle.calendar.phase === 'continental') {
    return {
      label: `Torneos Continentales · ${continentalRoundLabel(cycle.calendar.matchday)}`,
      targetView: 'continental',
    };
  }
  if (cycle.calendar.phase === 'confed') {
    return {
      label: `Copa Confederaciones · ${confedRoundLabel(cycle.calendar.matchday)}`,
      targetView: 'confederations',
    };
  }
  return null;
}
