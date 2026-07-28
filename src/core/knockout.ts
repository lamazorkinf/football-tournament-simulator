import type { KnockoutMatch, KnockoutBracket, WorldCupGroup, Team } from '../types';
import { sortStandings } from './scheduler';
import {
  advanceBracket,
  createBracket,
  type Bracket,
  type BracketRound,
} from './formats/bracket';
import { R32_SLOT_ORDER, WORLD_CUP_PLAN } from './formats/fifaPlan';
import { knockoutMatchesToTies, tiesToKnockoutMatches } from './formats/knockoutCompat';

/**
 * Cuadro del Mundial. Desde la unificación de formatos esto es un ADAPTADOR
 * sobre la primitiva única de eliminación (core/formats/bracket.ts): conserva
 * todas sus firmas para no tocar core/cycle.ts ni el store.
 *
 * Lo que hace especial a este cuadro —y la razón por la que la primitiva
 * necesita planes de cruce explícitos— es que sus rondas NO son adyacencia.
 * Cada posición `i` de R32 y la `i+8` salen de los MISMOS dos grupos (p. ej.
 * p0 = A1 vs B2 y p8 = B1 vs A2), así que no pueden emparejarse entre sí: sería
 * una revancha de grupo en octavos. El plan las manda a mitades opuestas del
 * cuadro y, combinado con los cruces de cuartos, dos equipos del mismo grupo
 * sólo pueden reencontrarse en la final.
 *
 * Además `position` se persiste en matches_new: renumerar corrompería los
 * torneos en curso al cargarlos.
 */

/** El Mundial no estampa jornada; sí posición, salvo donde nunca la tuvo. */
const AS_KNOCKOUT = { stage: 'world-cup-knockout' } as const;

/**
 * Generates the Round of 32 bracket from World Cup group results (16 groups)
 * FIFA standard format adapted for 64 teams:
 * - Winners of groups play runners-up from different groups
 * - Teams from same group can't meet until later rounds
 */
export function generateRoundOf32(groups: WorldCupGroup[], teams?: Team[]): KnockoutMatch[] {
  // El cuadro está construido sobre 16 grupos exactos; con menos, los accesos
  // por índice de abajo darían undefined y romperían la generación.
  if (groups.length !== 16) {
    console.warn(
      `⚠️ generateRoundOf32 requiere 16 grupos, recibió ${groups.length}. No se genera bracket.`
    );
    return [];
  }

  // Sort groups A-P (16 groups)
  const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name));

  const groupResults = sortedGroups.map((group) => {
    const sorted = sortStandings(group.standings, teams, group.matches);
    return { winner: sorted[0]?.teamId, runnerUp: sorted[1]?.teamId };
  });

  const slots = R32_SLOT_ORDER.map(([groupIndex, place]) => groupResults[groupIndex][place]);
  // Si falta algún clasificado no se arma el cuadro, igual que antes (los pares
  // incompletos simplemente no generaban partido).
  if (slots.some((id) => !id)) return [];

  const bracket = createBracket({
    entrants: slots as string[],
    legs: 1,
    neutral: true,
    stage: 'world-cup-knockout',
    idPrefix: 'wc',
    plan: WORLD_CUP_PLAN,
    seed: { kind: 'explicit' },
  });

  return tiesToKnockoutMatches(bracket.rounds[0].ties, AS_KNOCKOUT);
}

/** Rehidrata el cuadro con la ronda dada en SU índice real del plan. */
function bracketFromRound(ties: KnockoutMatch[], roundIndex: number): Bracket {
  const rounds: BracketRound[] = WORLD_CUP_PLAN.rounds.slice(0, roundIndex).map((r) => ({
    round: r.round,
    ties: [],
  }));
  rounds.push({
    round: WORLD_CUP_PLAN.rounds[roundIndex].round,
    ties: knockoutMatchesToTies(ties),
  });
  return {
    id: 'wc',
    plan: WORLD_CUP_PLAN,
    legs: 1,
    neutral: true,
    stage: 'world-cup-knockout',
    idPrefix: 'wc',
    rounds,
    thirdPlaceTie: null,
    byeTeamIds: [],
  };
}

function advanceFrom(ties: KnockoutMatch[], roundIndex: number): KnockoutMatch[] {
  const advanced = advanceBracket(bracketFromRound(ties, roundIndex));
  const next = advanced.rounds[roundIndex + 1];
  return next ? tiesToKnockoutMatches(next.ties, AS_KNOCKOUT) : [];
}

/**
 * Generates the Round of 16 bracket from Round of 32 results.
 * Dos equipos del mismo grupo no pueden cruzarse antes de la final.
 */
export function generateRoundOf16(roundOf32: KnockoutMatch[]): KnockoutMatch[] {
  return advanceFrom(roundOf32, 0);
}

/**
 * Generates quarter-final matches from Round of 16 results
 */
export function generateQuarterFinals(roundOf16: KnockoutMatch[]): KnockoutMatch[] {
  return advanceFrom(roundOf16, 1);
}

/**
 * Generates semi-final matches from quarter-final results
 */
export function generateSemiFinals(quarterFinals: KnockoutMatch[]): KnockoutMatch[] {
  return advanceFrom(quarterFinals, 2);
}

/**
 * Generates the third-place match from semi-final losers.
 * Sin `position`: la implementación previa no se la estampaba y ese dato se
 * persiste, así que omitirla mantiene idénticos los torneos ya guardados.
 */
export function generateThirdPlaceMatch(semiFinals: KnockoutMatch[]): KnockoutMatch | null {
  const advanced = advanceBracket(bracketFromRound(semiFinals, 3));
  return advanced.thirdPlaceTie
    ? tiesToKnockoutMatches([advanced.thirdPlaceTie], { ...AS_KNOCKOUT, includePosition: false })[0]
    : null;
}

/**
 * Generates the final match from semi-final winners.
 * Sin `position`, por el mismo motivo que el 3er puesto.
 */
export function generateFinal(semiFinals: KnockoutMatch[]): KnockoutMatch | null {
  const advanced = advanceBracket(bracketFromRound(semiFinals, 3));
  const finalRound = advanced.rounds[4];
  if (!finalRound || finalRound.ties.length === 0) return null;
  return tiesToKnockoutMatches(finalRound.ties, { ...AS_KNOCKOUT, includePosition: false })[0];
}

/**
 * Initialize empty knockout bracket
 */
export function initializeKnockoutBracket(): KnockoutBracket {
  return {
    roundOf32: [],
    roundOf16: [],
    quarterFinals: [],
    semiFinals: [],
    thirdPlace: null,
    final: null,
  };
}

/**
 * Check if all group stage matches are complete
 */
export function areGroupsComplete(groups: WorldCupGroup[]): boolean {
  return groups.every((group) => group.matches.every((match) => match.isPlayed));
}

/**
 * Check if a knockout round is complete
 */
export function isRoundComplete(matches: KnockoutMatch[]): boolean {
  return matches.length > 0 && matches.every((match) => match.isPlayed && match.winnerId);
}
