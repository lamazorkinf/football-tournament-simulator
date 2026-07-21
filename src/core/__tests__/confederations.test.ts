import { describe, it, expect } from 'vitest';
import { generateConfederationsGroups } from '../confederations';
import type { ConfederationFinalists } from '../confederations';
import type { Team, Region } from '../../types';

/** 4 confederaciones (Europe, America, Africa, Asia), campeón + subcampeón c/u. */
const FINALISTS: ConfederationFinalists[] = [
  { region: 'Europe', championId: 'EUR-C', runnerUpId: 'EUR-R' },
  { region: 'America', championId: 'AME-C', runnerUpId: 'AME-R' },
  { region: 'Africa', championId: 'AFR-C', runnerUpId: 'AFR-R' },
  { region: 'Asia', championId: 'ASI-C', runnerUpId: 'ASI-R' },
];

/**
 * Skills elegidos para que exista un reparto PERFECTO (diff 0):
 * {100,30,40,70} = 240 y {20,90,80,50} = 240.
 */
function makeFinalistTeams(): Team[] {
  const skills: Record<string, number> = {
    'EUR-C': 100, 'EUR-R': 20,
    'AME-C': 90, 'AME-R': 30,
    'AFR-C': 80, 'AFR-R': 40,
    'ASI-C': 70, 'ASI-R': 50,
  };
  const regionOf: Record<string, Region> = {
    'EUR-C': 'Europe', 'EUR-R': 'Europe',
    'AME-C': 'America', 'AME-R': 'America',
    'AFR-C': 'Africa', 'AFR-R': 'Africa',
    'ASI-C': 'Asia', 'ASI-R': 'Asia',
  };
  return Object.keys(skills).map((id) => ({
    id,
    name: id,
    flag: '🏳️',
    region: regionOf[id],
    skill: skills[id],
  }));
}

describe('generateConfederationsGroups', () => {
  const teams = makeFinalistTeams();
  const skillOf = (id: string) => teams.find((t) => t.id === id)!.skill;
  const regionOf = (id: string) => teams.find((t) => t.id === id)!.region;

  it('devuelve 2 grupos de 4 equipos, sin duplicados, con los 8 finalistas', () => {
    const groups = generateConfederationsGroups(FINALISTS, teams);
    expect(groups).toHaveLength(2);
    expect(groups[0].teamIds).toHaveLength(4);
    expect(groups[1].teamIds).toHaveLength(4);
    const all = [...groups[0].teamIds, ...groups[1].teamIds];
    expect(new Set(all).size).toBe(8);
  });

  it('cada grupo tiene exactamente un equipo de cada confederación', () => {
    const groups = generateConfederationsGroups(FINALISTS, teams);
    for (const g of groups) {
      const regions = g.teamIds.map(regionOf).sort();
      expect(regions).toEqual(['Africa', 'America', 'Asia', 'Europe']);
    }
  });

  it('campeón y subcampeón de cada conf caen en grupos opuestos', () => {
    const groups = generateConfederationsGroups(FINALISTS, teams);
    const groupOf = (id: string) =>
      groups[0].teamIds.includes(id) ? 0 : 1;
    for (const f of FINALISTS) {
      expect(groupOf(f.championId)).not.toBe(groupOf(f.runnerUpId));
    }
  });

  it('el sorteo balancea el skill (reparto perfecto: skill total igual)', () => {
    const groups = generateConfederationsGroups(FINALISTS, teams);
    const total = (g: (typeof groups)[number]) =>
      g.teamIds.reduce((s, id) => s + skillOf(id), 0);
    expect(total(groups[0])).toBe(total(groups[1])); // 240 = 240
  });

  it('cada grupo: 6 partidos confed-group, matchdays 1-3, standings en 0', () => {
    const groups = generateConfederationsGroups(FINALISTS, teams);
    for (const g of groups) {
      expect(g.matches).toHaveLength(6);
      expect(g.matches.every((m) => m.stage === 'confed-group')).toBe(true);
      expect(g.matches.every((m) => !m.isPlayed)).toBe(true);
      expect([...new Set(g.matches.map((m) => m.matchday))].sort()).toEqual([1, 2, 3]);
      expect(g.standings).toHaveLength(4);
      expect(g.standings.every((s) => s.played === 0 && s.points === 0)).toBe(true);
      // letras A-D asignadas una vez cada una
      const letters = Object.values(g.letterAssignments ?? {}).sort();
      expect(letters).toEqual(['A', 'B', 'C', 'D']);
    }
  });

  it('los partidos referencian solo equipos del propio grupo', () => {
    const groups = generateConfederationsGroups(FINALISTS, teams);
    for (const g of groups) {
      const ids = new Set(g.teamIds);
      for (const m of g.matches) {
        expect(ids.has(m.homeTeamId)).toBe(true);
        expect(ids.has(m.awayTeamId)).toBe(true);
      }
    }
  });

  it('rechaza un número de confederaciones distinto de 4', () => {
    expect(() => generateConfederationsGroups(FINALISTS.slice(0, 3), teams)).toThrow();
  });
});
