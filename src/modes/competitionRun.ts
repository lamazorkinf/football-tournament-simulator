import type { Competition, EliminacionSpec, EntrantsSource } from './types';
import { createLeagueState } from '../core/formats/league';
import {
  advanceBracket,
  createBracket,
  nextPowerOfTwo,
  standardPlan,
  type Bracket,
  type BracketPlan,
  type SeedStrategy,
} from '../core/formats/bracket';
import { crossDivisionSlots } from '../core/formats/bracketSeed';
import { fifa32Slots, WORLD_CUP_PLAN } from '../core/formats/fifaPlan';
import {
  drawGroupStage,
  groupStageQualifiers,
  isGroupStageComplete,
  type GroupStageState,
} from '../core/formats/groupStage';
import type {
  GroupsKnockoutState,
  ModeTournament,
  ModeTournamentState,
} from '../core/formats/modeTournament';
import type { MatchHistoryStage } from '../core/formats/rounds';
import type { Team } from '../types';

/**
 * De una competición del descriptor a su estado inicial jugable.
 *
 * Acá se cierra el círculo de la unificación: los tres formatos canónicos se
 * arman desde DATOS —el `Competition` que sale de `modes.config`— y no desde
 * código propio de cada modo. Sumar un modo es escribir competiciones; el motor
 * de temporada ya sabe correrlas.
 */

export interface SeasonContext {
  /** Composición de las divisiones del año en curso. */
  divisions: Record<string, string[]>;
  /** Composición del año ANTERIOR, para los sorteos con `usePreviousYear`. */
  previousDivisions?: Record<string, string[]> | null;
  /** Todos los equipos del pool del modo, de mejor a peor si el orden importa. */
  allTeamIds: string[];
  /** Torneos ya corriendo en la temporada, indexados por id de competición. */
  runs?: Record<string, ModeTournament>;
  /** Para desempatar tablas con criterios que miran al equipo (opcional). */
  teams?: Team[];
  rng?: () => number;
}

// ---------------------------------------------------------------------------
// Participantes
// ---------------------------------------------------------------------------

/** Las dos divisiones de un cruce, con la composición del año que corresponda. */
function crossDivisionPair(
  source: Extract<EntrantsSource, { from: 'cross-divisions' }>,
  ctx: SeasonContext,
): [string[], string[]] | null {
  const [first, second] = source.divisions;
  // Con `usePreviousYear` manda la composición del año anterior: así los
  // ascensos y descensos recién aplicados no alteran el sorteo. Si todavía no
  // hay año anterior (primera temporada del modo), se usa la del año en curso.
  const previous = source.usePreviousYear ? ctx.previousDivisions : null;
  const pool = previous?.[first] && previous?.[second] ? previous : ctx.divisions;
  const a = pool[first];
  const b = pool[second];
  return a && b ? [a, b] : null;
}

/** Clasificados de otra competición de la misma temporada. */
function fromCompetition(
  source: Extract<EntrantsSource, { from: 'competition' }>,
  ctx: SeasonContext,
): string[] | null {
  const run = ctx.runs?.[source.competitionId];
  if (!run) return null;

  if (source.take === 'champion-runner-up') {
    const bracket =
      run.format === 'eliminacion'
        ? run.state
        : run.format === 'grupos-eliminacion'
          ? run.state.bracket
          : null;
    if (!bracket?.championId || !bracket.runnerUpId) return null;
    return [bracket.championId, bracket.runnerUpId];
  }

  if (run.format !== 'grupos-eliminacion') return null;
  if (!isGroupStageComplete(run.state.groups)) return null;
  const { qualified, bestRunnersUp } = groupStageQualifiers(run.state.groups, ctx.teams);
  return [...qualified, ...bestRunnersUp];
}

/**
 * Los participantes de una competición, o `null` si todavía no se pueden
 * resolver (la competición de la que dependen no terminó).
 */
export function competitionEntrants(c: Competition, ctx: SeasonContext): string[] | null {
  const source = c.entrants;
  switch (source.from) {
    case 'division':
      return ctx.divisions[source.division] ?? null;
    case 'all-teams':
      return ctx.allTeamIds.length > 0 ? [...ctx.allTeamIds] : null;
    case 'cross-divisions': {
      const pair = crossDivisionPair(source, ctx);
      return pair ? [...pair[0], ...pair[1]] : null;
    }
    case 'competition':
      return fromCompetition(source, ctx);
  }
}

// ---------------------------------------------------------------------------
// Cuadros
// ---------------------------------------------------------------------------

function planFor(spec: EliminacionSpec, size: number): BracketPlan {
  if (spec.plan === 'fifa-32') return WORLD_CUP_PLAN;
  return standardPlan(size, { thirdPlace: spec.thirdPlace, byeJoin: spec.byeJoin });
}

/**
 * Arma un cuadro con la siembra que pide el descriptor. Las siembras genéricas
 * son estrategias de la primitiva; las propias de un modo (el cruce entre
 * divisiones, los clasificados del Mundial) producen un orden de slots explícito.
 */
