# Sync multi-dispositivo por recencia (localStorage ↔ Supabase)

**Fecha:** 2026-07-22
**Estado:** Aprobado — listo para plan de implementación

## Problema

El estado del torneo vive en dos fuentes escribibles: **localStorage** (vía Zustand
`persist`, que guarda `{ tournaments, currentTournamentId }`) y **Supabase**. Hoy se
reconcilian por *presencia* y por `created_at`, nunca por *cuál dato es más nuevo*.

Consecuencia concreta (reportada por el usuario): jugando en **dos dispositivos**
distintos, cada uno se queda con su propia copia de localStorage y no ve lo que se
hizo en el otro. Dos causas:

1. **localStorage siempre gana al cargar.** En `initializeTournament`
   (`src/store/useTournamentStore.ts:164`) hay una guarda `if (get().currentTournament)
   return;`. Como `onRehydrateStorage` reconstruye `currentTournament` desde
   localStorage, la DB ni se consulta: cada dispositivo muestra su estado local.
2. **`getLatestTournament` ordena por `created_at`**
   (`src/services/normalizedTournamentService.ts:502`), no por última jugada, así que
   cuando sí carga de la DB puede abrir un torneo distinto al que se estaba jugando.

Además, **`updated_at` no es confiable**: los upserts de `saveTournament` y
`saveCycleState` no lo setean y no hay trigger `BEFORE UPDATE`; solo se llena en el
INSERT (`DEFAULT now()`). No existe hoy una señal de recencia para reconciliar.

Los guardados a la DB son *best-effort* (`.then().catch(console.error)` y siguen), así
que un save que falla en secreto deja localStorage fresco y la DB vieja.

### Contexto que restringe la solución

- **Sin auth.** RLS abierta (`USING (true)`); no hay `user_id`. La DB es un único
  dataset global compartido: ambos dispositivos ven las mismas filas con la misma
  anon key.
- **Existen columnas `updated_at`** en `tournaments_new` (migración 002) y
  `tournament_cycle_state` (migración 008) — sirven de base para la recencia una vez
  que se bumpeen de verdad.
- **Uso real:** nunca en simultáneo, casi siempre con internet. → No hace falta
  resolución de conflictos concurrentes; alcanza *last-write-wins* por timestamp.

## Enfoque elegido

**DB autoritativa + reconciliación por `updated_at`**, con localStorage como caché y
fallback offline. Se reconcilia a **granularidad de torneo entero** (la app ya
carga/guarda torneos completos). El `now()` del servidor es el único reloj (no se
comparan relojes de dos dispositivos).

Enfoques descartados:
- *Online-first, la DB pisa siempre:* frágil ante saves fallidos (pierde datos).
- *Realtime / CRDT:* overkill (YAGNI) para uso de un jugador no simultáneo.

## Diseño

### Pieza 1 — `updated_at` confiable (DB)

Migración `011_touch_updated_at.sql`:

- Función `set_updated_at()` que hace `NEW.updated_at = now(); RETURN NEW;`.
- Trigger `BEFORE UPDATE` sobre `tournaments_new` y sobre `tournament_cycle_state`.

Racional: `saveTournament` siempre corre `UPDATE tournaments_new ... WHERE id = ?` en
su rama `if (existing)` (`normalizedTournamentService.ts:414-429`), y
`updateTournamentInState` la llama en **cada** mutación. Postgres dispara los triggers
`BEFORE UPDATE` aunque los valores no cambien, así que `updated_at` se bumpea incluso
al jugar un partido de grupo (que no altera campos del header).

**Riesgo a auditar en implementación:** que *toda* mutación persistida pase por
`updateTournamentInState → saveTournament` (que toca el header). Si alguna ruta
escribe solo en tablas hijas (`matches_new`, `standings`, `match_history`) sin tocar
el header, su cambio no bumpearía `updated_at` y la reconciliación lo perdería. En ese
caso, bumpear el header explícitamente en esa ruta. El camino central actual
(`updateTournamentInState`) debería cubrir todo; se verifica durante el plan.

Aplicar la migración a Supabase vía MCP (`apply_migration`), como el resto.

### Pieza 2 — Metadata de sync local

Nuevo estado en el store, **persistido** (agregar a `partialize`):

```ts
syncMeta: Record<string /* tournamentId */, {
  syncedUpdatedAt: string | null; // updated_at que la DB reportó la última vez
                                   // que ESTE dispositivo guardó/cargó el torneo
  dirty: boolean;                  // hay cambios locales sin confirmar en DB
}>
```

Transiciones:
- **Mutación local** (`updateTournamentInState`): `dirty = true` para ese torneo.
- **Save confirmado**: `dirty = false`, `syncedUpdatedAt = <updated_at devuelto por la
  DB>`. Requiere que `saveTournament` devuelva el `updated_at`: agregar
  `.select('updated_at').single()` al `UPDATE`/`INSERT` y propagarlo hacia arriba
  (hoy devuelve `void`).
