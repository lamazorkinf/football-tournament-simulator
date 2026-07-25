export type LiveSide = 'home' | 'away';

export interface LiveGoalEvent {
  minute: number; // 1..90, o hasta 120 si el partido fue a alargue
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
  /** El reloj llega a 120 en vez de a 90. */
  hasExtraTime: boolean;
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

export interface BuildTimelineInput {
  homeScore: number;
  awayScore: number;
  seed: number;
  penalties?: LivePenaltiesResult;
  /** Goles marcados EN el alargue; ya incluidos en homeScore/awayScore. */
  extraTime?: { homeGoals: number; awayGoals: number };
  rng?: () => number;
}

/**
 * Reparte `homeScore`+`awayScore` goles en minutos plausibles: los de los 90
 * minutos en [1,90] y los del alargue (si los hay) en [91,120]. Arma el
 * timeline con el marcador acumulado. Determinista dado (marcador, seed).
 * `rng` inyectable para tests. No recalcula nada del resultado.
 */
export function buildMatchTimeline(input: BuildTimelineInput): LiveTimeline {
  const { homeScore, awayScore, seed, penalties, extraTime } = input;
  const rng = input.rng ?? mulberry32(seed);

  const etHome = extraTime?.homeGoals ?? 0;
  const etAway = extraTime?.awayGoals ?? 0;

  const pending: { minute: number; side: LiveSide }[] = [];
  const push = (count: number, side: LiveSide, from: number, span: number) => {
    for (let i = 0; i < count; i++) pending.push({ minute: from + Math.floor(rng() * span), side });
  };

  // Los goles de los 90 minutos son el total menos los del alargue.
  push(homeScore - etHome, 'home', 1, 90);
  push(awayScore - etAway, 'away', 1, 90);
  push(etHome, 'home', 91, 30);
  push(etAway, 'away', 91, 30);

  // Array.prototype.sort es estable (ES2019+): a igual minuto, se conserva el
  // orden de encolado (locales antes que visitantes; 90' antes que 91'+).
  pending.sort((a, b) => a.minute - b.minute);

  let h = 0;
  let a = 0;
  const goals: LiveGoalEvent[] = pending.map((p) => {
    if (p.side === 'home') h++;
    else a++;
    return { minute: p.minute, side: p.side, homeScore: h, awayScore: a };
  });

  return {
    goals,
    finalHomeScore: homeScore,
    finalAwayScore: awayScore,
    penalties,
    hasExtraTime: !!extraTime,
  };
}

export interface LiveScoreAt {
  homeScore: number;
  awayScore: number;
  /** Minuto del último gol revelado; null si todavía no hubo goles. */
  lastGoalMinute: number | null;
  /** Lado del último gol revelado; null si todavía no hubo goles. */
  lastGoalSide: LiveSide | null;
  /** Minutos (ascendentes) de los goles revelados de cada equipo. */
  homeGoalMinutes: number[];
  awayGoalMinutes: number[];
}

/**
 * Marcador acumulado de un timeline a un minuto dado, con los minutos de gol
 * separados por equipo (la tarjeta en vivo los muestra del lado que marcó).
 * Derivación pura para que N tarjetas compartan un único reloj sin estado
 * propio por partido.
 */
export function scoreAtMinute(timeline: LiveTimeline, minute: number): LiveScoreAt {
  let last: LiveGoalEvent | undefined;
  const homeGoalMinutes: number[] = [];
  const awayGoalMinutes: number[] = [];
  for (const goal of timeline.goals) {
    if (goal.minute > minute) break;
    last = goal;
    if (goal.side === 'home') homeGoalMinutes.push(goal.minute);
    else awayGoalMinutes.push(goal.minute);
  }
  return {
    homeScore: last?.homeScore ?? 0,
    awayScore: last?.awayScore ?? 0,
    lastGoalMinute: last?.minute ?? null,
    lastGoalSide: last?.side ?? null,
    homeGoalMinutes,
    awayGoalMinutes,
  };
}
