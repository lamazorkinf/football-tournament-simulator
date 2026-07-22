# Plan 6 — Persistencia del ciclo en Supabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir el estado del ciclo (brackets continentales + Copa Confederaciones + calendario) en Supabase para que un ciclo en curso sobreviva a un reload en otro dispositivo/navegador, y arreglar de raíz el bug del wizard "Sortear Continental" para torneos legacy.

**Architecture:** El estado del ciclo es un *value-object* propiedad 1:1 de un torneo: se lee y escribe como una unidad, no se consulta relacionalmente, y no comparte integridad referencial con otras filas. Se persiste como documento **JSONB** en una tabla lateral `tournament_cycle_state` (FK 1:1 a `tournaments_new` con `ON DELETE CASCADE`), dejando el row header liviano para las queries de lista. Los resultados de cada partido continental/confed **ya** se auditan normalizados en `match_history`, así que no se pierde nada queryable. La carga distingue ciclo real (hay row) de torneo legacy (no hay row → calendario derivado del `status`, nunca `'continental'`).

**Tech Stack:** React 19 + TypeScript + Vite + Zustand (persist) + Supabase (Postgres, `@supabase/supabase-js`), Vitest.

## Global Constraints

- **Gate real por tarea** = `npx vitest run` (suite completa verde) **+** `npx tsc -b --noEmit` (exit 0) **+** `npx eslint <archivos tocados>` (0 errores nuevos). **NUNCA** `npx tsc --noEmit` sin `-b` (es no-op: tsconfig raíz solution-style, chequea 0 archivos).
- **Suite base al arrancar Plan 6 = 135 tests.** Ningún test previo puede quedar rojo.
- **Lint de base ya roto:** ~106 `@typescript-eslint/no-explicit-any` en archivos ajenos. **NO introducir nuevos `any`/`as any`** en código nuevo (excepción: el módulo `src/lib/supabaseNormalized.ts` YA usa `as any` por diseño en cada accessor `db.*` — la línea nueva sigue ese patrón existente y NO cuenta como `any` nuevo).
- **eslint de este repo flaggea vars/args/imports sin usar AUNQUE tengan prefijo `_`** (config `recommended` sin `argsIgnorePattern`). Nunca dejar nada sin usar.
- **Los servicios (`src/services/*`) NO tienen tests unitarios en este repo** (son wrappers finos de red, gateados por `tsc -b` + `eslint` + review). El servicio nuevo sigue esa convención: sin Vitest, gate por tsc/eslint/review + smoke manual.
- **Las acciones async del store NO son node-testeables** (cuelgan por `confirm()` + red). Su lógica pura vive en `src/core/cycle.ts` (testeada); el wiring del store se gatea con tsc/eslint/review + suite completa verde.
- **`isSupabaseConfigured()`** (de `src/lib/supabase.ts`) gatea TODA escritura/lectura a Supabase. En modo local (sin configurar) todo funciona igual vía el `persist` de Zustand — no romper esa rama.
- **Serialización:** el estado del ciclo es JSON-puro (números, strings, booleans, arrays, objetos anidados; campos opcionales `undefined` que `JSON.stringify` descarta). NO contiene `Date`, `Map`, funciones ni referencias circulares.
- Respuestas y comentarios en **español** con acentos correctos.

---

## File Structure

- **`supabase/migrations/008_cycle_state.sql`** (crear) — DDL: tabla `tournament_cycle_state` + RLS abierto (patrón del repo). No destructivo.
- **`supabase/migrations/009_wipe_legacy_data.sql`** (crear) — SQL de borrado de datos legacy pre-ciclo. **Destructivo**: se aplica SOLO con confirmación explícita del usuario en tiempo de ejecución.
- **`src/types/database.ts`** (modificar) — agregar `tournament_cycle_state` a `Database['public']['Tables']` (Row/Insert/Update).
- **`src/lib/supabaseNormalized.ts`** (modificar) — agregar accessor `tournament_cycle_state` al objeto `db`.
- **`src/core/cycle.ts`** (modificar) — agregar tipo `CycleStatePayload` + `serializeCycleState`, `deriveLegacyCalendar`, `reconstructCycle` (puros, testeados).
- **`src/core/__tests__/cycle.test.ts`** (modificar) — tests del round-trip y del backfill legacy.
- **`src/services/cycleStateService.ts`** (crear) — `saveCycleState` / `loadCycleState` (wrapper fino de Supabase).
- **`src/store/useTournamentStore.ts`** (modificar) — persistir cycle_state en cada guardado; cargarlo en `initializeTournament`; bump de versión de `persist` + `migrate` que descarta saves legacy.

