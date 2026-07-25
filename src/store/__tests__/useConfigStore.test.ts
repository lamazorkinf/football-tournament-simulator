import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useConfigStore, DEFAULT_CONFIG } from '../useConfigStore';
import { queueSettingsSave } from '../../lib/persistSettings';
import { DEFAULT_FATIGUE, ENERGY_MAX, type FatigueConfig } from '../../core/energy';

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

describe('fatigue (Task 9: controles de cansancio y oficio)', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('updateFatigue cambia un solo campo sin tocar los demás', () => {
    useConfigStore.getState().updateFatigue({ clutchGain: 0.35 });
    expect(config().fatigue.clutchGain).toBe(0.35);
    expect(config().fatigue.energyMin).toBe(DEFAULT_FATIGUE.energyMin);
    expect(config().fatigue.recovery).toBe(DEFAULT_FATIGUE.recovery);
  });

  // Con los sliders reales esto es inalcanzable (un <input type="range"> no
  // emite valores fuera de min/max), pero `updateFatigue` recibe un patch
  // libre — igual que los cinco setters hermanos, no debería confiar en que
  // el único llamador sea la UI.
  it('clampea energyMin por debajo de ENERGY_MAX', () => {
    useConfigStore.getState().updateFatigue({ energyMin: 500 });
    expect(config().fatigue.energyMin).toBeLessThan(ENERGY_MAX);

    useConfigStore.getState().updateFatigue({ energyMin: -20 });
    expect(config().fatigue.energyMin).toBe(0);
  });

  it('clampea clutchGain a no negativo', () => {
    useConfigStore.getState().updateFatigue({ clutchGain: -1 });
    expect(config().fatigue.clutchGain).toBe(0);
  });

  it('clampea recovery a no negativo', () => {
    useConfigStore.getState().updateFatigue({ recovery: -5 });
    expect(config().fatigue.recovery).toBe(0);
  });

  it('ignora valores no numéricos y conserva el que había', () => {
    useConfigStore.getState().updateFatigue({ energyMin: Number.NaN });
    expect(config().fatigue.energyMin).toBe(DEFAULT_FATIGUE.energyMin);
  });

  // El riesgo real que motivó este saneamiento no entra por los sliders (que
  // ya emiten valores válidos) sino por `applySettings`: hidrata `fatigue`
  // tal cual desde `app_settings`, así que un registro corrupto o guardado
  // por una versión con otros límites entraba sin filtro. Sin el clamp acá,
  // un `energyMin` por encima de `ENERGY_MAX` deja a `EnergyMeter` con
  // `aria-valuemin` por encima de `aria-valuemax` (estado ARIA inválido) y a
  // `commitEnergy` clampeando la energía guardada por encima de 100.
  it('applySettings sanea un fatigue fuera de rango llegado desde la DB', () => {
    const corrupted: FatigueConfig = {
      ...DEFAULT_FATIGUE,
      energyMin: 999,
      clutchGain: -3,
      recovery: -7,
    };
    useConfigStore.getState().applySettings({
      engineConfig: { ...DEFAULT_CONFIG, fatigue: corrupted },
    });

    expect(config().fatigue.energyMin).toBeLessThan(ENERGY_MAX);
    expect(config().fatigue.clutchGain).toBeGreaterThanOrEqual(0);
    expect(config().fatigue.recovery).toBeGreaterThanOrEqual(0);
  });

  // Distinto del caso anterior (falta `fatigue` entero): acá `fatigue`
  // existe pero le falta una sub-clave, como dejaría un registro guardado
  // por una versión con menos campos. Sin el merge con DEFAULT_FATIGUE
  // ANTES de clampear, `extraTimeShare` quedaba `undefined` y el motor
  // generaba 0 goles en silencio (`generateGoals(NaN)`), sin excepción.
  it('applySettings rellena una sub-clave faltante de fatigue con el default', () => {
    const partial = { ...DEFAULT_FATIGUE } as Partial<FatigueConfig>;
    delete partial.extraTimeShare;

    useConfigStore.getState().applySettings({
      engineConfig: { ...DEFAULT_CONFIG, fatigue: partial as FatigueConfig },
    });

    expect(config().fatigue.extraTimeShare).toBe(DEFAULT_FATIGUE.extraTimeShare);
  });

  it('applySettings sin fatigue guardado (config de una versión anterior) usa el default', () => {
    const legacyConfig: Partial<typeof DEFAULT_CONFIG> = { ...DEFAULT_CONFIG };
    delete legacyConfig.fatigue;

    useConfigStore.getState().applySettings({
      engineConfig: legacyConfig as typeof DEFAULT_CONFIG,
    });

    expect(config().fatigue).toEqual(DEFAULT_FATIGUE);
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
