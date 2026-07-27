import type { ContinentalBracket, KnockoutMatch, Region, Team } from '../types';
import {
  advanceBracket,
  createBracket,
  seedSlots as bracketSeedSlots,
  standardPlan,
  type Bracket,
  type BracketPlan,
  type BracketRound,
} from './formats/bracket';
import { knockoutMatchesToTies, tiesToKnockoutMatches } from './formats/knockoutCompat';

/**
 * Torneos continentales. Desde la unificación de formatos esto es un ADAPTADOR
 * fino sobre la primitiva única de eliminación (core/formats/bracket.ts):
 * conserva todas sus firmas para no tocar core/cycle.ts ni el store, pero la
 * estructura del cuadro (siembra, byes, avance de ronda, 3er puesto) la resuelve
 * la primitiva.
 *
 * El cuadro continental tiene dos particularidades que el plan describe como
 * datos y no como código: los byes entran a R32 por RE-SIEMBRA
 * (`byeJoin: 'reseed'`: byes + ganadores recolocados por seedSlots) y la primera
 * ronda se sortea por bombos (el bombo alto de local contra el bajo barajado).
 */

/**
 * Byes directos a R32 en un torneo continental de `teamCount` equipos.
 * Fórmula (spec §3): los que juegan R64 son `2·(teamCount − 32)`, así que
 * `byes = teamCount − 2·(teamCount − 32) = 64 − teamCount`.
 * 55 → 9, 45 → 19, 64 → 0. Requiere 32 ≤ teamCount ≤ 64 (si no, no se puede
 * formar un R32 de 32 equipos).
 */
export function getContinentalByeCount(teamCount: number): number {
  if (teamCount < 32 || teamCount > 64) {
    throw new Error(
      `getContinentalByeCount: teamCount debe estar en [32,64], recibió ${teamCount}`,
    );
  }
  return 64 - teamCount;
}

/** Cantidad de cruces reales en R64 = `teamCount − 32` (spec §3). */
export function getContinentalRoundOf64Count(teamCount: number): number {
  if (teamCount < 32 || teamCount > 64) {
    throw new Error(
      `getContinentalRoundOf64Count: teamCount debe estar en [32,64], recibió ${teamCount}`,
    );
  }
  return teamCount - 32;
}

/**
 * Orden de siembra estándar de un cuadro de `size` slots.
 * Vive en core/formats/bracket.ts; se reexporta acá porque era el hogar
 * histórico de esta función y varios tests la importan desde este módulo.
 */
export const seedSlots = bracketSeedSlots;

/** El plan del cuadro continental: 64 slots, 3er puesto, jornadas 1-6, byes por re-siembra. */
const CONTINENTAL_PLAN: BracketPlan = standardPlan(64, {
  thirdPlace: true,
  firstMatchday: 1,
  byeJoin: 'reseed',
});

/** Proyección a KnockoutMatch: el continental sí estampa jornada y posición. */
const AS_KNOCKOUT = { includeMatchday: true, stage: 'continental' } as const;

/**
 * Sorteo de un torneo continental. Los mejores `byeCount` por skill reciben bye
 * directo a R32; el resto se cruza en R64 con siembra por bombos: el bombo alto
 * (mejores) hace de local contra un rival barajado del bombo bajo.
 */
export function generateContinentalBracket(
  region: Region,
  teams: Team[],
): ContinentalBracket {
  const sorted = [...teams].sort((a, b) => b.skill - a.skill);
  const byeCount = getContinentalByeCount(sorted.length);

  const bracket = createBracket({
    entrants: sorted.map((t) => t.id),
    legs: 1,
    neutral: true,
    stage: 'continental',
    idPrefix: `cont-${region}`,
    plan: CONTINENTAL_PLAN,
    seed: { kind: 'pots' },
    byeCount,
  });

  return {
    region,
    roundOf64: tiesToKnockoutMatches(bracket.rounds[0].ties, AS_KNOCKOUT),
    roundOf32: [],
    roundOf16: [],
    quarterFinals: [],
    semiFinals: [],
    final: null,
    thirdPlace: null,
    byeTeamIds: bracket.byeTeamIds,
  };
}

