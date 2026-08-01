import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { deriveNextAction, type ModeActions } from '../nextAction';
import { toCycle } from '../../core/cycle';
import {
  baseTournament,
  makeContinentalDoneCycle,
  makeDrawnContinentalCycle,
} from '../../test/fixtures/cycle';
import type { Cycle, Group, Region } from '../../types';

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

/** Grupo de clasificatorias con un único partido, ya jugado: alcanza para que
 * `getQualifierProgress` lo cuente como completo (exige matches > 0). */
function playedQualifierGroup(region: Region): Group {
  return {
    id: `${region}-g1`,
    name: 'Group A',
    region,
    teamIds: ['a', 'b'],
    matches: [
      { id: `${region}-m1`, homeTeamId: 'a', awayTeamId: 'b', homeScore: 1, awayScore: 0, isPlayed: true, matchday: 1 },
    ],
    standings: [],
    isDrawComplete: true,
  };
}

/** Ciclo con continental y Confederaciones completos, calendario ya en
 * clasificatorias: lo mínimo para que las fases previas no compitan por la
 * próxima acción. */
function cycleReadyToDrawQualifiers(): Cycle {
  const base = toCycle(baseTournament());
  return {
    ...base,
    continental: { ...base.continental, isComplete: true },
    confederationsCup: { ...base.confederationsCup, isComplete: true },
    calendar: { phase: 'wc-qualifiers', matchday: 1 },
  };
}

/** Además, con las cuatro regiones jugadas enteras: dispara `canAdvanceToWorldCup`. */
function cycleReadyForWorldCup(): Cycle {
  return {
    ...cycleReadyToDrawQualifiers(),
    calendar: { phase: 'wc-qualifiers', matchday: 20 },
    qualifiers: {
      Europe: [playedQualifierGroup('Europe')],
      America: [playedQualifierGroup('America')],
      Africa: [playedQualifierGroup('Africa')],
      Asia: [playedQualifierGroup('Asia')],
    },
  };
}

/** Mundial recién sorteado: un grupo con un partido pendiente. */
function cycleWithWorldCupGroupsPending(): Cycle {
  return {
    ...cycleReadyForWorldCup(),
    worldCup: {
      groups: [
        {
          id: 'wc-g1',
          name: 'Grupo A',
          teamIds: ['a', 'b', 'c', 'd'],
          matches: [
            { id: 'wc-m1', homeTeamId: 'a', awayTeamId: 'b', homeScore: null, awayScore: null, isPlayed: false },
          ],
          standings: [],
        },
      ],
      knockout: { roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], thirdPlace: null, final: null },
      qualifiedTeamIds: [],
    },
  };
}

/** Grupos del Mundial completos, playoffs sin arrancar todavía. */
function cycleReadyForKnockout(): Cycle {
  return {
    ...cycleReadyForWorldCup(),
    worldCup: {
      groups: [
        {
          id: 'wc-g1',
          name: 'Grupo A',
          teamIds: ['a', 'b', 'c', 'd'],
          matches: [
            { id: 'wc-m1', homeTeamId: 'a', awayTeamId: 'b', homeScore: 1, awayScore: 0, isPlayed: true },
          ],
          standings: [],
        },
      ],
      knockout: { roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], thirdPlace: null, final: null },
      qualifiedTeamIds: [],
    },
  };
}

