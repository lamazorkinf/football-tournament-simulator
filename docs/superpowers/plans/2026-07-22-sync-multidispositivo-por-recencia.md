# Sync multi-dispositivo por recencia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que dos dispositivos que comparten la misma DB de Supabase converjan al estado más reciente del torneo, reconciliando localStorage ↔ DB por recencia en vez de dejar que localStorage siempre gane.

**Architecture:** La DB pasa a ser fuente de verdad compartida y localStorage queda como caché/fallback offline. Se agrega un `updated_at` confiable (trigger), metadata de sync local (`syncMeta` con `syncedUpdatedAt` + `dirty`), una función pura de reconciliación, y saves con reintento + toast. `initializeTournament` consulta la DB por `updated_at desc` y reconcilia; ninguna ruta descarta silenciosamente la copia más fresca.

**Tech Stack:** React 19, Zustand 5 (`persist` + `createJSONStorage`), Supabase JS 2, Vitest 4, TypeScript 5.9. Toasts vía `useToastStore` (convención del store; `ToastContainer` montado en `App.tsx`).

## Global Constraints

- **Reloj único = servidor.** La recencia se decide con `updated_at` que setea Postgres (`now()`), nunca comparando relojes de dos dispositivos.
- **Granularidad = torneo entero.** No hay merge por-campo ni sync por-partido.
- **Sin auth / sin scoping por usuario.** La DB global compartida y la RLS abierta se mantienen.
- **No bloquear la simulación.** Los guardados siguen asíncronos; los fallos se informan por toast, no frenan el juego.
- **No romper la suite existente** (184 tests) ni `tsc -b`.
- **Persistencia local tolerante a errores:** el `storage` custom del `persist` ya envuelve `localStorage` en try/catch — mantenerlo.
- **Migraciones:** aplicar a Supabase vía MCP (`mcp__supabase__apply_migration`), como el resto del repo. Numeración: la próxima es `011`.

---

## File Structure

- `supabase/migrations/011_touch_updated_at.sql` — **crear**. Trigger `BEFORE UPDATE` que bumpea `updated_at`.
- `src/types/index.ts` — **modificar**. Agregar `SyncMetaEntry` y `syncMeta` a `TournamentState`.
- `src/store/syncReconcile.ts` — **crear**. Función pura `reconcile()` + tipos. Sin dependencias de Supabase (testeable en aislamiento).
- `src/store/__tests__/syncReconcile.test.ts` — **crear**. Tests de la función pura.
- `src/services/normalizedTournamentService.ts` — **modificar**. `saveTournament` devuelve `updated_at`; `getLatestTournament` ordena por `updated_at` y devuelve `{ tournament, updatedAt }`.
- `src/store/useTournamentStore.ts` — **modificar**. Estado `syncMeta`, helper `persistTournamentWithSync`, reescritura de `initializeTournament`, `mergeTournament` recency-aware, extracción de `createFirstTournament`, quitar guarda "localStorage siempre gana", seed/limpieza de `syncMeta` en create/delete, `partialize` + `migrate` (v11).
- `src/store/__tests__/useTournamentStore.sync.test.ts` — **crear**. Tests de `persistTournamentWithSync` y del flujo de `initializeTournament` (con spies en el boundary de servicios).

---

## Task 1: Migración `updated_at` confiable

**Files:**
- Create: `supabase/migrations/011_touch_updated_at.sql`

**Interfaces:**
- Consumes: nada.
- Produces: `tournaments_new.updated_at` y `tournament_cycle_state.updated_at` se bumpean en cada `UPDATE`.

- [ ] **Step 1: Escribir la migración**

Create `supabase/migrations/011_touch_updated_at.sql`:

```sql
-- ============================================
-- Migration 011: updated_at confiable (reconciliación multi-dispositivo)
-- ============================================
-- La reconciliación local↔DB (ver spec 2026-07-22-sync-multidispositivo-por-recencia)
-- necesita que updated_at refleje la última escritura. Los upserts de saveTournament
-- y saveCycleState no lo setean, y solo se llenaba en el INSERT (DEFAULT now()).
-- Un trigger BEFORE UPDATE lo bumpea en cada UPDATE. Postgres dispara el trigger
-- aunque los valores no cambien, así que también bumpea cuando saveTournament
-- reescribe el header al jugar un partido de grupo (que no toca campos del header).

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_tournaments_new_updated_at ON tournaments_new;
CREATE TRIGGER trigger_tournaments_new_updated_at
  BEFORE UPDATE ON tournaments_new
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_cycle_state_updated_at ON tournament_cycle_state;
CREATE TRIGGER trigger_cycle_state_updated_at
  BEFORE UPDATE ON tournament_cycle_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **Step 2: Aplicar la migración a Supabase (MCP)**

Usar la tool `mcp__supabase__apply_migration` con `name: "011_touch_updated_at"` y el `query` = contenido del archivo del Step 1.
Expected: sin error.

- [ ] **Step 3: Verificar que el trigger bumpea `updated_at`**

Usar `mcp__supabase__execute_sql` con:

```sql
UPDATE tournaments_new
SET name = name
WHERE id = (SELECT id FROM tournaments_new ORDER BY created_at DESC LIMIT 1)
RETURNING id, created_at, updated_at;
```

Expected: la fila devuelta tiene `updated_at` > `created_at` (o `updated_at` ≈ `now()`), probando que un `UPDATE` no-op igual lo bumpeó. Si la tabla está vacía (0 filas), crear un torneo desde la app primero o dar por válido el trigger (la lógica SQL es estándar).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/011_touch_updated_at.sql
git commit -m "feat(sync): trigger BEFORE UPDATE para updated_at confiable (migración 011)"
```