**Orden de tareas:** T1 (schema) → T2 (core puro) → T3 (servicio) → T4 (wiring store) → T5 (borrado legacy). Cada una es revisable de forma independiente.

**Modelos sugeridos:** T1 haiku (transcripción de SQL/tipos), T2 sonnet (lógica + TDD), T3 haiku (transcripción del servicio), T4 sonnet (integración en archivo de 2290 líneas), T5 sonnet (lógica de `migrate` por versión). Reviewers sonnet; review final opus.

---

## Divergencias vs spec (aprobadas por el usuario en esta sesión)

1. **Persistencia = JSONB en tabla lateral, NO tablas normalizadas.** El spec §10 pide extender `tournaments_new`/`matches_new` y crear tablas de brackets/grupos. Se decidió JSONB porque el estado del ciclo es un value-object propiedad 1:1 del torneo, se lee/escribe como unidad, no se consulta relacionalmente, y el dato queryable por-partido ya vive normalizado en `match_history`. Normalizar sería acoplamiento + superficie de bugs (reconstrucción del shape anidado, aflojar el `CHECK` de `knockout_round` para R64) sin beneficio práctico. **Acción en T1:** actualizar spec §10 para registrar la decisión.
2. **Borrado de datos legacy** (spec §10/§13) se implementa en T5: bump de versión de `persist` (descarta localStorage una vez) + SQL de TRUNCATE aplicado con confirmación.

## Fuera de alcance (follow-ups conocidos, NO parte de Plan 6)

- Avanzar `calendar.phase` a través de `wc-groups`/`wc-knockout`/`completed` durante el Mundial (hoy se queda en `wc-qualifiers`; el flujo Mundial se guía por el objeto `worldCup`). El blob persiste lo que haya; que avance es follow-up (b) de 5B.
- Lockstep de jornada intra-fase de Clasificatorias/Mundial (follow-up (a) de 5B).
- Fusionar partidos continental/confed en la lista del Match Center (follow-up (c) de 5B).
- Persistir cada partido continental/confed en `matches_new` como fila normalizada (los resultados ya están en `match_history`; no se necesita para resumir el ciclo).

---

## Task 1: Migración 008 + tipos de DB + accessor

**Files:**
- Create: `supabase/migrations/008_cycle_state.sql`
- Modify: `src/types/database.ts` (agregar tabla al bloque `Tables`, después de `team_tournament_skills`)
- Modify: `src/lib/supabaseNormalized.ts:29-30` (agregar accessor tras `team_tournament_skills`)
- Modify: `docs/superpowers/specs/2026-07-21-ciclo-continental-confederaciones-calendario-design.md:205-213` (§10: registrar decisión JSONB)

**Interfaces:**
- Produces: la tabla `tournament_cycle_state(tournament_id TEXT PK FK→tournaments_new CASCADE, state JSONB NOT NULL, schema_version INTEGER DEFAULT 1, updated_at TIMESTAMPTZ DEFAULT now())`; el tipo `Database['public']['Tables']['tournament_cycle_state']`; el accessor `db.tournament_cycle_state()`. Consumidos por T3.

- [ ] **Step 1: Crear la migración SQL**

Crear `supabase/migrations/008_cycle_state.sql`:

```sql
-- ============================================
-- Migration 008: Estado del ciclo (continental + confederaciones + calendario)
-- ============================================
-- El estado del ciclo es un value-object propiedad 1:1 de un torneo: se lee y
-- escribe como una unidad, no se consulta relacionalmente, y no comparte
-- integridad referencial con otras filas. Se guarda como documento JSONB en una
-- tabla lateral, dejando `tournaments_new` liviano para las queries de lista.
-- Los resultados de cada partido continental/confed siguen auditándose
-- normalizados en `match_history`.

CREATE TABLE IF NOT EXISTS tournament_cycle_state (
  tournament_id  TEXT PRIMARY KEY REFERENCES tournaments_new(id) ON DELETE CASCADE,
  state          JSONB NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS abierto, consistente con el resto del esquema (la app no tiene auth).
ALTER TABLE tournament_cycle_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for tournament_cycle_state" ON tournament_cycle_state
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE tournament_cycle_state IS
  'Snapshot JSONB del estado del ciclo (continental/confederaciones/calendario) por torneo. Propiedad 1:1 de tournaments_new (ON DELETE CASCADE). El detalle por-partido queryable vive en match_history.';
```

