import { describe, it, expect } from 'vitest';
import {
  getContinentalByeCount,
  getContinentalRoundOf64Count,
  seedSlots,
} from '../continental';

describe('getContinentalByeCount', () => {
  it('confederaciones de 55 → 9 byes, de 45 → 19 byes', () => {
    expect(getContinentalByeCount(55)).toBe(9);
    expect(getContinentalByeCount(45)).toBe(19);
  });

  it('64 equipos → 0 byes; 32 equipos → 32 byes', () => {
    expect(getContinentalByeCount(64)).toBe(0);
    expect(getContinentalByeCount(32)).toBe(32);
  });

  it('fuera de rango [32,64] lanza error', () => {
    expect(() => getContinentalByeCount(31)).toThrow();
    expect(() => getContinentalByeCount(65)).toThrow();
  });
});

describe('getContinentalRoundOf64Count', () => {
  it('cruces R64 = teamCount − 32', () => {
    expect(getContinentalRoundOf64Count(55)).toBe(23);
    expect(getContinentalRoundOf64Count(45)).toBe(13);
    expect(getContinentalRoundOf64Count(64)).toBe(32);
    expect(getContinentalRoundOf64Count(32)).toBe(0);
  });

  it('byes + 2×cruces = teamCount (los byes no juegan R64)', () => {
    for (const n of [45, 55, 64]) {
      expect(getContinentalByeCount(n) + 2 * getContinentalRoundOf64Count(n)).toBe(n);
    }
  });
});

describe('seedSlots', () => {
  it('tamaños chicos: arrays exactos del bracket estándar', () => {
    expect(seedSlots(1)).toEqual([0]);
    expect(seedSlots(2)).toEqual([0, 1]);
    expect(seedSlots(4)).toEqual([0, 3, 1, 2]);
    expect(seedSlots(8)).toEqual([0, 7, 3, 4, 1, 6, 2, 5]);
  });

  it('size=32: 32 slots, cada semilla 0..31 exactamente una vez', () => {
    const slots = seedSlots(32);
    expect(slots).toHaveLength(32);
    expect([...slots].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 32 }, (_, i) => i),
    );
  });

  it('siembra 0 en la 1ª mitad y siembra 1 en la 2ª mitad (mitades opuestas)', () => {
    const slots = seedSlots(32);
    expect(slots[0]).toBe(0); // top seed, slot 0 → match 0 (mitad alta)
    expect(slots[16]).toBe(1); // seed 1, slot 16 → match 8 (mitad baja)
  });

  it('rechaza tamaños que no son potencia de 2', () => {
    expect(() => seedSlots(0)).toThrow();
    expect(() => seedSlots(6)).toThrow();
  });
});

import { generateContinentalBracket } from '../continental';
import type { Team, Region } from '../../types';

/** Equipos sintéticos con skills estrictamente descendentes (100, 99, …). */
function makeTeams(region: Region, count: number): Team[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${region}-${i}`,
    name: `${region} ${i}`,
    flag: '🏳️',
    region,
    skill: 100 - i, // único y descendente
  }));
}

describe('generateContinentalBracket', () => {
  it('55 equipos: 9 byes fuera de R64 y 23 cruces de R64', () => {
    const teams = makeTeams('Europe', 55);
    const b = generateContinentalBracket('Europe', teams);

    expect(b.region).toBe('Europe');
    expect(b.byeTeamIds).toHaveLength(9);
    expect(b.roundOf64).toHaveLength(23);
    expect(b.roundOf32).toEqual([]);
    expect(b.final).toBeNull();

    // Los 9 byes son los de mayor skill (ids Europe-0..Europe-8).
    expect(b.byeTeamIds).toEqual(teams.slice(0, 9).map((t) => t.id));

    // Ningún bye juega R64.
    const r64Ids = new Set(b.roundOf64.flatMap((m) => [m.homeTeamId, m.awayTeamId]));
    for (const id of b.byeTeamIds) expect(r64Ids.has(id)).toBe(false);

    // 9 byes + 46 en R64 = 55 equipos, sin duplicados.
    expect(r64Ids.size).toBe(46);
    expect(new Set([...b.byeTeamIds, ...r64Ids]).size).toBe(55);
  });

  it('45 equipos: 19 byes y 13 cruces de R64', () => {
    const b = generateContinentalBracket('America', makeTeams('America', 45));
    expect(b.byeTeamIds).toHaveLength(19);
    expect(b.roundOf64).toHaveLength(13);
  });

  it('cada cruce de R64 empareja bombo alto (home) vs bombo bajo (away)', () => {
    const teams = makeTeams('Asia', 55);
    const skill = new Map(teams.map((t) => [t.id, t.skill]));
    const b = generateContinentalBracket('Asia', teams);
    // El bombo alto = 23 mejores de los 46 no-cabeza; el bajo = 23 peores.
    // Con skills únicos descendentes, home.skill > away.skill en TODO cruce.
    for (const m of b.roundOf64) {
      expect(skill.get(m.homeTeamId)!).toBeGreaterThan(skill.get(m.awayTeamId)!);
    }
  });

  it('cada partido R64: stage continental, ronda round-of-64, matchday 1, posición única', () => {
    const b = generateContinentalBracket('Africa', makeTeams('Africa', 55));
    const positions = b.roundOf64.map((m) => m.position);
    expect(new Set(positions).size).toBe(b.roundOf64.length);
    for (const m of b.roundOf64) {
      expect(m.stage).toBe('continental');
      expect(m.round).toBe('round-of-64');
      expect(m.matchday).toBe(1);
      expect(m.isPlayed).toBe(false);
      expect(m.homeScore).toBeNull();
    }
    // posiciones 0..22 contiguas
    expect([...positions].sort((a, b2) => (a ?? 0) - (b2 ?? 0))).toEqual(
      Array.from({ length: 23 }, (_, i) => i),
    );
  });
});
