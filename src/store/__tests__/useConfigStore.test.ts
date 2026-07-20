import { describe, it, expect, beforeEach } from 'vitest';
import { useConfigStore } from '../useConfigStore';

const config = () => useConfigStore.getState().config;

describe('updateSkillLimits', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('acepta un rango válido', () => {
    useConfigStore.getState().updateSkillLimits(40, 95);

    expect(config().skillMin).toBe(40);
    expect(config().skillMax).toBe(95);
  });

  it('rechaza un rango invertido en vez de romper el motor', () => {
    const before = { ...config() };

    // Es lo que produce borrar el campo "Máximo": Number('') === 0
    useConfigStore.getState().updateSkillLimits(before.skillMin, 0);

    expect(config().skillMin).toBe(before.skillMin);
    expect(config().skillMax).toBe(before.skillMax);
  });

  it('rechaza min igual a max', () => {
    const before = { ...config() };
    useConfigStore.getState().updateSkillLimits(50, 50);

    expect(config()).toEqual(before);
  });

  it('ignora valores no numéricos', () => {
    const before = { ...config() };
    useConfigStore.getState().updateSkillLimits(Number.NaN, Number.NaN);

    expect(config()).toEqual(before);
  });

  it('mantiene siempre skillMin < skillMax', () => {
    const attempts: Array<[number, number]> = [
      [0, 0], [99, 1], [100, 100], [-50, -10], [80, 20], [30, 100],
    ];

    for (const [min, max] of attempts) {
      useConfigStore.getState().updateSkillLimits(min, max);
      expect(config().skillMin).toBeLessThan(config().skillMax);
    }
  });
});