- [ ] **Step 2: Agregar el tipo de DB**

En `src/types/database.ts`, dentro de `Database['public']['Tables']`, inmediatamente después del cierre del bloque `team_tournament_skills` (y antes de `team_tournament_performance` si existe, o del cierre de `Tables`), agregar:

```ts
      tournament_cycle_state: {
        Row: {
          tournament_id: string
          state: Json
          schema_version: number
          updated_at: string
        }
        Insert: {
          tournament_id: string
          state: Json
          schema_version?: number
          updated_at?: string
        }
        Update: {
          tournament_id?: string
          state?: Json
          schema_version?: number
          updated_at?: string
        }
      }
```

(El tipo `Json` ya está declarado en `database.ts:1-7`.)

- [ ] **Step 3: Agregar el accessor en `db`**

En `src/lib/supabaseNormalized.ts`, dentro del objeto `db`, después de la línea `team_tournament_skills: () => (supabase.from('team_tournament_skills') as any),` (línea 29), agregar:

```ts
  tournament_cycle_state: () => (supabase.from('tournament_cycle_state') as any),
```

(Sigue el patrón `as any` existente del módulo — NO es un `any` nuevo a los efectos de la constraint de lint.)

- [ ] **Step 4: Actualizar el spec §10**

En `docs/superpowers/specs/2026-07-21-ciclo-continental-confederaciones-calendario-design.md`, reemplazar el bloque de la sección `## 10. Persistencia (Supabase + local)` (líneas 205-213) por:

```markdown
## 10. Persistencia (Supabase + local)

- **Decisión (Plan 6):** el estado del ciclo (continental + confederaciones + calendario) se persiste como **documento JSONB** en una tabla lateral 1:1 `tournament_cycle_state`, NO en tablas normalizadas. Es un value-object propiedad del torneo: se lee/escribe como unidad, no se consulta relacionalmente, y el detalle por-partido queryable ya vive normalizado en `match_history`. Normalizarlo agregaría acoplamiento y reconstrucción del shape anidado sin beneficio práctico para este simulador single-player.
- **Migración `008_cycle_state.sql`:** crea `tournament_cycle_state(tournament_id PK FK→tournaments_new ON DELETE CASCADE, state JSONB, schema_version, updated_at)` con RLS abierto.
- **Carga:** si un torneo tiene row de cycle_state → parse directo. Si no (legacy, previo al ciclo) → calendario derivado del `status` real (nunca `'continental'`), etapas previas marcadas completas → el wizard no ofrece "Sortear Continental".
- **Modo local:** todo funciona igual vía `persist` de Zustand cuando Supabase no está configurado (`isSupabaseConfigured() === false`); el `tournaments` array (Cycle[]) ya se persiste entero en localStorage.
- **Borrado de datos viejos:** `009_wipe_legacy_data.sql` (TRUNCATE, aplicado con confirmación) + bump de versión del `persist` que descarta el localStorage legacy una vez.
- Servicio nuevo `cycleStateService` (`saveCycleState`/`loadCycleState`) siguiendo el patrón de wrapper fino existente.
```

- [ ] **Step 5: Verificar tipos y lint**

