# Plan 5A — Ciclo en el store: motor puro `core/cycle.ts` + wiring (importancia + enforcement)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development para ejecutar este plan tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Que el store pueda **crear y correr las fases nuevas del Ciclo** (Continental → Copa Confederaciones) con **orden de jornada global estricto en esas fases** y **peso Elo por etapa en todas las simulaciones**, con toda la lógica de mutación del ciclo en un módulo **puro y testeado** (`src/core/cycle.ts`) y las acciones del store como wrappers finos. Las fases Mundial (clasificatorias/grupos/knockout) quedan tipadas dentro del `Cycle` y siguen jugándose como hoy; su enforcement por jornada es parte del hub Match Center (5B).

**Architecture:** Módulo puro `core/cycle.ts` (`Cycle → Cycle`, determinista: recibe resultados ya simulados) que reutiliza `core/continental.ts`, `core/confederations.ts`, `core/calendar.ts`, `core/scheduler.ts`. El store expone acciones finas que (1) simulan con RNG + importancia, (2) llaman a la función pura correspondiente, (3) persisten con el patrón existente (`updateTournamentInState` + `persist` de Zustand). `getStageImportance` se cablea en cada call site de simulación. `isMatchPlayable` (ya en `calendar.ts`) gatea las acciones nuevas de continental/confed (las fases Mundial existentes no se gatean por jornada en 5A — eso es del hub en 5B).

**Tech Stack:** React 19 + TypeScript + Vite + Zustand (`persist`) + Vitest (env node). Sin dependencias nuevas.

## Divergencias vs spec (aprobadas por el usuario, 2026-07-21)

1. **Nombres**: se mantiene `tournaments` / `currentTournament` / `currentTournamentId` (tipo → `Cycle`) en vez del rename a `cycles`/`currentCycle` del spec §4.1. `Cycle extends Tournament` hace el cambio type-safe; el rename es cosmético y de blast radius enorme. **No renombrar.**
2. **Alcance**: la orquestación **pura** (creación de ciclo + transiciones de fase, que el spec §12 lista en Plan 6) se incluye acá porque el enforcement (Plan 5) es intestable sin ella. **Solo** la persistencia **Supabase** (migración `008`, `continentalService`/`confederationsService`) queda para Plan 6. En 5A el ciclo corre en modo local vía el `persist` de Zustand (los campos nuevos serializan a JSON automáticamente).
3. **Módulo nuevo** `src/core/cycle.ts` (transiciones/mutación) separado de `src/core/calendar.ts` (queries de solo lectura, ya existe).

## Global Constraints

- **Gate real del repo por tarea** (todos deben salir con exit 0):
  - Tareas puras (1-3): `npx vitest run src/core/__tests__/cycle.test.ts` **+** `npx tsc -b --noEmit` **+** `npx eslint <archivos tocados>`.
  - Tareas de store (4-5): `npx tsc -b --noEmit` **+** `npx eslint <archivos tocados>` (+ reviewer). **No son testeables en node** (las actions async del store cuelgan: usan `confirm()` y `await` de Supabase). El gate de esas tareas es tipos + lint + review + smoke manual; NO inventar tests de store que cuelguen.
  - **`npx tsc --noEmit` es un NO-OP en este repo** (tsconfig raíz solution-style, type-checkea 0 archivos, siempre exit 0). Usar SIEMPRE `npx tsc -b --noEmit`.
- **`core/cycle.ts` es PURO**: no importa React, Zustand, Supabase, ni `getEngineConfig`/`getEngineConfig()`. Puede importar: `nanoid`, otros módulos `core/*` puros (`continental`, `confederations`, `calendar`, `scheduler`, `knockout`), constantes y tipos. **No importar `core/engine.ts`** (arrastra el config store) — el cálculo de importancia vive en el store, no acá.
- **Lint de base ya roto**: `npx eslint .` (todo el repo) reporta ~106 errores `@typescript-eslint/no-explicit-any` PRE-EXISTENTES en archivos ajenos (services, useTournamentStore, edge functions). No introducir NINGÚN `any` nuevo. El eslint scopeado a los archivos tocados debe salir limpio.
- **No re-estampar `stage`**: `continental.ts` estampa `stage:'continental'` y `confederations.ts` estampa `'confed-group'`/`'confed-knockout'` en sus factories. `core/cycle.ts` NUNCA reescribe `stage`.
- **Sede neutral**: Continental y Confederaciones se juegan sin ventaja de local → el store simula con `disableHomeAdvantage = true`. Penales si hay empate. El Elo ya cuenta los penales como **empate** (FIFA-style) porque `simulateMatchWithPenalties` calcula el cambio de skill sobre el marcador de los 90' antes de tirar penales — **no requiere cambios en `engine.ts`**.
- **Jornada global (calendario)**:
  - Continental: 6 jornadas, 4 confederaciones en lockstep. md1=R64, md2=R32, md3=R16, md4=QF, md5=SF, md6=Final.
  - Confederaciones: 5 jornadas. md1-3=grupos, md4=semis, md5=final+3er puesto.
  - Boundary de fase = **paso explícito con sorteo** (acción del store). Al completar la última jornada de una fase, NO se auto-avanza a la siguiente: se marca `isComplete` y el calendario queda en el boundary hasta que el usuario ejecuta el sorteo de la fase siguiente.
- **Alcance del enforcement en 5A**: el guard `isMatchPlayable` (rechazo de partidos fuera de la jornada actual) se aplica **solo en las acciones nuevas de continental/confed**. NO se agrega a las sims existentes de clasificatorias/Mundial, porque 5A no implementa el auto-avance de jornada de esas fases y el guard las trabaría tras la jornada 1. Esas fases siguen jugándose como hoy (sin gate de jornada a nivel store); su enforcement por jornada es del hub Match Center en 5B. La **importancia Elo** sí se cablea en las 3 sims existentes (no tiene riesgo de trabar nada).
- **Defaults de importancia** (spec §8, ya en `EngineConfig.importanceByStage` desde Plan 2, ya mapeados por `getStageImportance`): qualifier 0.75, continentalEarly 0.90, continentalLate 1.20, confedGroup 1.10, confedKnockout 1.40, wcGroup 1.25, wcKnockout 1.60.

---

## File Structure

- **Create:** `src/core/cycle.ts` — motor puro de transiciones del ciclo (creación, sorteo continental/confed, registro de resultados + auto-avance de ronda/jornada, boundaries). Tareas 1-3.
- **Create:** `src/core/__tests__/cycle.test.ts` — tests puros del motor. Tareas 1-3.
- **Modify:** `src/store/useTournamentStore.ts` — tipar `currentTournament`/`tournaments` como `Cycle`; `migrate`/rehydrate defensivos; wiring de importancia en las 3 sims existentes (Tarea 4, sin guard de jornada); acciones nuevas del ciclo con su guard `isMatchPlayable` (Tarea 5).
- **Modify:** `src/types/index.ts` — `TournamentState`: campos `currentTournament`/`tournaments` a `Cycle`; declarar las acciones nuevas del ciclo. (Tareas 4-5.)

---

## Task 1: `core/cycle.ts` — creación de ciclo + reemplazo de match

**Files:**
- Create: `src/core/cycle.ts`
- Test: `src/core/__tests__/cycle.test.ts`

