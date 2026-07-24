import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Cycle, Group, Match, Region, Team } from '../../types';

const {
  isSupabaseConfigured,
  saveTournament,
  saveCycleState,
  createQualifierGroups,
  deleteQualifierData,
} = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn(() => true),
  saveTournament: vi.fn(async () => {}),
  saveCycleState: vi.fn(async () => {}),
  createQualifierGroups: vi.fn(async () => {}),
  deleteQualifierData: vi.fn(async () => {}),
}));

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured,
  supabase: {},
  escapeOrValue: (v: string) => v,
}));

vi.mock('../../services/adaptiveTournamentService', () => ({
  adaptiveTournamentService: {
    getLatestTournament: vi.fn(),
    getTournamentsList: vi.fn(),
    loadTournament: vi.fn(),
    saveTournament,
    deleteTournament: vi.fn(),
  },
}));

vi.mock('../../services/cycleStateService', () => ({
  cycleStateService: { loadCycleState: vi.fn(), saveCycleState },
}));

vi.mock('../../services/cycleMatchHistory', () => ({
  buildMatchParams: vi.fn(),
  backfillCycleMatchHistory: vi.fn(async () => 0),
}));

vi.mock('../../services/normalizedQualifiersService', () => ({
  normalizedQualifiersService: { createQualifierGroups, deleteQualifierData },
}));

vi.mock('../../services/teamsService', () => ({
  teamsService: {
    getAllTeams: vi.fn(async () => []),
    batchUpdateTeams: vi.fn(),
    updateTeam: vi.fn(async () => {}),
  },
}));

const { useTournamentStore } = await import('../useTournamentStore');
const { toCycle } = await import('../../core/cycle');
const { baseTournament } = await import('../../test/fixtures/cycle');

const REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

function makeTeams(): Team[] {
  return REGIONS.flatMap((region) =>
    Array.from({ length: 5 }, (_, i) => ({
      id: `${region}-t${i}`,
      name: `${region} ${i}`,
      flag: '🏳️',
      region,
      skill: 90 - i,
    }))
  );
}

/** Un grupo por región; `matches` en 0 = grupo creado pero sin sortear. */
function makeQualifiers(matchesPerGroup: number): Record<Region, Group[]> {
  const build = (region: Region): Group[] => {
    const teamIds = Array.from({ length: 5 }, (_, i) => `${region}-t${i}`);
    const matches: Match[] = Array.from({ length: matchesPerGroup }, (_, i) => ({
      id: `${region}-m${i}`,
      homeTeamId: teamIds[0],
      awayTeamId: teamIds[1],
      homeScore: null,
      awayScore: null,
      isPlayed: false,
      stage: 'qualifier',
      matchday: i + 1,
    }));
    return [
      {
        id: `${region}-g1`,
        name: 'Group A',
        region,
        teamIds: matchesPerGroup > 0 ? teamIds : [],
        matches,
        standings: [],
        isDrawComplete: matchesPerGroup > 0,
      },
    ];
  };
  return { Europe: build('Europe'), America: build('America'), Africa: build('Africa'), Asia: build('Asia') };
}

function setUpTournament(matchesPerGroup: number): Cycle {
  const cycle: Cycle = {
    ...toCycle(baseTournament()),
    id: 't-guards',
    qualifiers: makeQualifiers(matchesPerGroup),
    calendar: { phase: 'wc-qualifiers', matchday: 1 },
  };
  useTournamentStore.setState({
    teams: makeTeams(),
    tournaments: [cycle],
    currentTournamentId: cycle.id,
    currentTournament: cycle,
    isBatchProcessing: false,
  });
  return cycle;
}

const store = () => useTournamentStore.getState();

