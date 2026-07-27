import type { Match, Team, TeamStanding } from '../../types';
import { initializeStandings, sortStandings, updateStandings } from '../scheduler';
import {
  FIXTURE_TEMPLATE,
  WORLD_CUP_FIXTURE_TEMPLATE,
} from '../../constants/fixtureTemplate';
import { generateLeagueFixtures, type LeagueLegs } from './league';

/**
 * FASE DE GRUPOS — la primera mitad del formato "grupos + eliminación", y la
 * pieza que unifica los tres generadores de grupos que había: clasificatorias
 * (utils/drawSystem.ts, grupos de 5), Mundial (core/seeding.ts, grupos de 4) y
 * Copa Confederaciones (core/confederations.ts, grupos de 4).
 *
 * Reutiliza el motor de tabla existente (core/scheduler.ts) sin tocarlo:
 * `sortStandings` sigue siendo el único desempate del juego, con su tabla de
 * enfrentamientos directos.
 *
 * OJO CON LAS PLANTILLAS. Las clasificatorias reparten UN partido por fecha a lo
 * largo de 20 fechas (FIXTURE_TEMPLATE), mientras que el round-robin del método
 * del círculo daría 10 fechas de 2 partidos. Todo el calendario del ciclo está
 * indexado por `matchday`, así que cambiar el generador convertiría las
 * clasificatorias de 20 fechas en 10 — visible para el usuario. Por eso las
 * plantillas sobreviven como DATO que se le pasa a esta primitiva, y no se
 * reemplazan por el algoritmo.
 */

/** Letra de bombo. Hasta 5 bombos: los grupos del juego no pasan de 5 equipos. */
export type PotLetter = 'A' | 'B' | 'C' | 'D' | 'E';

const POT_LETTERS: PotLetter[] = ['A', 'B', 'C', 'D', 'E'];

export interface GroupStageConfig {
  groupCount: number;
  groupSize: number;
  legs: LeagueLegs;
  /** Cuántos clasifican por grupo (1º, 2º, …). */
  qualifiersPerGroup: number;
  /** Mejores segundos que clasifican además de los de arriba. 0 = ninguno. */
  bestRunnersUp: number;
  /** Se estampa en cada Match: define el peso Elo y viaja a match_history. */
  stage: string;
  /**
   * Plantilla de fixtures por letra de bombo. Si está, MANDA — incluida la
   * numeración de jornadas. Ausente ⇒ round-robin del método del círculo.
   */
  fixtureTemplate?: 'fifa-4' | 'fifa-5';
  /** Jornada de la primera fecha (sólo en el camino algorítmico). */
  firstMatchday?: number;
}

export interface GroupState {
  id: string;
  name: string;
  teamIds: string[];
  /** Bombo del que salió cada equipo. Necesario para aplicar la plantilla. */
  potLetters?: Record<string, PotLetter>;
  matches: Match[];
  standings: TeamStanding[];
}

export interface GroupStageState {
  config: GroupStageConfig;
  groups: GroupState[];
}

export type GroupSeedStrategy =
  | {
      kind: 'pots';
      rng?: () => number;
      /** Reparto en serpiente: el bombo impar recorre los grupos al revés. */
      snake?: boolean;
      /** Evitar dos equipos de la misma región en un grupo (sólo selecciones). */
      avoidSameRegion?: boolean;
      regionOf?: (teamId: string) => string | undefined;
    }
  /** El caller ya decidió la composición (p. ej. el reparto balanceado de confed). */
  | { kind: 'explicit'; groups: string[][] };

/**
 * Etiqueta de grupo: A-Z y luego AA, AB, … Misma regla que core/scheduler.ts
 * (String.fromCharCode(65 + i) sólo daba letras válidas hasta 26 grupos).
 */
