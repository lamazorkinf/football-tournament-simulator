import type { KnockoutMatch, Team, WorldCupGroup, TeamStanding } from '../../types';

/**
 * Utilidades compartidas por el test de fixtures dorados de los cuadros.
 *
 * Los dorados se capturaron contra el código PREVIO a la unificación de
 * formatos (core/knockout.ts, core/continental.ts, core/confederations.ts) y son
 * el criterio duro del refactor: si el cuadro del Mundial, el continental o el
 * de la Copa Confederaciones cambian una sola posición, el refactor rompió algo.
 *
 * `knockout_position` se persiste en matches_new, así que renumerar no es un
 * detalle cosmético: corrompería los torneos en curso al cargarlos.
 */

/** PRNG determinista (mulberry32). Math.random se stubbea con esto en el test. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Forma comparable de un partido de cuadro: lo que no puede cambiar. */
export interface TieShape {
  round: string;
  position: number | null;
  home: string;
  away: string;
  matchday: number | null;
}

export function shapeOf(m: KnockoutMatch): TieShape {
  return {
    round: m.round,
    position: m.position ?? null,
    home: m.homeTeamId,
    away: m.awayTeamId,
    matchday: m.matchday ?? null,
  };
}

export function shapesOf(matches: KnockoutMatch[]): TieShape[] {
  return matches.map(shapeOf);
}

/** Equipos sintéticos con skill decreciente y determinista: T01 el mejor. */
export function makeTeams(count: number, prefix = 'T'): Team[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${String(i + 1).padStart(2, '0')}`,
    name: `Equipo ${i + 1}`,
    flag: '🏳️',
    skill: 100 - i, // orden de mérito estable, sin empates
  }));
}

/**
 * Resuelve una ronda de forma determinista: gana SIEMPRE el local. Así el
 * dorado mide la ESTRUCTURA del cuadro (quién se cruza con quién y en qué
 * posición), no la simulación.
 */
export function resolveAllHomeWins(matches: KnockoutMatch[]): KnockoutMatch[] {
  return matches.map((m) => ({
    ...m,
    homeScore: 1,
    awayScore: 0,
    isPlayed: true,
    winnerId: m.homeTeamId,
    loserId: m.awayTeamId,
  }));
}

/** Tabla de un grupo donde el orden de `teamIds` ES el orden final. */
function standingsFor(teamIds: string[]): TeamStanding[] {
  return teamIds.map((teamId, i) => ({
    teamId,
    played: 3,
    won: 3 - i,
    drawn: 0,
    lost: i,
    goalsFor: 10 - i,
    goalsAgainst: i,
    goalDifference: 10 - 2 * i,
    points: (3 - i) * 3,
  }));
}

/**
 * 16 grupos del Mundial (A..P) de 4 equipos, con posiciones ya definidas y sin
 * empates: el 1º y el 2º de cada grupo salen del orden de `teamIds`.
 */
export function makeWorldCupGroups(): WorldCupGroup[] {
  const letters = 'ABCDEFGHIJKLMNOP'.split('');
  return letters.map((letter, g) => {
    const teamIds = Array.from({ length: 4 }, (_, i) => `${letter}${i + 1}`);
    return {
      id: `wc-group-${letter}`,
      name: `Group ${letter}`,
      teamIds,
      matches: [],
      standings: standingsFor(teamIds),
    } satisfies WorldCupGroup;
  });
}

/** Equipos correspondientes a los grupos de arriba (skill decreciente por letra). */
export function makeWorldCupTeams(): Team[] {
  return makeWorldCupGroups().flatMap((g, gi) =>
    g.teamIds.map((id, i) => ({
      id,
      name: id,
      flag: '🏳️',
      skill: 99 - gi * 4 - i,
    })),
  );
}