Run: `npx tsc -b --noEmit && npx eslint src/types/database.ts src/lib/supabaseNormalized.ts`
Expected: exit 0, sin errores. (La suite no cambia; no hace falta correrla en esta tarea, pero no debe romperse: `npx vitest run` → 135.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/008_cycle_state.sql src/types/database.ts src/lib/supabaseNormalized.ts docs/superpowers/specs/2026-07-21-ciclo-continental-confederaciones-calendario-design.md
git commit -m "feat(db): migración 008 tournament_cycle_state (JSONB 1:1) + tipos + accessor"
```

> **Nota para el controller (fuera de los steps del implementer):** aplicar la migración 008 a Supabase vía el MCP `apply_migration` (name: `008_cycle_state`, query = contenido del `.sql`) y verificar con `list_tables` que `tournament_cycle_state` existe. Es aditivo/no destructivo → bajo riesgo, pero confirmá antes de aplicar contra la DB en vivo.

---

## Task 2: Serialización y reconstrucción del ciclo (core puro, TDD)

**Files:**
- Modify: `src/core/cycle.ts` (agregar tipo + 3 funciones, después de `ensureCycleFields` en la línea ~99)
- Test: `src/core/__tests__/cycle.test.ts` (agregar un bloque `describe`)

**Interfaces:**
- Consumes: `Cycle`, `Tournament`, `CalendarState`, `ContinentalStage`, `ConfederationsCup` (de `../types`); `createEmptyContinentalStage`, `createEmptyConfederationsCup` (ya en `cycle.ts`).
- Produces:
  - `interface CycleStatePayload { continental: ContinentalStage; confederationsCup: ConfederationsCup; calendar: CalendarState }`
  - `serializeCycleState(cycle: Cycle): CycleStatePayload`
  - `deriveLegacyCalendar(base: Tournament): CalendarState`
  - `reconstructCycle(base: Tournament, state: CycleStatePayload | null): Cycle`
  Consumidos por T3 (`serializeCycleState`, `CycleStatePayload`) y T4 (`reconstructCycle`).

- [ ] **Step 1: Escribir los tests que fallan**

En `src/core/__tests__/cycle.test.ts`, ajustar los imports del tope del archivo:
1. Al bloque `import { ... } from '../cycle';` (que ya trae `toCycle`, `drawContinentalStage`, etc.) agregar tres símbolos: `serializeCycleState`, `reconstructCycle`, `type CycleStatePayload`. (NO importar `deriveLegacyCalendar`: no se usa directo en los tests y eslint flaggearía el import sin usar.)
2. A la línea `import type { Cycle, KnockoutMatch, Region, Team, Tournament } from '../../types';` agregar `WorldCup` → `... Tournament, WorldCup } from '../../types';`.
3. Agregar dos imports nuevos:
   ```ts
   import { canDrawContinental } from '../../utils/cycleProgress';
   import { makeDrawnContinentalCycle } from '../../test/fixtures/cycle';
   ```

Luego agregar al final del archivo (usa el `baseTournament()` local ya definido en el archivo y el idioma `as unknown as` que el archivo ya emplea):

```ts
describe('serializeCycleState / reconstructCycle (persistencia)', () => {
  it('serializeCycleState extrae exactamente los 3 campos del ciclo', () => {
    const cycle = toCycle(baseTournament());
    const payload = serializeCycleState(cycle);
    expect(Object.keys(payload).sort()).toEqual(['calendar', 'confederationsCup', 'continental']);
    expect(payload.calendar).toBe(cycle.calendar);
    expect(payload.continental).toBe(cycle.continental);
    expect(payload.confederationsCup).toBe(cycle.confederationsCup);
  });

  it('round-trip: reconstructCycle(base, serialize(cycle)) reproduce los campos de ciclo', () => {
    const { cycle: drawn } = makeDrawnContinentalCycle();
    const payload = JSON.parse(JSON.stringify(serializeCycleState(drawn))) as CycleStatePayload;
    const restored = reconstructCycle(baseTournament(), payload);
    expect(restored.calendar).toEqual(drawn.calendar);
    expect(restored.continental.brackets.Europe.roundOf64.length).toBe(
      drawn.continental.brackets.Europe.roundOf64.length,
    );
    expect(restored.continental.brackets.Europe.roundOf64.length).toBeGreaterThan(0);
  });

  it('legacy (state=null) con Mundial completado → calendar.phase "completed", NO continental', () => {
    const base: Tournament = { ...baseTournament(), worldCup: { champion: 'x' } as unknown as WorldCup };
    const restored = reconstructCycle(base, null);
    expect(restored.calendar.phase).toBe('completed');
    expect(canDrawContinental(restored)).toBe(false);
  });

  it('legacy (state=null) con Mundial en curso → phase "wc-groups", NO continental', () => {
    const base: Tournament = { ...baseTournament(), worldCup: {} as unknown as WorldCup };
    const restored = reconstructCycle(base, null);
    expect(restored.calendar.phase).toBe('wc-groups');
    expect(canDrawContinental(restored)).toBe(false);
  });

  it('legacy (state=null) solo clasificatorias → phase "wc-qualifiers", NO continental', () => {
    const base: Tournament = { ...baseTournament(), worldCup: null };
    const restored = reconstructCycle(base, null);
    expect(restored.calendar.phase).toBe('wc-qualifiers');
    expect(canDrawContinental(restored)).toBe(false);
  });
});
```

> El archivo tiene su propio `baseTournament()` local (id `'t1'`, `worldCup: null`) — usar ese, NO el de fixtures. `makeDrawnContinentalCycle()` (de fixtures) devuelve `{ cycle, teams }` con el continental ya sorteado (R64 poblada).

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/core/__tests__/cycle.test.ts`
Expected: FAIL — `serializeCycleState`, `deriveLegacyCalendar`, `reconstructCycle` no existen (o los 5 casos nuevos fallan).

