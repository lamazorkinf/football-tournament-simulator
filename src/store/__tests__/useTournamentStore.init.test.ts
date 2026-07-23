import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Cycle } from '../../types';

/**
 * Carga inicial contra la DB. Desde que se eliminó el modo offline no hay copia
 * local de respaldo: la regresión que importa es que un fallo de red NO caiga a
 * datos viejos, porque esa era la vía por la que un dispositivo terminaba
 * pisando lo jugado en otro.
 */

const {
  isSupabaseConfigured,
  getLatestTournament,
  getTournamentsList,
  loadTournament,
  saveTournament,
  deleteTournament,
  loadCycleState,
  saveCycleState,
} = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn(() => true),
  getLatestTournament: vi.fn(),
  getTournamentsList: vi.fn(),
  loadTournament: vi.fn(),
  saveTournament: vi.fn(),
  deleteTournament: vi.fn(),
  loadCycleState: vi.fn(),
  saveCycleState: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured,
  supabase: {},
  escapeOrValue: (v: string) => v,
}));

vi.mock('../../services/adaptiveTournamentService', () => ({
  adaptiveTournamentService: {
    getLatestTournament,
    getTournamentsList,
    loadTournament,
    saveTournament,
    deleteTournament,
  },
}));

vi.mock('../../services/cycleStateService', () => ({
  cycleStateService: { loadCycleState, saveCycleState },
}));

vi.mock('../../services/cycleMatchHistory', () => ({
  buildMatchParams: vi.fn(),
  backfillCycleMatchHistory: vi.fn(async () => 0),
}));

const { createQualifierGroups } = vi.hoisted(() => ({ createQualifierGroups: vi.fn() }));

vi.mock('../../services/normalizedQualifiersService', () => ({
  normalizedQualifiersService: { createQualifierGroups },
}));

vi.mock('../../services/teamsService', () => ({
  teamsService: { getAllTeams: vi.fn(async () => []), batchUpdateTeams: vi.fn() },
}));

const { useTournamentStore } = await import('../useTournamentStore');

/** Torneo mínimo tal como lo devuelve la capa de servicios. */
function dbTournament(id: string, year = 2026) {
  return {
    id,
    name: `World Cup ${year}`,
    year,
    qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
    worldCup: null,
    isQualifiersComplete: false,
    hasAnyMatchPlayed: false,
    originalSkills: {},
  } as unknown as Cycle;
}

/** Torneo con un grupo y un partido en Europa, para chequear el remapeo de ids. */
function tournamentWithQualifiers(id: string) {
  const base = dbTournament(id, 2030) as unknown as Record<string, unknown>;
  return {
    ...base,
    qualifiers: {
      Europe: [
        {
          id: 'grupo-original',
          name: 'Group A',
          region: 'Europe',
          teamIds: ['esp', 'ita'],
          standings: [],
          matches: [
            {
              id: 'partido-original',
              homeTeamId: 'esp',
              awayTeamId: 'ita',
              homeScore: 2,
              awayScore: 1,
              isPlayed: true,
              matchday: 1,
            },
          ],
        },
      ],
      America: [],
      Africa: [],
      Asia: [],
    },
  } as unknown as Cycle;
}

function resetStore() {
  useTournamentStore.setState({
    tournaments: [],
    currentTournamentId: null,
    currentTournament: null,
    isSavingMatch: false,
    isBatchProcessing: false,
    initStatus: 'loading',
  });
}

