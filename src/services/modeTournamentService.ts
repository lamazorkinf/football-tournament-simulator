import { db } from '../lib/supabaseNormalized';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  MODE_TOURNAMENT_SCHEMA_VERSION,
  type ModeTournament,
  type ModeTournamentFormat,
  type ModeTournamentState,
  type ModeTournamentStatus,
} from '../core/formats/modeTournament';
import {
  canonicalFormat,
  migrateTournamentState,
} from '../core/formats/modeTournamentMigration';

/**
 * Persistencia de los torneos de un modo de temporada como documento JSONB en
 * `mode_tournaments` (mismo patrón atómico que tournament_cycle_state, pero por
 * torneo y con el estado completo dentro de `state`).
 *
 * Al leer, la fila se traduce al vocabulario actual: `format` legacy
 * (`'league'`/`'cup'`) pasa a su formato canónico y un `state` de v1 se migra en
 * memoria. La fila se re-escribe en v2 recién en la próxima escritura del torneo.
 */

interface ModeTournamentRow {
  id: string;
  mode_id: string;
  year: number;
  format: string;
  name: string;
  status: ModeTournamentStatus;
  division: string | null;
  competition_id: string | null;
  schema_version: number | null;
  state: unknown;
}

const COLUMNS =
  'id, mode_id, year, format, name, status, division, competition_id, schema_version, state';

/**
 * A qué competición del descriptor pertenece una fila sin `competition_id`
 * (guardada antes de que existiera la columna). Lo resuelve el llamador, que es
 * quien tiene el descriptor del modo.
 */
export type LegacyCompetitionResolver = (
  format: ModeTournamentFormat,
  division: string | null,
) => string | null;

function rowToTournament(
  row: ModeTournamentRow,
  resolveLegacy?: LegacyCompetitionResolver,
): ModeTournament {
  const format = canonicalFormat(row.format);
  const competitionId =
    row.competition_id ?? resolveLegacy?.(format, row.division) ?? `${format}:${row.division ?? ''}`;

  const base = {
    id: row.id,
    modeId: row.mode_id,
    competitionId,
    year: row.year,
    name: row.name,
    status: row.status,
    division: row.division,
  };
  const state = migrateTournamentState(format, row.schema_version ?? 1, row.state);

  // El union se discrimina por `format`; el estado ya viene migrado a la forma
  // que le corresponde a cada uno.
  switch (format) {
    case 'liga':
      return { ...base, format, state } as ModeTournament;
    case 'eliminacion':
      return { ...base, format, state } as ModeTournament;
    case 'grupos-eliminacion':
      return { ...base, format, state } as ModeTournament;
  }
}

export const modeTournamentService = {
  /** Torneos de un modo (opcionalmente de un año), ordenados por creación. */
  async listByMode(
    modeId: string,
    year?: number,
    resolveLegacy?: LegacyCompetitionResolver,
  ): Promise<ModeTournament[]> {
    if (!isSupabaseConfigured()) return [];
    let query = db.mode_tournaments().select(COLUMNS).eq('mode_id', modeId);
    if (year !== undefined) query = query.eq('year', year);
    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) throw error;
    return (data as ModeTournamentRow[]).map((row) => rowToTournament(row, resolveLegacy));
  },

  /** Crea un torneo de modo y devuelve su id. */
  async create(input: {
    modeId: string;
    year: number;
    format: ModeTournamentFormat;
    competitionId: string;
    name: string;
    division?: string | null;
    state: ModeTournamentState;
  }): Promise<string> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const { data, error } = await db
      .mode_tournaments()
      .insert({
        mode_id: input.modeId,
        year: input.year,
        format: input.format,
        competition_id: input.competitionId,
        name: input.name,
        division: input.division ?? null,
        state: input.state,
        status: 'in-progress',
        schema_version: MODE_TOURNAMENT_SCHEMA_VERSION,
      })
      .select('id')
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  },

  /** Guarda el estado (y opcionalmente el status) de un torneo de modo. */
  async saveState(
    id: string,
    state: ModeTournamentState,
    status?: ModeTournamentStatus,
  ): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    // Toda escritura deja la fila en el esquema actual: así un torneo v1 que se
    // sigue jugando queda migrado sin necesidad de un backfill.
    const patch: Record<string, unknown> = {
      state,
      schema_version: MODE_TOURNAMENT_SCHEMA_VERSION,
    };
    if (status) patch.status = status;
    const { error } = await db.mode_tournaments().update(patch).eq('id', id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const { error } = await db.mode_tournaments().delete().eq('id', id);
    if (error) throw error;
  },
};
