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
    byeTeamIds,
  };
}