describe('initializeTournament', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseConfigured.mockReturnValue(true);
    loadCycleState.mockResolvedValue(null);
    saveCycleState.mockResolvedValue(undefined);
    saveTournament.mockResolvedValue('2026-07-23T10:00:00Z');
    getTournamentsList.mockResolvedValue([]);
    resetStore();
  });

  it('carga el torneo más reciente de la DB', async () => {
    getLatestTournament.mockResolvedValue({
      tournament: dbTournament('t1'),
      updatedAt: '2026-07-23T10:00:00Z',
    });

    await useTournamentStore.getState().initializeTournament();

    const state = useTournamentStore.getState();
    expect(state.initStatus).toBe('ready');
    expect(state.currentTournamentId).toBe('t1');
    expect(state.currentTournament?.name).toBe('World Cup 2026');
  });

  it('con la DB vacía crea el primer torneo', async () => {
    getLatestTournament.mockResolvedValue(null);

    await useTournamentStore.getState().initializeTournament();

    const state = useTournamentStore.getState();
    expect(state.initStatus).toBe('ready');
    expect(state.currentTournament).not.toBeNull();
    expect(saveTournament).toHaveBeenCalled();
  });

  it('con la DB caída queda en error y SIN torneo (no hay fallback local)', async () => {
    getLatestTournament.mockRejectedValue(new Error('network down'));

    await useTournamentStore.getState().initializeTournament();

    const state = useTournamentStore.getState();
    expect(state.initStatus).toBe('error');
    expect(state.currentTournament).toBeNull();
    expect(state.currentTournamentId).toBeNull();
  });

  it('un torneo viejo en memoria no sobrevive a un fallo de carga', async () => {
    // Simula la copia que antes rehidrataba localStorage: aunque esté en el
    // store, initializeTournament no debe promoverla a currentTournament.
    const stale = dbTournament('stale', 2022);
    useTournamentStore.setState({ tournaments: [stale] });
    getLatestTournament.mockRejectedValue(new Error('network down'));

    await useTournamentStore.getState().initializeTournament();

    expect(useTournamentStore.getState().initStatus).toBe('error');
    expect(useTournamentStore.getState().currentTournament).toBeNull();
  });

  it('sin Supabase configurado informa el estado y no toca la red', async () => {
    isSupabaseConfigured.mockReturnValue(false);

    await useTournamentStore.getState().initializeTournament();

    expect(useTournamentStore.getState().initStatus).toBe('unconfigured');
    expect(getLatestTournament).not.toHaveBeenCalled();
  });

  it('completa el selector con el resto de los torneos de la DB', async () => {
    getLatestTournament.mockResolvedValue({
      tournament: dbTournament('t1', 2026),
      updatedAt: '2026-07-23T10:00:00Z',
    });
    getTournamentsList.mockResolvedValue([
      { id: 't1', name: 'World Cup 2026', year: 2026, status: 'qualifiers' },
      { id: 't0', name: 'World Cup 2022', year: 2022, status: 'completed' },
    ]);
    loadTournament.mockResolvedValue(dbTournament('t0', 2022));

    await useTournamentStore.getState().initializeTournament();

    const ids = useTournamentStore.getState().tournaments.map((t) => t.id);
    expect(ids).toContain('t1');
    expect(ids).toContain('t0');
    // El activo sigue siendo el más reciente.
    expect(useTournamentStore.getState().currentTournamentId).toBe('t1');
  });

  it('si falla el listado del selector la app queda igualmente usable', async () => {
    getLatestTournament.mockResolvedValue({
      tournament: dbTournament('t1'),
      updatedAt: '2026-07-23T10:00:00Z',
    });
    getTournamentsList.mockRejectedValue(new Error('boom'));

    await useTournamentStore.getState().initializeTournament();

    expect(useTournamentStore.getState().initStatus).toBe('ready');
    expect(useTournamentStore.getState().currentTournamentId).toBe('t1');
  });
});

describe('refreshFromDatabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseConfigured.mockReturnValue(true);
    loadCycleState.mockResolvedValue(null);
    saveCycleState.mockResolvedValue(undefined);
    resetStore();
    useTournamentStore.setState({
      tournaments: [dbTournament('t1')],
      currentTournamentId: 't1',
      currentTournament: dbTournament('t1'),
      initStatus: 'ready',
    });
  });

  it('trae la versión fresca del torneo activo', async () => {
    const fresh = { ...dbTournament('t1'), name: 'Actualizado' };
    loadTournament.mockResolvedValue(fresh);

    await useTournamentStore.getState().refreshFromDatabase();

    expect(useTournamentStore.getState().currentTournament?.name).toBe('Actualizado');
  });

  it('no refresca durante una simulación en curso', async () => {
    useTournamentStore.setState({ isBatchProcessing: true });

    await useTournamentStore.getState().refreshFromDatabase();

    expect(loadTournament).not.toHaveBeenCalled();
  });

  it('no refresca mientras se guarda un partido', async () => {
    useTournamentStore.setState({ isSavingMatch: true });

    await useTournamentStore.getState().refreshFromDatabase();

    expect(loadTournament).not.toHaveBeenCalled();
  });

  it('un fallo de red deja el torneo actual intacto', async () => {
    loadTournament.mockRejectedValue(new Error('network down'));

    await useTournamentStore.getState().refreshFromDatabase();

    expect(useTournamentStore.getState().currentTournament?.id).toBe('t1');
  });
});

