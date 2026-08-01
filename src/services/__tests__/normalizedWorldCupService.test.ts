import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { normalizedWorldCupService } from '../normalizedWorldCupService';
import { db } from '../../lib/supabaseNormalized';
import * as supaLib from '../../lib/supabase';
import { useHistoryRevisionStore } from '../../store/useHistoryRevisionStore';

/**
 * Cadena `.delete().eq().eq()` que resuelve con `{ error }`, la forma exacta que
 * usa `deleteKnockoutData` sobre `matches_new` y sobre `match_history`.
 */
const deleteChain = (error: Error | null) => ({
  delete: () => ({ eq: () => ({ eq: async () => ({ error }) }) }),
});

beforeEach(() => {
  vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Regenerar el bracket de playoffs borra filas de `match_history` con SQL crudo.
 * Es una acción de usuario real (`useTournamentStore.ts:2319`) y, sin bump, la
 * portada del Hub sigue titulando un octavos que ya no existe hasta el próximo
 * insert.
 */
describe('deleteKnockoutData — revisión del historial', () => {
  const mockAmbos = (historyError: Error | null) => {
    vi.spyOn(db as unknown as { matches_new: () => unknown }, 'matches_new')
      .mockReturnValue(deleteChain(null) as never);
    vi.spyOn(supaLib.supabase as unknown as { from: (...a: unknown[]) => unknown }, 'from')
      .mockReturnValue(deleteChain(historyError) as never);
  };

  it('un borrado exitoso incrementa la revisión', async () => {
    mockAmbos(null);

    const antes = useHistoryRevisionStore.getState().revision;
    await normalizedWorldCupService.deleteKnockoutData('t1');

    expect(useHistoryRevisionStore.getState().revision).toBe(antes + 1);
  });

  it('un borrado fallido NO incrementa la revisión', async () => {
    mockAmbos(new Error('sin red'));

    const antes = useHistoryRevisionStore.getState().revision;
    await expect(normalizedWorldCupService.deleteKnockoutData('t1')).rejects.toThrow();

    expect(useHistoryRevisionStore.getState().revision).toBe(antes);
  });

  it('sin Supabase es no-op y no toca la revisión', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(false);

    const antes = useHistoryRevisionStore.getState().revision;
    await normalizedWorldCupService.deleteKnockoutData('t1');

    expect(useHistoryRevisionStore.getState().revision).toBe(antes);
  });
});
