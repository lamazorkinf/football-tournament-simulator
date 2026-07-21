import type {
  CalendarState,
  ConfederationsCup,
  ContinentalBracket,
  ContinentalStage,
  Cycle,
  KnockoutMatch,
  Region,
  Team,
  Tournament,
} from '../types';
import {
  generateContinentalBracket,
  generateContinentalRoundOf32,
  generateContinentalRoundOf16,
  generateContinentalQuarterFinals,
  generateContinentalSemiFinals,
  generateContinentalFinal,
} from './continental';
import { isCurrentMatchdayComplete, getNextCalendarState } from './calendar';

/** Las 4 confederaciones, en orden fijo. Export para uso interno de las tareas 2-3. */
export const CYCLE_REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

/** Calendario inicial: fase continental, jornada 0 = todavía sin sortear. */
export function createInitialCalendar(): CalendarState {
  return { phase: 'continental', matchday: 0 };
}

function emptyBracket(region: Region): ContinentalBracket {
  return {
    region,
    roundOf64: [],
    roundOf32: [],
    roundOf16: [],
    quarterFinals: [],
    semiFinals: [],
    final: null,
    byeTeamIds: [],
  };
}

/** Etapa continental vacía: 4 brackets sin sortear. */
export function createEmptyContinentalStage(): ContinentalStage {
  return {
    brackets: {
      Europe: emptyBracket('Europe'),
      America: emptyBracket('America'),
      Africa: emptyBracket('Africa'),
      Asia: emptyBracket('Asia'),
    },
    isComplete: false,
  };
}

/** Copa Confederaciones vacía: sin grupos ni knockout. */
export function createEmptyConfederationsCup(): ConfederationsCup {
  return {
    groups: [],
    knockout: { semiFinals: [], thirdPlace: null, final: null },
    championId: undefined,
    isComplete: false,
  };
}

/** Envuelve un `Tournament` en un `Cycle` con las fases previas vacías. */
export function toCycle(base: Tournament): Cycle {
  return {
    ...base,
    continental: createEmptyContinentalStage(),
    confederationsCup: createEmptyConfederationsCup(),
    calendar: createInitialCalendar(),
  };
}

/**
 * Backfill defensivo: garantiza que un objeto (posiblemente legacy, sin campos
 * de ciclo) tenga `continental`/`confederationsCup`/`calendar`. No pisa los que
 * ya están presentes. Se usa al rehidratar/cargar torneos.
 */
export function ensureCycleFields(t: Tournament | Cycle): Cycle {
  const c = t as Partial<Cycle>;
  return {
    ...(t as Cycle),
    continental: c.continental ?? createEmptyContinentalStage(),
    confederationsCup: c.confederationsCup ?? createEmptyConfederationsCup(),
    calendar: c.calendar ?? createInitialCalendar(),
  };
}

/** Resultado ya resuelto de un cruce de eliminación directa. */
export interface KnockoutResult {
  homeScore: number;
  awayScore: number;
  winnerId: string;
  loserId: string;
  penalties?: { homeScore: number; awayScore: number };
}

/** Sortea los 4 brackets continentales y arranca el calendario en md1 (R64). */
export function drawContinentalStage(
  cycle: Cycle,
  teamsByRegion: Record<Region, Team[]>,
): Cycle {
  const brackets = {
    Europe: generateContinentalBracket('Europe', teamsByRegion.Europe),
    America: generateContinentalBracket('America', teamsByRegion.America),
    Africa: generateContinentalBracket('Africa', teamsByRegion.Africa),
    Asia: generateContinentalBracket('Asia', teamsByRegion.Asia),
  };
  return {
    ...cycle,
    continental: { brackets, isComplete: false },
    calendar: { phase: 'continental', matchday: 1 },
  };
}

/** Aplica `result` al match `matchId` dentro de un array de knockout. */
function applyResultTo(matches: KnockoutMatch[], matchId: string, result: KnockoutResult): KnockoutMatch[] {
  return matches.map((m) =>
    m.id === matchId
      ? {
          ...m,
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          isPlayed: true,
          winnerId: result.winnerId,
          loserId: result.loserId,
          penalties: result.penalties,
        }
      : m,
  );
}

/** Reemplaza el match (por id) en el bracket continental que lo contenga. */
function replaceContinentalMatch(cycle: Cycle, matchId: string, result: KnockoutResult): Cycle {
  const brackets = { ...cycle.continental.brackets };
  for (const r of CYCLE_REGIONS) {
    const b = brackets[r];
    brackets[r] = {
      ...b,
      roundOf64: applyResultTo(b.roundOf64, matchId, result),
      roundOf32: applyResultTo(b.roundOf32, matchId, result),
      roundOf16: applyResultTo(b.roundOf16, matchId, result),
      quarterFinals: applyResultTo(b.quarterFinals, matchId, result),
      semiFinals: applyResultTo(b.semiFinals, matchId, result),
      final:
        b.final && b.final.id === matchId
          ? applyResultTo([b.final], matchId, result)[0]
          : b.final,
    };
  }
  return { ...cycle, continental: { ...cycle.continental, brackets } };
}

/**
 * Genera la ronda siguiente de los 4 brackets según la jornada recién
 * completada, o corona finalistas si fue la final. Devuelve el cycle avanzado.
 */
function advanceContinental(cycle: Cycle): Cycle {
  const md = cycle.calendar.matchday; // jornada recién completada (1..6)
  const brackets = { ...cycle.continental.brackets };
  for (const r of CYCLE_REGIONS) {
    const b = brackets[r];
    if (md === 1) brackets[r] = { ...b, roundOf32: generateContinentalRoundOf32(b) };
    else if (md === 2) brackets[r] = { ...b, roundOf16: generateContinentalRoundOf16(b.roundOf32) };
    else if (md === 3) brackets[r] = { ...b, quarterFinals: generateContinentalQuarterFinals(b.roundOf16) };
    else if (md === 4) brackets[r] = { ...b, semiFinals: generateContinentalSemiFinals(b.quarterFinals) };
    else if (md === 5) brackets[r] = { ...b, final: generateContinentalFinal(b.semiFinals) };
    else if (md === 6) brackets[r] = { ...b, championId: b.final?.winnerId, runnerUpId: b.final?.loserId };
  }
  const continental: ContinentalStage = { brackets, isComplete: md === 6 };
  const next: Cycle = { ...cycle, continental };
  // md6 = final: boundary. No auto-avanzar de fase (espera sorteo de confed).
  if (md === 6) return next;
  return { ...next, calendar: getNextCalendarState(next) };
}

/**
 * Registra el resultado de un cruce continental. Si con esto queda completa la
 * jornada global, genera la ronda siguiente en los 4 brackets y avanza el
 * calendario (auto-avance intra-fase). Función pura.
 */
export function recordContinentalMatch(cycle: Cycle, matchId: string, result: KnockoutResult): Cycle {
  const updated = replaceContinentalMatch(cycle, matchId, result);
  if (updated.calendar.phase !== 'continental') return updated;
  return isCurrentMatchdayComplete(updated) ? advanceContinental(updated) : updated;
}
