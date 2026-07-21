import { describe, it, expect, beforeEach } from 'vitest';
import { calculateSkillChanges, getStageImportance } from '../engine';
import { useConfigStore } from '../../store/useConfigStore';

const cfg = () => useConfigStore.getState().config;

describe('getStageImportance', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('mapea cada etapa a su peso por defecto', () => {
    expect(getStageImportance('qualifier', undefined, cfg())).toBe(0.75);
    expect(getStageImportance('confed-group', undefined, cfg())).toBe(1.1);
    expect(getStageImportance('confed-knockout', 'semi', cfg())).toBe(1.4);
    expect(getStageImportance('world-cup-group', undefined, cfg())).toBe(1.25);
    expect(getStageImportance('world-cup-knockout', 'final', cfg())).toBe(1.6);
  });

  it('continental: rondas tempranas vs tardías', () => {
    expect(getStageImportance('continental', 'round-of-64', cfg())).toBe(0.9);
    expect(getStageImportance('continental', 'round-of-16', cfg())).toBe(0.9);
    expect(getStageImportance('continental', 'quarter', cfg())).toBe(1.2);
    expect(getStageImportance('continental', 'final', cfg())).toBe(1.2);
  });

  it('etapa desconocida o sin definir → 1 (neutro)', () => {
    expect(getStageImportance(undefined, undefined, cfg())).toBe(1);
    expect(getStageImportance('lo-que-sea', undefined, cfg())).toBe(1);
  });
});

describe('calculateSkillChanges con importancia', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('importancia 0 → cambio de skill 0', () => {
    const { homeChange, awayChange } = calculateSkillChanges(80, 70, 3, 0, 0);
    expect(homeChange).toBe(0);
    expect(awayChange).toBeCloseTo(0, 5);
  });

  it('importancia 2 ≈ el doble del cambio con importancia 1', () => {
    const base = calculateSkillChanges(80, 70, 3, 0, 1);
    const doubled = calculateSkillChanges(80, 70, 3, 0, 2);
    expect(doubled.homeChange).toBeCloseTo(base.homeChange * 2, 1);
    // El cambio de local sigue siendo el opuesto del de visitante
    expect(doubled.awayChange).toBeCloseTo(-doubled.homeChange, 5);
  });

  it('default de importancia = 1 (mismo resultado que pasar 1 explícito)', () => {
    const implicit = calculateSkillChanges(80, 70, 3, 0);
    const explicit = calculateSkillChanges(80, 70, 3, 0, 1);
    expect(implicit).toEqual(explicit);
  });
});
