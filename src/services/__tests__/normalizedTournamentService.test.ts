import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizedTournamentService } from '../normalizedTournamentService';
import { db } from '../../lib/supabaseNormalized';
import * as supaLib from '../../lib/supabase';

/**
 * `getLatestTournament` devuelve null para decir "la base está vacía", y el
 * store lo interpreta como "primer arranque: creá el torneo inicial". Por eso
 * un fallo de red NO puede devolver null: si lo hiciera, cada arranque sin
 * conexión crearía un torneo fantasma.
 */
function listBuilder(result: { data?: unknown; error?: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })),
  };
  return builder;
}

describe('getLatestTournament', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
  });

  it('base vacía ⇒ null (habilita crear el torneo inicial)', async () => {
    vi.spyOn(db, 'tournaments_new').mockReturnValue(listBuilder({ data: [] }) as never);

    expect(await normalizedTournamentService.getLatestTournament()).toBeNull();
  });

  it('error de la base ⇒ lanza, NO devuelve null', async () => {
    vi.spyOn(db, 'tournaments_new').mockReturnValue(
      listBuilder({ error: new Error('network down') }) as never,
    );

    await expect(normalizedTournamentService.getLatestTournament()).rejects.toThrow('network down');
  });

  it('fila presente pero detalle incargable ⇒ lanza en vez de simular base vacía', async () => {
    // El header existe; el armado del torneo falla (red caída a mitad de camino).
    const tournaments = listBuilder({ data: [{ id: 't1', updated_at: '2026-07-23T10:00:00Z' }] });
    vi.spyOn(db, 'tournaments_new').mockImplementation(() => {
      // La segunda parte de la carga usa otras tablas; que fallen simula el corte.
      return tournaments as never;
    });
    vi.spyOn(db, 'qualifier_groups').mockImplementation(() => {
      throw new Error('network down');
    });

    await expect(normalizedTournamentService.getLatestTournament()).rejects.toThrow();
  });
});
