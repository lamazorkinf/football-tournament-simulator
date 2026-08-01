import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveNextAction, type ModeActions, type SeasonView } from '../nextAction';
import type { LigaTournament } from '../../core/formats/modeTournament';
import type { Match } from '../../types';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

function match(id: string, matchday: number, isPlayed: boolean): Match {
  return {
    id,
    homeTeamId: `h${id}`,
    awayTeamId: `a${id}`,
    homeScore: isPlayed ? 1 : null,
    awayScore: isPlayed ? 0 : null,
    isPlayed,
    matchday,
  } as Match;
}

function liga(id: string, matches: Match[]): LigaTournament {
  return {
    id,
    modeId: 'villamariense',
    competitionId: 'league-A',
    year: 2027,
    name: 'Liga A 2027',
    status: 'in-progress',
    division: 'A',
    format: 'liga',
    state: { teamIds: [], legs: 1, matches, standings: [] },
  };
}

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

function actionFor(season: SeasonView, actions = makeActions(), nav = vi.fn(), busy = false) {
  return deriveNextAction({ engine: 'season', cycle: null, season, busy, nav, actions });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deriveNextAction — temporada, prioridad', () => {
  it('sin clubes sembrados no ofrece nada', () => {
    expect(actionFor({ status: 'needs-seed', tournaments: [] })).toBeNull();
  });

  it('sin conexion ofrece reintentar la carga', async () => {
    const actions = makeActions();
    const action = actionFor({ status: 'error', tournaments: [] }, actions);
    expect(action?.label).toBe('▶ REINTENTAR');
    await action?.onPress();
    expect(actions.reloadMode).toHaveBeenCalled();
  });

  it('listo y sin torneos: ofrece empezar la temporada', async () => {
    const actions = makeActions();
    const action = actionFor({ status: 'ready', tournaments: [] }, actions);
    expect(action?.label).toBe('▶ EMPEZAR TEMPORADA');
    await action?.onPress();
    expect(actions.startSeason).toHaveBeenCalled();
  });

  it('con jornada pendiente: la ofrece con su rotulo y el torneo correcto', async () => {
    const lg = liga('lg-A', [match('m1', 1, true), match('m2', 2, false)]);
    const actions = makeActions();
    const action = actionFor({ status: 'ready', tournaments: [lg] }, actions);
    expect(action?.label).toBe('▶ SIMULAR FECHA 2');
    await action?.onPress();
    expect(actions.simulateJornada).toHaveBeenCalledWith('lg-A');
  });

  it('todo jugado: ofrece cerrar la temporada', async () => {
    const lg = liga('lg-A', [match('m1', 1, true)]);
    const actions = makeActions();
    const action = actionFor({ status: 'ready', tournaments: [lg] }, actions);
    expect(action?.label).toBe('▶ CERRAR TEMPORADA');
    await action?.onPress();
    expect(actions.closeSeason).toHaveBeenCalled();
  });

  it('la primera competicion con jornada pendiente gana, en orden', () => {
    const a = liga('lg-A', [match('a1', 1, true)]);
    const b = liga('lg-B', [match('b1', 1, false)]);
    expect(actionFor({ status: 'ready', tournaments: [a, b] })?.label).toBe('▶ SIMULAR FECHA 1');
  });

  it('con una accion en vuelo queda deshabilitada', () => {
    const action = actionFor({ status: 'ready', tournaments: [] }, makeActions(), vi.fn(), true);
    expect(action?.disabled).toBe(true);
  });

  it('sin estado de temporada no ofrece nada', () => {
    const action = deriveNextAction({
      engine: 'season',
      cycle: null,
      season: null,
      busy: false,
      nav: vi.fn(),
      actions: makeActions(),
    });
    expect(action).toBeNull();
  });
});
