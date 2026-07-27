import { describe, it, expect } from 'vitest';
import {
  generateLeagueFixtures,
  createLeagueState,
  recalcLeagueStandings,
  isLeagueComplete,
} from '../league';
import type { Match } from '../../../types';

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `t${i + 1}`);
}

function pairKey(m: Match): string {
  return [m.homeTeamId, m.awayTeamId].sort().join('|');
}

describe('generateLeagueFixtures — round-robin', () => {
  it('una sola vuelta: cada par juega exactamente una vez (N par)', () => {
    const teams = ids(16);
    const matches = generateLeagueFixtures(teams, 1);
    // C(16,2) = 120 partidos.
    expect(matches).toHaveLength(120);

    const seen = new Map<string, number>();
    for (const m of matches) seen.set(pairKey(m), (seen.get(pairKey(m)) ?? 0) + 1);
    expect(seen.size).toBe(120);
    expect([...seen.values()].every((c) => c === 1)).toBe(true);
  });

  it('ida y vuelta: cada par juega dos veces, una de local cada uno', () => {
    const teams = ids(16);
    const matches = generateLeagueFixtures(teams, 2);
    expect(matches).toHaveLength(240); // 120 × 2

    // Cada par ordenado (a vs b) aparece una vez con a de local y otra con b.
    const directed = new Map<string, number>();
    for (const m of matches) {
      const k = `${m.homeTeamId}>${m.awayTeamId}`;
      directed.set(k, (directed.get(k) ?? 0) + 1);
    }
    // 16×15 = 240 orientaciones distintas, cada una exactamente una vez.
    expect(directed.size).toBe(240);
    expect([...directed.values()].every((c) => c === 1)).toBe(true);
  });

  it('ningún equipo juega dos veces en la misma fecha', () => {
    const teams = ids(16);
    const matches = generateLeagueFixtures(teams, 2);
    const byMatchday = new Map<number, string[]>();
    for (const m of matches) {
      const list = byMatchday.get(m.matchday!) ?? [];
      list.push(m.homeTeamId, m.awayTeamId);
      byMatchday.set(m.matchday!, list);
    }
    for (const [, teamsInDay] of byMatchday) {
      expect(new Set(teamsInDay).size).toBe(teamsInDay.length);
    }
  });

  it('N par de 16 equipos: 30 fechas ida y vuelta, 8 partidos por fecha', () => {
    const matches = generateLeagueFixtures(ids(16), 2);
    const matchdays = new Set(matches.map((m) => m.matchday));
    expect(matchdays.size).toBe(30); // (16-1) × 2
    for (let md = 1; md <= 30; md++) {
      expect(matches.filter((m) => m.matchday === md)).toHaveLength(8);
    }
  });

  it('N impar (BYE): cada fecha deja un equipo libre y no hay repetición', () => {
    const teams = ids(15);
    const matches = generateLeagueFixtures(teams, 1);
    // C(15,2) = 105 partidos, 15 fechas de 7 (un equipo libre por fecha).
    expect(matches).toHaveLength(105);
    const matchdays = new Set(matches.map((m) => m.matchday));
    expect(matchdays.size).toBe(15);
    for (const md of matchdays) {
      expect(matches.filter((m) => m.matchday === md)).toHaveLength(7);
    }
    const seen = new Set(matches.map(pairKey));
    expect(seen.size).toBe(105);
  });

  it('todos los partidos arrancan sin jugar y con stage "league"', () => {
    const matches = generateLeagueFixtures(ids(4), 1);
    expect(matches.every((m) => !m.isPlayed && m.stage === 'league')).toBe(true);
    expect(matches.every((m) => m.homeScore === null && m.awayScore === null)).toBe(true);
  });

  it('menos de 2 equipos: sin fixture', () => {
    expect(generateLeagueFixtures(ids(1), 2)).toEqual([]);
    expect(generateLeagueFixtures([], 2)).toEqual([]);
  });
});

describe('createLeagueState / standings', () => {
  it('estado inicial: tabla en cero para todos', () => {
    const state = createLeagueState(ids(4), 2);
    expect(state.standings).toHaveLength(4);
    expect(state.standings.every((s) => s.played === 0 && s.points === 0)).toBe(true);
    expect(isLeagueComplete(state)).toBe(false);
  });

  it('recalcula la tabla desde los partidos jugados', () => {
    const state = createLeagueState(['a', 'b', 'c', 'd'], 1);
    // Jugar todos: 'a' gana siempre, 'b' segundo, etc. (a>b>c>d).
    const order = ['a', 'b', 'c', 'd'];
    for (const m of state.matches) {
      const hi = order.indexOf(m.homeTeamId);
      const ai = order.indexOf(m.awayTeamId);
      m.isPlayed = true;
      // Gana el de menor índice (mejor equipo).
      if (hi < ai) {
        m.homeScore = 2;
        m.awayScore = 0;
      } else {
        m.homeScore = 0;
        m.awayScore = 2;
      }
    }
    const table = recalcLeagueStandings(state);
    expect(table.map((s) => s.teamId)).toEqual(['a', 'b', 'c', 'd']);
    expect(table[0].won).toBe(3);
    expect(table[0].points).toBe(9);
    expect(table[3].lost).toBe(3);
    expect(isLeagueComplete(state)).toBe(true);
  });
});
