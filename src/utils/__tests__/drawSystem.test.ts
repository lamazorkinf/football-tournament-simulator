import { describe, it, expect } from 'vitest';
import type { Team, Group, Region } from '../../types';
import { performDraw, generateGroupMatches } from '../drawSystem';

function buildTeams(count: number, region: Region = 'Europe'): Team[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `team-${i}`,
    name: `Team ${i}`,
    flag: '',
    region,
    skill: 90 - i * 0.1,
  }));
}

function buildGroups(count: number, region: Region = 'Europe'): Group[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `group-${i}`,
    name: `Group ${String.fromCharCode(65 + i)}`,
    region,
    teamIds: [],
    matches: [],
    standings: [],
    isDrawComplete: false,
  }));
}

describe('performDraw', () => {
  it('reparte 55 equipos en 11 grupos de 5', () => {
    const groups = performDraw(buildGroups(11), buildTeams(55));

    expect(groups).toHaveLength(11);
    for (const group of groups) {
      expect(group.teamIds).toHaveLength(5);
      expect(Object.values(group.letterAssignments!).sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
      expect(group.isDrawComplete).toBe(true);
    }
  });

  it('asigna cada equipo exactamente una vez', () => {
    const teams = buildTeams(55);
    const groups = performDraw(buildGroups(11), teams);

    const assigned = groups.flatMap(g => g.teamIds);
    expect(assigned).toHaveLength(55);
    expect(new Set(assigned).size).toBe(55);
  });

  it('no revienta cuando la región no es múltiplo de 5', () => {
    // 54 equipos -> Math.ceil(54/5) = 11 grupos, pero el último bombo queda corto.
    const teams = buildTeams(54);
    const groups = performDraw(buildGroups(11), teams);

    const assigned = groups.flatMap(g => g.teamIds);
    expect(assigned).toHaveLength(54);
    expect(new Set(assigned).size).toBe(54);

    // Ningún grupo puede quedar vacío ni con equipos indefinidos.
    for (const group of groups) {
      expect(group.teamIds.length).toBeGreaterThan(0);
      expect(group.teamIds.every(id => typeof id === 'string')).toBe(true);
    }
  });

  it('tolera varios tamaños de región sin perder equipos', () => {
    for (const count of [51, 52, 53, 54, 56, 57]) {
      const numGroups = Math.ceil(count / 5);
      const groups = performDraw(buildGroups(numGroups), buildTeams(count));
      const assigned = groups.flatMap(g => g.teamIds);

      expect(new Set(assigned).size).toBe(count);
    }
  });
});

describe('generateGroupMatches', () => {
  it('genera 20 partidos de ida y vuelta para un grupo de 5', () => {
    const groups = performDraw(buildGroups(1), buildTeams(5));
    const matches = generateGroupMatches('g', groups[0].letterAssignments!);

    expect(matches).toHaveLength(20);
    for (const match of matches) {
      expect(match.homeTeamId).toBeDefined();
      expect(match.awayTeamId).toBeDefined();
      expect(match.homeTeamId).not.toBe(match.awayTeamId);
    }
  });

  it('genera un round-robin válido para un grupo incompleto de 4', () => {
    const letterAssignments = {
      'team-0': 'A' as const,
      'team-1': 'B' as const,
      'team-2': 'C' as const,
      'team-3': 'D' as const,
    };
    const matches = generateGroupMatches('g', letterAssignments);

    // 4 equipos x 3 rivales x 2 (ida y vuelta) = 12
    expect(matches).toHaveLength(12);
    for (const match of matches) {
      expect(match.homeTeamId).toBeDefined();
      expect(match.awayTeamId).toBeDefined();
    }

    // Cada equipo juega 3 de local y 3 de visitante.
    for (const teamId of Object.keys(letterAssignments)) {
      expect(matches.filter(m => m.homeTeamId === teamId)).toHaveLength(3);
      expect(matches.filter(m => m.awayTeamId === teamId)).toHaveLength(3);
    }
  });
});
