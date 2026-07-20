import { describe, it, expect } from 'vitest';
import type { WorldCupGroup, KnockoutMatch, TeamStanding } from '../../types';
import {
  generateRoundOf32,
  generateRoundOf16,
  generateQuarterFinals,
  generateSemiFinals,
  generateFinal,
} from '../knockout';

const GROUP_LETTERS = 'ABCDEFGHIJKLMNOP'.split('');

/** El id de equipo codifica su grupo: "A1" = ganador del grupo A, "A2" = subcampeón. */
function groupOf(teamId: string): string {
  return teamId[0];
}

function buildStanding(teamId: string, points: number): TeamStanding {
  return {
    teamId,
    played: 3,
    won: points / 3,
    drawn: 0,
    lost: 3 - points / 3,
    goalsFor: points,
    goalsAgainst: 0,
    goalDifference: points,
    points,
  };
}

/** 16 grupos (A-P) de 4 equipos, con posiciones ya definidas de forma determinista. */
function buildGroups(): WorldCupGroup[] {
  return GROUP_LETTERS.map((letter) => ({
    id: `group-${letter}`,
    name: `Group ${letter}`,
    teamIds: [1, 2, 3, 4].map((n) => `${letter}${n}`),
    matches: [],
    standings: [
      buildStanding(`${letter}1`, 9),
      buildStanding(`${letter}2`, 6),
      buildStanding(`${letter}3`, 3),
      buildStanding(`${letter}4`, 0),
    ],
  }));
}

/** PRNG determinista para que los tests sean reproducibles. */
function makeRng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** Resuelve una ronda eligiendo un ganador con el PRNG. */
function playRound(matches: KnockoutMatch[], rng: () => number): KnockoutMatch[] {
  return matches.map((m) => {
    const homeWins = rng() < 0.5;
    return {
      ...m,
      isPlayed: true,
      homeScore: homeWins ? 1 : 0,
      awayScore: homeWins ? 0 : 1,
      winnerId: homeWins ? m.homeTeamId : m.awayTeamId,
      loserId: homeWins ? m.awayTeamId : m.homeTeamId,
    };
  });
}

/** Simula el bracket completo y devuelve todos los partidos con su ronda. */
function simulateBracket(seed: number): KnockoutMatch[] {
  const rng = makeRng(seed);
  const all: KnockoutMatch[] = [];

  const r32 = generateRoundOf32(buildGroups());
  all.push(...r32);
  const r32Played = playRound(r32, rng);

  const r16 = generateRoundOf16(r32Played);
  all.push(...r16);
  const r16Played = playRound(r16, rng);

  const qf = generateQuarterFinals(r16Played);
  all.push(...qf);
  const qfPlayed = playRound(qf, rng);

  const sf = generateSemiFinals(qfPlayed);
  all.push(...sf);
  const sfPlayed = playRound(sf, rng);

  const final = generateFinal(sfPlayed);
  if (final) all.push(final);

  return all;
}

describe('generateRoundOf32', () => {
  it('genera 16 partidos, uno por cada par de grupos', () => {
    const r32 = generateRoundOf32(buildGroups());
    expect(r32).toHaveLength(16);
  });

  it('nunca enfrenta a dos equipos del mismo grupo', () => {
    const r32 = generateRoundOf32(buildGroups());
    const sameGroup = r32.filter((m) => groupOf(m.homeTeamId) === groupOf(m.awayTeamId));
    expect(sameGroup).toEqual([]);
  });

  it('empareja ganadores contra subcampeones', () => {
    const r32 = generateRoundOf32(buildGroups());
    for (const m of r32) {
      expect(m.homeTeamId.endsWith('1')).toBe(true);
      expect(m.awayTeamId.endsWith('2')).toBe(true);
    }
  });
});

describe('bracket completo', () => {
  it('nunca cruza dos equipos del mismo grupo antes de la final', () => {
    const offenders: Array<{ seed: number; round: string; home: string; away: string }> = [];

    for (let seed = 1; seed <= 200; seed++) {
      for (const match of simulateBracket(seed)) {
        if (groupOf(match.homeTeamId) === groupOf(match.awayTeamId) && match.round !== 'final') {
          offenders.push({
            seed,
            round: match.round,
            home: match.homeTeamId,
            away: match.awayTeamId,
          });
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('produce el número de partidos esperado en cada ronda', () => {
    const all = simulateBracket(42);
    const count = (round: string) => all.filter((m) => m.round === round).length;

    expect(count('round-of-32')).toBe(16);
    expect(count('round-of-16')).toBe(8);
    expect(count('quarter')).toBe(4);
    expect(count('semi')).toBe(2);
    expect(count('final')).toBe(1);
  });

  it('cada ronda usa exclusivamente ganadores de la ronda anterior', () => {
    const rng = makeRng(7);
    const r32Played = playRound(generateRoundOf32(buildGroups()), rng);
    const winners = new Set(r32Played.map((m) => m.winnerId));

    for (const match of generateRoundOf16(r32Played)) {
      expect(winners.has(match.homeTeamId)).toBe(true);
      expect(winners.has(match.awayTeamId)).toBe(true);
    }
  });
});
