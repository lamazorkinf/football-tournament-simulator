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