---

## Task 2: `saveTournament` devuelve `updated_at`

**Files:**
- Modify: `src/services/normalizedTournamentService.ts:377-477` (cuerpo de `saveTournament`)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `saveTournament(tournament: Tournament): Promise<string | null>` — resuelve el `updated_at` del header (ISO string) o `null`. Cambio **aditivo**: los callers actuales que ignoran el valor resuelto siguen compilando.

- [ ] **Step 1: Cambiar la firma y la rama `update` para devolver `updated_at`**

En `src/services/normalizedTournamentService.ts`, cambiar la declaración de `saveTournament` (hoy `async saveTournament(tournament: Tournament): Promise<void>`) a `Promise<string | null>` y reemplazar la rama `if (existing)` (líneas ~414-432) por:

```ts
      let headerUpdatedAt: string | null = null;

      if (existing) {
        // Update existing tournament
        const { data, error } = await db
          .tournaments_new()
          .update({
            name: tournament.name,
            year: tournament.year,
            status,
            is_qualifiers_complete: tournament.isQualifiersComplete,
            has_any_match_played: tournament.hasAnyMatchPlayed,
            champion_team_id: tournament.worldCup?.champion || null,
            runner_up_team_id: tournament.worldCup?.runnerUp || null,
            third_place_team_id: tournament.worldCup?.thirdPlace || null,
            fourth_place_team_id: tournament.worldCup?.fourthPlace || null,
          })
          .eq('id', tournament.id)
          .select('updated_at')
          .single();

        if (error) throw error;
        headerUpdatedAt = (data as { updated_at?: string } | null)?.updated_at ?? null;
        console.log(`Tournament ${tournament.id} updated in database`);
      } else {
```

- [ ] **Step 2: Actualizar la rama `insert` para capturar `updated_at`**

Reemplazar la rama `else { ... insert ... }` (líneas ~433-452) por:

```ts
      } else {
        // Insert new tournament
        const { data, error } = await db
          .tournaments_new()
          .insert({
            id: tournament.id,
            name: tournament.name,
            year: tournament.year,
            status,
            is_qualifiers_complete: tournament.isQualifiersComplete,
            has_any_match_played: tournament.hasAnyMatchPlayed,
            champion_team_id: tournament.worldCup?.champion || null,
            runner_up_team_id: tournament.worldCup?.runnerUp || null,
            third_place_team_id: tournament.worldCup?.thirdPlace || null,
            fourth_place_team_id: tournament.worldCup?.fourthPlace || null,
          })
          .select('updated_at')
          .single();

        if (error) throw error;
        headerUpdatedAt = (data as { updated_at?: string } | null)?.updated_at ?? null;
        console.log(`Tournament ${tournament.id} created in database`);
      }
```

- [ ] **Step 3: Devolver `headerUpdatedAt` al final**

Antes del `return` implícito (después del bloque de `originalSkills`, al final del `try`, línea ~469), agregar:

```ts
      return headerUpdatedAt;
```

Y asegurarse de que el `catch` siga haciendo `throw error;` (sin cambios).

- [ ] **Step 4: Verificar tipos y suite**

Run: `npx tsc -b && npm test`
Expected: `tsc` sin errores; los 184 tests siguen verdes (cambio aditivo, ningún caller rompe).

- [ ] **Step 5: Commit**

```bash
git add src/services/normalizedTournamentService.ts
git commit -m "feat(sync): saveTournament devuelve el updated_at del header"
```

---

## Task 3: Función pura de reconciliación

**Files:**
- Modify: `src/types/index.ts:113-141` (agregar `SyncMetaEntry` y campo `syncMeta`)
- Create: `src/store/syncReconcile.ts`
- Test: `src/store/__tests__/syncReconcile.test.ts`

**Interfaces:**
- Consumes: `Cycle` desde `../types`.
- Produces:
  - `interface SyncMetaEntry { syncedUpdatedAt: string | null; dirty: boolean }` (en `../types`)
  - `type ReconcileAction = 'use-db' | 'push-local' | 'use-local-offline' | 'create-new'`
  - `function reconcile(input: ReconcileInput): ReconcileResult` con
    `ReconcileInput { local: Cycle | null; localMeta: SyncMetaEntry | null; db: Cycle | null; dbUpdatedAt: string | null }`
    y `ReconcileResult { action: ReconcileAction; winner: Cycle | null; syncedUpdatedAt: string | null }`.

- [ ] **Step 1: Agregar `SyncMetaEntry` y `syncMeta` a los tipos**

En `src/types/index.ts`, justo antes de `export interface TournamentState {` (línea 113), agregar:

```ts
/**
 * Metadata de sincronización local por torneo (ver spec sync-multidispositivo).
 * `syncedUpdatedAt`: el updated_at que la DB reportó la última vez que ESTE
 * dispositivo guardó/cargó el torneo. `dirty`: hay cambios locales sin confirmar.
 */
export interface SyncMetaEntry {
  syncedUpdatedAt: string | null;
  dirty: boolean;
}
```

Y dentro de `interface TournamentState`, después de `isBatchProcessing: boolean;` (línea 118), agregar el campo:

```ts
  syncMeta: Record<string, SyncMetaEntry>; // sync local↔DB por tournamentId
```

- [ ] **Step 2: Inicializar `syncMeta` en el estado del store (mantiene `tsc` verde)**

En `src/store/useTournamentStore.ts`, en el objeto de estado inicial (después de `isBatchProcessing: false,`, línea ~136), agregar:

```ts
        syncMeta: {},
```

Sin esto, agregar el campo a la interfaz deja el estado inicial incompleto y `tsc -b` falla. Es una sola línea; el resto de la lógica de `syncMeta` llega en Task 4.

- [ ] **Step 3: Escribir el test de `reconcile` (falla primero)**

Create `src/store/__tests__/syncReconcile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { reconcile } from '../syncReconcile';
import type { Cycle } from '../../types';

// Cycle mínimo: reconcile solo mira el id; el resto no importa para la lógica.
const cyc = (id: string): Cycle => ({ id } as unknown as Cycle);

describe('reconcile', () => {
  it('DB más nueva que el último sync → gana DB', () => {
    const r = reconcile({
      local: cyc('t1'),
      localMeta: { syncedUpdatedAt: '2026-07-22T10:00:00Z', dirty: false },
      db: cyc('t1'),
      dbUpdatedAt: '2026-07-22T11:00:00Z',
    });
    expect(r.action).toBe('use-db');
    expect(r.winner?.id).toBe('t1');
    expect(r.syncedUpdatedAt).toBe('2026-07-22T11:00:00Z');
  });

  it('DB sin cambios desde el último sync y local dirty → gana local (push)', () => {
    const r = reconcile({
      local: cyc('t1'),
      localMeta: { syncedUpdatedAt: '2026-07-22T10:00:00Z', dirty: true },
      db: cyc('t1'),
      dbUpdatedAt: '2026-07-22T10:00:00Z',
    });
    expect(r.action).toBe('push-local');
    expect(r.winner?.id).toBe('t1');
  });

  it('DB sin cambios y local NO dirty → gana DB (en sync, canónico)', () => {
    const r = reconcile({
      local: cyc('t1'),
      localMeta: { syncedUpdatedAt: '2026-07-22T10:00:00Z', dirty: false },
      db: cyc('t1'),
      dbUpdatedAt: '2026-07-22T10:00:00Z',
    });
    expect(r.action).toBe('use-db');
  });

  it('sin copia en DB (offline) y local presente → usar local offline', () => {
    const r = reconcile({
      local: cyc('t1'),
      localMeta: { syncedUpdatedAt: '2026-07-22T10:00:00Z', dirty: true },
      db: null,
      dbUpdatedAt: null,
    });
    expect(r.action).toBe('use-local-offline');
    expect(r.winner?.id).toBe('t1');
    expect(r.syncedUpdatedAt).toBe('2026-07-22T10:00:00Z');
  });

  it('DB presente, sin local → usar DB', () => {
    const r = reconcile({ local: null, localMeta: null, db: cyc('t1'), dbUpdatedAt: '2026-07-22T10:00:00Z' });
    expect(r.action).toBe('use-db');
    expect(r.winner?.id).toBe('t1');
  });

  it('sin DB ni local → crear nuevo', () => {
    const r = reconcile({ local: null, localMeta: null, db: null, dbUpdatedAt: null });
    expect(r.action).toBe('create-new');
    expect(r.winner).toBeNull();
  });

  it('primera carga (syncedUpdatedAt null, no dirty) con DB → gana DB', () => {
    const r = reconcile({
      local: cyc('t1'),
      localMeta: { syncedUpdatedAt: null, dirty: false },
      db: cyc('t1'),
      dbUpdatedAt: '2026-07-22T10:00:00Z',
    });
    expect(r.action).toBe('use-db');
  });

  it('legacy sin updated_at en DB y local dirty → push-local', () => {
    const r = reconcile({
      local: cyc('t1'),
      localMeta: { syncedUpdatedAt: null, dirty: true },
      db: cyc('t1'),
      dbUpdatedAt: null,
    });
    expect(r.action).toBe('push-local');
  });
});
```

- [ ] **Step 4: Correr el test para verlo fallar**

Run: `npm test -- syncReconcile`
Expected: FAIL — `Cannot find module '../syncReconcile'`.

- [ ] **Step 5: Implementar `reconcile`**

Create `src/store/syncReconcile.ts`:

```ts
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
```

- [ ] **Step 6: Correr los tests (deben pasar) y tipos**

