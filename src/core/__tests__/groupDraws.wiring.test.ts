import { describe, it, expect } from 'vitest';
import type { Group, Region, Team } from '../../types';
import { performDraw, generateGroupMatches } from '../../utils/drawSystem';
import { createSmartWorldCupDraw } from '../seeding';
import { generateConfederationsGroups, type ConfederationFinalists } from '../confederations';

/**
 * Los tres sorteos de grupos del ciclo comparten desde ahora una sola primitiva
 * (core/formats/groupStage.ts). Lo que estos tests fijan NO son las invariantes
 * de cada sorteo —eso ya lo cubren drawSystem.test / seeding.test /
 * confederations.test, que pasaron sin tocarse— sino lo único que la
 * unificación podía romper en silencio: la NUMERACIÓN DE FECHAS que impone cada
 * plantilla.
 *
 * Es el punto delicado del cambio: todo el calendario del ciclo está indexado
 * por `matchday`, así que si las clasificatorias pasaran de 20 fechas a las 10
 * del método del círculo, el usuario vería la mitad de las jornadas.
 */

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

/** Cuántos partidos hay por fecha, en orden de fecha. */
function perMatchday(matches: Array<{ matchday?: number }>): number[] {
  const counts = new Map<number, number>();
  for (const m of matches) counts.set(m.matchday!, (counts.get(m.matchday!) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
}

describe('clasificatorias — plantilla fifa-5', () => {
  it('20 partidos en 20 fechas, uno por fecha', () => {
    const groups = performDraw(buildGroups(11), buildTeams(55));
    const matches = generateGroupMatches(groups[0].id, groups[0].letterAssignments!);

    expect(matches).toHaveLength(20);
    expect(perMatchday(matches)).toEqual(Array(20).fill(1));
    expect(matches.every((m) => m.stage === 'qualifier')).toBe(true);
  });

  it('los ids no se repiten entre los grupos de una región', () => {
    const groups = performDraw(buildGroups(11), buildTeams(55));
    const ids = groups.flatMap((g) => generateGroupMatches(g.id, g.letterAssignments!)).map((m) => m.id);

    expect(ids).toHaveLength(220);
    expect(new Set(ids).size).toBe(220);
  });
});

describe('Mundial — plantilla fifa-4', () => {
  const worldCupTeams = (): Team[] =>
    Array.from({ length: 64 }, (_, i) => ({
      id: `wc-${i}`,
      name: `WC ${i}`,
      flag: '',
      region: (['Europe', 'America', 'Africa', 'Asia'] as Region[])[i % 4],
      skill: 100 - i,
    }));

  it('6 partidos por grupo en 3 fechas, dos por fecha', () => {
    for (const group of createSmartWorldCupDraw(worldCupTeams())) {
      expect(group.matches).toHaveLength(6);
      expect(perMatchday(group.matches)).toEqual([2, 2, 2]);
    }
  });

  it('los partidos llevan la etapa que conoce el motor', () => {
    const groups = createSmartWorldCupDraw(worldCupTeams());
    expect(groups.flatMap((g) => g.matches).every((m) => m.stage === 'world-cup-group')).toBe(true);
  });

  it('los ids no se repiten entre los 16 grupos', () => {
    const ids = createSmartWorldCupDraw(worldCupTeams()).flatMap((g) => g.matches.map((m) => m.id));
    expect(ids).toHaveLength(96);
    expect(new Set(ids).size).toBe(96);
  });
});

describe('Copa Confederaciones — plantilla fifa-4', () => {
  const FINALISTS: ConfederationFinalists[] = [
    { region: 'Europe', championId: 'EUR-C', runnerUpId: 'EUR-R' },
    { region: 'America', championId: 'AME-C', runnerUpId: 'AME-R' },
    { region: 'Africa', championId: 'AFR-C', runnerUpId: 'AFR-R' },
    { region: 'Asia', championId: 'ASI-C', runnerUpId: 'ASI-R' },
  ];
  const teams: Team[] = FINALISTS.flatMap((f, i) => [
    { id: f.championId, name: f.championId, flag: '', region: f.region, skill: 100 - i * 10 },
    { id: f.runnerUpId, name: f.runnerUpId, flag: '', region: f.region, skill: 20 + i * 10 },
  ]);

  it('6 partidos por grupo en 3 fechas, dos por fecha', () => {
    for (const group of generateConfederationsGroups(FINALISTS, teams)) {
      expect(group.matches).toHaveLength(6);
      expect(perMatchday(group.matches)).toEqual([2, 2, 2]);
      expect(group.matches.every((m) => m.stage === 'confed-group')).toBe(true);
    }
  });

  it('los ids no se repiten entre los 2 grupos', () => {
    const ids = generateConfederationsGroups(FINALISTS, teams).flatMap((g) =>
      g.matches.map((m) => m.id),
    );
    expect(new Set(ids).size).toBe(12);
  });
});
