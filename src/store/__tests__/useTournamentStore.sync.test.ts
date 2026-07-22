import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { persistTournamentWithSync } from '../useTournamentStore';
import { adaptiveTournamentService } from '../../services/adaptiveTournamentService';
import { cycleStateService } from '../../services/cycleStateService';
import { useToastStore } from '../useToastStore';
import * as supa from '../../lib/supabase';
import type { Cycle, SyncMetaEntry } from '../../types';
import { useTournamentStore } from '../useTournamentStore';
import { reconstructCycle } from '../../core/cycle';

const cyc = (id: string): Cycle => ({ id } as unknown as Cycle);

// set/get mínimos que emulan a Zustand para probar el helper en aislamiento.
function makeStore() {
  let state = { syncMeta: {} as Record<string, SyncMetaEntry> };
  const set = (updater: any) => {
    const patch = typeof updater === 'function' ? updater(state) : updater;
    state = { ...state, ...patch };
  };
  const get = () => state;
  return { set, get, snapshot: () => state };
}

describe('persistTournamentWithSync', () => {
  beforeEach(() => {
    vi.spyOn(supa, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(cycleStateService, 'saveCycleState').mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('en éxito marca dirty=false y guarda el updated_at devuelto', async () => {
    vi.spyOn(adaptiveTournamentService, 'saveTournament').mockResolvedValue('2026-07-22T12:00:00Z');
    const { set, get, snapshot } = makeStore();

    await persistTournamentWithSync(cyc('t1'), set, get);

    expect(snapshot().syncMeta['t1']).toEqual({
      syncedUpdatedAt: '2026-07-22T12:00:00Z',
      dirty: false,
    });
  });

  it('si el guardado falla siempre, deja dirty=true y avisa por toast', async () => {
    vi.useFakeTimers();
    vi.spyOn(adaptiveTournamentService, 'saveTournament').mockRejectedValue(new Error('network'));
    const toastError = vi.spyOn(useToastStore.getState(), 'error').mockReturnValue('id');
    const { set, get, snapshot } = makeStore();

    const p = persistTournamentWithSync(cyc('t1'), set, get);
    await vi.runAllTimersAsync();
    await p;

    expect(snapshot().syncMeta['t1'].dirty).toBe(true);
    expect(toastError).toHaveBeenCalledOnce();
  });
});

describe('initializeTournament — reconciliación multi-dispositivo', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // historial de llamadas limpio entre tests
    vi.spyOn(supa, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(cycleStateService, 'loadCycleState').mockResolvedValue(null);
    // Por defecto no hay otros torneos en la DB (evita tocar red en el paso
    // que puebla el selector con la lista completa).
    vi.spyOn(adaptiveTournamentService, 'getTournamentsList').mockResolvedValue([]);
    vi.spyOn(adaptiveTournamentService, 'loadTournament').mockResolvedValue(null);
    useTournamentStore.setState({
      tournaments: [],
      currentTournamentId: null,
      currentTournament: null,
      syncMeta: {},
    });
  });

  it('DB más nueva pisa la copia local vieja (el caso multi-dispositivo)', async () => {
    // Local: torneo t1 sincronizado a las 10:00, sin cambios locales.
    const localCycle = reconstructCycle(
      { id: 't1', name: 'Local viejo', year: 2026 } as any,
      null,
    );
    useTournamentStore.setState({
      tournaments: [localCycle],
      currentTournamentId: 't1',
      currentTournament: localCycle,
      syncMeta: { t1: { syncedUpdatedAt: '2026-07-22T10:00:00Z', dirty: false } },
    });

    // DB: mismo torneo, actualizado a las 11:00 en el otro dispositivo.
    vi.spyOn(adaptiveTournamentService, 'getLatestTournament').mockResolvedValue({
      tournament: { id: 't1', name: 'DB nuevo', year: 2026 } as any,
      updatedAt: '2026-07-22T11:00:00Z',
    });

    await useTournamentStore.getState().initializeTournament();

    const s = useTournamentStore.getState();
    expect(s.currentTournament?.name).toBe('DB nuevo');
    expect(s.syncMeta['t1']).toEqual({ syncedUpdatedAt: '2026-07-22T11:00:00Z', dirty: false });
  });

  it('local dirty con DB sin cambios → conserva local y lo re-empuja', async () => {
    const localCycle = reconstructCycle(
      { id: 't1', name: 'Local con cambios', year: 2026 } as any,
      null,
    );
    useTournamentStore.setState({
      tournaments: [localCycle],
      currentTournamentId: 't1',
      currentTournament: localCycle,
      syncMeta: { t1: { syncedUpdatedAt: '2026-07-22T10:00:00Z', dirty: true } },
    });

    vi.spyOn(adaptiveTournamentService, 'getLatestTournament').mockResolvedValue({
      tournament: { id: 't1', name: 'DB vieja', year: 2026 } as any,
      updatedAt: '2026-07-22T10:00:00Z',
    });
    const save = vi.spyOn(adaptiveTournamentService, 'saveTournament').mockResolvedValue('2026-07-22T12:00:00Z');
    vi.spyOn(cycleStateService, 'saveCycleState').mockResolvedValue(undefined);

    await useTournamentStore.getState().initializeTournament();

    const s = useTournamentStore.getState();
    expect(s.currentTournament?.name).toBe('Local con cambios');
    expect(save).toHaveBeenCalledOnce(); // re-empujó local
  });

  it('offline con local dirty → conserva el flag dirty (no lo pisa un futuro "en sync")', async () => {
    // Regresión: si offline resetea dirty a false, un futuro `reconcile` con la
    // DB sin cambios ("en sync") pensaría que no hay nada para re-empujar y
    // descartaría en silencio los cambios locales nunca subidos.
    const localCycle = reconstructCycle(
      { id: 't1', name: 'Local sin subir', year: 2026 } as any,
      null,
    );
    useTournamentStore.setState({
      tournaments: [localCycle],
      currentTournamentId: 't1',
      currentTournament: localCycle,
      syncMeta: { t1: { syncedUpdatedAt: '2026-07-22T10:00:00Z', dirty: true } },
    });

    // getLatestTournament devuelve null: simula DB inalcanzable (offline/error).
    vi.spyOn(adaptiveTournamentService, 'getLatestTournament').mockResolvedValue(null);

    await useTournamentStore.getState().initializeTournament();

    const s = useTournamentStore.getState();
    expect(s.currentTournament?.name).toBe('Local sin subir');
    expect(s.syncMeta['t1']).toEqual({ syncedUpdatedAt: '2026-07-22T10:00:00Z', dirty: true });
  });

  it('puebla el selector con TODOS los torneos de la DB (navegador nuevo)', async () => {
    // Local vacío (navegador nuevo). La DB tiene 3 torneos; el más reciente es t2.
    vi.spyOn(adaptiveTournamentService, 'getLatestTournament').mockResolvedValue({
      tournament: { id: 't2', name: 'World Cup 2030', year: 2030 } as any,
      updatedAt: '2026-07-22T11:00:00Z',
    });
    (adaptiveTournamentService.getTournamentsList as any).mockResolvedValue([
      { id: 't1', name: 'World Cup 2026', year: 2026, status: 'completed' },
      { id: 't2', name: 'World Cup 2030', year: 2030, status: 'completed' },
      { id: 't3', name: 'World Cup 2034', year: 2034, status: 'qualifiers' },
    ]);
    (adaptiveTournamentService.loadTournament as any).mockImplementation(async (id: string) => ({
      id,
      name: id === 't1' ? 'World Cup 2026' : 'World Cup 2034',
      year: id === 't1' ? 2026 : 2034,
    }));

    await useTournamentStore.getState().initializeTournament();

    const s = useTournamentStore.getState();
    // El actual sigue siendo el reconciliado (t2, el más reciente).
    expect(s.currentTournamentId).toBe('t2');
    // La lista trae los 3, ordenados por año descendente.
    expect(s.tournaments.map((t) => t.id)).toEqual(['t3', 't2', 't1']);
    // loadTournament sólo se llamó por los que faltaban (t1 y t3), no por t2.
    expect(adaptiveTournamentService.loadTournament).toHaveBeenCalledTimes(2);
    // Los agregados quedan con sync meta neutral.
    expect(s.syncMeta['t1']).toEqual({ syncedUpdatedAt: null, dirty: false });
    expect(s.syncMeta['t3']).toEqual({ syncedUpdatedAt: null, dirty: false });
  });

  it('no pisa un torneo local con cambios sin subir al poblar el selector', async () => {
    // Local: t1 con cambios sin subir. La DB además tiene t9.
    const localCycle = reconstructCycle(
      { id: 't1', name: 'Local con cambios', year: 2026 } as any,
      null,
    );
    useTournamentStore.setState({
      tournaments: [localCycle],
      currentTournamentId: 't1',
      currentTournament: localCycle,
      syncMeta: { t1: { syncedUpdatedAt: '2026-07-22T10:00:00Z', dirty: true } },
    });
    // DB sin cambios en t1 → se conserva y re-empuja (push-local).
    vi.spyOn(adaptiveTournamentService, 'getLatestTournament').mockResolvedValue({
      tournament: { id: 't1', name: 'DB vieja', year: 2026 } as any,
      updatedAt: '2026-07-22T10:00:00Z',
    });
    vi.spyOn(adaptiveTournamentService, 'saveTournament').mockResolvedValue('2026-07-22T12:00:00Z');
    vi.spyOn(cycleStateService, 'saveCycleState').mockResolvedValue(undefined);
    (adaptiveTournamentService.getTournamentsList as any).mockResolvedValue([
      { id: 't1', name: 'World Cup 2026', year: 2026, status: 'qualifiers' },
      { id: 't9', name: 'World Cup 2038', year: 2038, status: 'qualifiers' },
    ]);
    (adaptiveTournamentService.loadTournament as any).mockResolvedValue({
      id: 't9', name: 'World Cup 2038', year: 2038,
    });

    await useTournamentStore.getState().initializeTournament();

    const s = useTournamentStore.getState();
    // t1 conserva la copia LOCAL con cambios (no la pisó la lista de la DB):
    // el paso que puebla el selector nunca recarga un id ya presente.
    expect(s.tournaments.find((t) => t.id === 't1')?.name).toBe('Local con cambios');
    // t9 se agregó a la lista.
    expect(s.tournaments.map((t) => t.id)).toContain('t9');
    // Nunca se recargó t1 desde la DB (el loop salta ids ya presentes).
    expect(adaptiveTournamentService.loadTournament).not.toHaveBeenCalledWith('t1');
  });
});
