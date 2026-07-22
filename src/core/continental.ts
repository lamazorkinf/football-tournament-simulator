import { nanoid } from 'nanoid';
import type { ContinentalBracket, KnockoutMatch, Region, Team } from '../types';

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
 * Orden de siembra estándar de un cuadro de `size` slots (`size` potencia de 2).
 * `slots[k]` = índice de semilla (0-based) que va en el slot `k`. Emparejando
 * slots consecutivos (2m, 2m+1) y fusionando rondas por adyacencia, dos semillas
 * altas solo pueden reencontrarse en la final.
 * seedSlots(8) → [0,7,3,4,1,6,2,5].
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

/** Baraja una copia del array (Fisher-Yates). No muta el original. */
function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function newKnockoutMatch(
  homeTeamId: string,
  awayTeamId: string,
  round: KnockoutMatch['round'],
  matchday: number,
  position: number,
): KnockoutMatch {
  return {
    id: nanoid(),
    homeTeamId,
    awayTeamId,
    homeScore: null,
    awayScore: null,
    isPlayed: false,
    stage: 'continental',
    round,
    matchday,
    position,
  };
}

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

  const byeTeamIds = sorted.slice(0, byeCount).map((t) => t.id);
  const r64Teams = sorted.slice(byeCount);
  const w = r64Teams.length / 2; // entero: r64Teams.length siempre es par

  const topPot = r64Teams.slice(0, w);
  const bottomPot = shuffle(r64Teams.slice(w));

  const roundOf64: KnockoutMatch[] = topPot.map((home, i) =>
    newKnockoutMatch(home.id, bottomPot[i].id, 'round-of-64', 1, i),
  );

  return {
    region,
    roundOf64,
    roundOf32: [],
    roundOf16: [],
    quarterFinals: [],
    semiFinals: [],
    final: null,
    thirdPlace: null,
    byeTeamIds,
  };
}

/**
 * Forma la R32 a partir de los byes (semillas altas) y los ganadores de R64.
 * Ocupantes = byes ++ ganadores (32 en total); se colocan por `seedSlots(32)` y
 * se emparejan slots consecutivos. Si no hay exactamente 32 ocupantes con id
 * (p.ej. faltan `winnerId`), devuelve `[]` sin generar (igual que knockout.ts).
 */
export function generateContinentalRoundOf32(bracket: ContinentalBracket): KnockoutMatch[] {
  const winners = [...bracket.roundOf64]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((m) => m.winnerId)
    .filter((id): id is string => Boolean(id));

  const occupants = [...bracket.byeTeamIds, ...winners];
  if (occupants.length !== 32) {
    console.warn(
      `⚠️ generateContinentalRoundOf32: se esperaban 32 ocupantes, hay ${occupants.length}. No se genera R32.`,
    );
    return [];
  }

  const slots = seedSlots(32); // slots[k] = índice de semilla en el slot k
  const placed = slots.map((seedIdx) => occupants[seedIdx]);

  const matches: KnockoutMatch[] = [];
  for (let m = 0; m < 16; m++) {
    matches.push(newKnockoutMatch(placed[2 * m], placed[2 * m + 1], 'round-of-32', 2, m));
  }
  return matches;
}

/**
 * Avanza una ronda emparejando ganadores adyacentes: `next[j]` = ganador de
 * `prev` en posición `2j` vs ganador en `2j+1`. Solo genera un partido si AMBOS
 * ganadores están definidos; si falta alguno, se omite (ronda incompleta ⇒ []).
 */
function advanceContinentalRound(
  prev: KnockoutMatch[],
  round: KnockoutMatch['round'],
  matchday: number,
): KnockoutMatch[] {
  const sorted = [...prev].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const matches: KnockoutMatch[] = [];
  for (let j = 0; 2 * j + 1 < sorted.length; j++) {
    const a = sorted[2 * j];
    const b = sorted[2 * j + 1];
    if (a?.winnerId && b?.winnerId) {
      matches.push(newKnockoutMatch(a.winnerId, b.winnerId, round, matchday, j));
    }
  }
  return matches;
}

export function generateContinentalRoundOf16(roundOf32: KnockoutMatch[]): KnockoutMatch[] {
  return advanceContinentalRound(roundOf32, 'round-of-16', 3);
}

export function generateContinentalQuarterFinals(roundOf16: KnockoutMatch[]): KnockoutMatch[] {
  return advanceContinentalRound(roundOf16, 'quarter', 4);
}

export function generateContinentalSemiFinals(quarterFinals: KnockoutMatch[]): KnockoutMatch[] {
  return advanceContinentalRound(quarterFinals, 'semi', 5);
}

export function generateContinentalFinal(semiFinals: KnockoutMatch[]): KnockoutMatch | null {
  return advanceContinentalRound(semiFinals, 'final', 6)[0] ?? null;
}

/**
 * Partido por el 3er puesto: empareja los perdedores de las 2 semifinales
 * (ordenadas por `position`). Jornada 6 (misma que la final). Devuelve null si
 * falta algún perdedor (semis no jugadas).
 */
export function generateContinentalThirdPlace(semiFinals: KnockoutMatch[]): KnockoutMatch | null {
  const sorted = [...semiFinals].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  if (sorted.length < 2) return null;
  const [a, b] = sorted;
  if (!a?.loserId || !b?.loserId) return null;
  return newKnockoutMatch(a.loserId, b.loserId, 'third-place', 6, 0);
}
