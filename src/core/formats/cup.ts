import type { Match } from '../../types';

/**
 * Formato Copa a doble partido (ida y vuelta), sin ventaja de gol de visitante.
 * El global tras los dos partidos define; si queda empatado, prórroga y penales
 * (la prórroga se juega en la vuelta y sus goles ya vienen sumados en el
 * marcador de la vuelta; si aún hay empate global, deciden los penales).
 *
 * Este módulo maneja la ESTRUCTURA: sorteo con restricción, armado de rondas y
 * resolución del global. La simulación de cada partido (goles, prórroga,
 * penales) la hace el motor en la capa de store; acá sólo se decide el ganador
 * dados los resultados.
 */

export type CupRoundKey =
  | 'round-of-32'
  | 'round-of-16'
  | 'quarter'
  | 'semi'
  | 'final';

/** Un cruce a doble partido. `homeTeamId` juega la IDA de local y la VUELTA de visitante. */
export interface TwoLeggedTie {
  id: string;
  round: CupRoundKey;
  position: number; // posición en la llave (para armar la ronda siguiente)
  homeTeamId: string | null; // local de la ida (null = por definir)
  awayTeamId: string | null;
  leg1: Match | null; // ida, en cancha de homeTeamId
  leg2: Match | null; // vuelta, en cancha de awayTeamId
  winnerId?: string;
  loserId?: string;
  /** El cruce se definió en la prórroga (o fue a penales tras ella). */
  extraTime?: boolean;
  /** Penales, sólo si el global terminó empatado. Marcados desde homeTeamId. */
  penalties?: { homeScore: number; awayScore: number };
}

export interface CupState {
  /** Rondas en orden (R32 → final). Cada ronda es una lista de cruces por posición. */
  rounds: TwoLeggedTie[][];
  championId?: string;
  runnerUpId?: string;
}

const ROUND_ORDER: CupRoundKey[] = ['round-of-32', 'round-of-16', 'quarter', 'semi', 'final'];

/** Clave de ronda según cuántos cruces tiene (16 → R32, 8 → R16, ...). */
export function roundKeyForTieCount(tieCount: number): CupRoundKey {
  switch (tieCount) {
    case 16:
      return 'round-of-32';
    case 8:
      return 'round-of-16';
    case 4:
      return 'quarter';
    case 2:
      return 'semi';
    default:
      return 'final';
  }
}

export function nextRoundKey(round: CupRoundKey): CupRoundKey | null {
  const i = ROUND_ORDER.indexOf(round);
  return i >= 0 && i < ROUND_ORDER.length - 1 ? ROUND_ORDER[i + 1] : null;
}

/** Baraja una copia del array con Fisher-Yates. `rng` inyectable para tests. */
function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function emptyLegMatches(id: string, home: string, away: string): { leg1: Match; leg2: Match } {
  const base = {
    homeScore: null,
    awayScore: null,
    isPlayed: false,
    stage: 'cup' as const,
  };
  return {
    leg1: { id: `${id}-l1`, homeTeamId: home, awayTeamId: away, matchday: 1, ...base },
    // La vuelta invierte la localía.
    leg2: { id: `${id}-l2`, homeTeamId: away, awayTeamId: home, matchday: 2, ...base },
  };
}

function makeTie(round: CupRoundKey, position: number, home: string | null, away: string | null): TwoLeggedTie {
  const id = `cup-${round}-${position}`;
  const legs = home && away ? emptyLegMatches(id, home, away) : { leg1: null, leg2: null };
  return {
    id,
    round,
    position,
    homeTeamId: home,
    awayTeamId: away,
    leg1: legs.leg1,
    leg2: legs.leg2,
  };
}

/**
 * Sorteo de primera ronda con restricción: cada equipo del grupo A se cruza SÍ o
 * SÍ con uno del grupo B. Se barajan ambos grupos y se emparejan uno a uno; la
 * localía de la ida se decide al azar por cruce. Requiere |A| === |B|.
 */
