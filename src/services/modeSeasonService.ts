import { db } from '../lib/supabaseNormalized';
import { isSupabaseConfigured } from '../lib/supabase';

/**
 * Composición de divisiones por año de un modo de ligas (`mode_season_state`).
 * Es la base de los ascensos/descensos y del cruce A-vs-B del sorteo de Copa
 * (que usa la composición del año anterior).
 */

export interface SeasonDivisions {
  /** teamIds por división, en orden de siembra/última tabla. */
  divisions: Record<string, string[]>;
}

interface SeasonRow {
  division: string;
  team_ids: string[];
}

export const modeSeasonService = {
  /** Divisiones de un modo en un año, o null si ese año no está sembrado. */
  async getSeason(modeId: string, year: number): Promise<SeasonDivisions | null> {
    if (!isSupabaseConfigured()) return null;
    const { data, error } = await db
      .mode_season_state()
      .select('division, team_ids')
      .eq('mode_id', modeId)
      .eq('year', year);
    if (error) throw error;
    const rows = (data as SeasonRow[]) ?? [];
    if (rows.length === 0) return null;
    const divisions: Record<string, string[]> = {};
    for (const r of rows) divisions[r.division] = r.team_ids ?? [];
    return { divisions };
  },

  /**
   * Guarda (upsert) la composición de una división en un año. La clave única
   * (mode_id, year, division) hace idempotente el guardado del rollover.
   */
  async saveDivision(
    modeId: string,
    year: number,
    division: string,
    teamIds: string[],
  ): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const { error } = await db.mode_season_state().upsert(
      { mode_id: modeId, year, division, team_ids: teamIds },
      { onConflict: 'mode_id,year,division' },
    );
    if (error) throw error;
  },
};
