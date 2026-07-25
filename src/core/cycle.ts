import type {
  CalendarState,
  ConfederationsCup,
  ContinentalBracket,
  ContinentalStage,
  Cycle,
  KnockoutMatch,
  Match,
  Region,
  Team,
  Tournament,
  WorldCup,
  WorldCupGroup,
} from '../types';
import type { EnergyState } from './energy';
import {
  generateContinentalBracket,
  generateContinentalRoundOf32,
  generateContinentalRoundOf16,
  generateContinentalQuarterFinals,
  generateContinentalSemiFinals,
  generateContinentalFinal,
  generateContinentalThirdPlace,
} from './continental';
import {
  generateConfederationsGroups,
  generateConfederationsSemiFinals,
  generateConfederationsFinal,
  generateConfederationsThirdPlace,
  type ConfederationFinalists,
} from './confederations';
import { updateStandings, sortStandings, initializeStandings } from './scheduler';
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
    thirdPlace: null,
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

/** El estado del ciclo que un Cycle agrega sobre Tournament, serializable a JSONB. */
export interface CycleStatePayload {
  continental: ContinentalStage;
  confederationsCup: ConfederationsCup;
  calendar: CalendarState;
  /**
   * Snapshot completo del Mundial (grupos + eliminatoria + campeón). Se guarda
   * en el MISMO documento JSONB que el resto del ciclo para que la persistencia
   * sea ATÓMICA: o se guarda todo el estado o nada. Antes el Mundial vivía sólo
   * en filas normalizadas escritas partido a partido en try/catch silenciosos;
   * si una fallaba, la base quedaba con "campeón sí, pero faltan partidos de la
   * llave" (el bug del 88% + "Completado"). Opcional para no romper la carga de
   * documentos legacy escritos antes de incluir este campo: ahí se cae al
   * `worldCup` de `base` (reconstruido de las filas normalizadas).
   */
  worldCup?: WorldCup | null;
  /** Ausente en documentos previos a la feature de energía. */
  energy?: EnergyState;
}

/** Extrae el estado del ciclo (para persistir como documento JSONB). */
export function serializeCycleState(cycle: Cycle): CycleStatePayload {
  return {
    continental: cycle.continental,
    confederationsCup: cycle.confederationsCup,
    calendar: cycle.calendar,
    worldCup: cycle.worldCup ?? null,
    energy: cycle.energy,
  };
}

/**
 * Calendario de un torneo legacy (sin cycle_state persistido): salta a la fase
 * Mundial que corresponde por su progreso real. NUNCA 'continental' — de otro
 * modo el wizard ofrecería "Sortear Continental" a un torneo con Mundial jugado.
 */
export function deriveLegacyCalendar(base: Tournament): CalendarState {
  if (base.worldCup?.champion) return { phase: 'completed', matchday: 0 };
  if (base.worldCup) return { phase: 'wc-groups', matchday: 1 };
  return { phase: 'wc-qualifiers', matchday: 1 };
}

/**
 * Reconstruye un Cycle desde el Tournament base + el cycle_state cargado de la
 * DB. Si `state` es null (torneo legacy, previo al ciclo), las fases continental
 * y de confederaciones se marcan completas/vacías y el calendario salta a la
 * fase Mundial correspondiente.
 */
