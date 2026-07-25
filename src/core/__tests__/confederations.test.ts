import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  generateConfederationsGroups,
  generateConfederationsSemiFinals,
  generateConfederationsFinal,
  generateConfederationsThirdPlace,
} from '../confederations';
import type { ConfederationFinalists } from '../confederations';
import type { Team, Region, WorldCupGroup, TeamStanding, KnockoutMatch } from '../../types';
import { getStageImportance } from '../engine';
import { useConfigStore } from '../../store/useConfigStore';

// Sin este mock, resetToDefaults() deja armada una escritura real a Supabase
// (mismo proyecto que producción): ver src/store/__tests__/useConfigStore.test.ts.
vi.mock('../../lib/persistSettings', () => ({
  queueSettingsSave: vi.fn(),
  flushSettingsSave: vi.fn(),
}));

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

/** Standing con puntos/GD dados (para forzar orden 1º/2º sin simular). */
function standing(teamId: string, points: number, gd = 0): TeamStanding {
  return {
    teamId,
    played: 3,
    won: points,
    drawn: 0,
    lost: 3 - points,
    goalsFor: gd + 3,
    goalsAgainst: 3,
    goalDifference: gd,
    points: points * 3,
  };
}

/** Grupo "jugado": 6 partidos isPlayed + standings con orden explícito. */
function playedGroup(name: string, order: string[]): WorldCupGroup {
  // order[0] = 1º, order[3] = 4º (puntos decrecientes 3,2,1,0)
  const standings = order.map((id, i) => standing(id, 3 - i));
  const matches = Array.from({ length: 6 }, (_, i) => ({
    id: `${name}-m${i}`,
    homeTeamId: order[0],
    awayTeamId: order[1],
    homeScore: 1,
    awayScore: 0,
    isPlayed: true,
    stage: 'confed-group',
    matchday: (i % 3) + 1,
  }));
  return { id: name, name, teamIds: order, matches, standings };
}

describe('generateConfederationsSemiFinals', () => {
  const teams: Team[] = [];

  it('SF1 = 1ºA vs 2ºB, SF2 = 1ºB vs 2ºA (position 0 y 1)', () => {
    const groups = [
      playedGroup('Group A', ['A1', 'A2', 'A3', 'A4']),
      playedGroup('Group B', ['B1', 'B2', 'B3', 'B4']),
    ];
    const semis = generateConfederationsSemiFinals(groups, teams);
    expect(semis).toHaveLength(2);

    const sf1 = semis.find((m) => m.position === 0)!;
    const sf2 = semis.find((m) => m.position === 1)!;
    expect(sf1.homeTeamId).toBe('A1');
    expect(sf1.awayTeamId).toBe('B2');
    expect(sf2.homeTeamId).toBe('B1');
    expect(sf2.awayTeamId).toBe('A2');

    for (const m of semis) {
      expect(m.round).toBe('semi');
      expect(m.stage).toBe('confed-knockout');
      expect(m.matchday).toBe(4);
      expect(m.isPlayed).toBe(false);
    }
  });

  it('ordena por nombre: da igual el orden del array de grupos', () => {
    const groups = [
      playedGroup('Group B', ['B1', 'B2', 'B3', 'B4']),
      playedGroup('Group A', ['A1', 'A2', 'A3', 'A4']),
    ];
    const semis = generateConfederationsSemiFinals(groups, teams);
    const sf1 = semis.find((m) => m.position === 0)!;
    expect(sf1.homeTeamId).toBe('A1');
    expect(sf1.awayTeamId).toBe('B2');
  });

  it('guard: si algún partido de grupo no se jugó, devuelve []', () => {
    const groups = [
      playedGroup('Group A', ['A1', 'A2', 'A3', 'A4']),
      playedGroup('Group B', ['B1', 'B2', 'B3', 'B4']),
    ];
    groups[1].matches[0].isPlayed = false;
    expect(generateConfederationsSemiFinals(groups, teams)).toEqual([]);
  });

  it('guard: distinto de 2 grupos devuelve []', () => {
    const groups = [playedGroup('Group A', ['A1', 'A2', 'A3', 'A4'])];
    expect(generateConfederationsSemiFinals(groups, teams)).toEqual([]);
  });
});

function playedSemis(): KnockoutMatch[] {
  return [
    {
      id: 'sf0', homeTeamId: 'A1', awayTeamId: 'B2',
      homeScore: 2, awayScore: 1, isPlayed: true,
      stage: 'confed-knockout', round: 'semi', matchday: 4, position: 0,
      winnerId: 'A1', loserId: 'B2',
    },
    {
      id: 'sf1', homeTeamId: 'B1', awayTeamId: 'A2',
      homeScore: 0, awayScore: 3, isPlayed: true,
      stage: 'confed-knockout', round: 'semi', matchday: 4, position: 1,
      winnerId: 'A2', loserId: 'B1',
    },
  ];
}

describe('final y tercer puesto confed', () => {
  it('final = ganadores de las semis; matchday 5, round final', () => {
    const final = generateConfederationsFinal(playedSemis());
    expect(final).not.toBeNull();
    expect(final!.homeTeamId).toBe('A1');
    expect(final!.awayTeamId).toBe('A2');
    expect(final!.round).toBe('final');
    expect(final!.stage).toBe('confed-knockout');
    expect(final!.matchday).toBe(5);
  });

  it('tercer puesto = perdedores de las semis; matchday 5, round third-place', () => {
    const third = generateConfederationsThirdPlace(playedSemis());
    expect(third).not.toBeNull();
    expect(third!.homeTeamId).toBe('B2');
    expect(third!.awayTeamId).toBe('B1');
    expect(third!.round).toBe('third-place');
    expect(third!.stage).toBe('confed-knockout');
    expect(third!.matchday).toBe(5);
  });

  it('guards: semis incompletas → null', () => {
    expect(generateConfederationsFinal([])).toBeNull();
    expect(generateConfederationsThirdPlace([])).toBeNull();
  });
});

describe('acceptance: pesos Elo confed vivos', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('un partido de grupo confed da importance 1.1 y uno de llave 1.4', () => {
    const cfg = useConfigStore.getState().config;
    const groups = generateConfederationsGroups(FINALISTS, makeFinalistTeams());
    const groupMatch = groups[0].matches[0];
    expect(getStageImportance(groupMatch.stage, undefined, cfg)).toBe(1.1);
    expect(getStageImportance(groupMatch.stage, undefined, cfg)).not.toBe(1);

    const final = generateConfederationsFinal(playedSemis())!;
    expect(getStageImportance(final.stage, final.round, cfg)).toBe(1.4);
  });
});