describe('generateDrawAndFixtures — guard de sorteo ya hecho', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseConfigured.mockReturnValue(true);
  });

  it('no re-sortea si las clasificatorias ya tienen partidos', async () => {
    const before = setUpTournament(20);

    await store().generateDrawAndFixtures();

    expect(store().currentTournament).toBe(before);
    expect(createQualifierGroups).not.toHaveBeenCalled();
    expect(deleteQualifierData).not.toHaveBeenCalled();
  });

  it('sortea normalmente si todavía no hay partidos', async () => {
    setUpTournament(0);

    await store().generateDrawAndFixtures();

    const europe = store().currentTournament!.qualifiers.Europe;
    expect(europe[0].matches.length).toBe(20);
    expect(createQualifierGroups).toHaveBeenCalledTimes(4);
  });

  it('con force borra el sorteo anterior ANTES de escribir el nuevo', async () => {
    setUpTournament(20);

    await store().generateDrawAndFixtures({ force: true });

    expect(deleteQualifierData).toHaveBeenCalledWith('t-guards');
    expect(createQualifierGroups).toHaveBeenCalledTimes(4);
    // Sin este orden, los partidos viejos (con otros nanoid) sobreviven al
    // upsert y el torneo queda con el doble de partidos.
    expect(deleteQualifierData.mock.invocationCallOrder[0]).toBeLessThan(
      createQualifierGroups.mock.invocationCallOrder[0]
    );
  });

  it('force NO alcanza si ya se jugó algún partido', async () => {
    const cycle = setUpTournament(20);
    useTournamentStore.setState({
      currentTournament: { ...cycle, hasAnyMatchPlayed: true },
      tournaments: [{ ...cycle, hasAnyMatchPlayed: true }],
    });

    await store().generateDrawAndFixtures({ force: true });

    expect(deleteQualifierData).not.toHaveBeenCalled();
    expect(createQualifierGroups).not.toHaveBeenCalled();
  });

  it('el primer sorteo también borra: limpia el residuo de un intento anterior', async () => {
    setUpTournament(0);

    await store().generateDrawAndFixtures();

    expect(deleteQualifierData).toHaveBeenCalledWith('t-guards');
  });
});

describe('candado isDrawing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseConfigured.mockReturnValue(true);
  });

  it('dos sorteos disparados a la vez producen uno solo', async () => {
    setUpTournament(20); // ya sorteado: el escenario real es "Rehacer sorteo".
    // Sin `force`, la primera llamada actualiza el estado local (con el
    // sorteo) de forma síncrona, antes de llegar a ningún await, así que
    // para cuando arranca la segunda llamada el guard `isQualifiersDrawn`
    // ya la rechaza por su cuenta y el test queda decorativo: nunca llega
    // a ejercitar el candado. Con `force: true` ese guard se saltea a
    // propósito -como al tocar el botón "Rehacer sorteo"-, así que el
    // candado `isDrawing` pasa a ser la única defensa posible contra el
    // doble clic, que es justo lo que este test tiene que probar.
    // El guardado se demora para que las dos llamadas se solapen de verdad,
    // que es lo que pasa con un doble clic sobre un botón que tarda segundos.
    createQualifierGroups.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 20))
    );

    await Promise.all([
      store().generateDrawAndFixtures({ force: true }),
      store().generateDrawAndFixtures({ force: true }),
    ]);

    expect(createQualifierGroups).toHaveBeenCalledTimes(4); // 4 regiones, no 8
    // Si el candado no frenara a la segunda llamada, también volvería a
    // borrar: dos borrados serían tan destructivos como dos escrituras.
    expect(deleteQualifierData).toHaveBeenCalledTimes(1);
  });

  it('libera el candado cuando el sorteo termina', async () => {
    setUpTournament(0);

    await store().generateDrawAndFixtures();

    expect(store().isDrawing).toBe(false);
  });

  it('libera el candado aunque la persistencia falle', async () => {
    setUpTournament(0);
    createQualifierGroups.mockRejectedValue(new Error('sin red'));

    await store().generateDrawAndFixtures();

    expect(store().isDrawing).toBe(false);
  });
});
