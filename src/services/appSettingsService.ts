import { db } from '../lib/supabaseNormalized';
import { isSupabaseConfigured } from '../lib/supabase';
import type { EngineConfig } from '../store/useConfigStore';

/**
 * Preferencias globales de la app: config del motor Elo, equipos favoritos y
 * efecto CRT. Viven en la fila singleton `app_settings` (id = 'global'), no en
 * localStorage: la DB es la única fuente de verdad del estado de la app.
 *
 * Como la app no tiene auth, son preferencias compartidas entre dispositivos,
 * no por-dispositivo.
 */
export interface AppSettings {
  engineConfig: EngineConfig;
  favoriteTeamIds: string[];
  scanlines: boolean;
}

/** id de la única fila permitida (el CHECK de la tabla lo garantiza). */
const SINGLETON_ID = 'global';

interface AppSettingsRow {
  engine_config: EngineConfig;
  favorite_team_ids: string[] | null;
  scanlines: boolean | null;
}

export const appSettingsService = {
  /**
   * Carga las preferencias, o null si todavía no hay fila (primer arranque) o
   * si Supabase no está configurado. Los stores caen a sus defaults en ese caso.
   */
  async loadSettings(): Promise<AppSettings | null> {
    if (!isSupabaseConfigured()) return null;
    const { data, error } = await db
      .app_settings()
      .select('engine_config, favorite_team_ids, scanlines')
      .eq('id', SINGLETON_ID)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const row = data as AppSettingsRow;
    return {
      engineConfig: row.engine_config,
      favoriteTeamIds: row.favorite_team_ids ?? [],
      scanlines: row.scanlines ?? true,
    };
  },

  /**
   * Upsert parcial: sólo se envían las claves presentes en `patch`, de modo que
   * guardar los favoritos no pise la config del motor ni al revés.
   *
   * El upsert necesita todas las columnas NOT NULL sin default en el INSERT, y
   * `engine_config` es una de ellas. Por eso un patch que no la incluya usa
   * UPDATE: si todavía no existe la fila no hay nada que preservar, y el primer
   * guardado siempre viene de la hidratación inicial, que sí manda la config.
   */
  async saveSettings(patch: Partial<AppSettings>): Promise<void> {
    if (!isSupabaseConfigured()) return;

    const row: Record<string, unknown> = {};
    if (patch.engineConfig !== undefined) row.engine_config = patch.engineConfig;
    if (patch.favoriteTeamIds !== undefined) row.favorite_team_ids = patch.favoriteTeamIds;
    if (patch.scanlines !== undefined) row.scanlines = patch.scanlines;
    if (Object.keys(row).length === 0) return;

    if (patch.engineConfig !== undefined) {
      const { error } = await db
        .app_settings()
        .upsert({ id: SINGLETON_ID, ...row }, { onConflict: 'id' });
      if (error) throw error;
      return;
    }

    const { error } = await db.app_settings().update(row).eq('id', SINGLETON_ID);
    if (error) throw error;
  },
};

export default appSettingsService;
