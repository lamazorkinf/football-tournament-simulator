import { describe, it, expect } from 'vitest';
import type { Team, Region } from '../../types';
import { createSmartWorldCupDraw, validateGroupDistribution } from '../seeding';

const REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

/**
 * 64 equipos con las regiones alternadas, de modo que cada bombo (16 equipos
 * consecutivos por skill) contenga exactamente 4 equipos de cada región.
 * Con este reparto la diversidad regional perfecta es alcanzable.
 */
function buildBalancedTeams(): Team[] {
  return Array.from({ length: 64 }, (_, i) => ({
    id: `team-${i}`,
    name: `Team ${i}`,
    flag: '',
    region: REGIONS[i % 4],
    skill: 100 - i,
  }));
}

/** 64 equipos de la MISMA región: la diversidad es imposible, no debe romperse. */
function buildSingleRegionTeams(): Team[] {
  return Array.from({ length: 64 }, (_, i) => ({
    id: `team-${i}`,
    name: `Team ${i}`,
    flag: '',
    region: 'Europe' as Region,
    skill: 100 - i,
  }));
}

function regionsOf(teamIds: string[], teams: Team[]): Region[] {
  const byId = new Map(teams.map((t) => [t.id, t]));
  return teamIds.map((id) => byId.get(id)!.region);
}

describe('createSmartWorldCupDraw — invariantes', () => {
  it('crea 16 grupos de 4 equipos sin duplicados', () => {
    const teams = buildBalancedTeams();
    const groups = createSmartWorldCupDraw(teams);

    expect(groups).toHaveLength(16);
    const result = validateGroupDistribution(groups, teams);
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('asigna exactamente un equipo por bombo a cada grupo', () => {
    for (let run = 0; run < 50; run++) {
      const groups = createSmartWorldCupDraw(buildBalancedTeams());

      for (const group of groups) {
        const letters = Object.values(group.letterAssignments || {}).sort();
        expect(letters).toEqual(['A', 'B', 'C', 'D']);
      }
    }
  });

  it('genera 6 partidos por grupo, todos con equipos definidos', () => {
    const groups = createSmartWorldCupDraw(buildBalancedTeams());

    for (const group of groups) {
      expect(group.matches).toHaveLength(6);
      for (const match of group.matches) {
        expect(group.teamIds).toContain(match.homeTeamId);
        expect(group.teamIds).toContain(match.awayTeamId);
        expect(match.homeTeamId).not.toBe(match.awayTeamId);
      }
    }
  });

  it('todos los equipos de un grupo juegan la misma cantidad de partidos', () => {
    const groups = createSmartWorldCupDraw(buildBalancedTeams());

    for (const group of groups) {
      const appearances = new Map<string, number>();
      for (const match of group.matches) {
        appearances.set(match.homeTeamId, (appearances.get(match.homeTeamId) || 0) + 1);
        appearances.set(match.awayTeamId, (appearances.get(match.awayTeamId) || 0) + 1);
      }
      expect([...appearances.values()]).toEqual([3, 3, 3, 3]);
    }
  });
});

describe('createSmartWorldCupDraw — diversidad regional', () => {
  it('con regiones balanceadas, ningún grupo repite región', () => {
    for (let run = 0; run < 50; run++) {
      const teams = buildBalancedTeams();
      const groups = createSmartWorldCupDraw(teams);

      for (const group of groups) {
        const regions = regionsOf(group.teamIds, teams);
        expect(new Set(regions).size).toBe(4);
      }
    }
  });

  it('con 64 equipos de la misma región no rompe ni pierde equipos', () => {
    const teams = buildSingleRegionTeams();
    const groups = createSmartWorldCupDraw(teams);

    expect(validateGroupDistribution(groups, teams).valid).toBe(true);
    for (const group of groups) {
      const letters = Object.values(group.letterAssignments || {}).sort();
      expect(letters).toEqual(['A', 'B', 'C', 'D']);
    }
  });
});
