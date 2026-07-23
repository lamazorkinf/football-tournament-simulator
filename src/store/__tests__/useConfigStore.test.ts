import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useConfigStore, DEFAULT_CONFIG } from '../useConfigStore';
import { queueSettingsSave } from '../../lib/persistSettings';

vi.mock('../../lib/persistSettings', () => ({
  queueSettingsSave: vi.fn(),
  flushSettingsSave: vi.fn(),
}));

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

describe('importanceByStage', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('tiene los 7 pesos por defecto correctos', () => {
    expect(config().importanceByStage).toEqual({
      qualifier: 0.75,
      continentalEarly: 0.9,
      continentalLate: 1.2,
      confedGroup: 1.1,
      confedKnockout: 1.4,
      wcGroup: 1.25,
      wcKnockout: 1.6,
    });
  });

  it('updateImportance cambia un solo peso sin tocar los demás', () => {
    useConfigStore.getState().updateImportance('wcKnockout', 2);
    expect(config().importanceByStage.wcKnockout).toBe(2);
    expect(config().importanceByStage.qualifier).toBe(0.75);
  });

  it('updateImportance clampea al rango [0, 5]', () => {
    useConfigStore.getState().updateImportance('qualifier', -1);
    expect(config().importanceByStage.qualifier).toBe(0);
    useConfigStore.getState().updateImportance('qualifier', 99);
    expect(config().importanceByStage.qualifier).toBe(5);
  });

  it('updateImportance ignora valores no numéricos', () => {
    useConfigStore.getState().updateImportance('wcGroup', Number.NaN);
    expect(config().importanceByStage.wcGroup).toBe(1.25);
  });
});

describe('persistencia en la DB', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
    useConfigStore.getState().applySettings({ scanlines: true });
    vi.mocked(queueSettingsSave).mockClear();
  });

  it('cada cambio de config se encola para la DB, no para localStorage', () => {
    useConfigStore.getState().updateKFactor(3);

    expect(queueSettingsSave).toHaveBeenCalledWith({ engineConfig: config() });
    expect(config().kFactor).toBe(3);
    expect(localStorage.getItem('football-engine-config')).toBeNull();
  });

  it('un cambio rechazado no se encola', () => {
    // Rango invertido: updateSkillLimits descarta el cambio.
    useConfigStore.getState().updateSkillLimits(80, 20);

    expect(queueSettingsSave).not.toHaveBeenCalled();
  });

  it('toggleScanlines encola sólo la preferencia visual', () => {
    useConfigStore.getState().toggleScanlines();

    expect(queueSettingsSave).toHaveBeenCalledWith({ scanlines: false });
  });

  it('applySettings escribe sin re-guardar (los datos vienen de la DB)', () => {
    const stored = { ...DEFAULT_CONFIG, kFactor: 7 };
    useConfigStore.getState().applySettings({ engineConfig: stored, scanlines: false });

    expect(config().kFactor).toBe(7);
    expect(useConfigStore.getState().scanlines).toBe(false);
    expect(queueSettingsSave).not.toHaveBeenCalled();
  });
});