Run: `npm test -- syncReconcile && npx tsc -b`
Expected: los 8 tests de `reconcile` en PASS; `tsc` sin errores (el `syncMeta: {}` del Step 2 mantiene el estado inicial completo).

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/store/syncReconcile.ts src/store/__tests__/syncReconcile.test.ts src/store/useTournamentStore.ts
git commit -m "feat(sync): función pura reconcile() + tipo SyncMetaEntry"
```

---

## Task 4: `syncMeta` en el store + saves confiables

**Files:**
- Modify: `src/store/useTournamentStore.ts` — helper nuevo `persistTournamentWithSync`, `updateTournamentInState` (líneas ~90-116), `createNewTournament` (líneas ~305-310), `deleteTournament` (después de línea ~399), `partialize`/`migrate`/`version` (líneas ~2269-2319)
- Test: `src/store/__tests__/useTournamentStore.sync.test.ts`

> Precondición: `syncMeta: {}` ya fue inicializado en el estado (Task 3, Step 2).

**Interfaces:**
- Consumes: `saveTournament(): Promise<string | null>` (Task 2), `SyncMetaEntry` (Task 3).
- Produces: `export async function persistTournamentWithSync(tournament: Cycle, set: any, get: any): Promise<void>` — guarda con reintento, actualiza `syncMeta` del torneo (`dirty=false` + `syncedUpdatedAt` en éxito; toast + `dirty=true` en fallo definitivo). `updateTournamentInState` marca `dirty=true` sincrónicamente.

- [ ] **Step 1: Agregar el helper `persistTournamentWithSync` (con delay + retry)**

Justo antes de `const updateTournamentInState = ...` (línea ~89), agregar:

```ts
/** Backoff fijo entre reintentos de guardado (ms). Longitud = nº de reintentos. */
const SAVE_RETRY_DELAYS_MS = [300, 800];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Guarda el torneo en Supabase (header + cycle_state, en ese orden por la FK) con
 * reintento corto. En éxito marca syncMeta[id] = { syncedUpdatedAt, dirty:false }.
 * En fallo definitivo deja dirty=true y avisa por toast (se re-empuja al recargar).
 * No-op si Supabase no está configurado (queda dirty para un futuro push).
 */
export async function persistTournamentWithSync(
  tournament: Cycle,
  set: any,
  get: any,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const attempts = SAVE_RETRY_DELAYS_MS.length + 1;
  for (let i = 0; i < attempts; i++) {
    try {
      const updatedAt = await adaptiveTournamentService.saveTournament(tournament);
      await cycleStateService.saveCycleState(ensureCycleFields(tournament));
      set((s: TournamentState) => ({
        syncMeta: {
          ...s.syncMeta,
          [tournament.id]: { syncedUpdatedAt: updatedAt, dirty: false },
        },
      }));
      return;
    } catch (error) {
      console.error(`Error guardando torneo (intento ${i + 1}/${attempts}):`, error);
      if (i < SAVE_RETRY_DELAYS_MS.length) {
        await delay(SAVE_RETRY_DELAYS_MS[i]);
      }
    }
  }

  // Falló definitivamente: mantener dirty=true para re-empujar en la próxima carga.
  set((s: TournamentState) => ({
    syncMeta: {
      ...s.syncMeta,
      [tournament.id]: {
        syncedUpdatedAt: s.syncMeta[tournament.id]?.syncedUpdatedAt ?? null,
        dirty: true,
      },
    },
  }));
  useToastStore.getState().error('No se pudo sincronizar con la base. Reintentaré al recargar.');
}
```

- [ ] **Step 2: Reescribir `updateTournamentInState` para marcar dirty y usar el helper**

Reemplazar el cuerpo completo de `updateTournamentInState` (líneas ~90-116) por:

```ts
const updateTournamentInState = (set: any, get: any, updatedTournament: Tournament, skipDbSave = false) => {
  // Update in tournaments list + marcar dirty sincrónicamente para este torneo.
  set((state: TournamentState) => ({
    tournaments: state.tournaments.map(t =>
      t.id === updatedTournament.id ? updatedTournament : t
    ),
    currentTournament: state.currentTournamentId === updatedTournament.id
      ? updatedTournament
      : state.currentTournament,
    syncMeta: {
      ...state.syncMeta,
      [updatedTournament.id]: {
        syncedUpdatedAt: state.syncMeta[updatedTournament.id]?.syncedUpdatedAt ?? null,
        dirty: true,
      },
    },
  }));

  // Save to database (skip if in batch mode or explicitly disabled). persistTournamentWithSync
  // encadena saveTournament → saveCycleState (orden requerido por la FK de cycle_state) y
  // limpia dirty al confirmar; si falla, deja dirty=true + toast.
  const state = get();
  if (isSupabaseConfigured() && !skipDbSave && !state.isBatchProcessing) {
    void persistTournamentWithSync(updatedTournament as Cycle, set, get);
  }
};
```

- [ ] **Step 3: Seed de `syncMeta` al crear torneo en `createNewTournament`**

En `createNewTournament`, reemplazar las líneas ~307-310:

```ts
              progress.updateProgress('Guardando torneo en base de datos...', 4);
              await adaptiveTournamentService.saveTournament(tournament);
              await cycleStateService.saveCycleState(tournament);
              console.log(`Tournament ${year} created and saved to database`);
