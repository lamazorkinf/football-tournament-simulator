import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveNextAction, type ModeActions } from '../nextAction';
import { toCycle } from '../../core/cycle';
import {
  baseTournament,
  makeContinentalDoneCycle,
  makeDrawnContinentalCycle,
} from '../../test/fixtures/cycle';
import type { Cycle } from '../../types';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

function makeActions(overrides: Partial<ModeActions> = {}): ModeActions {
  return {
    drawContinental: vi.fn(() => true),
    drawConfederations: vi.fn(() => true),
    advanceToQualifiers: vi.fn(),
    generateDrawAndFixtures: vi.fn(async () => true),
    advanceToWorldCup: vi.fn(async () => true),
    advanceToKnockout: vi.fn(async () => true),
    startSeason: vi.fn(async () => {}),
    simulateJornada: vi.fn(async () => []),
    closeSeason: vi.fn(async () => {}),
    reloadMode: vi.fn(async () => {}),
    ...overrides,
  };
}

function actionFor(cycle: Cycle | null, actions = makeActions(), nav = vi.fn(), busy = false) {
  return deriveNextAction({
    engine: 'national-cycle',
    cycle,
    season: null,
    busy,
    nav,
    actions,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deriveNextAction — ciclo, prioridad de fases', () => {
  it('ciclo nuevo: ofrece sortear los continentales', () => {
    expect(actionFor(toCycle(baseTournament()))?.label).toBe('▶ SORTEAR CONTINENTAL');
  });

  it('continental sorteado y sin terminar: ofrece jugarlo y navega', () => {
    const { cycle } = makeDrawnContinentalCycle();
    const nav = vi.fn();
    const action = actionFor(cycle, makeActions(), nav);
    expect(action?.label).toBe('▶ JUGAR CONTINENTAL');
    action?.onPress();
    expect(nav).toHaveBeenCalledWith('continental');
  });

  it('continental completo: ofrece sortear la Confederaciones', () => {
    const { cycle } = makeContinentalDoneCycle();
    expect(actionFor(cycle)?.label).toBe('▶ SORTEAR CONFED');
  });

  it('sin ciclo cargado no ofrece nada', () => {
    expect(actionFor(null)).toBeNull();
  });

  it('con un sorteo o batch en curso la accion queda deshabilitada', () => {
    const action = actionFor(toCycle(baseTournament()), makeActions(), vi.fn(), true);
    expect(action?.disabled).toBe(true);
  });
});

describe('deriveNextAction — ciclo, no festeja cuando el guard rechaza', () => {
  it('sorteo continental rechazado: no navega', () => {
    const nav = vi.fn();
    const actions = makeActions({ drawContinental: vi.fn(() => false) });
    actionFor(toCycle(baseTournament()), actions, nav)?.onPress();
    expect(actions.drawContinental).toHaveBeenCalled();
    expect(nav).not.toHaveBeenCalled();
  });

  it('sorteo continental aceptado: navega a la vista continental', () => {
    const nav = vi.fn();
    actionFor(toCycle(baseTournament()), makeActions(), nav)?.onPress();
    expect(nav).toHaveBeenCalledWith('continental');
  });
});
