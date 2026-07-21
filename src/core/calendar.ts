import type {
  Cycle,
  CyclePhase,
  ContinentalBracket,
  KnockoutBracket,
  Match,
} from '../types';

/** Orden fijo de fases del ciclo. `'completed'` es el estado terminal. */
export const CYCLE_PHASE_ORDER: CyclePhase[] = [
  'continental',
  'confed',
  'wc-qualifiers',
  'wc-groups',
  'wc-knockout',
  'completed',
];

function bracketMatches(b: ContinentalBracket): Match[] {
  return [
    ...b.roundOf64,
    ...b.roundOf32,
    ...b.roundOf16,
    ...b.quarterFinals,
    ...b.semiFinals,
    ...(b.final ? [b.final] : []),
  ];
}

function knockoutMatches(k: KnockoutBracket): Match[] {
  return [
    ...k.roundOf32,
    ...k.roundOf16,
    ...k.quarterFinals,
    ...k.semiFinals,
    ...(k.thirdPlace ? [k.thirdPlace] : []),
    ...(k.final ? [k.final] : []),
  ];
}

/** Todos los partidos que pertenecen a una fase del ciclo, aplanados. */
export function getPhaseMatches(cycle: Cycle, phase: CyclePhase): Match[] {
  switch (phase) {
    case 'continental':
      return Object.values(cycle.continental.brackets).flatMap(bracketMatches);
    case 'confed': {
      const c = cycle.confederationsCup;
      const groupMatches = c.groups.flatMap((g) => g.matches);
      const ko = [
        ...c.knockout.semiFinals,
        ...(c.knockout.thirdPlace ? [c.knockout.thirdPlace] : []),
        ...(c.knockout.final ? [c.knockout.final] : []),
      ];
      return [...groupMatches, ...ko];
    }
    case 'wc-qualifiers':
      return Object.values(cycle.qualifiers)
        .flat()
        .flatMap((g) => g.matches);
    case 'wc-groups':
      return cycle.worldCup ? cycle.worldCup.groups.flatMap((g) => g.matches) : [];
    case 'wc-knockout':
      return cycle.worldCup ? knockoutMatches(cycle.worldCup.knockout) : [];
    case 'completed':
      return [];
  }
}

/** Partidos de una jornada concreta dentro de una fase. */
export function getMatchdayMatches(
  cycle: Cycle,
  phase: CyclePhase,
  matchday: number,
): Match[] {
  return getPhaseMatches(cycle, phase).filter((m) => (m.matchday ?? 0) === matchday);
}

/** Partidos jugables ahora: fase y jornada actuales del calendario, sin jugar. */
export function getPlayableMatches(cycle: Cycle): Match[] {
  const { phase, matchday } = cycle.calendar;
  return getMatchdayMatches(cycle, phase, matchday).filter((m) => !m.isPlayed);
}

/** Un partido es jugable si está en la jornada actual y todavía no se jugó. */
export function isMatchPlayable(cycle: Cycle, matchId: string): boolean {
  const { phase, matchday } = cycle.calendar;
  return getMatchdayMatches(cycle, phase, matchday).some(
    (m) => m.id === matchId && !m.isPlayed,
  );
}

/** Cantidad de jornadas de una fase = mayor `matchday` presente (0 si vacía). */
export function getPhaseMatchdayCount(cycle: Cycle, phase: CyclePhase): number {
  const matchdays = getPhaseMatches(cycle, phase).map((m) => m.matchday ?? 0);
  return matchdays.length ? Math.max(...matchdays) : 0;
}

/** ¿Están jugados todos los partidos de la jornada actual? (false si no hay). */
export function isCurrentMatchdayComplete(cycle: Cycle): boolean {
  const { phase, matchday } = cycle.calendar;
  const matches = getMatchdayMatches(cycle, phase, matchday);
  return matches.length > 0 && matches.every((m) => m.isPlayed);
}