/** Playoffs en curso: dieciseisavos generados, con un cruce sin jugar. */
function cycleWithPlayoffsInProgress(): Cycle {
  return {
    ...cycleReadyForWorldCup(),
    worldCup: {
      groups: [
        {
          id: 'wc-g1',
          name: 'Grupo A',
          teamIds: ['a', 'b', 'c', 'd'],
          matches: [
            { id: 'wc-m1', homeTeamId: 'a', awayTeamId: 'b', homeScore: 1, awayScore: 0, isPlayed: true },
          ],
          standings: [],
        },
      ],
      knockout: {
        roundOf32: [
          {
            id: 'ko-1', homeTeamId: 'a', awayTeamId: 'b', homeScore: null, awayScore: null,
            isPlayed: false, round: 'round-of-32',
          },
        ],
        roundOf16: [], quarterFinals: [], semiFinals: [], thirdPlace: null, final: null,
      },
      qualifiedTeamIds: [],
    },
  };
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

  it('con un sorteo o batch en curso la acción queda deshabilitada', () => {
    const action = actionFor(toCycle(baseTournament()), makeActions(), vi.fn(), true);
    expect(action?.disabled).toBe(true);
  });

  it('clasificatorias completas: ofrece avanzar al mundial y navega', async () => {
    const nav = vi.fn();
    const actions = makeActions();
    const action = actionFor(cycleReadyForWorldCup(), actions, nav);
    expect(action?.label).toBe('▶ AVANZAR AL MUNDIAL');
    await action?.onPress();
    expect(actions.advanceToWorldCup).toHaveBeenCalled();
    expect(nav).toHaveBeenCalledWith('worldcup');
  });

  it('mundial sorteado y grupos sin terminar: ofrece jugarlo y navega', () => {
    const nav = vi.fn();
    const action = actionFor(cycleWithWorldCupGroupsPending(), makeActions(), nav);
    expect(action?.label).toBe('▶ JUGAR EL MUNDIAL');
    action?.onPress();
    expect(nav).toHaveBeenCalledWith('worldcup');
  });

  it('grupos del mundial completos: ofrece ir a playoffs y navega', async () => {
    const nav = vi.fn();
    const actions = makeActions();
    const action = actionFor(cycleReadyForKnockout(), actions, nav);
    expect(action?.label).toBe('▶ IR A PLAYOFFS');
    await action?.onPress();
    expect(actions.advanceToKnockout).toHaveBeenCalled();
    expect(nav).toHaveBeenCalledWith('worldcup');
  });

  it('playoffs en curso: ofrece jugarlos y navega', () => {
    const nav = vi.fn();
    const action = actionFor(cycleWithPlayoffsInProgress(), makeActions(), nav);
    expect(action?.label).toBe('▶ JUGAR PLAYOFFS');
    action?.onPress();
    expect(nav).toHaveBeenCalledWith('worldcup');
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

  it('avanzar al mundial rechazado: no navega (la más destructiva de las cuatro nuevas)', async () => {
    const nav = vi.fn();
    const actions = makeActions({ advanceToWorldCup: vi.fn(async () => false) });
    await actionFor(cycleReadyForWorldCup(), actions, nav)?.onPress();
    expect(actions.advanceToWorldCup).toHaveBeenCalled();
    expect(nav).not.toHaveBeenCalled();
  });
});

describe('deriveNextAction — ciclo, matiz del toast de EMPEZAR', () => {
  it('con habilidades originales cargadas: el toast distingue la base curada', async () => {
    const cycle: Cycle = { ...cycleReadyToDrawQualifiers(), originalSkills: { a: 82 } };
    const nav = vi.fn();
    const action = actionFor(cycle, makeActions(), nav);
    expect(action?.label).toBe('▶ EMPEZAR');
    await action?.onPress();
    expect(toast.success).toHaveBeenCalledWith(
      'Sorteo generado — habilidades en la base de este Mundial'
    );
    expect(nav).toHaveBeenCalledWith('qualifiers');
  });

  it('sin habilidades originales: el toast es el genérico', async () => {
    const action = actionFor(cycleReadyToDrawQualifiers(), makeActions(), vi.fn());
    expect(action?.label).toBe('▶ EMPEZAR');
    await action?.onPress();
    expect(toast.success).toHaveBeenCalledWith('Sorteo y fixtures generados');
  });

  it('sorteo rechazado: no festeja ninguna de las dos variantes', async () => {
    const actions = makeActions({ generateDrawAndFixtures: vi.fn(async () => false) });
    const cycle: Cycle = { ...cycleReadyToDrawQualifiers(), originalSkills: { a: 82 } };
    await actionFor(cycle, actions, vi.fn())?.onPress();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