/**
 * Rehidrata un cuadro de la primitiva a partir de una ronda ya jugada, para
 * poder pedirle la siguiente. El estado del ciclo se guarda como arrays de
 * KnockoutMatch (esquema normalizado), así que cada avance parte de ahí.
 */
function bracketFromRound(
  ties: KnockoutMatch[],
  roundIndex: number,
  byeTeamIds: string[] = [],
): Bracket {
  // La ronda tiene que quedar en SU índice real dentro del plan: `advanceBracket`
  // deduce cuál es la siguiente por posición, y también usa "estoy en la ronda 0"
  // para saber si toca meter los byes. Las rondas previas se rellenan vacías —
  // sólo se inspecciona la última.
  const rounds: BracketRound[] = CONTINENTAL_PLAN.rounds.slice(0, roundIndex).map((r) => ({
    round: r.round,
    ties: [],
  }));
  rounds.push({
    round: CONTINENTAL_PLAN.rounds[roundIndex].round,
    ties: knockoutMatchesToTies(ties),
  });

  return {
    id: 'cont',
    plan: CONTINENTAL_PLAN,
    legs: 1,
    neutral: true,
    stage: 'continental',
    idPrefix: 'cont',
    rounds,
    thirdPlaceTie: null,
    byeTeamIds,
  };
}

/**
 * Avanza una ronda del cuadro y devuelve la siguiente ya proyectada.
 * `roundIndex` es la posición de la ronda de ENTRADA dentro del plan.
 */
function advanceFrom(
  ties: KnockoutMatch[],
  roundIndex: number,
  byeTeamIds: string[] = [],
): KnockoutMatch[] {
  const advanced = advanceBracket(bracketFromRound(ties, roundIndex, byeTeamIds));
  const next = advanced.rounds[roundIndex + 1];
  return next ? tiesToKnockoutMatches(next.ties, AS_KNOCKOUT) : [];
}

/**
 * Forma la R32 a partir de los byes (semillas altas) y los ganadores de R64.
 * Ocupantes = byes ++ ganadores (32 en total); se colocan por `seedSlots(32)` y
 * se emparejan slots consecutivos. Si no hay exactamente 32 ocupantes con id
 * (p.ej. faltan `winnerId`), devuelve `[]` sin generar.
 */
export function generateContinentalRoundOf32(bracket: ContinentalBracket): KnockoutMatch[] {
  const resolved = bracket.roundOf64.filter((m) => m.winnerId);
  if (resolved.length !== bracket.roundOf64.length) return [];
  return advanceFrom(bracket.roundOf64, 0, bracket.byeTeamIds);
}

export function generateContinentalRoundOf16(roundOf32: KnockoutMatch[]): KnockoutMatch[] {
  return advanceFrom(roundOf32, 1);
}

export function generateContinentalQuarterFinals(roundOf16: KnockoutMatch[]): KnockoutMatch[] {
  return advanceFrom(roundOf16, 2);
}

export function generateContinentalSemiFinals(quarterFinals: KnockoutMatch[]): KnockoutMatch[] {
  return advanceFrom(quarterFinals, 3);
}

export function generateContinentalFinal(semiFinals: KnockoutMatch[]): KnockoutMatch | null {
  return advanceFrom(semiFinals, 4)[0] ?? null;
}

/**
 * Partido por el 3er puesto: empareja los perdedores de las 2 semifinales
 * (ordenadas por `position`). Jornada 6 (misma que la final). Devuelve null si
 * falta algún perdedor (semis no jugadas).
 */
export function generateContinentalThirdPlace(semiFinals: KnockoutMatch[]): KnockoutMatch | null {
  const advanced = advanceBracket(bracketFromRound(semiFinals, 4));
  return advanced.thirdPlaceTie
    ? tiesToKnockoutMatches([advanced.thirdPlaceTie], AS_KNOCKOUT)[0]
    : null;
}