```

por:

```ts
              progress.updateProgress('Guardando torneo en base de datos...', 4);
              const createdUpdatedAt = await adaptiveTournamentService.saveTournament(tournament);
              await cycleStateService.saveCycleState(tournament);
              set((s: TournamentState) => ({
                syncMeta: {
                  ...s.syncMeta,
                  [tournament.id]: { syncedUpdatedAt: createdUpdatedAt, dirty: false },
                },
              }));
              console.log(`Tournament ${year} created and saved to database`);
```

- [ ] **Step 4: Limpiar `syncMeta` al borrar torneo en `deleteTournament`**

En `deleteTournament`, localizar el `set(...)` que remueve el torneo del estado (quita de `tournaments` tras el delete en DB). Inmediatamente después de ese `set`, agregar la limpieza del mapa:

```ts
        set((s: TournamentState) => {
          const nextSyncMeta = { ...s.syncMeta };
          delete nextSyncMeta[id];
          return { syncMeta: nextSyncMeta };
        });
```

- [ ] **Step 5: Persistir `syncMeta` y bump de versión (v11)**

En el bloque `persist(..., { ... })` (líneas ~2269-2319):

Cambiar `version: 10,` por `version: 11,` y su comentario a:

```ts
      version: 11, // v11: agrega syncMeta (reconciliación local↔DB por recencia).
```

Reemplazar `partialize` por:

```ts
      partialize: (state) => ({
        tournaments: state.tournaments,
        currentTournamentId: state.currentTournamentId,
        syncMeta: state.syncMeta,
      }),
```

Reemplazar `migrate` por:

```ts
      migrate: (persistedState, version) => {
        if (version < 10) {
          return { tournaments: [], currentTournamentId: null, syncMeta: {} };
        }
        const previous = (persistedState ?? {}) as {
          tournaments?: Cycle[];
          currentTournamentId?: string | null;
          syncMeta?: Record<string, import('../types').SyncMetaEntry>;
        };
        return {
          tournaments: previous.tournaments ?? [],
          currentTournamentId: previous.currentTournamentId ?? null,
          syncMeta: previous.syncMeta ?? {},
        };
      },
```

- [ ] **Step 6: Escribir el test de `persistTournamentWithSync` (falla primero)**

Create `src/store/__tests__/useTournamentStore.sync.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { persistTournamentWithSync } from '../useTournamentStore';
import { adaptiveTournamentService } from '../../services/adaptiveTournamentService';
import { cycleStateService } from '../../services/cycleStateService';
import { useToastStore } from '../useToastStore';
import * as supa from '../../lib/supabase';
import type { Cycle, SyncMetaEntry } from '../../types';

const cyc = (id: string): Cycle => ({ id } as unknown as Cycle);

// set/get mínimos que emulan a Zustand para probar el helper en aislamiento.
function makeStore() {
  let state = { syncMeta: {} as Record<string, SyncMetaEntry> };
  const set = (updater: any) => {
    const patch = typeof updater === 'function' ? updater(state) : updater;
    state = { ...state, ...patch };
  };
  const get = () => state;
  return { set, get, snapshot: () => state };
}

