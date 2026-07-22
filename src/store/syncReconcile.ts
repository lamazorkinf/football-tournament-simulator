import type { Cycle, SyncMetaEntry } from '../types';

export type ReconcileAction = 'use-db' | 'push-local' | 'use-local-offline' | 'create-new';

export interface ReconcileInput {
  /** Copia local del torneo candidato (misma id que `db`, o la seleccionada si offline). */
  local: Cycle | null;
  localMeta: SyncMetaEntry | null;
  /** Torneo cargado desde la DB, o null si offline / DB vacía. */
  db: Cycle | null;
  /** updated_at (ISO) del torneo de la DB, o null. */
  dbUpdatedAt: string | null;
}

export interface ReconcileResult {
  action: ReconcileAction;
  /** Torneo a usar como currentTournament (null solo en 'create-new'). */
  winner: Cycle | null;
  /** Valor a guardar en syncMeta[winner.id].syncedUpdatedAt. */
  syncedUpdatedAt: string | null;
}

/** ISO string → milisegundos; null/parseo inválido → -Infinity (más viejo que todo). */
function toMillis(ts: string | null): number {
  if (!ts) return -Infinity;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? -Infinity : ms;
}

/**
 * Decide qué copia (local o DB) gana, usando el updated_at del servidor como
 * único reloj. Nunca compara relojes de dos dispositivos entre sí: compara el
 * updated_at actual de la DB contra el que ESTE dispositivo vio la última vez.
 */
export function reconcile({ local, localMeta, db, dbUpdatedAt }: ReconcileInput): ReconcileResult {
  if (db && local) {
    const dbMs = toMillis(dbUpdatedAt);
    const syncedMs = toMillis(localMeta?.syncedUpdatedAt ?? null);
    if (dbMs > syncedMs) {
      // El otro dispositivo escribió después de nuestro último sync.
      return { action: 'use-db', winner: db, syncedUpdatedAt: dbUpdatedAt };
    }
    if (localMeta?.dirty) {
      // La DB no avanzó y tenemos cambios sin subir (save fallido / offline previo).
      return { action: 'push-local', winner: local, syncedUpdatedAt: localMeta.syncedUpdatedAt };
    }
    // En sync: la DB es la copia canónica.
    return { action: 'use-db', winner: db, syncedUpdatedAt: dbUpdatedAt };
  }
  if (db && !local) {
    return { action: 'use-db', winner: db, syncedUpdatedAt: dbUpdatedAt };
  }
  if (!db && local) {
    return { action: 'use-local-offline', winner: local, syncedUpdatedAt: localMeta?.syncedUpdatedAt ?? null };
  }
  return { action: 'create-new', winner: null, syncedUpdatedAt: null };
}
