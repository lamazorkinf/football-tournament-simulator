import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FATIGUE,
  ENERGY_MAX,
  clutchMultiplier,
  commitEnergy,
  effectiveSkill,
  fatiguePenalty,
  matchEnergyCost,
  matchdayIndexFor,
  resolveEnergy,
  scopeForStage,
} from '../energy';

const cfg = DEFAULT_FATIGUE;

describe('fatiguePenalty', () => {
  it('no penaliza a energía llena y penaliza 8 en el piso', () => {
    expect(fatiguePenalty(100, cfg)).toBe(0);
    expect(fatiguePenalty(60, cfg)).toBeCloseTo(8, 5);
  });

  it('es lineal: a mitad de camino, la mitad de la penalización', () => {
    expect(fatiguePenalty(80, cfg)).toBeCloseTo(4, 5);
  });

  it('con la fatiga apagada nunca penaliza', () => {
    expect(fatiguePenalty(60, { ...cfg, enabled: false })).toBe(0);
  });
});

describe('effectiveSkill', () => {
  it('un 96,2 exhausto rinde como 88,2', () => {
    expect(effectiveSkill(96.2, 60, cfg)).toBeCloseTo(88.2, 5);
  });
});

describe('clutchMultiplier', () => {
  // Es multiplicativo a propósito: una final contra un rival flojo NO es un
  // partido difícil. Con la fórmula aditiva anterior, un equipo exhausto le
  // ganaba a un rival muy inferior más seguido que en el motor sin fatiga.
  it('rival top en instancia máxima → multiplicador cerca del tope', () => {
    // min(96,2; 90,2) = 90,2 → normSkill ≈ 0,8600; importancia 1,6 → normImp 1
    // 0,8600 × 1 = 0,8600 → 1 + 0,8600 × 0,15 ≈ 1,129
    expect(clutchMultiplier(96.2, 90.2, 1.6, cfg)).toBeCloseTo(1.129, 3);
  });

  it('rival flojo en instancia máxima → multiplicador chico', () => {
    // min(94,8; 60) = 60 → normSkill ≈ 0,4286 → 1 + 0,4286 × 0,15 ≈ 1,064
    expect(clutchMultiplier(94.8, 60, 1.6, cfg)).toBeCloseTo(1.064, 3);
  });

  it('mismo cruce pesa más en una final que en fase de grupos', () => {
    const grupos = clutchMultiplier(85.4, 77.7, 1.25, cfg);
    const final = clutchMultiplier(85.4, 77.7, 1.6, cfg);
    expect(final).toBeGreaterThan(grupos);
  });

  it('importancia por encima del tope satura en vez de desbordar', () => {
    // El usuario puede subir los pesos desde Ajustes: el clamp es load-bearing.
    expect(clutchMultiplier(90, 90, 99, cfg)).toBeCloseTo(clutchMultiplier(90, 90, 1.6, cfg), 5);
  });

  it('con la fatiga apagada no amplifica nada', () => {
    expect(clutchMultiplier(96.2, 90.2, 1.6, { ...cfg, enabled: false })).toBe(1);
  });
});

describe('matchEnergyCost', () => {
  const base = { skill: 80, oppSkill: 80, importance: 1.6, tight: false, extraTime: false, penalties: false };

  it('el alargue cuesta 7 más que el mismo partido sin alargue, antes del plantel', () => {
    const sin = matchEnergyCost(base, cfg);
    const con = matchEnergyCost({ ...base, extraTime: true }, cfg);
    const factorPlantel = 1 - cfg.depthMax * ((80 - 30) / 70);
    expect(con - sin).toBeCloseTo(cfg.costExtraTime * factorPlantel, 5);
  });

  it('un rival más fuerte cuesta más energía', () => {
    const flojo = matchEnergyCost({ ...base, oppSkill: 40 }, cfg);
    const fuerte = matchEnergyCost({ ...base, oppSkill: 95 }, cfg);
    expect(fuerte).toBeGreaterThan(flojo);
  });

  it('el equipo con más skill paga menos por el mismo partido (plantel)', () => {
    // skill 30 es el piso de la escala: normSkill 0, así que no tiene descuento
    // y sirve de referencia contra el 100, que tiene el descuento máximo.
    const chico = matchEnergyCost({ ...base, skill: 30 }, cfg);
    const grande = matchEnergyCost({ ...base, skill: 100 }, cfg);
    expect(grande).toBeCloseTo(chico * (1 - cfg.depthMax), 5);
  });
});

describe('scopeForStage', () => {
  it('grupos y knockout del Mundial son el MISMO torneo', () => {
    expect(scopeForStage('world-cup-group')).toBe('world-cup');
    expect(scopeForStage('world-cup-knockout')).toBe('world-cup');
  });

  it('grupos y knockout de Confederaciones son el mismo torneo', () => {
    expect(scopeForStage('confed-group')).toBe('confed');
    expect(scopeForStage('confed-knockout')).toBe('confed');
  });

  it('clasificatorias y continental son torneos propios', () => {
    expect(scopeForStage('qualifier')).toBe('wc-qualifiers');
    expect(scopeForStage('continental')).toBe('continental');
  });
});

