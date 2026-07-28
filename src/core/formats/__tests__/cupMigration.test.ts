import { describe, it, expect } from 'vitest';
import { crossDivisionSlots } from '../bracketSeed';
import {
  advanceBracket,
  createBracket,
  recordBracketMatch,
  standardPlan,
  type Bracket,
} from '../bracket';
import {
  canonicalFormat,
  migrateCupStateV1,
  migrateTournamentState,
  type LegacyCupState,
  type LegacyTwoLeggedTie,
} from '../modeTournamentMigration';
import type { Match } from '../../../types';

/**
 * La copa a ida y vuelta era el cuarto cuadro del juego, con su propio módulo
 * (`formats/cup.ts`) y su propia estructura persistida. Estos tests fijan las
 * dos cosas que su absorción por la primitiva no podía romper: el sorteo cruzado
 * A-vs-B y la lectura de los documentos que ya están guardados.
 */

/** RNG determinista (LCG) para sorteos reproducibles en test. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const A = Array.from({ length: 16 }, (_, i) => `A${i + 1}`);
const B = Array.from({ length: 16 }, (_, i) => `B${i + 1}`);

function cupBracket(rng: () => number): Bracket {
  return createBracket({
    entrants: crossDivisionSlots(A, B, rng),
    legs: 2,
    neutral: false,
    stage: 'cup',
    idPrefix: 'cup',
    plan: standardPlan(32, { thirdPlace: false }),
    seed: { kind: 'explicit' },
  });
}

describe('sorteo cruzado A-vs-B', () => {
  it('arma 16 cruces, cada uno con un equipo de A y uno de B', () => {
    const ties = cupBracket(seededRng(42)).rounds[0].ties;
    expect(ties).toHaveLength(16);
    const setA = new Set(A);
    const setB = new Set(B);
    for (const t of ties) {
      const teams = [t.homeTeamId!, t.awayTeamId!];
      expect(teams.filter((x) => setA.has(x))).toHaveLength(1);
      expect(teams.filter((x) => setB.has(x))).toHaveLength(1);
    }
  });

  it('usa los 32 equipos exactamente una vez', () => {
    const used = cupBracket(seededRng(7)).rounds[0].ties.flatMap((t) => [t.homeTeamId!, t.awayTeamId!]);
    expect(new Set(used).size).toBe(32);
    expect(used).toHaveLength(32);
  });

  it('la ronda inicial de 16 cruces es round-of-32, a dos partidos', () => {
    const ties = cupBracket(seededRng(1)).rounds[0].ties;
    expect(ties.every((t) => t.round === 'round-of-32')).toBe(true);
    // Ida en cancha del primero, vuelta invertida.
    for (const t of ties) {
      expect(t.matches).toHaveLength(2);
      expect(t.matches[0].homeTeamId).toBe(t.homeTeamId);
      expect(t.matches[1].homeTeamId).toBe(t.awayTeamId);
      expect(t.matches.map((m) => m.matchday)).toEqual([1, 2]);
    }
  });

  it('genera cruces distintos según la semilla', () => {
    const key = (rng: () => number) =>
      cupBracket(rng).rounds[0].ties.map((t) => `${t.homeTeamId}-${t.awayTeamId}`);
    expect(key(seededRng(1))).not.toEqual(key(seededRng(999)));
  });

  it('rechaza divisiones de distinto tamaño', () => {
    expect(() => crossDivisionSlots(A, B.slice(0, 15))).toThrow();
  });

  it('conserva los ids que emitía la copa: cup-<ronda>-<posición> y sus legs', () => {
    const tie = cupBracket(seededRng(3)).rounds[0].ties[0];
    expect(tie.id).toBe('cup-round-of-32-0');
    expect(tie.matches.map((m) => m.id)).toEqual([
      'cup-round-of-32-0-l1',
      'cup-round-of-32-0-l2',
    ]);
  });
});

// ---------------------------------------------------------------------------

function leg(id: string, home: string, away: string, matchday: number, score?: [number, number]): Match {
  return {
    id,
    homeTeamId: home,
    awayTeamId: away,
    matchday,
    stage: 'cup',
    homeScore: score ? score[0] : null,
    awayScore: score ? score[1] : null,
    isPlayed: score !== undefined,
  };
}

/** Un documento de copa v1 con la R32 a medio jugar. */
function legacyCup(): LegacyCupState {
  const ties: LegacyTwoLeggedTie[] = Array.from({ length: 16 }, (_, i) => {
    const id = `cup-round-of-32-${i}`;
    const home = `A${i + 1}`;
    const away = `B${i + 1}`;
    // Los primeros 15 resueltos; el último todavía sin jugar.
    const resolved = i < 15;
    return {
      id,
      round: 'round-of-32',
      position: i,
      homeTeamId: home,
      awayTeamId: away,
      leg1: leg(`${id}-l1`, home, away, 1, resolved ? [2, 0] : undefined),
      leg2: leg(`${id}-l2`, away, home, 2, resolved ? [0, 1] : undefined),
      ...(resolved ? { winnerId: home, loserId: away } : {}),
    };
  });
  return { rounds: [ties] };
}