- **Carga/reconciliación**: `syncedUpdatedAt = <updated_at de la DB>`, `dirty = false`
  cuando gana la DB.

Se guarda como mapa paralelo (no dentro del tipo `Cycle`) para no ensuciar el modelo
de dominio.

### Pieza 3 — Reconciliación al cargar (reescribir `initializeTournament`)

Nuevo flujo, todo bajo el lock `initializationInFlight` existente:

1. Rehidratar localStorage como hoy → `tournaments` + `syncMeta`.
2. Si Supabase está configurado y hay conexión: traer el torneo más reciente
   **ordenando por `updated_at desc`** (cambiar el `order` en `getLatestTournament`,
   `normalizedTournamentService.ts:502`) + su `cycle_state`.
3. **Reconciliar** con una función pura `reconcile(local, dbTournament, dbUpdatedAt,
   meta)` que devuelve `{ winner: Cycle; action: 'use-db' | 'push-local' | 'noop';
   syncedUpdatedAt: string | null }`:
   - `dbUpdatedAt > meta.syncedUpdatedAt` → **gana DB** (`use-db`).
   - `dbUpdatedAt == meta.syncedUpdatedAt` y `meta.dirty` → **gana local**
     (`push-local`).
   - sin copia en DB (offline / no configurado) → usar local.
   - sin copia local → usar DB.
   - sin ninguna → crear torneo nuevo (como hoy).
4. Aplicar el resultado: setear `currentTournament`/`currentTournamentId`, mergear en
   la lista, y si `action === 'push-local'`, re-empujar a la DB.
5. **Eliminar la guarda "localStorage siempre gana"** (`useTournamentStore.ts:164`).
   `onRehydrateStorage` sigue reconstruyendo `currentTournament` para el arranque
   offline, pero ya no impide la consulta a la DB.
6. **`mergeTournament` pasa a ser recency-aware**: al fusionar por `id`, conserva la
   copia más nueva (según `updated_at`/`dirty`) en vez de sobrescribir siempre con
   `incoming`. Ninguna ruta debe descartar silenciosamente la copia más fresca.

### Pieza 4 — Saves confiables

Para que el otro dispositivo vea los cambios, la DB debe haberlos recibido **antes**
del cambio de aparato. Sobre el camino de guardado (`updateTournamentInState` y los
saves encadenados `saveTournament().then(saveCycleState())`):

- **Reintento corto con backoff** (p. ej. 2 reintentos) ante fallo de red.
- Si igual falla: **toast** "No se pudo sincronizar" (usar `sonner` / el toast store
  existente) y dejar `dirty = true` para re-empujar en la próxima carga/mutación.
- No bloquear la UI del juego: el guardado sigue siendo asíncrono; el toast informa
  sin frenar la simulación.

## Manejo de errores

- **Offline al cargar** → usar copia local; `dirty`/`syncMeta` intactos para empujar
  después.
- **Falla de guardado** → reintento → toast; `dirty = true` persiste.
- **Empate de timestamps con ambos "dirty"** (imposible con uso no simultáneo, pero
  determinista por las dudas): si la DB no es *estrictamente* más nueva y local está
  `dirty`, gana local.
- **`updated_at` nulo/ausente en DB** (torneo legacy sin bump) → tratar como
  `syncedUpdatedAt` desconocido: si local está `dirty`, empujar local; si no, usar DB.

## Testing

- **Función `reconcile` (pura)** — tabla de casos: DB más nueva; local `dirty` + DB
  sin cambios; offline (sin `dbTournament`); sin local; empate ambos `dirty`;
  `updated_at` nulo.
- **Trigger `updated_at`** — verificar que un `UPDATE` cualquiera lo bumpea (test de
  migración o verificación manual vía MCP `execute_sql`).
- **Regresión** — la suite actual (184 tests) debe seguir verde; sumar casos al test
  del store para el nuevo flujo de `initializeTournament`.

## Fuera de alcance (YAGNI)

- Sin realtime / suscripciones (Supabase Realtime).
- Sin CRDT ni merge por-campo; se reconcilia torneo entero.
- Sin sync por-partido.
- Sin auth / scoping por usuario; la DB global compartida se mantiene.
- Sin UI de resolución de conflictos; last-write-wins automático.

## Archivos afectados (estimado)

- `supabase/migrations/011_touch_updated_at.sql` (nuevo).
- `src/services/normalizedTournamentService.ts` — `getLatestTournament` (order por
  `updated_at`), `saveTournament` (devolver `updated_at`).
- `src/services/cycleStateService.ts` — devolver `updated_at` si se necesita para la
  reconciliación del ciclo.
- `src/store/useTournamentStore.ts` — `syncMeta`, `reconcile`, reescritura de
  `initializeTournament`, `mergeTournament` recency-aware, quitar guarda línea 164,
  reintento + toast en el camino de guardado, `partialize`.
- Tests del store y de `reconcile`.
