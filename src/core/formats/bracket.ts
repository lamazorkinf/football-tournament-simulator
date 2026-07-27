import type { Match } from '../../types';
import { ROUND_ORDER, nextRoundKey, roundKeyForTieCount, type RoundKey } from './rounds';

/**
 * FORMATO ELIMINACIÓN — la primitiva única de cuadros del juego.
 *
 * Unifica las cuatro implementaciones que había: el cuadro del Mundial
 * (core/knockout.ts), los continentales (core/continental.ts), la llave de la
 * Copa Confederaciones (core/confederations.ts) y la copa a doble partido
 * (core/formats/cup.ts). Cubre también la segunda mitad del formato
 * "grupos + eliminación".
 *
 * La clave del diseño: esas cuatro NO comparten la regla de emparejamiento. El
 * Mundial usa tablas de cruces específicas para que dos equipos del mismo grupo
 * no se reencuentren antes de la final; el continental y la copa son adyacencia.
 * Por eso el avance de ronda se describe con un PLAN explícito y serializable
 * (`BracketPlan`) en vez de estar cableado: una primitiva sólo-adyacencia
 * reescribiría el cuadro del Mundial en silencio.
 *
 * Este módulo maneja la ESTRUCTURA (siembra, armado de rondas, resolución del
 * global). La simulación de cada partido —goles, prórroga, penales— la hace el
 * motor en la capa de arriba; acá sólo se decide el ganador dados los
 * resultados.
 */

export type TieLegs = 1 | 2;

/** Un cruce de eliminación: uno o dos partidos más su resolución. */
export interface Tie {
  id: string;
  round: RoundKey;
  position: number;
  /** Local de la IDA (visitante de la vuelta si `legs === 2`). null = por definir. */
  homeTeamId: string | null;
  awayTeamId: string | null;
  /** 1 o 2 partidos. Vacío mientras no haya rivales definidos. */
  matches: Match[];
  winnerId?: string;
  loserId?: string;
  /** El cruce se definió en la prórroga (o fue a penales tras ella). */
  extraTime?: boolean;
  /** Sólo si el global terminó empatado. Marcados desde `homeTeamId`. */
  penalties?: { homeScore: number; awayScore: number };
}

/**
 * Para cada posición de destino, las DOS posiciones de la ronda previa que la
 * alimentan. `sources[j] = [a, b]` ⇒ el cruce j de esta ronda enfrenta al
 * ganador de la posición `a` con el de la `b`.
 */
export type RoundSources = Array<[number, number]>;

export interface PlannedRound {
  round: RoundKey;
  tieCount: number;
  /** Ausente en la primera ronda. Ausente en las siguientes ⇒ adyacencia (2j, 2j+1). */
  sources?: RoundSources;
  /** Jornada global del calendario. Ausente ⇒ no se estampa (el Mundial no la usa). */
  matchday?: number;
}

export interface BracketPlan {
  /** Slots del cuadro, contando byes. Potencia de 2. */
  size: number;
  rounds: PlannedRound[];
  thirdPlace: boolean;
  thirdPlaceMatchday?: number;
  /**
   * Cómo entran los byes a la segunda ronda.
   * - `reseed`: ocupantes = byes ++ ganadores, recolocados por `seedSlots`.
   *   Es lo que hace el cuadro continental.
   * - `adjacent`: cada bye ocupa el slot del cruce ausente. Convención estándar.
   */
  byeJoin: 'adjacent' | 'reseed';
}

export interface BracketRound {
  round: RoundKey;
  ties: Tie[];
}

export interface Bracket {
  id: string;
  plan: BracketPlan;
  legs: TieLegs;
  neutral: boolean;
  /** Se estampa en cada Match: define el peso Elo y viaja a match_history. */
  stage: string;
  idPrefix: string;
  rounds: BracketRound[];
  thirdPlaceTie: Tie | null;
  byeTeamIds: string[];
  championId?: string;
  runnerUpId?: string;
  thirdPlaceId?: string;
}

export type SeedStrategy =
  /** `entrants` viene en orden de mérito; se coloca por `seedSlots`. */
  | { kind: 'seeded' }
  /** Se baraja todo y se emparejan de a dos. */
  | { kind: 'random'; rng?: () => number }
  /** Bombo alto de local contra un bombo bajo barajado (cuadro continental). */
  | { kind: 'pots'; rng?: () => number }
  /** El caller ya decidió el orden de los slots (Mundial, confederaciones, copa). */
  | { kind: 'explicit' };