describe('importTournament', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseConfigured.mockReturnValue(true);
    saveTournament.mockResolvedValue('2026-07-23T10:00:00Z');
    saveCycleState.mockResolvedValue(undefined);
    createQualifierGroups.mockResolvedValue(undefined);
    deleteTournament.mockResolvedValue(undefined);
    resetStore();
  });

  it('guarda el torneo importado con un id nuevo y lo selecciona', async () => {
    const imported = dbTournament('id-del-archivo', 2030);

    await useTournamentStore.getState().importTournament(imported);

    const state = useTournamentStore.getState();
    expect(state.currentTournament).not.toBeNull();
    expect(state.currentTournament?.id).not.toBe('id-del-archivo');
    expect(state.currentTournamentId).toBe(state.currentTournament?.id);
    expect(state.tournaments).toHaveLength(1);
    expect(saveTournament).toHaveBeenCalled();
    expect(saveCycleState).toHaveBeenCalled();
  });

  it('no toca el torneo homónimo que ya existía en la lista', async () => {
    const existing = dbTournament('id-del-archivo', 2030);
    useTournamentStore.setState({
      tournaments: [existing],
      currentTournamentId: 'id-del-archivo',
      currentTournament: existing,
    });

    await useTournamentStore.getState().importTournament(dbTournament('id-del-archivo', 2030));

    const state = useTournamentStore.getState();
    expect(state.tournaments).toHaveLength(2);
    expect(state.tournaments.some((t) => t.id === 'id-del-archivo')).toBe(true);
  });

  it('persiste las clasificatorias con ids nuevos, sin robarle los grupos al original', async () => {
    await useTournamentStore.getState().importTournament(tournamentWithQualifiers('id-del-archivo'));

    // Una llamada por región, con el id del torneo nuevo.
    expect(createQualifierGroups).toHaveBeenCalledTimes(4);
    const newId = useTournamentStore.getState().currentTournamentId;
    const europeCall = createQualifierGroups.mock.calls.find((c) => c[1] === 'Europe');
    expect(europeCall?.[0]).toBe(newId);

    const groups = europeCall?.[2] as Array<{ id: string; matches: Array<{ id: string }> }>;
    expect(groups[0].id).not.toBe('grupo-original');
    expect(groups[0].matches[0].id).not.toBe('partido-original');
    // El resultado jugado se conserva: el trigger reconstruye las posiciones.
    expect(groups[0].matches[0]).toMatchObject({ homeScore: 2, awayScore: 1, isPlayed: true });
  });

  it('propaga el error si la base rechaza el guardado', async () => {
    saveTournament.mockRejectedValue(new Error('boom'));

    await expect(
      useTournamentStore.getState().importTournament(dbTournament('x', 2030)),
    ).rejects.toThrow(/no se pudo guardar/i);

    expect(useTournamentStore.getState().tournaments).toHaveLength(0);
  });

  it('si fallan las clasificatorias, borra el torneo a medio crear', async () => {
    // El header ya está insertado cuando falla este paso: sin el rollback la
    // base quedaba con un torneo sin grupos mientras la UI decía "Import Failed".
    createQualifierGroups.mockRejectedValue(new Error('boom'));

    await expect(
      useTournamentStore.getState().importTournament(tournamentWithQualifiers('x')),
    ).rejects.toThrow(/clasificatorias/i);

    expect(deleteTournament).toHaveBeenCalledTimes(1);
    expect(useTournamentStore.getState().tournaments).toHaveLength(0);
    expect(useTournamentStore.getState().currentTournament).toBeNull();
  });

  it('sin Supabase configurado no importa', async () => {
    isSupabaseConfigured.mockReturnValue(false);

    await expect(
      useTournamentStore.getState().importTournament(dbTournament('x', 2030)),
    ).rejects.toThrow(/no está configurado/i);
  });
});