- [ ] **Step 3: Implementar las 3 funciones + el tipo**

En `src/core/cycle.ts`, inmediatamente después de la función `ensureCycleFields` (que termina en la línea ~99), agregar:

```ts
/** Los 3 campos que un Cycle agrega sobre Tournament, serializables a JSONB. */
export interface CycleStatePayload {
  continental: ContinentalStage;
  confederationsCup: ConfederationsCup;
  calendar: CalendarState;
}

/** Extrae el estado del ciclo (para persistir como documento JSONB). */
export function serializeCycleState(cycle: Cycle): CycleStatePayload {
  return {
    continental: cycle.continental,
    confederationsCup: cycle.confederationsCup,
    calendar: cycle.calendar,
  };
}

/**
 * Calendario de un torneo legacy (sin cycle_state persistido): salta a la fase
 * Mundial que corresponde por su progreso real. NUNCA 'continental' — de otro
 * modo el wizard ofrecería "Sortear Continental" a un torneo con Mundial jugado.
 */
export function deriveLegacyCalendar(base: Tournament): CalendarState {
  if (base.worldCup?.champion) return { phase: 'completed', matchday: 0 };
  if (base.worldCup) return { phase: 'wc-groups', matchday: 1 };
  return { phase: 'wc-qualifiers', matchday: 1 };
}

/**
 * Reconstruye un Cycle desde el Tournament base + el cycle_state cargado de la
 * DB. Si `state` es null (torneo legacy, previo al ciclo), las fases continental
 * y de confederaciones se marcan completas/vacías y el calendario salta a la
 * fase Mundial correspondiente.
 */
export function reconstructCycle(base: Tournament, state: CycleStatePayload | null): Cycle {
  if (state) {
    return {
      ...base,
      continental: state.continental,
      confederationsCup: state.confederationsCup,
      calendar: state.calendar,
    };
  }
  return {
    ...base,
    continental: { ...createEmptyContinentalStage(), isComplete: true },
    confederationsCup: { ...createEmptyConfederationsCup(), isComplete: true },
    calendar: deriveLegacyCalendar(base),
  };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/core/__tests__/cycle.test.ts`
Expected: PASS (los 5 casos nuevos verdes).

- [ ] **Step 5: Gate completo**

Run: `npx vitest run && npx tsc -b --noEmit && npx eslint src/core/cycle.ts src/core/__tests__/cycle.test.ts`
Expected: suite 140 verde (135 + 5), tsc exit 0, eslint sin errores. Si algún símbolo importado quedó sin usar, quitarlo.

- [ ] **Step 6: Commit**

```bash
git add src/core/cycle.ts src/core/__tests__/cycle.test.ts
git commit -m "feat(core): serializeCycleState/reconstructCycle + backfill legacy sin bug de wizard"
```

---

## Task 3: `cycleStateService` (wrapper de Supabase)

**Files:**
- Create: `src/services/cycleStateService.ts`

**Interfaces:**
- Consumes: `db` (de `../lib/supabaseNormalized`), `isSupabaseConfigured` (de `../lib/supabase`), `serializeCycleState` + `type CycleStatePayload` (de `../core/cycle`), `type Cycle` (de `../types`).
- Produces:
  - `cycleStateService.saveCycleState(cycle: Cycle): Promise<void>`
  - `cycleStateService.loadCycleState(tournamentId: string): Promise<CycleStatePayload | null>`
  Consumidos por T4.