export function reconstructCycle(base: Tournament, state: CycleStatePayload | null): Cycle {
  if (state) {
    // worldCup autoritativo desde el documento JSONB si el snapshot lo incluye
    // (escrito por esta versión). Los documentos legacy no traen la clave → se
    // conserva el worldCup de `base` (reconstruido de las filas normalizadas),
    // preservando el comportamiento previo sin regresiones.
    const worldCup = 'worldCup' in state ? state.worldCup ?? null : base.worldCup;
    return {
      ...base,
      worldCup,
      continental: state.continental,
      confederationsCup: state.confederationsCup,
      calendar: state.calendar,
      energy: state.energy,
    };
  }
  return {
    ...base,
    continental: { ...createEmptyContinentalStage(), isComplete: true },
    confederationsCup: { ...createEmptyConfederationsCup(), isComplete: true },
    calendar: deriveLegacyCalendar(base),
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
      thirdPlace:
        b.thirdPlace && b.thirdPlace.id === matchId
          ? applyResultTo([b.thirdPlace], matchId, result)[0]
          : b.thirdPlace,
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
    else if (md === 5) brackets[r] = { ...b, final: generateContinentalFinal(b.semiFinals), thirdPlace: generateContinentalThirdPlace(b.semiFinals) };
    else if (md === 6) brackets[r] = { ...b, championId: b.final?.winnerId, runnerUpId: b.final?.loserId, thirdPlaceId: b.thirdPlace?.winnerId };
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

/** Resultado de un partido de grupo (sin winner explícito: lo dan los goles). */
export interface GroupResult {
  homeScore: number;
  awayScore: number;
}

/**
 * Arma los 4 finalistas (campeón + subcampeón) desde los brackets continentales.
 * Lanza si algún bracket no coronó finalistas (precondición: continental completo).
 */
export function assembleConfederationFinalists(cycle: Cycle): ConfederationFinalists[] {
  return CYCLE_REGIONS.map((region) => {
    const b = cycle.continental.brackets[region];
    if (!b.championId || !b.runnerUpId) {
      throw new Error(`assembleConfederationFinalists: la confederación ${region} no tiene finalistas`);
    }
    return { region, championId: b.championId, runnerUpId: b.runnerUpId };
  });
}

/** Sortea los 2 grupos de la Copa Confederaciones y arranca el calendario en md1. */
export function drawConfederationsStage(cycle: Cycle, teams: Team[]): Cycle {
  const finalists = assembleConfederationFinalists(cycle);
  const groups = generateConfederationsGroups(finalists, teams);
  return {
    ...cycle,
    confederationsCup: {
      ...cycle.confederationsCup,
      groups,
      knockout: { semiFinals: [], thirdPlace: null, final: null },
      isComplete: false,
    },
    calendar: { phase: 'confed', matchday: 1 },
  };
}

/** Recalcula standings de un grupo desde cero con sus partidos jugados. */
function recomputeGroupStandings(group: WorldCupGroup, teams: Team[]): WorldCupGroup {
  const fresh = initializeStandings(group.teamIds);
  const played = group.matches.filter((m) => m.isPlayed);
  const standings = played.reduce((acc, m) => updateStandings(acc, m), fresh);
  return { ...group, standings: sortStandings(standings, teams, group.matches) };
}

/** Aplica un marcador a un partido de grupo (por id) dentro de una lista. */
function applyGroupResult(matches: Match[], matchId: string, result: GroupResult): Match[] {
  return matches.map((m) =>
    m.id === matchId
      ? { ...m, homeScore: result.homeScore, awayScore: result.awayScore, isPlayed: true }
      : m,
  );
}

function advanceConfedAfterGroups(cycle: Cycle, teams: Team[]): Cycle {
  const md = cycle.calendar.matchday; // 1..3
  if (md < 3) {
    return { ...cycle, calendar: getNextCalendarState(cycle) };
  }
  // md3 completa → generar semifinales, avanzar a md4.
  const semiFinals = generateConfederationsSemiFinals(cycle.confederationsCup.groups, teams);
  const withSemis: Cycle = {
    ...cycle,
    confederationsCup: {
      ...cycle.confederationsCup,
      knockout: { ...cycle.confederationsCup.knockout, semiFinals },
    },
  };
  return { ...withSemis, calendar: getNextCalendarState(withSemis) };
}

/** Registra un partido de grupo confed + recálculo de standings + auto-avance. */
export function recordConfedGroupMatch(
  cycle: Cycle,
  matchId: string,
  result: GroupResult,
  teams: Team[],
): Cycle {
  const groups = cycle.confederationsCup.groups.map((g) => {
    if (!g.matches.some((m) => m.id === matchId)) return g;
    const withResult: WorldCupGroup = { ...g, matches: applyGroupResult(g.matches, matchId, result) };
    return recomputeGroupStandings(withResult, teams);
  });
  const updated: Cycle = {
    ...cycle,
    confederationsCup: { ...cycle.confederationsCup, groups },
  };
  if (updated.calendar.phase !== 'confed') return updated;
  return isCurrentMatchdayComplete(updated) ? advanceConfedAfterGroups(updated, teams) : updated;
}

/** Aplica un `KnockoutResult` a un `KnockoutMatch | null` (por id). */
function applyKoResult(match: KnockoutMatch | null, matchId: string, result: KnockoutResult): KnockoutMatch | null {
  if (!match || match.id !== matchId) return match;
  return applyResultTo([match], matchId, result)[0];
}

function advanceConfedAfterKnockout(cycle: Cycle): Cycle {
  const md = cycle.calendar.matchday; // 4 (semis) o 5 (final+3er)
  const ko = cycle.confederationsCup.knockout;
  if (md === 4) {
    // Semis completas → generar final + 3er puesto, avanzar a md5.
    const final = generateConfederationsFinal(ko.semiFinals);
    const thirdPlace = generateConfederationsThirdPlace(ko.semiFinals);
    const withFinals: Cycle = {
      ...cycle,
      confederationsCup: { ...cycle.confederationsCup, knockout: { ...ko, final, thirdPlace } },
    };
    return { ...withFinals, calendar: getNextCalendarState(withFinals) };
  }
  // md5 completa → coronar campeón. Boundary: NO auto-avanzar de fase.
  return {
    ...cycle,
    confederationsCup: {
      ...cycle.confederationsCup,
      championId: ko.final?.winnerId,
      isComplete: true,
    },
  };
}

/** Registra un partido de knockout confed (semi/final/3er) + auto-avance. */
export function recordConfedKnockoutMatch(
  cycle: Cycle,
  matchId: string,
  result: KnockoutResult,
): Cycle {
  const ko = cycle.confederationsCup.knockout;
  const updated: Cycle = {
    ...cycle,
    confederationsCup: {
      ...cycle.confederationsCup,
      knockout: {
        semiFinals: applyResultTo(ko.semiFinals, matchId, result),
        final: applyKoResult(ko.final, matchId, result),
        thirdPlace: applyKoResult(ko.thirdPlace, matchId, result),
      },
    },
  };
  if (updated.calendar.phase !== 'confed') return updated;
  return isCurrentMatchdayComplete(updated) ? advanceConfedAfterKnockout(updated) : updated;
}