// ---------------------------------------------------------------------------
// Siembra
// ---------------------------------------------------------------------------

/**
 * Orden de siembra estándar de un cuadro de `size` slots (`size` potencia de 2).
 * `slots[k]` = índice de semilla (0-based) que va en el slot `k`. Emparejando
 * slots consecutivos (2m, 2m+1) y fusionando rondas por adyacencia, dos semillas
 * altas sólo pueden reencontrarse en la final.
 * `seedSlots(8)` → `[0,7,3,4,1,6,2,5]`.
 */
export function seedSlots(size: number): number[] {
  if (size < 1 || (size & (size - 1)) !== 0) {
    throw new Error(`seedSlots requiere una potencia de 2 ≥ 1, recibió ${size}`);
  }
  let slots = [0];
  while (slots.length < size) {
    const total = slots.length * 2 - 1;
    const next: number[] = [];
    for (const s of slots) {
      next.push(s);
      next.push(total - s);
    }
    slots = next;
  }
  return slots;
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

/** Potencia de 2 igual o mayor a `n`. */
export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// ---------------------------------------------------------------------------
// Planes
// ---------------------------------------------------------------------------

/**
 * Plan de un cuadro corriente: todas las rondas por adyacencia, con las
 * jornadas numeradas desde `firstMatchday` (si se pasa). Sin `firstMatchday` el
 * cuadro no estampa jornada, que es lo que necesita el Mundial.
 */
export function standardPlan(
  size: number,
  o: {
    thirdPlace?: boolean;
    firstMatchday?: number;
    byeJoin?: 'adjacent' | 'reseed';
  } = {},
): BracketPlan {
  if (size < 2 || (size & (size - 1)) !== 0) {
    throw new Error(`standardPlan requiere una potencia de 2 ≥ 2, recibió ${size}`);
  }
  const rounds: PlannedRound[] = [];
  let tieCount = size / 2;
  let md = o.firstMatchday;

  while (tieCount >= 1) {
    rounds.push({
      round: roundKeyForTieCount(tieCount),
      tieCount,
      ...(md !== undefined ? { matchday: md } : {}),
    });
    tieCount /= 2;
    if (md !== undefined) md += 1;
  }

  return {
    size,
    rounds,
    thirdPlace: o.thirdPlace ?? false,
    // El 3er puesto se juega junto con la final: comparte su jornada.
    ...(o.firstMatchday !== undefined && o.thirdPlace
      ? { thirdPlaceMatchday: o.firstMatchday + rounds.length - 1 }
      : {}),
    byeJoin: o.byeJoin ?? 'adjacent',
  };
}

/**
 * Plan con emparejamientos a medida. `sources[i]` describe la ronda de índice
 * `i` (0 es la primera, que nunca tiene fuentes). Es lo que necesita el cuadro
 * del Mundial, cuyos cruces de R16 y cuartos no son adyacencia.
 */
export function planWithSources(
  size: number,
  sources: Record<number, RoundSources>,
  o: { thirdPlace?: boolean; firstMatchday?: number } = {},
): BracketPlan {
  const base = standardPlan(size, o);
  return {
    ...base,
    rounds: base.rounds.map((r, i) => (sources[i] ? { ...r, sources: sources[i] } : r)),
  };
}

// ---------------------------------------------------------------------------
// Construcción
// ---------------------------------------------------------------------------

function emptyMatches(
  tieId: string,
  home: string,
  away: string,
  legs: TieLegs,
  stage: string,
  matchday?: number,
): Match[] {
  const base = { homeScore: null, awayScore: null, isPlayed: false, stage };
  if (legs === 1) {
    return [
      {
        id: `${tieId}-m`,
        homeTeamId: home,
        awayTeamId: away,
        ...(matchday !== undefined ? { matchday } : {}),
        ...base,
      },
    ];
  }
  return [
    {
      id: `${tieId}-l1`,
      homeTeamId: home,
      awayTeamId: away,
      matchday: matchday ?? 1,
      ...base,
    },
    // La vuelta invierte la localía.
    {
      id: `${tieId}-l2`,
      homeTeamId: away,
      awayTeamId: home,
      matchday: matchday !== undefined ? matchday + 1 : 2,
      ...base,
    },
  ];
}

function makeTie(
  b: Pick<Bracket, 'idPrefix' | 'legs' | 'stage'>,
  round: RoundKey,
  position: number,
  home: string | null,
  away: string | null,
  matchday?: number,
): Tie {
  const id = `${b.idPrefix}-${round}-${position}`;
  return {
    id,
    round,
    position,
    homeTeamId: home,
    awayTeamId: away,
    matches: home && away ? emptyMatches(id, home, away, b.legs, b.stage, matchday) : [],
  };
}

/**
 * Coloca a los entrantes en los slots de la primera ronda según la estrategia.
 * Devuelve un array de `size` posiciones donde `null` = bye (nadie ocupa ese
 * slot y su cruce no se juega).
 */
function placeEntrants(
  entrants: string[],
  size: number,
  byeCount: number,
  seed: SeedStrategy,
): { slots: (string | null)[]; byeTeamIds: string[] } {
  if (seed.kind === 'pots') {
    // Bombo alto (mejores, ya ordenados) de local contra un bombo bajo barajado.
    // Los `byeCount` mejores quedan afuera de la primera ronda.
    const byeTeamIds = entrants.slice(0, byeCount);
    const playing = entrants.slice(byeCount);
    const half = playing.length / 2;
    const topPot = playing.slice(0, half);
    const bottomPot = shuffle(playing.slice(half), seed.rng);
    const slots: (string | null)[] = [];
    for (let i = 0; i < topPot.length; i++) {
      slots.push(topPot[i], bottomPot[i]);
    }
    return { slots, byeTeamIds };
  }

  const ordered =
    seed.kind === 'random' ? shuffle(entrants, seed.rng) : entrants;

  if (seed.kind === 'explicit') {
    // El caller ya decidió: los slots son los entrantes tal cual, más los byes
    // al final si el cuadro no está lleno.
    const slots: (string | null)[] = [...ordered];
    while (slots.length < size) slots.push(null);
    return { slots, byeTeamIds: [] };
  }

  // 'seeded' y 'random': se colocan por siembra estándar y los slots que
  // sobran quedan vacíos (el rival del bye).
  const placement = seedSlots(size);
  const slots: (string | null)[] = placement.map((seedIdx) => ordered[seedIdx] ?? null);
  const byeTeamIds: string[] = [];
  for (let m = 0; m < size / 2; m++) {
    const a = slots[2 * m];
    const b = slots[2 * m + 1];
    if (a && !b) byeTeamIds.push(a);
    if (b && !a) byeTeamIds.push(b);
  }
  return { slots, byeTeamIds };
}

/**
 * Crea un cuadro con su primera ronda ya sorteada. Las rondas siguientes se van
 * generando con `advanceBracket` a medida que se resuelven, igual que hacía cada
 * implementación previa (nunca se arma el cuadro entero de una).
 */
export function createBracket(input: {
  entrants: string[];
  legs: TieLegs;
  neutral: boolean;
  stage: string;
  idPrefix?: string;
  plan?: BracketPlan;
  seed: SeedStrategy;
  byeCount?: number;
}): Bracket {
  const plan = input.plan ?? standardPlan(nextPowerOfTwo(input.entrants.length));
  const idPrefix = input.idPrefix ?? 'bk';
  const byeCount = input.byeCount ?? Math.max(0, plan.size - input.entrants.length);

  const shell: Pick<Bracket, 'idPrefix' | 'legs' | 'stage'> = {
    idPrefix,
    legs: input.legs,
    stage: input.stage,
  };

  const { slots, byeTeamIds } = placeEntrants(input.entrants, plan.size, byeCount, input.seed);
  const first = plan.rounds[0];

  const ties: Tie[] = [];
  let position = 0;
  for (let m = 0; m * 2 + 1 < slots.length; m++) {
    const home = slots[2 * m] ?? null;
    const away = slots[2 * m + 1] ?? null;
    // Un slot con un solo ocupante es un bye: no genera partido, igual que en
    // el cuadro continental (que sólo emite los cruces reales de R64).
    if (!home || !away) continue;
    ties.push(makeTie(shell, first.round, position++, home, away, first.matchday));
  }

  return {
    id: idPrefix,
    plan,
    legs: input.legs,
    neutral: input.neutral,
    stage: input.stage,
    idPrefix,
    rounds: [{ round: first.round, ties }],
    thirdPlaceTie: null,
    byeTeamIds,
  };
}

// ---------------------------------------------------------------------------
// Resolución de un cruce
// ---------------------------------------------------------------------------

/**
 * Global del cruce, desde la perspectiva de `homeTeamId` (local de la ida).
 * Con un solo partido es el marcador; con dos, la suma sin gol de visitante.
 * `null` si falta jugar algún partido.
 */
export function tieAggregate(tie: Tie): { home: number; away: number } | null {
  if (tie.matches.length === 0) return null;
  if (!tie.matches.every((m) => m.isPlayed && m.homeScore !== null && m.awayScore !== null)) {
    return null;
  }
  const [leg1, leg2] = tie.matches;
  if (!leg2) {
    return { home: leg1.homeScore!, away: leg1.awayScore! };
  }
  // homeTeamId es local en la ida y visitante en la vuelta.
  return {
    home: leg1.homeScore! + leg2.awayScore!,
    away: leg1.awayScore! + leg2.homeScore!,
  };
}

/**
 * Resuelve el ganador a partir de los partidos jugados (sin gol de visitante).
 * Empate global → deciden los penales, que deben venir cargados tras la
 * prórroga. Devuelve el cruce intacto si todavía no se puede definir.
 */
export function resolveTie(tie: Tie): Tie {
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
    const p = tie.penalties;
    if (!p) return tie; // faltan los penales para definir
    if (p.homeScore === p.awayScore) return tie; // penales inválidos
    const homeWins = p.homeScore > p.awayScore;
    winnerId = homeWins ? tie.homeTeamId : tie.awayTeamId;
    loserId = homeWins ? tie.awayTeamId : tie.homeTeamId;
  }

  return { ...tie, winnerId, loserId };
}