- [ ] **Step 1: Crear el servicio**

Crear `src/services/cycleStateService.ts`:

```ts
import { db } from '../lib/supabaseNormalized';
import { isSupabaseConfigured } from '../lib/supabase';
import { serializeCycleState } from '../core/cycle';
import type { CycleStatePayload } from '../core/cycle';
import type { Cycle } from '../types';

/**
 * Persistencia del estado del ciclo (continental + confederaciones + calendario)
 * como documento JSONB en la tabla lateral `tournament_cycle_state` (1:1 con el
 * torneo). El detalle por-partido queryable vive normalizado en `match_history`;
 * acá guardamos el snapshot que permite reanudar el ciclo en otro dispositivo.
 */
export const cycleStateService = {
  /** Upsert del estado del ciclo. No-op si Supabase no está configurado. */
  async saveCycleState(cycle: Cycle): Promise<void> {
    if (!isSupabaseConfigured()) return;
    const { error } = await db.tournament_cycle_state().upsert(
      {
        tournament_id: cycle.id,
        state: serializeCycleState(cycle),
        schema_version: 1,
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
```

- [ ] **Step 2: Gate (tsc + eslint + suite)**

Run: `npx tsc -b --noEmit && npx eslint src/services/cycleStateService.ts && npx vitest run`
Expected: tsc exit 0, eslint sin errores nuevos, suite 140 verde (sin cambios: el servicio aún no se importa desde código de producción, pero debe compilar). No debe haber `any`/`as any` nuevos (el `as CycleStatePayload` es un narrowing de `Json`, no un `any`).

- [ ] **Step 3: Commit**

```bash
git add src/services/cycleStateService.ts
git commit -m "feat(services): cycleStateService save/load (JSONB) siguiendo el patrón normalizado"
```

---

## Task 4: Wiring de persistencia en el store

**Files:**
- Modify: `src/store/useTournamentStore.ts`:
  - Imports (agregar `cycleStateService` + `reconstructCycle`)
  - `updateTournamentInState` (`:101-107`) — guardar cycle_state en cada save
  - `initializeTournament` rama Supabase (`:162-174`) — cargar cycle_state + `reconstructCycle`
  - `initializeTournament` rama de creación (`:225-229`) — guardar cycle_state del torneo nuevo
  - `createNewTournament` (tras `:288` `saveTournament`) — guardar cycle_state

**Interfaces:**
- Consumes: `cycleStateService` (T3), `reconstructCycle` (T2), `ensureCycleFields` (ya importado).

- [ ] **Step 1: Agregar imports**

En `src/store/useTournamentStore.ts`, en el bloque de imports de servicios (junto a los otros `import { X } from '../services/...'`, cerca de la línea 38-43), agregar:

```ts
import { cycleStateService } from '../services/cycleStateService';
```

Y en el import existente desde `'../core/cycle'` (que ya trae `ensureCycleFields`, `toCycle`, `drawContinentalStage`, etc.), agregar `reconstructCycle` a la lista de símbolos importados.

- [ ] **Step 2: Persistir cycle_state en `updateTournamentInState`**

En `src/store/useTournamentStore.ts`, dentro de `updateTournamentInState`, en el bloque `if (isSupabaseConfigured() && !skipDbSave && !state.isBatchProcessing) { ... }` (líneas 103-107), después del `.catch(...)` del `saveTournament`, agregar la persistencia del ciclo (best-effort, no bloquea):

```ts
  // Save to database (skip if in batch mode or explicitly disabled)
  const state = get();
  if (isSupabaseConfigured() && !skipDbSave && !state.isBatchProcessing) {
    adaptiveTournamentService
      .saveTournament(updatedTournament)
      .catch((error) => console.error('Error auto-saving tournament:', error));
    cycleStateService
      .saveCycleState(ensureCycleFields(updatedTournament))
      .catch((error) => console.error('Error auto-saving cycle state:', error));
  }
```

(`ensureCycleFields` garantiza los 3 campos aunque `updatedTournament` esté tipado como `Tournament`; en runtime siempre es un `Cycle`.)

- [ ] **Step 3: Cargar cycle_state en `initializeTournament` (rama Supabase)**