export function drawCupFirstRound(
  divisionA: string[],
  divisionB: string[],
  rng: () => number = Math.random,
): TwoLeggedTie[] {
  if (divisionA.length !== divisionB.length) {
    throw new Error(
      `drawCupFirstRound requiere divisiones del mismo tamaño (A=${divisionA.length}, B=${divisionB.length})`,
    );
  }
  const shuffledA = shuffle(divisionA, rng);
  const shuffledB = shuffle(divisionB, rng);
  const round = roundKeyForTieCount(divisionA.length);

  return shuffledA.map((a, i) => {
    const b = shuffledB[i];
    // Localía de la ida al azar entre los dos.
    const homeIsA = rng() < 0.5;
    return makeTie(round, i, homeIsA ? a : b, homeIsA ? b : a);
  });
}

/**
 * Global de un cruce resuelto. `homeTeamId` = local de la ida.
 * agg local = goles de la ida (local) + goles de la vuelta (visitante).
 */
export function tieAggregate(tie: TwoLeggedTie): { home: number; away: number } | null {
  if (!tie.leg1?.isPlayed || !tie.leg2?.isPlayed) return null;
  if (tie.leg1.homeScore === null || tie.leg1.awayScore === null) return null;
  if (tie.leg2.homeScore === null || tie.leg2.awayScore === null) return null;
  // homeTeamId es local en leg1 y visitante en leg2.
  const home = tie.leg1.homeScore + tie.leg2.awayScore;
  const away = tie.leg1.awayScore + tie.leg2.homeScore;
  return { home, away };
}

/**
 * Resuelve el ganador del cruce a partir de los dos partidos ya jugados (sin gol
 * de visitante). Empate global → decide `penalties` (que deben venir cargados
 * tras la prórroga). Devuelve el mismo tie con winnerId/loserId set, o el tie
 * intacto si todavía no están los dos partidos.
 */
export function resolveTie(tie: TwoLeggedTie): TwoLeggedTie {
  const agg = tieAggregate(tie);
  if (!agg || !tie.homeTeamId || !tie.awayTeamId) return tie;

  let winnerId: string;
  let loserId: string;
  if (agg.home > agg.away) {
    winnerId = tie.homeTeamId;
    loserId = tie.awayTeamId;
  } else if (agg.away > agg.home) {
    winnerId = tie.awayTeamId;
    loserId = tie.homeTeamId;
  } else {
    // Empate global: deciden los penales (marcados desde homeTeamId).
    const p = tie.penalties;
    if (!p) return tie; // faltan los penales para definir
    if (p.homeScore === p.awayScore) return tie; // penales inválidos (deben tener ganador)
    const homeWinsPens = p.homeScore > p.awayScore;
    winnerId = homeWinsPens ? tie.homeTeamId : tie.awayTeamId;
    loserId = homeWinsPens ? tie.awayTeamId : tie.homeTeamId;
  }

  return { ...tie, winnerId, loserId };
}

/** ¿Están definidos todos los cruces de una ronda? */
export function isRoundResolved(ties: TwoLeggedTie[]): boolean {
  return ties.length > 0 && ties.every((t) => t.winnerId !== undefined);
}

/**
 * Arma la ronda siguiente emparejando ganadores consecutivos por posición
 * (0-1, 2-3, ...). El primer clasificado de cada par juega la ida de local.
 * Requiere que la ronda previa esté resuelta.
 */
export function generateNextCupRound(resolvedRound: TwoLeggedTie[]): TwoLeggedTie[] | null {
  if (!isRoundResolved(resolvedRound)) return null;
  const round = resolvedRound[0].round;
  const next = nextRoundKey(round);
  if (!next) return null; // era la final

  const winners = [...resolvedRound]
    .sort((a, b) => a.position - b.position)
    .map((t) => t.winnerId!);

  const ties: TwoLeggedTie[] = [];
  for (let i = 0; i < winners.length; i += 2) {
    ties.push(makeTie(next, i / 2, winners[i], winners[i + 1]));
  }
  return ties;
}
