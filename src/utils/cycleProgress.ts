import type { Cycle, Region } from '../types';
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

const QUALIFIER_REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

/** ¿Ya se sortearon las clasificatorias? (algún grupo con partidos generados). */
export function isQualifiersDrawn(cycle: Cycle): boolean {
  return QUALIFIER_REGIONS.some((region) =>
    (cycle.qualifiers[region] ?? []).some((group) => group.matches.length > 0)
  );
}

/**
 * Estado del sorteo de clasificatorias, distinguiendo el caso "quedó a medias".
 *
 * El guardado escribe las cuatro regiones en paralelo, así que un fallo de red
 * puede dejar unas persistidas y otras no. Al recargar, la base vuelve a ser la
 * fuente de verdad y ese residuo aparece como grupos sin partidos (o como una
 * región entera sin grupos).
 */
export type QualifiersDrawStatus =
  | { state: 'not-drawn' }
  | { state: 'partial'; groupsMissing: number; totalGroups: number; regionsMissing: number }
  | { state: 'drawn' };

export function getQualifiersDrawStatus(cycle: Cycle): QualifiersDrawStatus {
  const groups = QUALIFIER_REGIONS.flatMap((region) => cycle.qualifiers[region] ?? []);
  const totalGroups = groups.length;
  // Un grupo está sano cuando el sorteo le asignó equipos Y le generó partidos.
  const healthy = groups.filter(
    (group) => group.teamIds.length > 0 && group.matches.length > 0
  ).length;
  const regionsMissing = QUALIFIER_REGIONS.filter(
    (region) => (cycle.qualifiers[region] ?? []).length === 0
  ).length;

  if (healthy === 0) return { state: 'not-drawn' };
  if (healthy === totalGroups && regionsMissing === 0) return { state: 'drawn' };
  return { state: 'partial', groupsMissing: totalGroups - healthy, totalGroups, regionsMissing };
}

export function canDrawContinental(cycle: Cycle): boolean {
  return cycle.calendar.phase === 'continental' && !isContinentalDrawn(cycle);
}

export function canDrawConfederations(cycle: Cycle): boolean {
  return (
    cycle.continental.isComplete &&
    !isConfederationsDrawn(cycle) &&
    !cycle.confederationsCup.isComplete
  );
}

export function canAdvanceToQualifiers(cycle: Cycle): boolean {
  return cycle.confederationsCup.isComplete && cycle.calendar.phase === 'confed';
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
