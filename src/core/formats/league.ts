import type { Match, TeamStanding } from '../../types';
import { initializeStandings, updateStandings, sortStandings } from '../scheduler';

/**
 * Formato Liga (todos contra todos). Genérico en cantidad de equipos y vueltas
 * (ida / ida y vuelta). Reutiliza el motor de tabla de posiciones existente
 * (scheduler): este módulo sólo arma el fixture y expone helpers de estado.
 *
 * No depende de región ni del ciclo mundialista: sirve para cualquier modo de
 * ligas (ej: cada división de la Liga Villamariense, 16 equipos, ida y vuelta).
 */

export type LeagueLegs = 1 | 2;

export interface LeagueState {
  teamIds: string[];
  legs: LeagueLegs;
  matches: Match[];
  standings: TeamStanding[];
}

/** Marcador de una fecha del round-robin del método del círculo (antes de rotular equipos). */
interface RawPairing {
  home: string | null; // null = BYE (equipo libre esa fecha, con N impar)
  away: string | null;
}

/**
 * Fixture de una sola vuelta por el método del círculo (round-robin de Berger).
 * Con N impar se agrega un BYE, así siempre hay N (o N+1) equipos y el algoritmo
 * es uniforme; los cruces contra el BYE se descartan (ese equipo queda libre).
 *
 * Devuelve las fechas (arrays de cruces), cada una con emparejamientos sin
 * repetir rival dentro de la misma fecha.
 */
function singleRoundRobin(teamIds: string[]): RawPairing[][] {
  const teams: (string | null)[] = [...teamIds];
  if (teams.length % 2 !== 0) teams.push(null); // BYE

  const n = teams.length;
  const rounds: RawPairing[][] = [];
  // El primer equipo queda fijo; el resto rota. n-1 fechas.
  const rotating = teams.slice(1);

  for (let round = 0; round < n - 1; round++) {
    const pairings: RawPairing[] = [];
    const left = [teams[0], ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const a = left[i];
      const b = left[n - 1 - i];
      // Alternar localía por fecha para repartir locales/visitantes de forma pareja.
      if (round % 2 === 0) {
        pairings.push({ home: a, away: b });
      } else {
        pairings.push({ home: b, away: a });
      }
    }
    rounds.push(pairings);
    // Rotar: el último pasa al frente (el índice 0 global sigue fijo).
    rotating.unshift(rotating.pop()!);
  }

  return rounds;
}

/** Crea un partido de liga sin jugar para una fecha dada. */
function makeLeagueMatch(id: string, home: string, away: string, matchday: number): Match {
  return {
    id,
    homeTeamId: home,
    awayTeamId: away,
    homeScore: null,
    awayScore: null,
    isPlayed: false,
    stage: 'league',
    matchday,
  };
}

/**
 * Genera el fixture completo de una liga. Con `legs === 2` juega la vuelta
 * invirtiendo la localía, en fechas posteriores a toda la ida. Los ids de
 * partido usan `idPrefix` para ser estables y únicos dentro del torneo.
 */
export function generateLeagueFixtures(
  teamIds: string[],
  legs: LeagueLegs,
  idPrefix = 'lg',
): Match[] {
  if (teamIds.length < 2) return [];

  const firstLeg = singleRoundRobin(teamIds);
  const matches: Match[] = [];
  let matchday = 0;

  for (const round of firstLeg) {
    matchday++;
    let seq = 0;
    for (const p of round) {
      if (!p.home || !p.away) continue; // BYE: nadie juega
      matches.push(makeLeagueMatch(`${idPrefix}-${matchday}-${seq++}`, p.home, p.away, matchday));
    }
  }

  if (legs === 2) {
    for (const round of firstLeg) {
      matchday++;
      let seq = 0;
      for (const p of round) {
        if (!p.home || !p.away) continue;
        // Vuelta: se invierte la localía respecto de la ida.
        matches.push(makeLeagueMatch(`${idPrefix}-${matchday}-${seq++}`, p.away, p.home, matchday));
      }
    }
  }

  return matches;
}

/** Estado inicial de una liga: fixture generado y tabla en cero. */
export function createLeagueState(
  teamIds: string[],
  legs: LeagueLegs,
  idPrefix = 'lg',
): LeagueState {
  return {
    teamIds: [...teamIds],
    legs,
    matches: generateLeagueFixtures(teamIds, legs, idPrefix),
    standings: initializeStandings(teamIds),
  };
}

/**
 * Recalcula la tabla desde cero a partir de los partidos jugados. Se recalcula
 * entero (no incremental) para que sea idempotente y no acumule si se reprocesa.
 */
export function recalcLeagueStandings(state: LeagueState): TeamStanding[] {
  let standings = initializeStandings(state.teamIds);
  for (const m of state.matches) {
    if (m.isPlayed && m.homeScore !== null && m.awayScore !== null) {
      standings = updateStandings(standings, m);
    }
  }
  // Se pasan los partidos para el desempate por enfrentamientos directos.
  return sortStandings(standings, undefined, state.matches);
}

/** ¿Se jugaron todos los partidos de la liga? */
export function isLeagueComplete(state: LeagueState): boolean {
  return state.matches.length > 0 && state.matches.every((m) => m.isPlayed);
}