Reemplazar el bloque de carga (líneas 162-174):

```ts
            const latestTournament = await adaptiveTournamentService.getLatestTournament();
            if (latestTournament) {
              console.log(`Loaded latest tournament: ${latestTournament.name}`);
              const latestCycle = ensureCycleFields(latestTournament);
              set((state) => ({
                // Fusionar, no reemplazar: descartar la lista rehidratada borraba
                // el historial local de torneos y lo volvía a persistir truncado.
                tournaments: mergeTournament(state.tournaments, latestCycle),
                currentTournamentId: latestCycle.id,
                currentTournament: latestCycle,
              }));
              return;
            }
```

por:

```ts
            const latestTournament = await adaptiveTournamentService.getLatestTournament();
            if (latestTournament) {
              console.log(`Loaded latest tournament: ${latestTournament.name}`);
              // Cargar el estado del ciclo persistido; si no hay row, es un torneo
              // legacy (previo al ciclo) → reconstructCycle deriva un calendario
              // de fase Mundial en vez de ofrecer "Sortear Continental".
              const cycleState = await cycleStateService.loadCycleState(latestTournament.id);
              const latestCycle = reconstructCycle(latestTournament, cycleState);
              set((state) => ({
                // Fusionar, no reemplazar: descartar la lista rehidratada borraba
                // el historial local de torneos y lo volvía a persistir truncado.
                tournaments: mergeTournament(state.tournaments, latestCycle),
                currentTournamentId: latestCycle.id,
                currentTournament: latestCycle,
              }));
              return;
            }
```

- [ ] **Step 4: Guardar cycle_state del torneo recién creado (rama de creación de `initializeTournament`)**

En el bloque `if (isSupabaseConfigured()) { ... }` que guarda el torneo nuevo (líneas 225-229), agregar la persistencia del ciclo:

```ts
        // Save new tournament to database
        if (isSupabaseConfigured()) {
          adaptiveTournamentService
            .saveTournament(tournament)
            .catch((error) => console.error('Error saving new tournament:', error));
          cycleStateService
            .saveCycleState(tournament)
            .catch((error) => console.error('Error saving new cycle state:', error));
        }
```

(`tournament` acá ya es un `Cycle` — sale de `toCycle({...})`.)

- [ ] **Step 5: Guardar cycle_state en `createNewTournament`**

En `createNewTournament`, dentro del `try`, inmediatamente después de `await adaptiveTournamentService.saveTournament(tournament);` (línea ~288), agregar:

```ts
              await adaptiveTournamentService.saveTournament(tournament);
              await cycleStateService.saveCycleState(tournament);
              console.log(`Tournament ${year} created and saved to database`);
```

(`tournament` en `createNewTournament` también nace de `toCycle` → es `Cycle`.)

- [ ] **Step 6: Gate completo**

Run: `npx vitest run && npx tsc -b --noEmit && npx eslint src/store/useTournamentStore.ts`
Expected: suite 140 verde (los tests de store/componentes que importan el store no deben romperse), tsc exit 0, eslint sin errores nuevos. Verificar que NO quedó ningún import sin usar y que no se introdujo ningún `any`.

- [ ] **Step 7: Commit**

```bash
git add src/store/useTournamentStore.ts
git commit -m "feat(store): persistir y cargar cycle_state en Supabase (save/init/create)"
```

---

## Task 5: Borrado de datos legacy (localStorage + Supabase)

**Files:**
- Modify: `src/store/useTournamentStore.ts` — `persist` config (`version` `:2219` + `migrate` `:2256-2265`)
- Create: `supabase/migrations/009_wipe_legacy_data.sql`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: bump de versión del `persist` que descarta el localStorage legacy una vez; SQL de TRUNCATE (aplicación diferida a confirmación).

- [ ] **Step 1: Bump de versión + `migrate` que descarta saves legacy**

En `src/store/useTournamentStore.ts`, en la config de `persist`:

1. Cambiar `version: 8` (línea 2219) por:

```ts
      version: 9, // Release del ciclo: descarta saves legacy de localStorage una vez.
```

2. Reemplazar la función `migrate` (líneas 2256-2265) por una que descarte cuando la versión persistida es anterior a 9:

