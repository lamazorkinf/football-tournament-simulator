import { describe, it, expect } from 'vitest';
import type { Match, Team, TeamStanding } from '../../types';
import { initializeStandings, updateStandings, sortStandings } from '../scheduler';

function standing(teamId: string, over: Partial<TeamStanding> = {}): TeamStanding {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    ...over,
  };
}

function playedMatch(home: string, away: string, homeScore: number, awayScore: number): Match {
  return {
    id: `${home}-${away}`,
    homeTeamId: home,
    awayTeamId: away,
    homeScore,
    awayScore,
    isPlayed: true,
    stage: 'qualifier',
  };
}

const TEAMS: Team[] = [
  { id: 'alg', name: 'Argelia', flag: '', region: 'Africa', skill: 70 },
  { id: 'tun', name: 'Túnez', flag: '', region: 'Africa', skill: 70 },
  { id: 'mar', name: 'Marruecos', flag: '', region: 'Africa', skill: 70 },
];

describe('updateStandings', () => {
  it('no muta los standings recibidos', () => {
    const original = initializeStandings(['a', 'b']);
    const snapshot = JSON.parse(JSON.stringify(original));

    const result = updateStandings(original, playedMatch('a', 'b', 2, 0));

    expect(original).toEqual(snapshot);
    expect(result).not.toBe(original);
    expect(result[0]).not.toBe(original[0]);
  });

  it('asigna 3 puntos al ganador y 0 al perdedor', () => {
    const result = updateStandings(initializeStandings(['a', 'b']), playedMatch('a', 'b', 2, 0));

    expect(result.find(s => s.teamId === 'a')).toMatchObject({
      played: 1, won: 1, lost: 0, points: 3, goalsFor: 2, goalsAgainst: 0, goalDifference: 2,
    });
    expect(result.find(s => s.teamId === 'b')).toMatchObject({
      played: 1, won: 0, lost: 1, points: 0, goalsFor: 0, goalsAgainst: 2, goalDifference: -2,
    });
  });

  it('reparte 1 punto a cada equipo en caso de empate', () => {
    const result = updateStandings(initializeStandings(['a', 'b']), playedMatch('a', 'b', 1, 1));

    expect(result.find(s => s.teamId === 'a')).toMatchObject({ drawn: 1, points: 1 });
    expect(result.find(s => s.teamId === 'b')).toMatchObject({ drawn: 1, points: 1 });
  });

  it('ignora los partidos no jugados', () => {
    const original = initializeStandings(['a', 'b']);
    const notPlayed: Match = {
      id: 'x', homeTeamId: 'a', awayTeamId: 'b',
      homeScore: null, awayScore: null, isPlayed: false,
    };

    expect(updateStandings(original, notPlayed)).toBe(original);
  });
});

describe('sortStandings — desempates', () => {
  it('ordena por puntos, luego diferencia de gol, luego goles a favor', () => {
    const table = [
      standing('c', { points: 6, goalDifference: 1, goalsFor: 5 }),
      standing('a', { points: 9, goalDifference: 0, goalsFor: 2 }),
      standing('b', { points: 6, goalDifference: 3, goalsFor: 4 }),
    ];

    expect(sortStandings(table).map(s => s.teamId)).toEqual(['a', 'b', 'c']);
  });

  it('desempata por enfrentamiento directo cuando todo lo demás es igual', () => {
    // Argelia y Túnez empatan en puntos, diferencia de gol y goles a favor.
    // Túnez ganó los dos duelos directos, así que debe quedar por delante
    // pese a ir después alfabéticamente.
    const table = [
      standing('alg', { played: 4, points: 6, goalDifference: 2, goalsFor: 6 }),
      standing('tun', { played: 4, points: 6, goalDifference: 2, goalsFor: 6 }),
    ];
    const matches = [
      playedMatch('tun', 'alg', 2, 0),
      playedMatch('alg', 'tun', 1, 2),
    ];

    expect(sortStandings(table, TEAMS, matches).map(s => s.teamId)).toEqual(['tun', 'alg']);
  });

  it('resuelve empates de tres equipos con la mini-tabla entre ellos', () => {
    // mar le ganó a alg y a tun; tun le ganó a alg. Orden esperado: mar, tun, alg.
    const table = [
      standing('alg', { played: 4, points: 6, goalDifference: 0, goalsFor: 4 }),
      standing('tun', { played: 4, points: 6, goalDifference: 0, goalsFor: 4 }),
      standing('mar', { played: 4, points: 6, goalDifference: 0, goalsFor: 4 }),
    ];
    const matches = [
      playedMatch('mar', 'alg', 1, 0),
      playedMatch('mar', 'tun', 1, 0),
      playedMatch('tun', 'alg', 1, 0),
    ];

    expect(sortStandings(table, TEAMS, matches).map(s => s.teamId)).toEqual(['mar', 'tun', 'alg']);
  });

  it('sin partidos, cae al orden alfabético de forma determinista', () => {
    const table = [
      standing('tun', { points: 6, goalDifference: 2, goalsFor: 6 }),
      standing('alg', { points: 6, goalDifference: 2, goalsFor: 6 }),
    ];

    expect(sortStandings(table, TEAMS).map(s => s.teamId)).toEqual(['alg', 'tun']);
  });

  it('no muta el array recibido', () => {
    const table = [
      standing('b', { points: 3 }),
      standing('a', { points: 9 }),
    ];
    const order = table.map(s => s.teamId);

    sortStandings(table, TEAMS);

    expect(table.map(s => s.teamId)).toEqual(order);
  });

  it('el enfrentamiento directo no altera el orden de equipos no empatados', () => {
    const table = [
      standing('alg', { points: 9, goalDifference: 5, goalsFor: 8 }),
      standing('tun', { points: 3, goalDifference: -2, goalsFor: 2 }),
    ];
    const matches = [playedMatch('tun', 'alg', 3, 0)];

    expect(sortStandings(table, TEAMS, matches).map(s => s.teamId)).toEqual(['alg', 'tun']);
  });
});
