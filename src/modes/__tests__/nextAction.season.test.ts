import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveNextAction, type ModeActions, type SeasonView } from '../nextAction';
import { VILLAMARIENSE_DESCRIPTOR } from '../registry';
import type { ModeDescriptor } from '../types';
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

/**
 * La temporada de un año concreto. Por defecto es la que corre: los tests que
 * miran un año pasado pasan `year` distinto de `currentYear` a propósito.
 */
function seasonView(over: Partial<SeasonView> & Pick<SeasonView, 'status' | 'tournaments'>): SeasonView {
  return { year: 2027, currentYear: 2027, ...over };
}

function actionFor(
  season: SeasonView,
  actions = makeActions(),
  nav = vi.fn(),
  busy = false,
  descriptor: ModeDescriptor = VILLAMARIENSE_DESCRIPTOR,
) {
  return deriveNextAction({ descriptor, cycle: null, season, busy, nav, actions });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deriveNextAction — temporada, prioridad', () => {
  it('sin clubes sembrados no ofrece nada', () => {
    expect(actionFor(seasonView({ status: 'needs-seed', tournaments: [] }))).toBeNull();
  });

  it('sin conexión ofrece reintentar la carga', async () => {
    const actions = makeActions();
    const action = actionFor(seasonView({ status: 'error', tournaments: [] }), actions);
    expect(action?.label).toBe('▶ REINTENTAR');
    await action?.onPress();
    expect(actions.reloadMode).toHaveBeenCalled();
  });

  it('listo y sin torneos: ofrece empezar la temporada', async () => {
    const actions = makeActions();
    const action = actionFor(seasonView({ status: 'ready', tournaments: [] }), actions);
    expect(action?.label).toBe('▶ EMPEZAR TEMPORADA');
    await action?.onPress();
    expect(actions.startSeason).toHaveBeenCalled();
  });

  it('con jornada pendiente: la ofrece con su rótulo y el torneo correcto', async () => {
    const lg = liga('lg-A', [match('m1', 1, true), match('m2', 2, false)]);
    const actions = makeActions();
    const action = actionFor(seasonView({ status: 'ready', tournaments: [lg] }), actions);
    expect(action?.label).toBe('▶ SIMULAR FECHA 2');
    await action?.onPress();
    expect(actions.simulateJornada).toHaveBeenCalledWith('lg-A');
  });

  it('todo jugado: ofrece cerrar la temporada', async () => {
    const lg = liga('lg-A', [match('m1', 1, true)]);
    const actions = makeActions();
    const action = actionFor(seasonView({ status: 'ready', tournaments: [lg] }), actions);
    expect(action?.label).toBe('▶ CERRAR TEMPORADA');
    await action?.onPress();
    expect(actions.closeSeason).toHaveBeenCalled();
  });

  it('la primera competición con jornada pendiente gana, en orden', () => {
    const a = liga('lg-A', [match('a1', 1, true)]);
    const b = liga('lg-B', [match('b1', 1, false)]);
    expect(actionFor(seasonView({ status: 'ready', tournaments: [a, b] }))?.label).toBe('▶ SIMULAR FECHA 1');
  });

  it('con una acción en vuelo queda deshabilitada', () => {
    const action = actionFor(seasonView({ status: 'ready', tournaments: [] }), makeActions(), vi.fn(), true);
    expect(action?.disabled).toBe(true);
  });

  it('sin estado de temporada no ofrece nada', () => {
    const action = deriveNextAction({
      descriptor: VILLAMARIENSE_DESCRIPTOR,
      cycle: null,
      season: null,
      busy: false,
      nav: vi.fn(),
      actions: makeActions(),
    });
    expect(action).toBeNull();
  });
});

/**
 * El selector de temporadas lista los años pasados como "Cerrada / Sólo
 * lectura", así que llegar acá son dos clics. Las tres acciones del store
 * (`startSeason`, `simulateMatches`, `closeSeason`) cortan con
 * `year !== currentYear` y no avisan nada: cualquier botón que se ofreciera acá
 * sería muerto.
 */
