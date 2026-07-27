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

/**
 * El INSERT de un torneo nuevo tiene que llevar `mode_id` explícito. Hasta la
 * migración 018 sólo existía el modo selecciones y el INSERT se apoyaba en el
 * DEFAULT de la columna, así que un segundo modo `national-cycle` habría
 * escrito sus ciclos dentro de selecciones. En el UPDATE, en cambio, `mode_id`
 * NO se toca: un torneo no cambia de modo.
 */
describe('saveTournament — atribución de modo', () => {
  const cycle = {
    id: 't-nuevo',
    name: 'Ciclo 2030',
    year: 2030,
    qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
    worldCup: null,
    isQualifiersComplete: false,
    hasAnyMatchPlayed: false,
  } as never;

  function saveBuilder(existing: unknown) {
    const insert = vi.fn(() => ({
      select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { updated_at: 'x' }, error: null })) })),
    }));
    const update = vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { updated_at: 'x' }, error: null })) })),
      })),
    }));
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({ data: existing, error: null })),
      insert,
      update,
    };
    return { builder, insert, update };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
  });

  it('el torneo nuevo se inserta con el mode_id que se le pasa', async () => {
    const { builder, insert } = saveBuilder(null); // no existe ⇒ rama INSERT
    vi.spyOn(db, 'tournaments_new').mockReturnValue(builder as never);
    vi.spyOn(db, 'qualifier_groups').mockImplementation(() => {
      throw new Error('corte adrede: sólo interesa el header');
    });

    await normalizedTournamentService.saveTournament(cycle, 'villamariense').catch(() => {});

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({ id: 't-nuevo', mode_id: 'villamariense' });
  });

  it('el UPDATE de un torneo existente no reescribe mode_id', async () => {
    const { builder, update } = saveBuilder({ id: 't-nuevo' }); // existe ⇒ rama UPDATE
    vi.spyOn(db, 'tournaments_new').mockReturnValue(builder as never);
    vi.spyOn(db, 'qualifier_groups').mockImplementation(() => {
      throw new Error('corte adrede: sólo interesa el header');
    });

    await normalizedTournamentService.saveTournament(cycle, 'villamariense').catch(() => {});

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).not.toHaveProperty('mode_id');
  });
});
