import type {
  CalendarState,
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

/**
 * Años previos al Mundial en que se juega cada fase del ciclo. El Mundial es el
 * año ancla (Y = `cycle.year`); las fases previas caen en años anteriores:
 * Eliminatorias en Y-1, Confederaciones en Y-2, Continental en Y-3. Así el
 * ciclo se organiza por año como en el calendario real de selecciones.
 */
const PHASE_YEAR_OFFSET: Record<CyclePhase, number> = {
  continental: 3,
  confed: 2,
  'wc-qualifiers': 1,
  'wc-groups': 0,
  'wc-knockout': 0,
  completed: 0,
};

/** Año en que se juega una fase, dado el año del Mundial (año ancla del ciclo). */
export function phaseYear(phase: CyclePhase, worldCupYear: number): number {
  return worldCupYear - PHASE_YEAR_OFFSET[phase];
}

function bracketMatches(b: ContinentalBracket): Match[] {
  return [
    ...b.roundOf64,
    ...b.roundOf32,
    ...b.roundOf16,
    ...b.quarterFinals,
    ...b.semiFinals,
    ...(b.final ? [b.final] : []),
    ...(b.thirdPlace ? [b.thirdPlace] : []),
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

/**
 * Próximo estado del calendario. Dentro de la fase avanza de jornada; al
 * completar la última jornada salta a la fase siguiente en jornada 1;
 * `'wc-knockout'` desemboca en `'completed'`. Función pura: no genera
 * partidos ni persiste (eso lo hace el store al ejecutar la transición).
 *
 * PRECONDICIÓN (load-bearing): asume que la jornada actual de la fase ya tiene
 * sus partidos generados. La "última jornada" se detecta como el mayor
 * `matchday` presente (`getPhaseMatchdayCount`), así que una fase SIN partidos
 * generados (count 0) se trata como YA COMPLETA y se saltea. Por eso el store
 * (Plan 5) debe: (1) generar los partidos de la ronda/jornada siguiente ANTES
 * de llamar a esta función, y (2) NUNCA invocarla sobre una fase recién
 * entrada pero todavía no sorteada/generada — si no, se saltearía la fase
 * entera (ej.: `confed` vacío devolvería directamente `wc-qualifiers`).
 */
export function getNextCalendarState(cycle: Cycle): CalendarState {
  const { phase, matchday } = cycle.calendar;
  if (phase === 'completed') return { phase, matchday };

  const count = getPhaseMatchdayCount(cycle, phase);
  if (matchday < count) return { phase, matchday: matchday + 1 };

  const nextPhase = CYCLE_PHASE_ORDER[CYCLE_PHASE_ORDER.indexOf(phase) + 1] ?? 'completed';
  return { phase: nextPhase, matchday: nextPhase === 'completed' ? 0 : 1 };
}