describe('migración del JSONB de copa v1 → cuadro unificado', () => {
  it('los format legacy se traducen a los canónicos', () => {
    expect(canonicalFormat('league')).toBe('liga');
    expect(canonicalFormat('cup')).toBe('eliminacion');
    expect(canonicalFormat('liga')).toBe('liga');
    expect(canonicalFormat('grupos-eliminacion')).toBe('grupos-eliminacion');
    expect(() => canonicalFormat('pelota-paleta')).toThrow();
  });

  it('conserva ids, rivales, marcadores y ganadores', () => {
    const bracket = migrateCupStateV1(legacyCup());
    expect(bracket.legs).toBe(2);
    expect(bracket.plan.size).toBe(32);
    expect(bracket.rounds).toHaveLength(1);

    const ties = bracket.rounds[0].ties;
    expect(ties).toHaveLength(16);
    expect(ties[0].id).toBe('cup-round-of-32-0');
    expect(ties[0].matches.map((m) => m.id)).toEqual([
      'cup-round-of-32-0-l1',
      'cup-round-of-32-0-l2',
    ]);
    expect(ties[0].winnerId).toBe('A1');
    expect(ties[0].matches[0].homeScore).toBe(2);
    expect(ties[15].winnerId).toBeUndefined();
  });

  it('un torneo a medio jugar sigue jugándose: se resuelve el cruce que faltaba y avanza de ronda', () => {
    let bracket = migrateCupStateV1(legacyCup());
    // El cruce 15 no estaba jugado. Se carga con la primitiva, no con la copa vieja.
    bracket = recordBracketMatch(bracket, 'cup-round-of-32-15-l1', { homeScore: 3, awayScore: 1 });
    bracket = recordBracketMatch(bracket, 'cup-round-of-32-15-l2', { homeScore: 0, awayScore: 0 });
    expect(bracket.rounds[0].ties[15].winnerId).toBe('A16');

    bracket = advanceBracket(bracket);
    expect(bracket.rounds).toHaveLength(2);
    expect(bracket.rounds[1].round).toBe('round-of-16');
    expect(bracket.rounds[1].ties).toHaveLength(8);
    // Adyacencia: el ganador de la posición 0 contra el de la 1.
    expect(bracket.rounds[1].ties[0].homeTeamId).toBe('A1');
    expect(bracket.rounds[1].ties[0].awayTeamId).toBe('A2');
  });

  it('el campeón guardado sobrevive a la migración', () => {
    const finished: LegacyCupState = {
      ...legacyCup(),
      championId: 'A1',
      runnerUpId: 'B7',
    };
    const bracket = migrateCupStateV1(finished);
    expect(bracket.championId).toBe('A1');
    expect(bracket.runnerUpId).toBe('B7');
  });

  it('sólo se migra lo que hace falta: v2 y las ligas pasan de largo', () => {
    const already = migrateCupStateV1(legacyCup());
    expect(migrateTournamentState('eliminacion', 2, already)).toBe(already);

    const leagueState = { matches: [], standings: [], legs: 2 as const, teamIds: [] };
    expect(migrateTournamentState('liga', 1, leagueState)).toBe(leagueState);
  });
});