function buildBracket(input: {
  spec: EliminacionSpec;
  entrants: string[];
  stage: string;
  idPrefix: string;
  ctx: SeasonContext;
  /** Clasificados por grupo, cuando el cuadro sigue a una fase de grupos. */
  perGroup?: string[][];
  crossPair?: [string[], string[]] | null;
}): Bracket | null {
  const { spec, stage, idPrefix, ctx } = input;

  let entrants = input.entrants;
  let seed: SeedStrategy;

  switch (spec.seed) {
    case 'cross-division': {
      if (!input.crossPair) return null;
      entrants = crossDivisionSlots(input.crossPair[0], input.crossPair[1], ctx.rng);
      seed = { kind: 'explicit' };
      break;
    }
    case 'group-standings': {
      if (spec.plan === 'fifa-32') {
        if (!input.perGroup) return null;
        entrants = fifa32Slots(input.perGroup);
      }
      // Con plan estándar los clasificados ya vienen en orden de siembra desde
      // `groupStageQualifiers` (todos los 1ºs, después los 2ºs).
      seed = { kind: 'explicit' };
      break;
    }
    case 'random':
      seed = { kind: 'random', ...(ctx.rng ? { rng: ctx.rng } : {}) };
      break;
    case 'by-skill':
      seed = { kind: 'seeded' };
      break;
  }

  const size = spec.plan === 'fifa-32' ? 32 : nextPowerOfTwo(Math.max(2, entrants.length));
  return createBracket({
    entrants,
    legs: spec.legs,
    neutral: spec.neutral,
    stage,
    idPrefix,
    plan: planFor(spec, size),
    seed,
  });
}

// ---------------------------------------------------------------------------
// Estado inicial de una competición
// ---------------------------------------------------------------------------

/** Prefijo de ids de una competición: sus partidos y cruces cuelgan de acá. */
export function competitionIdPrefix(c: Competition): string {
  return c.id;
}

/**
 * Estado inicial de una competición, listo para jugar. `null` si todavía no se
 * puede arrancar (le faltan participantes).
 */
export function createCompetitionState(
  c: Competition,
  ctx: SeasonContext,
): ModeTournamentState | null {
  const entrants = competitionEntrants(c, ctx);
  if (!entrants || entrants.length < 2) return null;
  const idPrefix = competitionIdPrefix(c);

  if (c.format === 'liga') {
    return createLeagueState(entrants, c.legs, idPrefix);
  }

  if (c.format === 'grupos-eliminacion') {
    const groups: GroupStageState = drawGroupStage(
      entrants,
      {
        groupCount: c.groups.count,
        groupSize: c.groups.size,
        legs: c.groups.legs,
        qualifiersPerGroup: c.qualify.perGroup,
        bestRunnersUp: c.qualify.bestRunnersUp,
        stage: c.stage,
        ...(c.groups.fixtureTemplate ? { fixtureTemplate: c.groups.fixtureTemplate } : {}),
      },
      c.draw.pots
        ? {
            kind: 'pots',
            ...(ctx.rng ? { rng: ctx.rng } : {}),
            ...(c.draw.snake ? { snake: true } : {}),
            ...(c.draw.avoidSameRegion ? { avoidSameRegion: true } : {}),
          }
        : { kind: 'explicit', groups: chunk(entrants, c.groups.size) },
      idPrefix,
    );
    const state: GroupsKnockoutState = { groups, bracket: null };
    return state;
  }

  const crossPair =
    c.entrants.from === 'cross-divisions' ? crossDivisionPair(c.entrants, ctx) : null;
  return buildBracket({ spec: c, entrants, stage: c.stage, idPrefix, ctx, crossPair });
}

/**
 * Sortea el cuadro de una competición de grupos + eliminación cuando la fase de
 * grupos ya terminó. Devuelve el estado intacto si todavía no corresponde, si el
 * formato no tiene cuadro propio, o si ya se sorteó.
 */
export function drawKnockoutFromGroups(
  c: Competition,
  state: GroupsKnockoutState,
  ctx: SeasonContext,
): GroupsKnockoutState {
  if (c.format !== 'grupos-eliminacion' || !c.knockout || state.bracket) return state;
  if (!isGroupStageComplete(state.groups)) return state;

  const { perGroup, qualified, bestRunnersUp } = groupStageQualifiers(state.groups, ctx.teams);
  const bracket = buildBracket({
    spec: c.knockout,
    entrants: [...qualified, ...bestRunnersUp],
    // Los partidos del cuadro llevan su propia etapa: `<stage>` describe los
    // grupos y no puede pesar lo mismo en el Elo que una eliminación.
    stage: knockoutStageFor(c.stage),
    idPrefix: `${c.id}-ko`,
    ctx,
    perGroup,
  });
  return bracket ? { ...state, bracket } : state;
}

/**
 * Etapa de los partidos del cuadro que sigue a una fase de grupos. Las del ciclo
 * mundialista tienen su par declarado en `match_history`; para cualquier otra, el
 * cuadro es una eliminación y pesa como una copa.
 */
export function knockoutStageFor(groupStage: MatchHistoryStage): MatchHistoryStage {
  if (groupStage === 'world-cup-group') return 'world-cup-knockout';
  if (groupStage === 'confed-group') return 'confed-knockout';
  return 'cup';
}

/** Parte un array en trozos de `size`. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Reexport por comodidad: el store avanza los cuadros que arma este módulo. */
export { advanceBracket };