describe('matchdayIndexFor', () => {
  it('en fases de grupos usa la jornada del partido', () => {
    expect(matchdayIndexFor('world-cup-group', undefined, 2)).toBe(2);
    expect(matchdayIndexFor('qualifier', undefined, 7)).toBe(7);
  });

  it('el knockout del Mundial continúa después de las 3 jornadas de grupos', () => {
    // knockout.ts NO asigna matchday: el índice sale de la ronda.
    expect(matchdayIndexFor('world-cup-knockout', 'round-of-32', undefined)).toBe(4);
    expect(matchdayIndexFor('world-cup-knockout', 'round-of-16', undefined)).toBe(5);
    expect(matchdayIndexFor('world-cup-knockout', 'final', undefined)).toBe(8);
  });

  it('tercer puesto y final se juegan en la misma jornada', () => {
    expect(matchdayIndexFor('world-cup-knockout', 'third-place', undefined)).toBe(
      matchdayIndexFor('world-cup-knockout', 'final', undefined),
    );
  });

  it('la continental arranca en R64 sin fase de grupos previa', () => {
    expect(matchdayIndexFor('continental', 'round-of-64', 1)).toBe(1);
    expect(matchdayIndexFor('continental', 'round-of-32', undefined)).toBe(2);
    expect(matchdayIndexFor('continental', 'final', undefined)).toBe(6);
  });

  it('Confederaciones arranca su knockout en semis, tras 3 jornadas de grupos', () => {
    expect(matchdayIndexFor('confed-group', undefined, 3)).toBe(3);
    expect(matchdayIndexFor('confed-knockout', 'semi', undefined)).toBe(4);
    expect(matchdayIndexFor('confed-knockout', 'final', undefined)).toBe(5);
  });

  it('sin jornada ni ronda cae en 1 en vez de romper', () => {
    expect(matchdayIndexFor('qualifier', undefined, undefined)).toBe(1);
  });
});

describe('resolveEnergy', () => {
  it('un equipo sin estado previo arranca lleno', () => {
    expect(resolveEnergy(undefined, 'world-cup', 1, 'bel', cfg)).toBe(ENERGY_MAX);
  });

  it('recupera por cada jornada transcurrida desde su último partido', () => {
    const state = commitEnergy(undefined, 'world-cup', 4, [{ teamId: 'bel', energy: 70 }], cfg);
    expect(resolveEnergy(state, 'world-cup', 5, 'bel', cfg)).toBeCloseTo(74, 5);
    // Dos jornadas sin jugar (fecha libre o bye) recuperan el doble.
    expect(resolveEnergy(state, 'world-cup', 6, 'bel', cfg)).toBeCloseTo(78, 5);
  });

  it('las clasificatorias recuperan más rápido que un torneo corto', () => {
    const state = commitEnergy(undefined, 'wc-qualifiers', 1, [{ teamId: 'bel', energy: 70 }], cfg);
    expect(resolveEnergy(state, 'wc-qualifiers', 2, 'bel', cfg)).toBeCloseTo(78, 5);
  });

  it('nunca supera el máximo por más que descanse', () => {
    const state = commitEnergy(undefined, 'world-cup', 1, [{ teamId: 'bel', energy: 90 }], cfg);
    expect(resolveEnergy(state, 'world-cup', 20, 'bel', cfg)).toBe(ENERGY_MAX);
  });

  it('cambiar de torneo resetea a lleno', () => {
    const state = commitEnergy(undefined, 'continental', 6, [{ teamId: 'bel', energy: 62 }], cfg);
    expect(resolveEnergy(state, 'world-cup', 1, 'bel', cfg)).toBe(ENERGY_MAX);
  });

  it('el Mundial NO se resetea al pasar de grupos a knockout', () => {
    const state = commitEnergy(undefined, 'world-cup', 3, [{ teamId: 'bel', energy: 88 }], cfg);
    // scope 'world-cup' cubre las dos fases: sigue el desgaste, sólo recupera.
    expect(resolveEnergy(state, 'world-cup', 4, 'bel', cfg)).toBeCloseTo(92, 5);
  });
});

describe('commitEnergy', () => {
  it('respeta el piso', () => {
    const state = commitEnergy(undefined, 'world-cup', 4, [{ teamId: 'bel', energy: 12 }], cfg);
    expect(state.byTeam.bel.value).toBe(cfg.energyMin);
  });

  it('descarta el estado del torneo anterior al cambiar de torneo', () => {
    const previo = commitEnergy(undefined, 'continental', 6, [{ teamId: 'arg', energy: 65 }], cfg);
    const nuevo = commitEnergy(previo, 'world-cup', 1, [{ teamId: 'bel', energy: 95 }], cfg);
    expect(nuevo.scope).toBe('world-cup');
    expect(nuevo.byTeam.arg).toBeUndefined();
  });

  it('no muta el estado recibido', () => {
    const previo = commitEnergy(undefined, 'world-cup', 1, [{ teamId: 'bel', energy: 90 }], cfg);
    const copia = structuredClone(previo);
    commitEnergy(previo, 'world-cup', 2, [{ teamId: 'bel', energy: 80 }], cfg);
    expect(previo).toEqual(copia);
  });
});