**Interfaces:**
- Consumes: tipos `Cycle`, `Tournament`, `CalendarState`, `ContinentalStage`, `ContinentalBracket`, `ConfederationsCup`, `Region`, `KnockoutMatch`, `Match` de `../types`.
- Produces (para tareas 2-5):
  - `createInitialCalendar(): CalendarState`
  - `createEmptyContinentalStage(): ContinentalStage`
  - `createEmptyConfederationsCup(): ConfederationsCup`
  - `toCycle(base: Tournament): Cycle`
  - `ensureCycleFields(t: Tournament | Cycle): Cycle`

- [ ] **Step 1: Escribir el test que falla**

Crear `src/core/__tests__/cycle.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createInitialCalendar,
  createEmptyContinentalStage,
  createEmptyConfederationsCup,
  toCycle,
  ensureCycleFields,
} from '../cycle';
import type { Tournament, Region } from '../../types';

const REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

function baseTournament(): Tournament {
  return {
    id: 't1',
    name: 'World Cup 2026',
    year: 2026,
    qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
    worldCup: null,
    isQualifiersComplete: false,
    hasAnyMatchPlayed: false,
  };
}

describe('cycle: creación', () => {
  it('createInitialCalendar arranca en continental, jornada 0 (sin sortear)', () => {
    expect(createInitialCalendar()).toEqual({ phase: 'continental', matchday: 0 });
  });

  it('createEmptyContinentalStage crea 4 brackets vacíos, isComplete false', () => {
    const s = createEmptyContinentalStage();
    expect(s.isComplete).toBe(false);
    for (const r of REGIONS) {
      const b = s.brackets[r];
      expect(b.region).toBe(r);
      expect(b.roundOf64).toEqual([]);
      expect(b.roundOf32).toEqual([]);
      expect(b.final).toBeNull();
      expect(b.byeTeamIds).toEqual([]);
    }
  });

  it('createEmptyConfederationsCup crea grupos/knockout vacíos', () => {
    const c = createEmptyConfederationsCup();
    expect(c.groups).toEqual([]);
    expect(c.knockout.semiFinals).toEqual([]);
    expect(c.knockout.thirdPlace).toBeNull();
    expect(c.knockout.final).toBeNull();
    expect(c.isComplete).toBe(false);
  });

  it('toCycle envuelve un Tournament conservando sus campos y agregando los del ciclo', () => {
    const base = baseTournament();
    const cycle = toCycle(base);
    expect(cycle.id).toBe('t1');
    expect(cycle.year).toBe(2026);
    expect(cycle.worldCup).toBeNull();
    expect(cycle.calendar).toEqual({ phase: 'continental', matchday: 0 });
    expect(cycle.continental.isComplete).toBe(false);
    expect(cycle.confederationsCup.isComplete).toBe(false);
  });

  it('ensureCycleFields hace backfill de campos faltantes sin pisar los presentes', () => {
    const base = baseTournament();
    // Simula un torneo legacy sin campos de ciclo:
    const legacy = base as unknown as import('../../types').Cycle;
    const fixed = ensureCycleFields(legacy);
    expect(fixed.calendar).toEqual({ phase: 'continental', matchday: 0 });
    expect(fixed.continental.brackets.Europe.region).toBe('Europe');

    // Si ya tiene calendario, no lo pisa:
    const withCalendar = toCycle(base);
    withCalendar.calendar = { phase: 'confed', matchday: 3 };
    expect(ensureCycleFields(withCalendar).calendar).toEqual({ phase: 'confed', matchday: 3 });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/core/__tests__/cycle.test.ts`
Expected: FAIL — "Failed to resolve import '../cycle'".

- [ ] **Step 3: Implementación mínima**

Crear `src/core/cycle.ts`:

```ts
import type {
  CalendarState,
  ConfederationsCup,
  ContinentalBracket,
  ContinentalStage,
  Cycle,
  Region,
  Tournament,
} from '../types';

/** Las 4 confederaciones, en orden fijo. Export para uso interno de las tareas 2-3. */
export const CYCLE_REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

/** Calendario inicial: fase continental, jornada 0 = todavía sin sortear. */
export function createInitialCalendar(): CalendarState {
  return { phase: 'continental', matchday: 0 };
}

function emptyBracket(region: Region): ContinentalBracket {
  return {
    region,
    roundOf64: [],
    roundOf32: [],
    roundOf16: [],
    quarterFinals: [],
    semiFinals: [],
    final: null,
    byeTeamIds: [],
  };
}

/** Etapa continental vacía: 4 brackets sin sortear. */
export function createEmptyContinentalStage(): ContinentalStage {
  return {
    brackets: {
      Europe: emptyBracket('Europe'),
      America: emptyBracket('America'),
      Africa: emptyBracket('Africa'),
      Asia: emptyBracket('Asia'),
    },
    isComplete: false,
  };
}

/** Copa Confederaciones vacía: sin grupos ni knockout. */
export function createEmptyConfederationsCup(): ConfederationsCup {
  return {
    groups: [],
    knockout: { semiFinals: [], thirdPlace: null, final: null },
    championId: undefined,
    isComplete: false,
  };
}

/** Envuelve un `Tournament` en un `Cycle` con las fases previas vacías. */
export function toCycle(base: Tournament): Cycle {
  return {
    ...base,
    continental: createEmptyContinentalStage(),
    confederationsCup: createEmptyConfederationsCup(),
    calendar: createInitialCalendar(),
  };
}

/**
 * Backfill defensivo: garantiza que un objeto (posiblemente legacy, sin campos
 * de ciclo) tenga `continental`/`confederationsCup`/`calendar`. No pisa los que
 * ya están presentes. Se usa al rehidratar/cargar torneos.
 */
export function ensureCycleFields(t: Tournament | Cycle): Cycle {
  const c = t as Partial<Cycle>;
  return {
    ...(t as Cycle),
    continental: c.continental ?? createEmptyContinentalStage(),
    confederationsCup: c.confederationsCup ?? createEmptyConfederationsCup(),
    calendar: c.calendar ?? createInitialCalendar(),
  };
}

// (Tareas 2-3 agregan más exports a este mismo archivo.)
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/core/__tests__/cycle.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Gate + commit**

```bash
npx tsc -b --noEmit && npx eslint src/core/cycle.ts src/core/__tests__/cycle.test.ts
git add src/core/cycle.ts src/core/__tests__/cycle.test.ts
git commit -m "feat(core): cycle creation helpers (toCycle, empty stages, ensureCycleFields)"
```

---

## Task 2: `core/cycle.ts` — sorteo continental + registro de resultado con auto-avance

**Files:**
- Modify: `src/core/cycle.ts`
- Test: `src/core/__tests__/cycle.test.ts` (append)

**Interfaces:**
- Consumes: de `./continental` → `generateContinentalBracket`, `generateContinentalRoundOf32`, `generateContinentalRoundOf16`, `generateContinentalQuarterFinals`, `generateContinentalSemiFinals`, `generateContinentalFinal`. De `./calendar` → `isCurrentMatchdayComplete`, `getNextCalendarState`. Tipos `Team`, `KnockoutMatch`.
- Produces:
  - `interface KnockoutResult { homeScore: number; awayScore: number; winnerId: string; loserId: string; penalties?: { homeScore: number; awayScore: number } }`
  - `drawContinentalStage(cycle: Cycle, teamsByRegion: Record<Region, Team[]>): Cycle` — sortea los 4 brackets, setea `calendar = { phase:'continental', matchday:1 }`.
  - `recordContinentalMatch(cycle: Cycle, matchId: string, result: KnockoutResult): Cycle` — registra el resultado en el bracket que corresponda y, si la jornada global quedó completa, genera la ronda siguiente en los 4 brackets y avanza el calendario (o, al completar la final, setea `championId`/`runnerUpId` + `isComplete`).

- [ ] **Step 1: Escribir los tests que fallan** (append a `cycle.test.ts`)

```ts
import {
  drawContinentalStage,
  recordContinentalMatch,
  type KnockoutResult,
} from '../cycle';
import type { Cycle, KnockoutMatch, Region, Team } from '../../types';

