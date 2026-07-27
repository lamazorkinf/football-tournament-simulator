import { db } from '../lib/supabaseNormalized';
import { isSupabaseConfigured } from '../lib/supabase';
import type {
  ModeTournament,
  ModeTournamentFormat,
  ModeTournamentStatus,
} from '../core/formats/modeTournament';
import type { LeagueState } from '../core/formats/league';
import type { CupState } from '../core/formats/cup';

/**
 * Persistencia de los torneos de un modo de ligas como documento JSONB en
 * `mode_tournaments` (mismo patrón atómico que tournament_cycle_state, pero por
 * torneo y con el estado completo dentro de `state`).
 */

interface ModeTournamentRow {
  id: string;
  mode_id: string;
  year: number;
  format: ModeTournamentFormat;
  name: string;
  status: ModeTournamentStatus;
  division: string | null;
  state: LeagueState | CupState;
}

function rowToTournament(row: ModeTournamentRow): ModeTournament {
  const base = {
    id: row.id,
    modeId: row.mode_id,
    year: row.year,
    name: row.name,
    status: row.status,
    division: row.division,
  };
  return row.format === 'league'
    ? { ...base, format: 'league', state: row.state as LeagueState }
    : { ...base, format: 'cup', state: row.state as CupState };
}

export const modeTournamentService = {
  /** Torneos de un modo (opcionalmente de un año), ordenados por creación. */
  async listByMode(modeId: string, year?: number): Promise<ModeTournament[]> {
    if (!isSupabaseConfigured()) return [];
    let query = db
      .mode_tournaments()
      .select('id, mode_id, year, format, name, status, division, state')
      .eq('mode_id', modeId);
    if (year !== undefined) query = query.eq('year', year);
    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) throw error;
    return (data as ModeTournamentRow[]).map(rowToTournament);
  },

  /** Crea un torneo de modo y devuelve su id. */
  async create(input: {
    modeId: string;
    year: number;
    format: ModeTournamentFormat;
    name: string;
    division?: string | null;
    state: LeagueState | CupState;
  }): Promise<string> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const { data, error } = await db
      .mode_tournaments()
      .insert({
        mode_id: input.modeId,
        year: input.year,
        format: input.format,
        name: input.name,
        division: input.division ?? null,
        state: input.state,
        status: 'in-progress',
      })
      .select('id')
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  },

  /** Guarda el estado (y opcionalmente el status) de un torneo de modo. */
  async saveState(
    id: string,
    state: LeagueState | CupState,
    status?: ModeTournamentStatus,
  ): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const patch: Record<string, unknown> = { state };
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