describe('persistTournamentWithSync', () => {
  beforeEach(() => {
    vi.spyOn(supa, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(cycleStateService, 'saveCycleState').mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('en éxito marca dirty=false y guarda el updated_at devuelto', async () => {
    vi.spyOn(adaptiveTournamentService, 'saveTournament').mockResolvedValue('2026-07-22T12:00:00Z');
    const { set, get, snapshot } = makeStore();

    await persistTournamentWithSync(cyc('t1'), set, get);

    expect(snapshot().syncMeta['t1']).toEqual({
      syncedUpdatedAt: '2026-07-22T12:00:00Z',
      dirty: false,
    });
  });

  it('si el guardado falla siempre, deja dirty=true y avisa por toast', async () => {
    vi.useFakeTimers();
    vi.spyOn(adaptiveTournamentService, 'saveTournament').mockRejectedValue(new Error('network'));
    const toastError = vi.spyOn(useToastStore.getState(), 'error').mockReturnValue('id');
    const { set, get, snapshot } = makeStore();

    const p = persistTournamentWithSync(cyc('t1'), set, get);
    await vi.runAllTimersAsync();
    await p;

    expect(snapshot().syncMeta['t1'].dirty).toBe(true);
    expect(toastError).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 7: Correr el test para verlo fallar, luego pasar**

Run: `npm test -- useTournamentStore.sync`
Expected primero: FAIL (el export `persistTournamentWithSync` recién se agrega en este task; si se corre antes de compilar, falla por import). Tras Steps 1-5: PASS los 2 tests.

- [ ] **Step 8: Verificar tipos y suite completa**

Run: `npx tsc -b && npm test`
Expected: `tsc` sin errores; toda la suite verde (los tests previos + los nuevos de reconcile y sync).

- [ ] **Step 9: Commit**

```bash
git add src/store/useTournamentStore.ts src/store/__tests__/useTournamentStore.sync.test.ts
git commit -m "feat(sync): syncMeta + persistTournamentWithSync (retry + toast) en el store"
```

---

## Task 5: Reescribir `initializeTournament` con reconciliación

**Files:**
- Modify: `src/services/normalizedTournamentService.ts` — `getLatestTournament` (líneas ~489-515)
- Modify: `src/store/useTournamentStore.ts` — `mergeTournament` (líneas ~65-71), extracción `createFirstTournament`, reescritura de `initializeTournament` (líneas ~159-257)
- Test: `src/store/__tests__/useTournamentStore.sync.test.ts` (agregar bloque)

**Interfaces:**
- Consumes: `reconcile()` (Task 3), `persistTournamentWithSync()` (Task 4), `SyncMetaEntry` (Task 3).
- Produces:
  - `getLatestTournament(): Promise<{ tournament: Tournament; updatedAt: string | null } | null>` (cambio **breaking** de firma; el único caller es `initializeTournament`, reescrito en este mismo task).
  - `mergeTournament(existing: Cycle[], incoming: Cycle): Cycle[]` — sin cambio de firma; ahora conserva la copia con `updated_at`/dirty más reciente. (En la práctica `incoming` ya es el ganador de `reconcile`, así que mantiene reemplazo por id.)

- [ ] **Step 1: `getLatestTournament` — ordenar por `updated_at` y devolver el timestamp**

En `src/services/normalizedTournamentService.ts`, reemplazar el cuerpo de `getLatestTournament` (líneas ~489-515) por:

```ts
  async getLatestTournament(): Promise<{ tournament: Tournament; updatedAt: string | null } | null> {
    if (!isSupabaseConfigured()) {
      console.log('Supabase not configured, cannot load tournament');
      return null;
    }

    try {
      // Ordenar por updated_at (última jugada), no created_at: así "el último"
      // es el torneo tocado más recientemente en cualquier dispositivo.
      const { data, error } = await db
        .tournaments_new()
        .select('id, updated_at')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (error) throw error;
      if (!data || data.length === 0) {
        return null;
      }

      const tournament = await loadTournamentFromNormalizedSchema(data[0].id);
      if (!tournament) return null;
      return { tournament, updatedAt: (data[0].updated_at as string | undefined) ?? null };
    } catch (error) {
      console.error('Error loading latest tournament:', error);
      return null;
    }
  },
```

- [ ] **Step 2: `mergeTournament` recency-aware**

En `src/store/useTournamentStore.ts`, reemplazar `mergeTournament` (líneas ~65-71) por:

```ts
/**
 * Fusiona un torneo cargado con la lista existente. Reemplaza la copia con la misma
 * id por `incoming` (que en el flujo de reconciliación ya es el ganador por recencia),
 * o la antepone si es nueva. Nunca duplica ids.
 */
const mergeTournament = (existing: Cycle[], incoming: Cycle): Cycle[] => {
  const index = existing.findIndex((t) => t.id === incoming.id);
  if (index === -1) return [incoming, ...existing];
  const next = [...existing];
  next[index] = incoming;
  return next;
};
```

- [ ] **Step 3: Extraer `createFirstTournament`**

En `src/store/useTournamentStore.ts`, agregar (nivel de módulo, junto a los otros helpers, después de `persistTournamentWithSync`):

```ts
/**
 * Crea el torneo inicial (World Cup 2026) cuando no hay nada ni en la DB ni en
 * localStorage. Setea el estado y persiste con seed de syncMeta.
 */
async function createFirstTournament(set: any, get: any): Promise<void> {
  const teamsWithTiers = updateTeamsTiers(get().teams);

  const originalSkills: Record<string, number> = {};
  teamsWithTiers.forEach((team: Team) => {
    originalSkills[team.id] = team.skill;
  });

  const qualifiers: Record<Region, Group[]> = {
    Europe: createQualifierGroups(teamsWithTiers, 'Europe'),
    America: createQualifierGroups(teamsWithTiers, 'America'),
    Africa: createQualifierGroups(teamsWithTiers, 'Africa'),
    Asia: createQualifierGroups(teamsWithTiers, 'Asia'),
  };

  const tournament: Cycle = toCycle({
    id: nanoid(),
    name: 'World Cup 2026',
    year: 2026,
    qualifiers,
    worldCup: null,
    isQualifiersComplete: false,
    hasAnyMatchPlayed: false,
    originalSkills,
  });

  set((state: TournamentState) => ({
    teams: teamsWithTiers,
    tournaments: mergeTournament(state.tournaments, tournament),
    currentTournamentId: tournament.id,
    currentTournament: tournament,
  }));

  await persistTournamentWithSync(tournament, set, get);
}
```

- [ ] **Step 4: Reescribir `initializeTournament`**

Reemplazar toda la acción `initializeTournament` (líneas ~159-257, desde `initializeTournament: async () => {` hasta su `},` de cierre) por:

```ts
      initializeTournament: async () => {
        if (initializationInFlight) return initializationInFlight;

        initializationInFlight = (async () => {
          const configured = isSupabaseConfigured();

          // 1. Traer el torneo más reciente de la DB (por updated_at), si se puede.
          //    db=null cubre tanto "DB vacía" como "offline/error" (getLatestTournament
          //    atrapa el error y devuelve null): en ambos casos caemos a lo local.
          let db: Cycle | null = null;
          let dbUpdatedAt: string | null = null;
          if (configured) {
            try {
              const latest = await adaptiveTournamentService.getLatestTournament();
              if (latest) {
                console.log(`Loaded latest tournament: ${latest.tournament.name}`);
                // cycle_state persistido; sin row → torneo legacy (reconstructCycle
                // deriva calendario de fase Mundial en vez de ofrecer "Sortear Continental").
                const cycleState = await cycleStateService.loadCycleState(latest.tournament.id);
                db = reconstructCycle(latest.tournament, cycleState);
                dbUpdatedAt = latest.updatedAt;
              }
            } catch (error) {
              console.error('Error loading tournament from database:', error);
            }
          }

          // 2. Resolver la copia local candidata. Con db, la de la misma id; sin db,
          //    la seleccionada (o la primera) rehidratada de localStorage.
          const state = get();
          const local = db
            ? state.tournaments.find((t) => t.id === db!.id) ?? null
            : state.tournaments.find((t) => t.id === state.currentTournamentId) ??
              state.tournaments[0] ??
              null;
          const localMeta = local ? state.syncMeta[local.id] ?? null : null;

          // 3. Reconciliar por recencia.
          const result = reconcile({ local, localMeta, db, dbUpdatedAt });

          if (result.action === 'create-new') {
            await createFirstTournament(set, get);
            return;
          }

          const winner = ensureCycleFields(result.winner!);
          set((s: TournamentState) => ({
            tournaments: mergeTournament(s.tournaments, winner),
            currentTournamentId: winner.id,
            currentTournament: winner,
            syncMeta: {
              ...s.syncMeta,
              [winner.id]: {
                syncedUpdatedAt: result.syncedUpdatedAt,
                dirty: result.action === 'push-local',
              },
            },
          }));

          if (result.action === 'use-db') {
            // Backfill best-effort: exponer en H2H los partidos continental/confed
            // ya jugados (antes de que se normalizaran a match_history).
            backfillCycleMatchHistory(winner, get().teams)
              .then((n) => { if (n > 0) console.log(`🔁 Backfill continental/confed: +${n} partidos`); })
              .catch((error) => console.error('Backfill continental/confed falló:', error));
          }

          if (result.action === 'push-local') {
            // Este dispositivo tenía cambios sin subir (save fallido/offline) → re-empujar.
            await persistTournamentWithSync(winner, set, get);
          }
        })();

        try {
          await initializationInFlight;
        } finally {
          initializationInFlight = null;
        }
      },
```

- [ ] **Step 5: Escribir tests de flujo de `initializeTournament` (falla primero)**

Agregar al final de `src/store/__tests__/useTournamentStore.sync.test.ts`:

```ts
import { useTournamentStore } from '../useTournamentStore';
import { reconstructCycle } from '../../core/cycle';

describe('initializeTournament — reconciliación multi-dispositivo', () => {
  beforeEach(() => {
    vi.spyOn(supa, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(cycleStateService, 'loadCycleState').mockResolvedValue(null);
    useTournamentStore.setState({
      tournaments: [],
      currentTournamentId: null,
      currentTournament: null,
      syncMeta: {},
    });
  });

  it('DB más nueva pisa la copia local vieja (el caso multi-dispositivo)', async () => {
    // Local: torneo t1 sincronizado a las 10:00, sin cambios locales.
    const localCycle = reconstructCycle(
      { id: 't1', name: 'Local viejo', year: 2026 } as any,
      null,
    );
    useTournamentStore.setState({
      tournaments: [localCycle],
      currentTournamentId: 't1',
      currentTournament: localCycle,
      syncMeta: { t1: { syncedUpdatedAt: '2026-07-22T10:00:00Z', dirty: false } },
    });

    // DB: mismo torneo, actualizado a las 11:00 en el otro dispositivo.
    vi.spyOn(adaptiveTournamentService, 'getLatestTournament').mockResolvedValue({
      tournament: { id: 't1', name: 'DB nuevo', year: 2026 } as any,
      updatedAt: '2026-07-22T11:00:00Z',
    });

    await useTournamentStore.getState().initializeTournament();

    const s = useTournamentStore.getState();
    expect(s.currentTournament?.name).toBe('DB nuevo');
    expect(s.syncMeta['t1']).toEqual({ syncedUpdatedAt: '2026-07-22T11:00:00Z', dirty: false });
  });

  it('local dirty con DB sin cambios → conserva local y lo re-empuja', async () => {
    const localCycle = reconstructCycle(
      { id: 't1', name: 'Local con cambios', year: 2026 } as any,
      null,
    );
    useTournamentStore.setState({
      tournaments: [localCycle],
      currentTournamentId: 't1',
      currentTournament: localCycle,
      syncMeta: { t1: { syncedUpdatedAt: '2026-07-22T10:00:00Z', dirty: true } },
    });

    vi.spyOn(adaptiveTournamentService, 'getLatestTournament').mockResolvedValue({
      tournament: { id: 't1', name: 'DB vieja', year: 2026 } as any,
      updatedAt: '2026-07-22T10:00:00Z',
    });
    const save = vi.spyOn(adaptiveTournamentService, 'saveTournament').mockResolvedValue('2026-07-22T12:00:00Z');
    vi.spyOn(cycleStateService, 'saveCycleState').mockResolvedValue(undefined);

    await useTournamentStore.getState().initializeTournament();

    const s = useTournamentStore.getState();
    expect(s.currentTournament?.name).toBe('Local con cambios');
    expect(save).toHaveBeenCalledOnce(); // re-empujó local
  });
});
```

- [ ] **Step 6: Correr los nuevos tests**

Run: `npm test -- useTournamentStore.sync`
Expected: los 4 tests del archivo en PASS (2 de persist + 2 de initialize).

- [ ] **Step 7: Verificar tipos y suite completa**

Run: `npx tsc -b && npm test`
Expected: `tsc` sin errores; toda la suite verde.

- [ ] **Step 8: Commit**

```bash
git add src/services/normalizedTournamentService.ts src/store/useTournamentStore.ts src/store/__tests__/useTournamentStore.sync.test.ts
git commit -m "feat(sync): initializeTournament reconcilia por recencia (fin del pisado localStorage↔DB)"
```

---

## Task 6: Verificación end-to-end y cierre

**Files:** ninguno nuevo (verificación + build).

- [ ] **Step 1: Suite completa + tipos + lint del código tocado**

Run: `npx tsc -b && npm test`
Expected: `tsc` sin errores; toda la suite verde (incluidos los nuevos archivos de test).

Nota: el repo tiene lint de base roto (~110 errores preexistentes, ver memoria del proyecto). Correr `npm run lint` solo para confirmar que **no se agregaron nuevos** errores en los archivos tocados; no intentar arreglar los preexistentes.

- [ ] **Step 2: Smoke manual — simular dos dispositivos**

Con la app corriendo (`npm run dev`) y Supabase configurado:

1. Dispositivo A (ventana 1): jugar un partido / avanzar el torneo. Verificar en consola que el guardado confirma (sin toast de error).
2. Simular "dispositivo B": abrir una ventana de incógnito (localStorage separado) en la misma URL. Debe cargar **el estado más reciente de la DB** (el partido jugado en A), no un estado vacío ni viejo.
3. Volver a A, recargar: debe seguir mostrando el estado más reciente (no pisar con algo viejo).
4. (Opcional) Probar el fallback offline: en una pestaña, cortar la red (DevTools → Network → Offline) y recargar. Debe cargar la copia local sin romper, y al reconectar y jugar, re-sincronizar.

Expected: ambos "dispositivos" convergen al último estado; no se pierde progreso.

- [ ] **Step 3: Actualizar memoria del proyecto**

Escribir una nota de memoria (archivo nuevo en el dir de memoria) resumiendo: feature de sync multi-dispositivo por recencia, rama `feat/sync-multidispositivo`, migración 011 aplicada, `syncMeta` + `reconcile` + saves con retry. Agregar la línea al índice `MEMORY.md`.

- [ ] **Step 4: Commit final y decisión de merge**

```bash
git add -A
git commit -m "chore(sync): verificación e2e multi-dispositivo + nota de memoria" || echo "nada que commitear"
```

Luego invocar la skill `superpowers:finishing-a-development-branch` para decidir merge a master / push / cleanup.

---

## Self-Review (cobertura del spec)

- **Pieza 1 (updated_at confiable):** Task 1. ✅
- **Pieza 2 (syncMeta local):** Task 3 (tipo) + Task 4 (estado, transiciones, persist). ✅
- **Pieza 3 (reconciliación al cargar):** Task 3 (`reconcile` puro) + Task 5 (`initializeTournament`, `getLatestTournament` por `updated_at`, quitar guarda línea 164, `mergeTournament`). ✅
- **Pieza 4 (saves confiables):** Task 4 (`persistTournamentWithSync` con retry + toast). ✅
- **Manejo de errores** (offline→local, fallo→retry+toast+dirty, empate determinista, updated_at nulo): cubierto por `reconcile` (Task 3, tests incluidos) y `persistTournamentWithSync` (Task 4, test de fallo). ✅
- **Testing** (reconcile puro, trigger, regresión suite): Tasks 3, 1 (Step 3), 6. ✅
- **Fuera de alcance** (realtime/CRDT/auth/UI de conflictos): respetado; nada de eso aparece en el plan. ✅

Consistencia de tipos verificada: `saveTournament(): Promise<string|null>` (Task 2) consumido por `persistTournamentWithSync` (Task 4) y `createNewTournament` (Task 4); `getLatestTournament(): Promise<{tournament,updatedAt}|null>` (Task 5) consumido por `initializeTournament` (Task 5); `reconcile`/`ReconcileResult`/`SyncMetaEntry` (Task 3) consumidos por Task 5; `persistTournamentWithSync` (Task 4) consumido por Task 5. `syncMeta` inicializado en Task 4 antes de usarse en Task 5.
