import { db } from '../lib/supabaseNormalized';
import { isSupabaseConfigured } from '../lib/supabase';
import type { GameMode, ModeKind } from '../types';

/**
 * Un modo es una competición aislada (ver GameMode en types). Este servicio es
 * el CRUD de la tabla `modes`. El pool de equipos, los torneos y el historial
 * de cada modo se filtran por `mode_id` en sus respectivos servicios.
 */

interface ModeRow {
  id: string;
  name: string;
  kind: ModeKind;
  config: Record<string, unknown> | null;
  current_year: number | null;
}

const rowToMode = (row: ModeRow): GameMode => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  config: row.config ?? {},
  currentYear: row.current_year,
});

export const modesService = {
  /** Todos los modos disponibles. Vacío si Supabase no está configurado. */
  async getAllModes(): Promise<GameMode[]> {
    if (!isSupabaseConfigured()) return [];
    const { data, error } = await db
      .modes()
      .select('id, name, kind, config, current_year')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data as ModeRow[]).map(rowToMode);
  },

  async getMode(id: string): Promise<GameMode | null> {
    if (!isSupabaseConfigured()) return null;
    const { data, error } = await db
      .modes()
      .select('id, name, kind, config, current_year')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToMode(data as ModeRow) : null;
  },

  async createMode(mode: {
    id: string;
    name: string;
    kind: ModeKind;
    config?: Record<string, unknown>;
    currentYear?: number | null;
  }): Promise<GameMode> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const { data, error } = await db
      .modes()
      .insert({
        id: mode.id,
        name: mode.name,
        kind: mode.kind,
        config: mode.config ?? {},
        current_year: mode.currentYear ?? null,
      })
      .select('id, name, kind, config, current_year')
      .single();
    if (error) throw error;
    return rowToMode(data as ModeRow);
  },

  /** Actualiza campos del modo (nombre, config, año en curso). */
  async updateMode(
    id: string,
    updates: Partial<Pick<GameMode, 'name' | 'config' | 'currentYear'>>,
  ): Promise<void> {
    if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
    const patch: Record<string, unknown> = {};
    if (updates.name !== undefined) patch.name = updates.name;
    if (updates.config !== undefined) patch.config = updates.config;
    if (updates.currentYear !== undefined) patch.current_year = updates.currentYear;
    const { error } = await db.modes().update(patch).eq('id', id);
    if (error) throw error;
  },
};
