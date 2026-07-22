import { db } from '../lib/supabaseNormalized';
import { isSupabaseConfigured } from '../lib/supabase';
import { serializeCycleState } from '../core/cycle';
import type { CycleStatePayload } from '../core/cycle';
import type { Cycle } from '../types';

/**
 * Persistencia del estado del ciclo (continental + confederaciones + calendario
 * + Mundial completo) como documento JSONB en la tabla lateral
 * `tournament_cycle_state` (1:1 con el torneo). El detalle por-partido queryable
 * vive normalizado en `match_history`; acá guardamos el snapshot ATÓMICO que
 * permite reanudar el ciclo entero en otro dispositivo — incluida la llave del
 * Mundial, que antes dependía de escrituras por-partido frágiles.
 */
export const cycleStateService = {
  /** Upsert del estado del ciclo. No-op si Supabase no está configurado. */
  async saveCycleState(cycle: Cycle): Promise<void> {
    if (!isSupabaseConfigured()) return;
    const { error } = await db.tournament_cycle_state().upsert(
      {
        tournament_id: cycle.id,
        state: serializeCycleState(cycle),
        // v2: el snapshot incluye ahora el Mundial completo (grupos + llave +
        // campeón), no sólo continental/confed/calendario. loadCycleState no
        // gatea por versión; el bump es documental.
        schema_version: 2,
      },
      { onConflict: 'tournament_id' },
    );
    if (error) throw error;
  },

  /** Carga el estado del ciclo de un torneo, o null si no hay row (legacy). */
  async loadCycleState(tournamentId: string): Promise<CycleStatePayload | null> {
    if (!isSupabaseConfigured()) return null;
    const { data, error } = await db
      .tournament_cycle_state()
      .select('state')
      .eq('tournament_id', tournamentId)
      .maybeSingle();
    if (error) throw error;
    return (data?.state as CycleStatePayload | undefined) ?? null;
  },
};

export default cycleStateService;