/** ¿Están definidos todos los cruces de una ronda? */
export function isRoundResolved(ties: Tie[]): boolean {
  return ties.length > 0 && ties.every((t) => t.winnerId !== undefined);
}

// ---------------------------------------------------------------------------
// Avance
// ---------------------------------------------------------------------------

/** Ganadores de una ronda, ordenados por posición. */
function winnersOf(ties: Tie[]): string[] {
  return [...ties].sort((a, b) => a.position - b.position).map((t) => t.winnerId!);
}

/**
 * Ocupantes de la ronda siguiente cuando hubo byes. Con `reseed` se juntan byes
 * y ganadores y se recolocan por siembra estándar (lo que hace el continental
 * al pasar de R64 a R32); con `adjacent` los byes entran en el lugar del cruce
 * que no se jugó.
 *
 * Sólo aplica al pasar de la PRIMERA ronda a la segunda: ahí es donde entran los
 * byes. En las rondas siguientes ya están todos adentro y volver a sumarlos
 * duplicaría equipos.
 */
function joinByes(bracket: Bracket, winners: string[], nextSize: number): (string | null)[] {
  if (bracket.byeTeamIds.length === 0) {
    return winners;
  }
  const occupants = [...bracket.byeTeamIds, ...winners];
  if (bracket.plan.byeJoin === 'reseed') {
    if (occupants.length !== nextSize) {
      console.warn(
        `⚠️ advanceBracket: se esperaban ${nextSize} ocupantes, hay ${occupants.length}. No se genera la ronda.`,
      );
      return [];
    }
    return seedSlots(nextSize).map((seedIdx) => occupants[seedIdx]);
  }
  return occupants;
}