// Helper: N equipos de una región con skills decrecientes (100, 99, ...).
function makeRegionTeams(region: Region, count: number): Team[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${region}-${i}`,
    name: `${region} ${i}`,
    flag: '🏳️',
    region,
    skill: 100 - i,
  }));
}

function fullTeamsByRegion(): Record<Region, Team[]> {
  return {
    Europe: makeRegionTeams('Europe', 55),
    Asia: makeRegionTeams('Asia', 55),
    Africa: makeRegionTeams('Africa', 55),
    America: makeRegionTeams('America', 45),
  };
}

// Toma todos los partidos continentales de la jornada actual sin jugar y los
// "juega" con victoria del local (home), devolviendo el cycle avanzado.
function playContinentalMatchday(cycle: Cycle): Cycle {
  const md = cycle.calendar.matchday;
  const matches = Object.values(cycle.continental.brackets)
    .flatMap((b): KnockoutMatch[] => [
      ...b.roundOf64, ...b.roundOf32, ...b.roundOf16,
      ...b.quarterFinals, ...b.semiFinals, ...(b.final ? [b.final] : []),
    ])
    .filter((m) => (m.matchday ?? 0) === md && !m.isPlayed);
  let next = cycle;
  for (const m of matches) {
    const result: KnockoutResult = {
      homeScore: 1, awayScore: 0, winnerId: m.homeTeamId, loserId: m.awayTeamId,
    };
    next = recordContinentalMatch(next, m.id, result);
  }
  return next;
}

describe('cycle: continental', () => {
  it('drawContinentalStage sortea 4 brackets y pone calendario en md1', () => {
    const cycle = drawContinentalStage(toCycle({
      id: 't', name: 'c', year: 2026,
      qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
      worldCup: null, isQualifiersComplete: false, hasAnyMatchPlayed: false,
    }), fullTeamsByRegion());

    expect(cycle.calendar).toEqual({ phase: 'continental', matchday: 1 });
    // Europa: 55 equipos → 9 byes, 23 cruces R64.
    expect(cycle.continental.brackets.Europe.byeTeamIds).toHaveLength(9);
    expect(cycle.continental.brackets.Europe.roundOf64).toHaveLength(23);
    // América: 45 equipos → 19 byes, 13 cruces R64.
    expect(cycle.continental.brackets.America.byeTeamIds).toHaveLength(19);
    expect(cycle.continental.brackets.America.roundOf64).toHaveLength(13);
  });

  it('al completar la jornada R64 global genera R32 y avanza a md2', () => {
    let cycle = drawContinentalStage(toCycle({
      id: 't', name: 'c', year: 2026,
      qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
      worldCup: null, isQualifiersComplete: false, hasAnyMatchPlayed: false,
    }), fullTeamsByRegion());

    cycle = playContinentalMatchday(cycle); // juega toda la R64
    expect(cycle.calendar).toEqual({ phase: 'continental', matchday: 2 });
    // Cada bracket ya tiene su R32 (16 cruces).
    expect(cycle.continental.brackets.Europe.roundOf32).toHaveLength(16);
    expect(cycle.continental.brackets.America.roundOf32).toHaveLength(16);
  });

  it('corre las 6 jornadas y corona campeón/subcampeón por confederación', () => {
    let cycle = drawContinentalStage(toCycle({
      id: 't', name: 'c', year: 2026,
      qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
      worldCup: null, isQualifiersComplete: false, hasAnyMatchPlayed: false,
    }), fullTeamsByRegion());

    for (let i = 0; i < 6; i++) cycle = playContinentalMatchday(cycle);

    expect(cycle.continental.isComplete).toBe(true);
    // La final quedó jugada y hay campeón + subcampeón en cada bracket.
    for (const r of ['Europe', 'America', 'Africa', 'Asia'] as Region[]) {
      const b = cycle.continental.brackets[r];
      expect(b.final?.isPlayed).toBe(true);
      expect(b.championId).toBeTruthy();
      expect(b.runnerUpId).toBeTruthy();
      expect(b.championId).not.toBe(b.runnerUpId);
    }
    // Boundary: el calendario NO saltó solo a confed (queda en continental md6).
    expect(cycle.calendar).toEqual({ phase: 'continental', matchday: 6 });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/core/__tests__/cycle.test.ts`
Expected: FAIL — imports `drawContinentalStage`/`recordContinentalMatch` no existen.

> El implementer debe **fusionar** los `import ... from '../cycle'` y `from '../../types'` de este bloque con los ya presentes al tope del test (Tarea 1) en una sola declaración por módulo — si la config tiene `import/no-duplicates`, imports duplicados fallan el lint. Igual criterio en la Tarea 3.

- [ ] **Step 3: Implementación** (append a `src/core/cycle.ts`)

Agregar imports arriba (fusionar con los existentes):

```ts
import {
  generateContinentalBracket,
  generateContinentalRoundOf32,
  generateContinentalRoundOf16,
  generateContinentalQuarterFinals,
  generateContinentalSemiFinals,
  generateContinentalFinal,
} from './continental';
import { isCurrentMatchdayComplete, getNextCalendarState } from './calendar';
import type { KnockoutMatch, Team } from '../types';
```

Agregar al final:

```ts
/** Resultado ya resuelto de un cruce de eliminación directa. */
export interface KnockoutResult {
  homeScore: number;
  awayScore: number;
  winnerId: string;
  loserId: string;
  penalties?: { homeScore: number; awayScore: number };
}

/** Sortea los 4 brackets continentales y arranca el calendario en md1 (R64). */
export function drawContinentalStage(
  cycle: Cycle,
  teamsByRegion: Record<Region, Team[]>,
): Cycle {
  const brackets = {
    Europe: generateContinentalBracket('Europe', teamsByRegion.Europe),
    America: generateContinentalBracket('America', teamsByRegion.America),
    Africa: generateContinentalBracket('Africa', teamsByRegion.Africa),
    Asia: generateContinentalBracket('Asia', teamsByRegion.Asia),
  };
  return {
    ...cycle,
    continental: { brackets, isComplete: false },
    calendar: { phase: 'continental', matchday: 1 },
  };
}

/** Aplica `result` al match `matchId` dentro de un array de knockout. */
function applyResultTo(matches: KnockoutMatch[], matchId: string, result: KnockoutResult): KnockoutMatch[] {
  return matches.map((m) =>
    m.id === matchId
      ? {
          ...m,
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          isPlayed: true,
          winnerId: result.winnerId,
          loserId: result.loserId,
          penalties: result.penalties,
        }
      : m,
  );
}

/** Reemplaza el match (por id) en el bracket continental que lo contenga. */
function replaceContinentalMatch(cycle: Cycle, matchId: string, result: KnockoutResult): Cycle {
  const brackets = { ...cycle.continental.brackets };
  for (const r of CYCLE_REGIONS) {
    const b = brackets[r];
    brackets[r] = {
      ...b,
      roundOf64: applyResultTo(b.roundOf64, matchId, result),
      roundOf32: applyResultTo(b.roundOf32, matchId, result),
      roundOf16: applyResultTo(b.roundOf16, matchId, result),
      quarterFinals: applyResultTo(b.quarterFinals, matchId, result),
      semiFinals: applyResultTo(b.semiFinals, matchId, result),
      final:
        b.final && b.final.id === matchId
          ? applyResultTo([b.final], matchId, result)[0]
          : b.final,
    };
  }
  return { ...cycle, continental: { ...cycle.continental, brackets } };
}

/**
 * Genera la ronda siguiente de los 4 brackets según la jornada recién
 * completada, o corona finalistas si fue la final. Devuelve el cycle avanzado.
 */
function advanceContinental(cycle: Cycle): Cycle {
  const md = cycle.calendar.matchday; // jornada recién completada (1..6)
  const brackets = { ...cycle.continental.brackets };
  for (const r of CYCLE_REGIONS) {
    const b = brackets[r];
    if (md === 1) brackets[r] = { ...b, roundOf32: generateContinentalRoundOf32(b) };
    else if (md === 2) brackets[r] = { ...b, roundOf16: generateContinentalRoundOf16(b.roundOf32) };
    else if (md === 3) brackets[r] = { ...b, quarterFinals: generateContinentalQuarterFinals(b.roundOf16) };
    else if (md === 4) brackets[r] = { ...b, semiFinals: generateContinentalSemiFinals(b.quarterFinals) };
    else if (md === 5) brackets[r] = { ...b, final: generateContinentalFinal(b.semiFinals) };
    else if (md === 6) brackets[r] = { ...b, championId: b.final?.winnerId, runnerUpId: b.final?.loserId };
  }
  const continental: ContinentalStage = { brackets, isComplete: md === 6 };
  const next: Cycle = { ...cycle, continental };
  // md6 = final: boundary. No auto-avanzar de fase (espera sorteo de confed).
  if (md === 6) return next;
  return { ...next, calendar: getNextCalendarState(next) };
}

/**
 * Registra el resultado de un cruce continental. Si con esto queda completa la
 * jornada global, genera la ronda siguiente en los 4 brackets y avanza el
 * calendario (auto-avance intra-fase). Función pura.
 */
export function recordContinentalMatch(cycle: Cycle, matchId: string, result: KnockoutResult): Cycle {
  const updated = replaceContinentalMatch(cycle, matchId, result);
  if (updated.calendar.phase !== 'continental') return updated;
  return isCurrentMatchdayComplete(updated) ? advanceContinental(updated) : updated;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/core/__tests__/cycle.test.ts`
Expected: PASS (Task 1 + 3 tests nuevos).

- [ ] **Step 5: Gate + commit**

```bash
npx tsc -b --noEmit && npx eslint src/core/cycle.ts src/core/__tests__/cycle.test.ts
git add src/core/cycle.ts src/core/__tests__/cycle.test.ts
git commit -m "feat(core): continental stage draw + record/auto-advance in cycle engine"
```

---

## Task 3: `core/cycle.ts` — sorteo confederaciones + registro (grupos y knockout)

**Files:**
- Modify: `src/core/cycle.ts`
- Test: `src/core/__tests__/cycle.test.ts` (append)

**Interfaces:**
- Consumes: de `./confederations` → `generateConfederationsGroups`, `generateConfederationsSemiFinals`, `generateConfederationsFinal`, `generateConfederationsThirdPlace`, tipo `ConfederationFinalists`. De `./scheduler` → `updateStandings`, `sortStandings`, `initializeStandings`. Tipos `Match`, `WorldCupGroup`.
- Produces:
  - `assembleConfederationFinalists(cycle: Cycle): ConfederationFinalists[]` — arma los 4 finalistas desde `championId`/`runnerUpId` de los brackets. Lanza si algún bracket no tiene finalistas.
  - `drawConfederationsStage(cycle: Cycle, teams: Team[]): Cycle` — genera los 2 grupos y setea `calendar = { phase:'confed', matchday:1 }`.
  - `interface GroupResult { homeScore: number; awayScore: number }`
  - `recordConfedGroupMatch(cycle: Cycle, matchId: string, result: GroupResult, teams: Team[]): Cycle` — registra el partido de grupo, recalcula standings de ese grupo y, si se completó la jornada, avanza (md3 → genera semis).
  - `recordConfedKnockoutMatch(cycle: Cycle, matchId: string, result: KnockoutResult, teams: Team[]): Cycle` — registra semi/final/3er puesto y avanza (semis completas → genera final+3er puesto; md5 completa → corona campeón + `isComplete`).

- [ ] **Step 1: Escribir los tests que fallan** (append)

```ts
import {
  assembleConfederationFinalists,
  drawConfederationsStage,
  recordConfedGroupMatch,
  recordConfedKnockoutMatch,
  type GroupResult,
} from '../cycle';
import type { WorldCupGroup } from '../../types';

// Arma un cycle con continental YA completo (finalistas fijados a mano).
function cycleWithContinentalDone(): { cycle: Cycle; teams: Team[] } {
  const teams: Team[] = [];
  const regions: Region[] = ['Europe', 'America', 'Africa', 'Asia'];
  const base = toCycle({
    id: 't', name: 'c', year: 2026,
    qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
    worldCup: null, isQualifiersComplete: false, hasAnyMatchPlayed: false,
  });
  const brackets = { ...base.continental.brackets };
  regions.forEach((r, ri) => {
    const champ: Team = { id: `${r}-champ`, name: `${r} C`, flag: '🏳️', region: r, skill: 90 - ri };
    const runner: Team = { id: `${r}-runner`, name: `${r} R`, flag: '🏳️', region: r, skill: 80 - ri };
    teams.push(champ, runner);
    brackets[r] = { ...brackets[r], championId: champ.id, runnerUpId: runner.id };
  });
  const cycle: Cycle = {
    ...base,
    continental: { brackets, isComplete: true },
    calendar: { phase: 'continental', matchday: 6 },
  };
  return { cycle, teams };
}

// Juega todos los partidos de grupo confed de la jornada actual (home gana).
function playConfedGroupMatchday(cycle: Cycle, teams: Team[]): Cycle {
  const md = cycle.calendar.matchday;
  const matches = cycle.confederationsCup.groups
    .flatMap((g) => g.matches)
    .filter((m) => (m.matchday ?? 0) === md && !m.isPlayed);
  let next = cycle;
  for (const m of matches) {
    next = recordConfedGroupMatch(next, m.id, { homeScore: 2, awayScore: 0 }, teams);
  }
  return next;
}

describe('cycle: confederaciones', () => {
  it('assembleConfederationFinalists arma 4 finalistas desde los brackets', () => {
    const { cycle } = cycleWithContinentalDone();
    const finalists = assembleConfederationFinalists(cycle);
    expect(finalists).toHaveLength(4);
    expect(new Set(finalists.map((f) => f.region)).size).toBe(4);
    expect(finalists.every((f) => f.championId && f.runnerUpId)).toBe(true);
  });

  it('drawConfederationsStage crea 2 grupos de 4 y pone calendario en confed md1', () => {
    const { cycle, teams } = cycleWithContinentalDone();
    const drawn = drawConfederationsStage(cycle, teams);
    expect(drawn.calendar).toEqual({ phase: 'confed', matchday: 1 });
    expect(drawn.confederationsCup.groups).toHaveLength(2);
    for (const g of drawn.confederationsCup.groups) {
      expect(g.teamIds).toHaveLength(4);
      expect(g.matches).toHaveLength(6); // round-robin 4 equipos
    }
  });

  it('completa grupos (md1-3), genera semis, luego final+3er puesto y corona campeón', () => {
    const { cycle, teams } = cycleWithContinentalDone();
    let c = drawConfederationsStage(cycle, teams);

    c = playConfedGroupMatchday(c, teams); // md1
    expect(c.calendar).toEqual({ phase: 'confed', matchday: 2 });
    c = playConfedGroupMatchday(c, teams); // md2
    c = playConfedGroupMatchday(c, teams); // md3 → genera semis, avanza a md4
    expect(c.calendar).toEqual({ phase: 'confed', matchday: 4 });
    expect(c.confederationsCup.knockout.semiFinals).toHaveLength(2);

    // Jugar las 2 semis (home gana):
    for (const m of c.confederationsCup.knockout.semiFinals.filter((s) => !s.isPlayed)) {
      c = recordConfedKnockoutMatch(c, m.id, {
        homeScore: 1, awayScore: 0, winnerId: m.homeTeamId, loserId: m.awayTeamId,
      }, teams);
    }
    expect(c.calendar).toEqual({ phase: 'confed', matchday: 5 });
    expect(c.confederationsCup.knockout.final).not.toBeNull();
    expect(c.confederationsCup.knockout.thirdPlace).not.toBeNull();

    // Jugar final + 3er puesto (md5):
    const final = c.confederationsCup.knockout.final!;
    const third = c.confederationsCup.knockout.thirdPlace!;
    c = recordConfedKnockoutMatch(c, final.id, {
      homeScore: 2, awayScore: 1, winnerId: final.homeTeamId, loserId: final.awayTeamId,
    }, teams);
    c = recordConfedKnockoutMatch(c, third.id, {
      homeScore: 1, awayScore: 0, winnerId: third.homeTeamId, loserId: third.awayTeamId,
    }, teams);

    expect(c.confederationsCup.isComplete).toBe(true);
    expect(c.confederationsCup.championId).toBe(final.homeTeamId);
    // Boundary: no salta solo a wc-qualifiers.
    expect(c.calendar).toEqual({ phase: 'confed', matchday: 5 });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/core/__tests__/cycle.test.ts`
Expected: FAIL — imports nuevos no existen.

- [ ] **Step 3: Implementación** (append a `src/core/cycle.ts`)

Agregar imports (fusionar):

```ts
import {
  generateConfederationsGroups,
  generateConfederationsSemiFinals,
  generateConfederationsFinal,
  generateConfederationsThirdPlace,
  type ConfederationFinalists,
} from './confederations';
import { updateStandings, sortStandings, initializeStandings } from './scheduler';
import type { Match, WorldCupGroup } from '../types';
```

Agregar al final:

```ts
/** Resultado de un partido de grupo (sin winner explícito: lo dan los goles). */
export interface GroupResult {
  homeScore: number;
  awayScore: number;
}

/**
 * Arma los 4 finalistas (campeón + subcampeón) desde los brackets continentales.
 * Lanza si algún bracket no coronó finalistas (precondición: continental completo).
 */
export function assembleConfederationFinalists(cycle: Cycle): ConfederationFinalists[] {
  return CYCLE_REGIONS.map((region) => {
    const b = cycle.continental.brackets[region];
    if (!b.championId || !b.runnerUpId) {
      throw new Error(`assembleConfederationFinalists: la confederación ${region} no tiene finalistas`);
    }
    return { region, championId: b.championId, runnerUpId: b.runnerUpId };
  });
}

/** Sortea los 2 grupos de la Copa Confederaciones y arranca el calendario en md1. */
export function drawConfederationsStage(cycle: Cycle, teams: Team[]): Cycle {
  const finalists = assembleConfederationFinalists(cycle);
  const groups = generateConfederationsGroups(finalists, teams);
  return {
    ...cycle,
    confederationsCup: {
      ...cycle.confederationsCup,
      groups,
      knockout: { semiFinals: [], thirdPlace: null, final: null },
      isComplete: false,
    },
    calendar: { phase: 'confed', matchday: 1 },
  };
}

/** Recalcula standings de un grupo desde cero con sus partidos jugados. */
function recomputeGroupStandings(group: WorldCupGroup, teams: Team[]): WorldCupGroup {
  const fresh = initializeStandings(group.teamIds);
  const played = group.matches.filter((m) => m.isPlayed);
  const standings = played.reduce((acc, m) => updateStandings(acc, m), fresh);
  return { ...group, standings: sortStandings(standings, teams, group.matches) };
}

/** Aplica un marcador a un partido de grupo (por id) dentro de una lista. */
function applyGroupResult(matches: Match[], matchId: string, result: GroupResult): Match[] {
  return matches.map((m) =>
    m.id === matchId
      ? { ...m, homeScore: result.homeScore, awayScore: result.awayScore, isPlayed: true }
      : m,
  );
}

function advanceConfedAfterGroups(cycle: Cycle, teams: Team[]): Cycle {
  const md = cycle.calendar.matchday; // 1..3
  if (md < 3) {
    return { ...cycle, calendar: getNextCalendarState(cycle) };
  }
  // md3 completa → generar semifinales, avanzar a md4.
  const semiFinals = generateConfederationsSemiFinals(cycle.confederationsCup.groups, teams);
  const withSemis: Cycle = {
    ...cycle,
    confederationsCup: {
      ...cycle.confederationsCup,
      knockout: { ...cycle.confederationsCup.knockout, semiFinals },
    },
  };
  return { ...withSemis, calendar: getNextCalendarState(withSemis) };
}

/** Registra un partido de grupo confed + recálculo de standings + auto-avance. */
export function recordConfedGroupMatch(
  cycle: Cycle,
  matchId: string,
  result: GroupResult,
  teams: Team[],
): Cycle {
  const groups = cycle.confederationsCup.groups.map((g) => {
    if (!g.matches.some((m) => m.id === matchId)) return g;
    const withResult: WorldCupGroup = { ...g, matches: applyGroupResult(g.matches, matchId, result) };
    return recomputeGroupStandings(withResult, teams);
  });
  const updated: Cycle = {
    ...cycle,
    confederationsCup: { ...cycle.confederationsCup, groups },
  };
  if (updated.calendar.phase !== 'confed') return updated;
  return isCurrentMatchdayComplete(updated) ? advanceConfedAfterGroups(updated, teams) : updated;
}

/** Aplica un `KnockoutResult` a un `KnockoutMatch | null` (por id). */
function applyKoResult(match: KnockoutMatch | null, matchId: string, result: KnockoutResult): KnockoutMatch | null {
  if (!match || match.id !== matchId) return match;
  return applyResultTo([match], matchId, result)[0];
}

function advanceConfedAfterKnockout(cycle: Cycle): Cycle {
  const md = cycle.calendar.matchday; // 4 (semis) o 5 (final+3er)
  const ko = cycle.confederationsCup.knockout;
  if (md === 4) {
    // Semis completas → generar final + 3er puesto, avanzar a md5.
    const final = generateConfederationsFinal(ko.semiFinals);
    const thirdPlace = generateConfederationsThirdPlace(ko.semiFinals);
    const withFinals: Cycle = {
      ...cycle,
      confederationsCup: { ...cycle.confederationsCup, knockout: { ...ko, final, thirdPlace } },
    };
    return { ...withFinals, calendar: getNextCalendarState(withFinals) };
  }
  // md5 completa → coronar campeón. Boundary: NO auto-avanzar de fase.
  return {
    ...cycle,
    confederationsCup: {
      ...cycle.confederationsCup,
      championId: ko.final?.winnerId,
      isComplete: true,
    },
  };
}

/** Registra un partido de knockout confed (semi/final/3er) + auto-avance. */
export function recordConfedKnockoutMatch(
  cycle: Cycle,
  matchId: string,
  result: KnockoutResult,
  _teams: Team[],
): Cycle {
  const ko = cycle.confederationsCup.knockout;
  const updated: Cycle = {
    ...cycle,
    confederationsCup: {
      ...cycle.confederationsCup,
      knockout: {
        semiFinals: applyResultTo(ko.semiFinals, matchId, result),
        final: applyKoResult(ko.final, matchId, result),
        thirdPlace: applyKoResult(ko.thirdPlace, matchId, result),
      },
    },
  };
  if (updated.calendar.phase !== 'confed') return updated;
  return isCurrentMatchdayComplete(updated) ? advanceConfedAfterKnockout(updated) : updated;
}
```

> Nota para el implementer: `_teams` en `recordConfedKnockoutMatch` no se usa hoy (la generación de final/3er puesto solo necesita las semis), pero se deja el parámetro por simetría con el group recorder y para el call site del store. Si eslint marca `no-unused-vars`, renombrar a `_teams` (prefijo `_`) YA lo exime — verificar la config; si igual protesta, quitar el parámetro y ajustar el test y el call site del store (Tarea 5).

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/core/__tests__/cycle.test.ts`
Expected: PASS (todos los tests de cycle).

- [ ] **Step 5: Suite completa + gate + commit**

```bash
npx vitest run                       # suite completa, sin regresiones
npx tsc -b --noEmit && npx eslint src/core/cycle.ts src/core/__tests__/cycle.test.ts
git add src/core/cycle.ts src/core/__tests__/cycle.test.ts
git commit -m "feat(core): confederations stage draw + group/knockout record in cycle engine"
```

---

## Task 4: Store — tipar `Cycle`, backfill defensivo, wiring de importancia + enforcement

**Files:**
- Modify: `src/types/index.ts` (interface `TournamentState`)
- Modify: `src/store/useTournamentStore.ts`

**Gate:** `npx tsc -b --noEmit` + `npx eslint src/types/index.ts src/store/useTournamentStore.ts`. **No node-testeable** (actions async cuelgan). Verificación: tipos + lint + reviewer + smoke manual (`npm run dev`: jugar un grupo de clasificatorias sigue funcionando).

**Interfaces:**
- Consumes: de `../core/cycle` → `toCycle`, `ensureCycleFields`. De `../core/engine` → `getStageImportance` (ya importado el resto de engine). De `./useConfigStore` → `getEngineConfig` (el store puede importarlo — NO es core).

> **Ordenamiento (crítico):** el cambio de tipo a `Cycle` NO compila solo. Hay que acompañarlo, EN ESTA MISMA TAREA, de que toda construcción/carga de torneos produzca un `Cycle` (Step 2), si no `npx tsc -b --noEmit` falla (un `Tournament` plano no es asignable a `Cycle`/`Cycle[]`). Los pasos 1 y 2 se commitean juntos.

- [ ] **Step 1: Tipar el estado como `Cycle`**

En `src/types/index.ts`, interface `TournamentState` (línea ~113):
- Cambiar `tournaments: Tournament[]` → `tournaments: Cycle[]`.
- Cambiar `currentTournament: Tournament | null` → `currentTournament: Cycle | null`.
- `Cycle` ya está declarada más abajo en el mismo módulo — no hace falta importar nada.

En `src/store/useTournamentStore.ts` línea 3, agregar `Cycle` al import de tipos desde `../types`.

- [ ] **Step 2: Que TODA construcción/carga de torneos produzca un `Cycle`** (para que `tsc -b` pase con el tipo nuevo)

`import { toCycle, ensureCycleFields } from '../core/cycle';` (junto a los imports de core del store).

(a) **`createNewTournament`** (línea ~241): cambiar la construcción del torneo a un ciclo (el resto de la función no cambia):

```ts
const tournament: Cycle = toCycle({
  id: nanoid(),
  name: `World Cup ${year}`,
  year,
  qualifiers,
  worldCup: null,
  isQualifiersComplete: false,
  hasAnyMatchPlayed: false,
  originalSkills,
});
```

(b) **`mergeTournament`** (línea ~49): retipar a `Cycle` para que el retorno sea `Cycle[]` (cuerpo idéntico):

```ts
const mergeTournament = (existing: Cycle[], incoming: Cycle): Cycle[] => {
  const index = existing.findIndex((t) => t.id === incoming.id);
  if (index === -1) return [incoming, ...existing];
  const next = [...existing];
  next[index] = incoming;
  return next;
};
```

En sus call sites, el `incoming` que venga de la DB (un `Tournament`) debe envolverse: `mergeTournament(get().tournaments, ensureCycleFields(loaded))`.

(c) **`initializeTournament`** (línea ~129) y toda carga desde DB (`adaptiveTournamentService.getLatestTournament()` devuelve `Tournament`): envolver el torneo cargado con `ensureCycleFields(...)` antes de setearlo en `currentTournament`/`tournaments`. Igual en `onRehydrateStorage` (líneas ~2086-2100): al reconstruir la lista y `currentTournament` desde lo persistido, mapear con `ensureCycleFields` (`tournaments.map(ensureCycleFields)`; `ensureCycleFields(found)` para el actual) — así torneos legacy sin campos de ciclo no rompen.

**Verificá antes de seguir:** `npx tsc -b --noEmit` debe pasar (exit 0) tras este step. Si algún `Tournament` plano sigue asignándose a `Cycle`, el compilador lo marca — arreglalo envolviéndolo con `ensureCycleFields`/`toCycle`.

- [ ] **Step 3: Extraer helper de importancia local al store**

Agregar los imports (junto a los demás del store) y el helper cerca de `updateTournamentInState`. `KnockoutMatch` YA está importado en el store (línea 3); no re-importar.

```ts
import { getStageImportance } from '../core/engine';
import { getEngineConfig } from './useConfigStore';

/**
 * Peso Elo del partido según su etapa/ronda, leyendo la config actual del
 * engine. `round` solo aplica a partidos de knockout (los de grupo lo dejan
 * en undefined → getStageImportance usa el peso de la etapa sin ronda).
 */
function importanceFor(stage: string | undefined, round: KnockoutMatch['round'] | undefined): number {
  return getStageImportance(stage, round, getEngineConfig());
}
```

- [ ] **Step 4: Cablear importancia en las 3 sims existentes**

- `simulateMatch` (línea 619): reemplazar
  ```ts
  const result = simulateGroupMatch(homeTeam.skill, awayTeam.skill, disableHomeAdvantage);
  ```
  por
  ```ts
  const stageKey = stage === 'qualifier' ? 'qualifier' : 'world-cup-group';
  const importance = importanceFor(stageKey, undefined);
  const result = simulateGroupMatch(homeTeam.skill, awayTeam.skill, disableHomeAdvantage, importance);
  ```
- `simulateMatchdayBatch` (línea 831-832): igual, computar `importanceFor(stage === 'qualifier' ? 'qualifier' : 'world-cup-group', undefined)` y pasarlo como 4º arg de `simulateGroupMatch`.
- `simulateKnockoutMatch` (línea 1753): reemplazar
  ```ts
  const result = simulateMatchWithPenalties(homeTeam.skill, awayTeam.skill);
  ```
  por
  ```ts
  const importance = importanceFor('world-cup-knockout', (targetMatch as KnockoutMatch).round);
  const result = simulateMatchWithPenalties(homeTeam.skill, awayTeam.skill, true, importance);
  ```
  > Nota: hoy el knockout del Mundial pasa `disableHomeAdvantage` por defecto (`false`). El spec dice que el Mundial knockout es neutral; pasar `true` acá lo corrige (FU alineado con "sede neutral en eliminatorias"). Si se prefiere no cambiar comportamiento de goles en este plan, pasar el 2º arg como estaba (`simulateMatchWithPenalties(homeTeam.skill, awayTeam.skill, false, importance)`) y anotarlo. **Decisión del plan: pasar `true`** (neutral), consistente con el spec.

- [ ] **Step 5: NO agregar guard de enforcement a las sims existentes**

**No** agregar el guard `isMatchPlayable` a `simulateMatch`/`simulateMatchdayBatch`/`simulateKnockoutMatch` en esta tarea. Motivo (ver Global Constraints): 5A no implementa el auto-avance de jornada de clasificatorias/Mundial, así que un guard por jornada trabaría esas fases tras la jornada 1 y rompería el flujo actual de la app. Esas fases se siguen jugando como hoy. El enforcement de continental/confed vive en las acciones nuevas (Tarea 5), que ya traen su propio guard `isMatchPlayable`. El enforcement por jornada de las fases Mundial es del hub Match Center (5B). Dejar el `match.isPlayed` guard existente intacto.

- [ ] **Step 6: Gate + commit**

```bash
npx tsc -b --noEmit && npx eslint src/types/index.ts src/store/useTournamentStore.ts
git add src/types/index.ts src/store/useTournamentStore.ts
git commit -m "feat(store): type state as Cycle (toCycle/ensureCycleFields) + wire stage importance"
```

---

## Task 5: Store — acciones del ciclo (finas) sobre `core/cycle.ts`

**Files:**
- Modify: `src/types/index.ts` (interface `TournamentState`: declarar acciones nuevas)
- Modify: `src/store/useTournamentStore.ts`

**Gate:** `npx tsc -b --noEmit` + `npx eslint src/types/index.ts src/store/useTournamentStore.ts` + reviewer + smoke manual. **No node-testeable.**

**Interfaces:**
- Consumes: de `../core/cycle` → `drawContinentalStage`, `recordContinentalMatch`, `drawConfederationsStage`, `recordConfedGroupMatch`, `recordConfedKnockoutMatch`, tipos `KnockoutResult`, `GroupResult`. De `../core/engine` → `simulateMatchWithPenalties`, `updateTeamSkill` (ya importados). De `../core/calendar` → `isMatchPlayable` (importar; usado por los guards de las acciones nuevas).
- **Firmas exactas del core (verificadas en Tasks 2-3):** `recordConfedGroupMatch(cycle, matchId, result, teams)` = **4 args** (usa `teams` para standings); `recordConfedKnockoutMatch(cycle, matchId, result)` = **3 args** (SIN `teams` — se eliminó porque eslint de este repo flaggea args sin usar aunque tengan prefijo `_`). Respetá esas aridades en los call sites.
- `toCycle` ya se usa en Task 4 (`createNewTournament`); esta tarea NO lo llama.
- Produce (nuevas acciones en `TournamentState`):
  - `drawContinental: () => void`
  - `simulateContinentalMatch: (matchId: string) => Promise<void>`
  - `drawConfederations: () => void`
  - `simulateConfederationsMatch: (matchId: string) => Promise<void>`
  - `advanceToQualifiers: () => void`

- [ ] **Step 1: Declarar las acciones en `TournamentState`**

En `src/types/index.ts`, agregar a la interface (sección Actions):

```ts
  drawContinental: () => void;
  simulateContinentalMatch: (matchId: string) => Promise<void>;
  drawConfederations: () => void;
  simulateConfederationsMatch: (matchId: string) => Promise<void>;
  advanceToQualifiers: () => void;
```

- [ ] **Step 2: (ya hecho en Task 4)**

`createNewTournament` ya construye un `Cycle` vía `toCycle` (se movió a Task 4 para que el cambio de tipo compile). No hay nada que hacer acá; seguí al Step 3.

- [ ] **Step 3: `drawContinental` — sortear los 4 brackets**

```ts
drawContinental: () => {
  const state = get();
  const cycle = state.currentTournament;
  if (!cycle) return;
  const byRegion: Record<Region, Team[]> = { Europe: [], America: [], Africa: [], Asia: [] };
  for (const t of state.teams) byRegion[t.region].push(t);
  const updated = drawContinentalStage(cycle, byRegion);
  updateTournamentInState(set, get, updated);
},
```

- [ ] **Step 4: `simulateContinentalMatch` — RNG + importancia + registro puro**

```ts
simulateContinentalMatch: async (matchId: string) => {
  const state = get();
  const cycle = state.currentTournament;
  if (!cycle) return;
  if (state.isSavingMatch) return;
  if (!isMatchPlayable(cycle, matchId)) {
    console.warn(`⛔ Continental ${matchId} fuera de jornada.`);
    return;
  }
  // Localizar el match en los brackets:
  const all = Object.values(cycle.continental.brackets).flatMap((b): KnockoutMatch[] => [
    ...b.roundOf64, ...b.roundOf32, ...b.roundOf16, ...b.quarterFinals, ...b.semiFinals,
    ...(b.final ? [b.final] : []),
  ]);
  const match = all.find((m) => m.id === matchId);
  if (!match || match.isPlayed) return;
  const home = state.teams.find((t) => t.id === match.homeTeamId);
  const away = state.teams.find((t) => t.id === match.awayTeamId);
  if (!home || !away) return;

  set({ isSavingMatch: true });
  const importance = importanceFor('continental', match.round);
  const result = simulateMatchWithPenalties(home.skill, away.skill, true, importance);

  // Winner por goles; si empate, por penales.
  let winnerId = home.id, loserId = away.id;
  if (result.homeScore < result.awayScore) { winnerId = away.id; loserId = home.id; }
  else if (result.homeScore === result.awayScore && result.penalties) {
    if (result.penalties.awayScore > result.penalties.homeScore) { winnerId = away.id; loserId = home.id; }
  }
  const newHome = updateTeamSkill(home.skill, result.homeSkillChange);
  const newAway = updateTeamSkill(away.skill, result.awaySkillChange);
  const updatedTeams = state.teams.map((t) =>
    t.id === home.id ? { ...t, skill: newHome } : t.id === away.id ? { ...t, skill: newAway } : t,
  );

  const ko: KnockoutResult = {
    homeScore: result.homeScore, awayScore: result.awayScore, winnerId, loserId,
    penalties: result.penalties,
  };
  const updated = recordContinentalMatch(cycle, matchId, ko);
  set({ teams: updatedTeams });
  updateTournamentInState(set, get, updated);
  set({ isSavingMatch: false });
},
```

> El implementer debe seguir el patrón de persistencia de teams de `simulateKnockoutMatch` (líneas 1793-1832) si Supabase está configurado (`teamsService.batchUpdateTeams`). Los campos de ciclo (bracket) se persisten hoy solo vía `persist` local; la persistencia normalizada de continental es Plan 6. Mantenerlo best-effort y no bloquear el estado local con `await` de red.

- [ ] **Step 5: `drawConfederations` — armar finalistas + sortear grupos**

```ts
drawConfederations: () => {
  const state = get();
  const cycle = state.currentTournament;
  if (!cycle) return;
  if (!cycle.continental.isComplete) {
    console.warn('drawConfederations: la fase continental no está completa.');
    return;
  }
  const updated = drawConfederationsStage(cycle, state.teams);
  updateTournamentInState(set, get, updated);
},
```

- [ ] **Step 6: `simulateConfederationsMatch` — grupo o knockout según el partido**

```ts
simulateConfederationsMatch: async (matchId: string) => {
  const state = get();
  const cycle = state.currentTournament;
  if (!cycle || state.isSavingMatch) return;
  if (!isMatchPlayable(cycle, matchId)) {
    console.warn(`⛔ Confed ${matchId} fuera de jornada.`);
    return;
  }
  const conf = cycle.confederationsCup;
  const groupMatch = conf.groups.flatMap((g) => g.matches).find((m) => m.id === matchId);
  const koMatch = [
    ...conf.knockout.semiFinals,
    ...(conf.knockout.final ? [conf.knockout.final] : []),
    ...(conf.knockout.thirdPlace ? [conf.knockout.thirdPlace] : []),
  ].find((m) => m.id === matchId);
  const match = groupMatch ?? koMatch;
  if (!match || match.isPlayed) return;
  const home = state.teams.find((t) => t.id === match.homeTeamId);
  const away = state.teams.find((t) => t.id === match.awayTeamId);
  if (!home || !away) return;

  set({ isSavingMatch: true });
  const isKo = Boolean(koMatch);
  const importance = importanceFor(isKo ? 'confed-knockout' : 'confed-group', isKo ? (match as KnockoutMatch).round : undefined);
  const result = simulateMatchWithPenalties(home.skill, away.skill, true, importance);
  const newHome = updateTeamSkill(home.skill, result.homeSkillChange);
  const newAway = updateTeamSkill(away.skill, result.awaySkillChange);
  const updatedTeams = state.teams.map((t) =>
    t.id === home.id ? { ...t, skill: newHome } : t.id === away.id ? { ...t, skill: newAway } : t,
  );

  let updated;
  if (isKo) {
    let winnerId = home.id, loserId = away.id;
    if (result.homeScore < result.awayScore) { winnerId = away.id; loserId = home.id; }
    else if (result.homeScore === result.awayScore && result.penalties
             && result.penalties.awayScore > result.penalties.homeScore) { winnerId = away.id; loserId = home.id; }
    updated = recordConfedKnockoutMatch(cycle, matchId, {
      homeScore: result.homeScore, awayScore: result.awayScore, winnerId, loserId, penalties: result.penalties,
    }); // 3 args: recordConfedKnockoutMatch NO recibe teams
  } else {
    updated = recordConfedGroupMatch(cycle, matchId, {
      homeScore: result.homeScore, awayScore: result.awayScore,
    }, updatedTeams);
  }
  set({ teams: updatedTeams });
  updateTournamentInState(set, get, updated);
  set({ isSavingMatch: false });
},
```

- [ ] **Step 7: `advanceToQualifiers` — boundary confed → clasificatorias**

El sorteo de clasificatorias ya existe (`generateDrawAndFixtures`). Esta acción solo mueve el calendario a la fase de clasificatorias tras completar confed (el sorteo de grupos de clasificación se dispara con `generateDrawAndFixtures`, que ya está en el wizard):

```ts
advanceToQualifiers: () => {
  const state = get();
  const cycle = state.currentTournament;
  if (!cycle) return;
  if (!cycle.confederationsCup.isComplete) {
    console.warn('advanceToQualifiers: la Copa Confederaciones no está completa.');
    return;
  }
  updateTournamentInState(set, get, { ...cycle, calendar: { phase: 'wc-qualifiers', matchday: 1 } });
},
```

> Nota de wiring de calendario para fases Mundial existentes (fuera del alcance de simulación de esta tarea, pero necesario para que el enforcement de esas fases funcione): las transiciones `advanceToWorldCup`/`advanceToKnockout` deberían setear `calendar` a `{ phase:'wc-groups', matchday:1 }` y `{ phase:'wc-knockout', matchday:1 }` respectivamente, y el auto-avance de jornada de esas fases se maneja igual que continental/confed. **Para 5A**: agregar esos dos `calendar:` a las transiciones existentes (una línea cada una en el objeto que arma `updatedTournament`), sin reescribir su lógica. El auto-avance intra-fase de clasificatorias/Mundial-grupos (incrementar `calendar.matchday` al completar la jornada) puede quedar como follow-up de 5B/refinamiento si excede el alcance; anotarlo en el ledger. El objetivo mínimo de 5A es: continental y confed corren end-to-end con enforcement y auto-avance; las fases Mundial quedan tipadas y con calendario seteado en su boundary.

- [ ] **Step 8: Gate + commit**

```bash
npx tsc -b --noEmit && npx eslint src/types/index.ts src/store/useTournamentStore.ts
git add src/types/index.ts src/store/useTournamentStore.ts
git commit -m "feat(store): cycle actions (draw/simulate continental + confed, advance phases)"
```

---

## Verificación final (whole-branch review)

Tras la Tarea 5:
- `npx vitest run` — suite completa verde (los tests de `cycle.ts` cubren el motor puro; las tareas de store no agregan tests).
- `npx tsc -b --noEmit` — exit 0.
- `npx eslint src/core/cycle.ts src/core/__tests__/cycle.test.ts src/types/index.ts src/store/useTournamentStore.ts` — limpio.
- Smoke manual (`npm run dev`): crear ciclo nuevo → el estado tiene `continental`/`calendar`; jugar un grupo de clasificatorias existente sigue funcionando (no se rompió el flujo viejo).
- Dispatch del reviewer whole-branch (opus) sobre el rango del branch: foco en (1) pureza de `core/cycle.ts` (sin React/Zustand/Supabase/engine), (2) que el auto-avance de calendario no saltee fases (precondición de `getNextCalendarState`: nunca llamarla sobre una fase sin partidos generados), (3) que las sims existentes de clasificatorias/Mundial sigan funcionando sin cambios de flujo (solo se les agregó importancia, no guard), (4) sin `any` nuevos, (5) que el registro puro no re-estampe `stage`.

## Follow-ups a arrastrar

- **5B (vistas + jsdom)**: `ContinentalView`, `ConfederationsCupView`, Match Center como hub del calendario (mostrar solo jornada actual, bloquear futuras), steps del wizard (Continental/Confed), router en `App.tsx`. Agregar `jsdom` + `@testing-library/react` + ampliar `include` a `.tsx`.
- **Auto-avance intra-fase de clasificatorias/Mundial-grupos** (si no entró en 5A): incrementar `calendar.matchday` al completar cada jornada de esas fases.
- **Plan 6 (persistencia Supabase)**: migración `008`, `continentalService`/`confederationsService`, persistir campos de ciclo, borrar datos viejos.
- **Batch continental/confed** (`simulateCurrentMatchday`) para "Simular jornada" en Match Center — puede vivir en 5B.