describe('deriveNextAction — temporada vieja, sólo lectura', () => {
  const vieja = { year: 2025, currentYear: 2027 } as const;

  it('con la temporada jugada no ofrece cerrarla', () => {
    const lg = liga('lg-A', [match('m1', 1, true)]);
    expect(actionFor(seasonView({ status: 'ready', tournaments: [lg], ...vieja }))).toBeNull();
  });

  it('con una fecha pendiente tampoco ofrece simularla', () => {
    const lg = liga('lg-A', [match('m1', 1, false)]);
    expect(actionFor(seasonView({ status: 'ready', tournaments: [lg], ...vieja }))).toBeNull();
  });

  it('sin torneos no ofrece empezarla', () => {
    expect(actionFor(seasonView({ status: 'ready', tournaments: [], ...vieja }))).toBeNull();
  });

  it('el año en curso sigue ofreciendo su acción', () => {
    // El contraste: lo que apaga la acción es mirar OTRO año, no el año.
    const lg = liga('lg-A', [match('m1', 1, false)]);
    const action = actionFor(seasonView({ status: 'ready', tournaments: [lg], year: 2025, currentYear: 2025 }));
    expect(action?.label).toBe('▶ SIMULAR FECHA 1');
  });

  it('sin conexión igual se puede reintentar la carga', () => {
    // `reloadMode` recarga el modo entero (vuelve al año en curso), así que no
    // es una acción sobre la temporada vieja y sigue teniendo sentido.
    const action = actionFor(seasonView({ status: 'error', tournaments: [], ...vieja }));
    expect(action?.label).toBe('▶ REINTENTAR');
  });

  it('sin año todavía no se asume que sea vieja', () => {
    const action = actionFor(seasonView({ status: 'ready', tournaments: [], year: null, currentYear: null }));
    expect(action?.label).toBe('▶ EMPEZAR TEMPORADA');
  });
});

/**
 * Un modo que no declara ascensos —el "Mundial de Clubes" del criterio de
 * cierre de la unificación— no puede cerrar su temporada: `closeSeason` lo
 * rechaza. Ofrecerle el botón era ofrecerle uno que nunca iba a funcionar.
 */
describe('deriveNextAction — un modo sin ascensos no ofrece cerrar', () => {
  const SIN_ASCENSOS: ModeDescriptor = {
    ...VILLAMARIENSE_DESCRIPTOR,
    divisions: [],
    promotion: null,
  };

  it('con todo jugado no ofrece nada', () => {
    const lg = liga('lg-A', [match('m1', 1, true)]);
    const action = actionFor(
      seasonView({ status: 'ready', tournaments: [lg] }),
      makeActions(),
      vi.fn(),
      false,
      SIN_ASCENSOS,
    );
    expect(action).toBeNull();
  });

  it('pero sí ofrece jugar lo que falta', () => {
    const lg = liga('lg-A', [match('m1', 1, false)]);
    const action = actionFor(
      seasonView({ status: 'ready', tournaments: [lg] }),
      makeActions(),
      vi.fn(),
      false,
      SIN_ASCENSOS,
    );
    expect(action?.label).toBe('▶ SIMULAR FECHA 1');
  });

  it('un modo con divisiones pero sin liga por división tampoco cierra', () => {
    // El otro guard de `closeSeason`: la escalera de ascensos sale de la tabla
    // de cada división, así que sin esa liga no hay nada que aplicar.
    const sinLigas: ModeDescriptor = { ...VILLAMARIENSE_DESCRIPTOR, competitions: [] };
    const lg = liga('lg-A', [match('m1', 1, true)]);
    const action = actionFor(
      seasonView({ status: 'ready', tournaments: [lg] }),
      makeActions(),
      vi.fn(),
      false,
      sinLigas,
    );
    expect(action).toBeNull();
  });
});