export function groupLabel(index: number): string {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/** Baraja una copia del array con Fisher-Yates. No muta el original. */
function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

interface TemplateRow {
  matchday: number;
  home: string;
  away: string;
}

function templateRows(kind: 'fifa-4' | 'fifa-5'): TemplateRow[] {
  return kind === 'fifa-4'
    ? WORLD_CUP_FIXTURE_TEMPLATE.map((f) => ({ matchday: f.matchday, home: f.home, away: f.away }))
    : FIXTURE_TEMPLATE.map((f) => ({ matchday: f.matchday, home: f.home, away: f.away }));
}

/**
 * Fixtures de un grupo a partir de la plantilla y de los bombos.
 *
 * Si el grupo tiene menos equipos que letras (una región que no es múltiplo del
 * tamaño de grupo), las letras sobrantes no tienen equipo y esos cruces se
 * descartan: como la plantilla es el round-robin completo, quitar una letra
 * deja un round-robin válido entre los que quedan.
 */
export function generateGroupFixturesFromTemplate(
  potLetters: Record<string, PotLetter>,
  kind: 'fifa-4' | 'fifa-5',
  stage: string,
  idPrefix: string,
): Match[] {
  const letterToTeam = new Map<string, string>();
  for (const [teamId, letter] of Object.entries(potLetters)) {
    letterToTeam.set(letter, teamId);
  }

  return templateRows(kind)
    .filter((row) => letterToTeam.has(row.home) && letterToTeam.has(row.away))
    .map((row, i) => ({
      id: `${idPrefix}-${row.matchday}-${i}`,
      homeTeamId: letterToTeam.get(row.home)!,
      awayTeamId: letterToTeam.get(row.away)!,
      homeScore: null,
      awayScore: null,
      isPlayed: false,
      stage,
      matchday: row.matchday,
    }));
}

/** Fixtures de un grupo: por plantilla si la hay, si no round-robin algorítmico. */
function groupFixtures(
  teamIds: string[],
  potLetters: Record<string, PotLetter> | undefined,
  cfg: GroupStageConfig,
  idPrefix: string,
): Match[] {
  if (cfg.fixtureTemplate && potLetters) {
    return generateGroupFixturesFromTemplate(potLetters, cfg.fixtureTemplate, cfg.stage, idPrefix);
  }
  const base = generateLeagueFixtures(teamIds, cfg.legs, idPrefix);
  const offset = (cfg.firstMatchday ?? 1) - 1;
  return base.map((m) => ({
    ...m,
    stage: cfg.stage,
    matchday: (m.matchday ?? 1) + offset,
  }));
}

// ---------------------------------------------------------------------------
// Sorteo
// ---------------------------------------------------------------------------

/**
 * Reparte `entrants` (en orden de mérito) en bombos y de ahí a los grupos.
 *
 * Cada grupo recibe EXACTAMENTE un equipo por bombo: es una invariante dura,
 * porque la plantilla mapea una letra por equipo y dos equipos con la misma
 * letra dejarían a uno sin partidos. Por eso, cuando se pide diversidad
 * regional, se elige para cada grupo cuál de los equipos que quedan en el bombo
 * encaja mejor — nunca se mueve un equipo a otro grupo.
 */
function drawByPots(
  entrants: string[],
  cfg: GroupStageConfig,
  seed: Extract<GroupSeedStrategy, { kind: 'pots' }>,
): { teamIds: string[]; potLetters: Record<string, PotLetter> }[] {
  const { groupCount, groupSize } = cfg;
  const buckets = Array.from({ length: groupCount }, () => ({
    teamIds: [] as string[],
    potLetters: {} as Record<string, PotLetter>,
  }));

  const regionOf = seed.regionOf ?? (() => undefined);
  const conflicts = (bucketIndex: number, teamId: string): boolean => {
    if (!seed.avoidSameRegion) return false;
    const region = regionOf(teamId);
    if (region === undefined) return false;
    return buckets[bucketIndex].teamIds.some((id) => regionOf(id) === region);
  };

  for (let pot = 0; pot < groupSize; pot++) {
    const letter = POT_LETTERS[pot];
    const slice = entrants.slice(pot * groupCount, (pot + 1) * groupCount);
    const remaining = shuffle(slice, seed.rng);

    // Serpiente: el bombo impar recorre los grupos al revés.
    const order = Array.from({ length: groupCount }, (_, i) => i);
    if (seed.snake && pot % 2 === 1) order.reverse();

    for (const bucketIndex of order) {
      if (remaining.length === 0) break;
      // Preferir un equipo sin conflicto regional; si no queda ninguno, el primero.
      let pick = remaining.findIndex((id) => !conflicts(bucketIndex, id));
      if (pick === -1) pick = 0;
      const [teamId] = remaining.splice(pick, 1);
      buckets[bucketIndex].teamIds.push(teamId);
      buckets[bucketIndex].potLetters[teamId] = letter;
    }
  }

  return buckets;
}

/** Sortea la fase de grupos y genera sus fixtures. */
export function drawGroupStage(
  entrants: string[],
  cfg: GroupStageConfig,
  seed: GroupSeedStrategy,
  idPrefix = 'gs',
): GroupStageState {
  const buckets =
    seed.kind === 'explicit'
      ? seed.groups.map((teamIds) => ({
          teamIds,
          potLetters: Object.fromEntries(
            teamIds.map((id, i) => [id, POT_LETTERS[i] ?? POT_LETTERS[POT_LETTERS.length - 1]]),
          ) as Record<string, PotLetter>,
        }))
      : drawByPots(entrants, cfg, seed);

  const groups: GroupState[] = buckets.map((bucket, i) => {
    const name = `Group ${groupLabel(i)}`;
    const id = `${idPrefix}-${groupLabel(i)}`;
    return {
      id,
      name,
      teamIds: [...bucket.teamIds],
      potLetters: bucket.potLetters,
      matches: groupFixtures(bucket.teamIds, bucket.potLetters, cfg, id),
      standings: initializeStandings(bucket.teamIds),
    };
  });

  return { config: cfg, groups };
}

// ---------------------------------------------------------------------------
// Juego y lectura
// ---------------------------------------------------------------------------

/** Recalcula la tabla de un grupo desde cero (idempotente: no acumula). */
export function recalcGroupStandings(group: GroupState, teams?: Team[]): TeamStanding[] {
  let standings = initializeStandings(group.teamIds);
  for (const m of group.matches) {
    if (m.isPlayed && m.homeScore !== null && m.awayScore !== null) {
      standings = updateStandings(standings, m);
    }
  }
  return sortStandings(standings, teams, group.matches);
}

/** Carga el resultado de un partido y recalcula la tabla de su grupo. */
export function recordGroupStageMatch(
  state: GroupStageState,
  matchId: string,
  score: { homeScore: number; awayScore: number },
  teams?: Team[],
): GroupStageState {
  return {
    ...state,
    groups: state.groups.map((g) => {
      if (!g.matches.some((m) => m.id === matchId)) return g;
      const matches = g.matches.map((m) =>
        m.id === matchId
          ? { ...m, homeScore: score.homeScore, awayScore: score.awayScore, isPlayed: true }
          : m,
      );
      const updated = { ...g, matches };
      return { ...updated, standings: recalcGroupStandings(updated, teams) };
    }),
  };
}

export function groupStageMatches(state: GroupStageState): Match[] {
  return state.groups.flatMap((g) => g.matches);
}

export function isGroupStageComplete(state: GroupStageState): boolean {
  const all = groupStageMatches(state);
  return all.length > 0 && all.every((m) => m.isPlayed);
}

/**
 * Clasificados, en orden de siembra para el cuadro: primero todos los 1ºs (por
 * grupo), después los 2ºs, y al final los mejores segundos si el formato los usa.
 *
 * `bestRunnersUp` se calcula entre los equipos que quedaron en la posición
 * `qualifiersPerGroup + 1`: son de grupos distintos, así que no hay
 * enfrentamiento directo entre ellos y el desempate es sólo por criterios
 * generales (mismo criterio que core/scheduler.ts).
 */
export function groupStageQualifiers(
  state: GroupStageState,
  teams?: Team[],
): { perGroup: string[][]; qualified: string[]; bestRunnersUp: string[] } {
  const { qualifiersPerGroup, bestRunnersUp: bestCount } = state.config;

  const tables = state.groups.map((g) => recalcGroupStandings(g, teams));
  const perGroup = tables.map((t) => t.slice(0, qualifiersPerGroup).map((s) => s.teamId));

  // Ordenado por posición: todos los 1ºs, después todos los 2ºs, etc.
  const qualified: string[] = [];
  for (let pos = 0; pos < qualifiersPerGroup; pos++) {
    for (const group of perGroup) {
      if (group[pos]) qualified.push(group[pos]);
    }
  }

  let best: string[] = [];
  if (bestCount > 0) {
    const candidates = tables
      .map((t) => t[qualifiersPerGroup])
      .filter((s): s is TeamStanding => s !== undefined);
    // sortStandings sin partidos: sólo criterios generales (no hay head-to-head
    // posible entre equipos de grupos distintos).
    best = sortStandings(candidates, teams)
      .slice(0, bestCount)
      .map((s) => s.teamId);
  }

  return { perGroup, qualified: [...qualified, ...best], bestRunnersUp: best };
}
