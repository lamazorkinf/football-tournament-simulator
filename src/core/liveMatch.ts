export type LiveSide = 'home' | 'away';

export interface LiveGoalEvent {
  minute: number; // 1..90
  side: LiveSide;
  homeScore: number; // marcador acumulado tras este gol
  awayScore: number;
}

export interface LivePenaltiesResult {
  homeScore: number;
  awayScore: number;
}

export interface LiveTimeline {
  goals: LiveGoalEvent[]; // ordenados ascendente por minuto
  finalHomeScore: number;
  finalAwayScore: number;
  penalties?: LivePenaltiesResult;
}

/** Hash FNV-1a determinista de un string a uint32, para sembrar el PRNG. */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** PRNG mulberry32 sembrado: puro y determinista. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Reparte `homeScore`+`awayScore` goles en minutos plausibles [1,90] y arma el
 * timeline con el marcador acumulado. Determinista dado (marcador, seed).
 * `rng` inyectable para tests. No recalcula nada del resultado.
 */
export function buildMatchTimeline(
  homeScore: number,
  awayScore: number,
  seed: number,
  penalties?: LivePenaltiesResult,
  rng: () => number = mulberry32(seed),
): LiveTimeline {
  const pending: { minute: number; side: LiveSide }[] = [];
  for (let i = 0; i < homeScore; i++) pending.push({ minute: 1 + Math.floor(rng() * 90), side: 'home' });
  for (let i = 0; i < awayScore; i++) pending.push({ minute: 1 + Math.floor(rng() * 90), side: 'away' });
  // Array.prototype.sort es estable (ES2019+): a igual minuto, se conserva el
  // orden de encolado (locales antes que visitantes).
  pending.sort((a, b) => a.minute - b.minute);

  let h = 0;
  let a = 0;
  const goals: LiveGoalEvent[] = pending.map((p) => {
    if (p.side === 'home') h++;
    else a++;
    return { minute: p.minute, side: p.side, homeScore: h, awayScore: a };
  });

  return { goals, finalHomeScore: homeScore, finalAwayScore: awayScore, penalties };
}

export interface LiveScoreAt {
  homeScore: number;
  awayScore: number;
  /** Minuto del último gol revelado; null si todavía no hubo goles. */
  lastGoalMinute: number | null;
}

/**
 * Marcador acumulado de un timeline a un minuto dado. Derivación pura para
 * que N tarjetas compartan un único reloj sin estado propio por partido.
 */
export function scoreAtMinute(timeline: LiveTimeline, minute: number): LiveScoreAt {
  let last: LiveGoalEvent | undefined;
  for (const goal of timeline.goals) {
    if (goal.minute > minute) break;
    last = goal;
  }
  return last
    ? { homeScore: last.homeScore, awayScore: last.awayScore, lastGoalMinute: last.minute }
    : { homeScore: 0, awayScore: 0, lastGoalMinute: null };
}
