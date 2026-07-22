import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { persistTournamentWithSync } from '../useTournamentStore';
import { adaptiveTournamentService } from '../../services/adaptiveTournamentService';
import { cycleStateService } from '../../services/cycleStateService';
import { useToastStore } from '../useToastStore';
import * as supa from '../../lib/supabase';
import type { Cycle, SyncMetaEntry } from '../../types';

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