/**
 * Avanza el cuadro: genera la ronda siguiente si la última está resuelta, arma
 * el 3er puesto cuando corresponde y corona al campeón tras la final.
 * Idempotente: llamarlo de más no duplica rondas.
 */
export function advanceBracket(bracket: Bracket): Bracket {
  const lastIndex = bracket.rounds.length - 1;
  const last = bracket.rounds[lastIndex];
  if (!last || !isRoundResolved(last.ties)) return bracket;

  const shell = {
    idPrefix: bracket.idPrefix,
    legs: bracket.legs,
    stage: bracket.stage,
  };

  let next: Bracket = bracket;

  // Final resuelta ⇒ campeón y subcampeón.
  if (last.round === 'final') {
    const finalTie = last.ties[0];
    next = { ...next, championId: finalTie.winnerId, runnerUpId: finalTie.loserId };
  }

  // Semis resueltas y el plan lo pide ⇒ partido por el 3er puesto.
  if (last.round === 'semi' && bracket.plan.thirdPlace && !bracket.thirdPlaceTie) {
    const sorted = [...last.ties].sort((a, b) => a.position - b.position);
    const [a, b] = sorted;
    if (a?.loserId && b?.loserId) {
      next = {
        ...next,
        thirdPlaceTie: makeTie(
          shell,
          'third-place',
          0,
          a.loserId,
          b.loserId,
          bracket.plan.thirdPlaceMatchday,
        ),
      };
    }
  }

  // 3er puesto resuelto ⇒ se registra quién quedó tercero.
  if (next.thirdPlaceTie?.winnerId && !next.thirdPlaceId) {
    next = { ...next, thirdPlaceId: next.thirdPlaceTie.winnerId };
  }

  const plannedNext = bracket.plan.rounds[lastIndex + 1];
  if (!plannedNext || last.round === 'final') return next;

  const winners = winnersOf(last.ties);
  // Los byes entran únicamente al pasar de la primera ronda a la segunda.
  const occupants =
    lastIndex === 0 ? joinByes(bracket, winners, plannedNext.tieCount * 2) : winners;
  if (occupants.length === 0) return next;

  const sources: RoundSources =
    plannedNext.sources ??
    Array.from({ length: plannedNext.tieCount }, (_, j) => [2 * j, 2 * j + 1] as [number, number]);

  const ties: Tie[] = [];
  for (let j = 0; j < sources.length; j++) {
    const [ia, ib] = sources[j];
    const a = occupants[ia];
    const b = occupants[ib];
    // Igual que las implementaciones previas: si falta algún ocupante, no se
    // genera ese cruce (ronda incompleta ⇒ no se avanza a medias).
    if (!a || !b) continue;
    ties.push(makeTie(shell, plannedNext.round, j, a, b, plannedNext.matchday));
  }
  if (ties.length !== sources.length) return next;

  return { ...next, rounds: [...next.rounds, { round: plannedNext.round, ties }] };
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

/** Todos los partidos del cuadro, incluido el 3er puesto. */
export function bracketMatches(bracket: Bracket): Match[] {
  const fromRounds = bracket.rounds.flatMap((r) => r.ties.flatMap((t) => t.matches));
  return bracket.thirdPlaceTie
    ? [...fromRounds, ...bracket.thirdPlaceTie.matches]
    : fromRounds;
}

/** Busca un cruce por el id de uno de sus partidos. */
export function findTieByMatchId(bracket: Bracket, matchId: string): Tie | null {
  for (const round of bracket.rounds) {
    const found = round.ties.find((t) => t.matches.some((m) => m.id === matchId));
    if (found) return found;
  }
  if (bracket.thirdPlaceTie?.matches.some((m) => m.id === matchId)) {
    return bracket.thirdPlaceTie;
  }
  return null;
}

/**
 * Carga el resultado de un partido y re-resuelve su cruce. No avanza de ronda:
 * eso lo hace `advanceBracket`, para que el caller decida cuándo.
 */
export function recordBracketMatch(
  bracket: Bracket,
  matchId: string,
  score: {
    homeScore: number;
    awayScore: number;
    penalties?: { homeScore: number; awayScore: number };
    extraTime?: boolean;
  },
): Bracket {
  const applyTo = (tie: Tie): Tie => {
    if (!tie.matches.some((m) => m.id === matchId)) return tie;
    const matches = tie.matches.map((m) =>
      m.id === matchId
        ? { ...m, homeScore: score.homeScore, awayScore: score.awayScore, isPlayed: true }
        : m,
    );
    const updated: Tie = {
      ...tie,
      matches,
      ...(score.extraTime !== undefined ? { extraTime: score.extraTime } : {}),
      ...(score.penalties !== undefined ? { penalties: score.penalties } : {}),
    };
    return resolveTie(updated);
  };

  return {
    ...bracket,
    rounds: bracket.rounds.map((r) => ({ ...r, ties: r.ties.map(applyTo) })),
    thirdPlaceTie: bracket.thirdPlaceTie ? applyTo(bracket.thirdPlaceTie) : null,
  };
}

/** ¿Terminó el cuadro? (hay campeón y, si el plan lo pide, tercero). */
export function isBracketComplete(bracket: Bracket): boolean {
  if (!bracket.championId) return false;
  if (bracket.plan.thirdPlace && !bracket.thirdPlaceId) return false;
  return true;
}

/** Ronda en curso: la última generada. */
export function currentRound(bracket: Bracket): BracketRound | null {
  return bracket.rounds[bracket.rounds.length - 1] ?? null;
}

/** Reexport por comodidad: casi todo consumidor del cuadro necesita las rondas. */
export { ROUND_ORDER, nextRoundKey, roundKeyForTieCount };
export type { RoundKey };