```ts
      // v9: release del ciclo de 4 años. Los saves locales previos son data
      // legacy (torneos sin estado de ciclo persistido en Supabase); se
      // descartan una vez. Desde v9, migrate preserva el shape como antes.
      migrate: (persistedState, version) => {
        if (version < 9) {
          return { tournaments: [], currentTournamentId: null };
        }
        const previous = (persistedState ?? {}) as {
          tournaments?: Tournament[];
          currentTournamentId?: string | null;
        };
        return {
          tournaments: previous.tournaments ?? [],
          currentTournamentId: previous.currentTournamentId ?? null,
        };
      },
```

- [ ] **Step 2: Crear el SQL de borrado (aplicación diferida)**

Crear `supabase/migrations/009_wipe_legacy_data.sql`:

```sql
-- ============================================
-- Migration 009: Borrado de datos legacy pre-ciclo
-- ============================================
-- Release del ciclo de 4 años (spec §10/§13): se limpian los torneos previos al
-- ciclo y su historial. `teams` NO se toca (data de referencia). TRUNCATE CASCADE
-- sobre `tournaments_new` limpia los hijos con FK (qualifier_groups,
-- world_cup_groups, matches_new, team_tournament_skills, tournament_cycle_state,
-- team_tournament_performance). `match_history` no tiene FK CASCADE desde
-- tournaments_new, así que se limpia explícitamente.
--
-- ⚠️ DESTRUCTIVO E IRREVERSIBLE. Aplicar SOLO con confirmación explícita.

TRUNCATE TABLE tournaments_new CASCADE;
TRUNCATE TABLE match_history;
```

- [ ] **Step 3: Gate del cambio de código**

Run: `npx tsc -b --noEmit && npx eslint src/store/useTournamentStore.ts && npx vitest run`
Expected: tsc exit 0, eslint sin errores, suite 140 verde (el cambio de `migrate`/`version` no afecta los tests, que seedean el store directamente).

- [ ] **Step 4: Commit**

```bash
git add src/store/useTournamentStore.ts supabase/migrations/009_wipe_legacy_data.sql
git commit -m "chore(release): descartar saves legacy de localStorage (v9) + SQL de wipe Supabase"
```

> **Nota para el controller (fuera de los steps del implementer):** el `009_wipe_legacy_data.sql` es **destructivo**. NO aplicarlo automáticamente. Presentarlo al usuario y aplicarlo vía MCP `apply_migration` **solo tras confirmación explícita**. El bump de versión del `persist` (localStorage) sí se activa solo en el próximo load de cada cliente — está previsto por el spec.

---

## Self-Review (checklist del autor del plan)

**1. Cobertura del spec §10:**
- "Migración nueva" → T1 (008) ✅ (JSONB en vez de normalizado — divergencia aprobada y registrada en el §10).
- "Modo local vía persist" → preservado (no se toca `partialize`; el `tournaments` array sigue persistiendo el Cycle entero local) ✅.
- "Borrado de datos viejos (localStorage + Supabase)" → T5 ✅.
- "Servicios siguiendo el patrón normalizado" → T3 (`cycleStateService`, wrapper fino) ✅. (El spec nombraba `continentalService`/`confederationsService`; con JSONB un único servicio cubre ambos — menos superficie, mismo patrón.)

**2. Placeholder scan:** sin TODO/TBD; cada step de código trae el código completo ✅.

**3. Consistencia de tipos:**
- `CycleStatePayload` definido en T2, consumido con el mismo nombre en T3 (`serializeCycleState`/`loadCycleState`) y T4 (`reconstructCycle`) ✅.
- `serializeCycleState(cycle: Cycle)` / `reconstructCycle(base, state | null)` / `loadCycleState → CycleStatePayload | null` encajan ✅.
- Accessor `db.tournament_cycle_state()` (T1) usado en T3 ✅.
- `state` columna `JSONB` ↔ tipo `Json` ↔ narrowing `as CycleStatePayload` ✅.

**4. Riesgos:**
- `updateTournamentInState` recibe `Tournament` pero en runtime es `Cycle`; `ensureCycleFields` lo hace seguro sin `as` ✅.
- El `migrate` v9 usa el 2º parámetro `version` (versión persistida) para descartar solo una vez ✅.
- La suite crece 135 → 140 (solo T2 agrega tests) ✅.
