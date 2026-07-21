# Ciclo — Plan 1: Fundación (modelo `Cycle` + motor de calendario puro)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Definir los tipos del Ciclo de 4 años y un motor de calendario **puro** (`src/core/calendar.ts`) que sepa, dado un `Cycle`, qué partidos son jugables ahora, si la jornada actual está completa y cuál es la próxima jornada/fase — sin tocar React ni Supabase.

**Architecture:** El `Cycle` extiende el `Tournament` existente agregando `continental`, `confederationsCup` y un puntero `calendar: { phase, matchday }`. El motor de calendario es un módulo puro (como `engine.ts`/`scheduler.ts`) que lee esas estructuras y expone funciones de solo-lectura + un planificador de avance. La generación de partidos, la persistencia y la UI son planes posteriores; este plan se testea con fixtures sintéticos.

**Tech Stack:** TypeScript, Vitest. Sin dependencias nuevas.

## Global Constraints

- **TDD con Vitest**, un test que falla antes de cada implementación. Comando base: `npx vitest run <archivo>`.
- **`src/core/` es puro**: prohibido importar React, Zustand o Supabase en `calendar.ts`.
- **Sin dependencias nuevas** (no instalar librerías).
- **Inmutabilidad**: las funciones no mutan el `Cycle` que reciben; devuelven valores nuevos.
- **Seguir los tipos existentes** de `src/types/index.ts`; no duplicar `EngineConfig` (se reexporta del config store).
- `Match.stage` es `string` libre; los nuevos valores son `'continental' | 'confed-group' | 'confed-knockout'` (además de los existentes `'qualifier' | 'world-cup-group' | 'world-cup-knockout'`).
- **Este es el Plan 1 de una secuencia de 6** (Fundación → Pesos Elo → Continental → Copa Confederaciones → Enforcement/UI → Persistencia). Solo cubre las secciones **4 (modelo)** y **5 (motor de calendario, parte pura)** del spec `docs/superpowers/specs/2026-07-21-ciclo-continental-confederaciones-calendario-design.md`.

## File Structure

- **Modificar** `src/types/index.ts` — agrega `'round-of-64'` a `KnockoutMatch.round` y define `CyclePhase`, `CalendarState`, `ContinentalBracket`, `ContinentalStage`, `ConfederationsCup`, `Cycle`.
- **Crear** `src/core/calendar.ts` — motor de calendario puro (lectura + planificador de avance).
- **Crear** `src/core/__tests__/calendar.fixtures.ts` — builders de `Cycle`/brackets/partidos para tests (reutilizable por planes posteriores).
- **Crear** `src/core/__tests__/calendar.test.ts` — tests del motor de calendario.

---

### Task 1: Tipos del Ciclo + builders de fixtures

**Files:**
- Modify: `src/types/index.ts` (union `KnockoutMatch.round` en línea 60; agregados nuevos al final del archivo, antes de `MatchResult`)
- Create: `src/core/__tests__/calendar.fixtures.ts`
- Test: `src/core/__tests__/calendar.fixtures.test.ts`

**Interfaces:**
- Produces (tipos): `CyclePhase`, `CalendarState`, `ContinentalBracket`, `ContinentalStage`, `ConfederationsCup`, `Cycle`; `KnockoutMatch.round` ahora incluye `'round-of-64'`.
- Produces (fixtures): `REGIONS: Region[]`, `makeMatch(id, matchday, isPlayed?, stage?)`, `makeKnockoutMatch(id, round, matchday, isPlayed?, stage?)`, `makeEmptyBracket(region)`, `makeContinentalStage(overrides?)`, `makeConfederationsCup()`, `makeCycle(overrides?)`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/core/__tests__/calendar.fixtures.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeCycle, makeEmptyBracket, REGIONS } from './calendar.fixtures';

describe('calendar fixtures', () => {
  it('makeCycle arranca en la fase continental, jornada 1', () => {
    const cycle = makeCycle();
    expect(cycle.calendar).toEqual({ phase: 'continental', matchday: 1 });
    expect(Object.keys(cycle.continental.brackets)).toHaveLength(4);
    expect(cycle.confederationsCup.groups).toEqual([]);
    expect(cycle.worldCup).toBeNull();
  });

  it('makeEmptyBracket crea un bracket vacío para la región dada', () => {
    const b = makeEmptyBracket('Europe');
    expect(b.region).toBe('Europe');
    expect(b.roundOf64).toEqual([]);
    expect(b.final).toBeNull();
    expect(b.byeTeamIds).toEqual([]);
  });

  it('REGIONS tiene las 4 confederaciones', () => {
    expect(REGIONS).toEqual(['Europe', 'America', 'Africa', 'Asia']);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/core/__tests__/calendar.fixtures.test.ts`
Expected: FAIL — `Cannot find module './calendar.fixtures'` (o error de tipos porque los tipos del Cycle todavía no existen).

- [ ] **Step 3: Agregar los tipos del Ciclo**

En `src/types/index.ts`, cambiar la línea 60 (union de `round`) para incluir `'round-of-64'`:

```ts
  round: 'round-of-64' | 'round-of-32' | 'round-of-16' | 'quarter' | 'semi' | 'third-place' | 'final';
```

Y agregar, justo antes del bloque `export type { EngineConfig } ...` (línea ~141):

```ts
/** Fase activa del ciclo (puntero de calendario). */
export type CyclePhase =
  | 'continental'
  | 'confed'
  | 'wc-qualifiers'
  | 'wc-groups'
  | 'wc-knockout'
  | 'completed';

/** Puntero del calendario global dentro del ciclo. */
export interface CalendarState {
  phase: CyclePhase;
  matchday: number; // 1-based: jornada/ronda actual dentro de la fase
}

/** Bracket de eliminación directa de un torneo continental (arranca en R64). */
export interface ContinentalBracket {
  region: Region;
  roundOf64: KnockoutMatch[]; // solo los cruces reales; los byes no generan partido
  roundOf32: KnockoutMatch[];
  roundOf16: KnockoutMatch[];
  quarterFinals: KnockoutMatch[];
  semiFinals: KnockoutMatch[];
  final: KnockoutMatch | null;
  championId?: string; // finalista 1 (campeón)
  runnerUpId?: string; // finalista 2 (subcampeón)
  byeTeamIds: string[]; // cabezas de serie con bye directo a R32
}

/** Los 4 brackets continentales de una edición del ciclo. */
export interface ContinentalStage {
  brackets: Record<Region, ContinentalBracket>;
  isComplete: boolean;
}

/** Copa Confederaciones: 2 grupos de 4 + semis/3er puesto/final. */
export interface ConfederationsCup {
  groups: WorldCupGroup[]; // 2 grupos de 4 (una selección por confederación por grupo)
  knockout: {
    semiFinals: KnockoutMatch[]; // 1ºA-2ºB, 1ºB-2ºA
    thirdPlace: KnockoutMatch | null;
    final: KnockoutMatch | null;
  };
  championId?: string;
  isComplete: boolean;
}

/** Ciclo de 4 años: extiende el Tournament con las fases previas y el calendario. */
export interface Cycle extends Tournament {
  continental: ContinentalStage;
  confederationsCup: ConfederationsCup;
  calendar: CalendarState;
}
```

- [ ] **Step 4: Crear los builders de fixtures**

Crear `src/core/__tests__/calendar.fixtures.ts`:

```ts
import type {
  Cycle,
  ContinentalBracket,
  ContinentalStage,
  ConfederationsCup,
  KnockoutMatch,
  Match,
  Region,
} from '../../types';

export const REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

export function makeMatch(
  id: string,
  matchday: number,
  isPlayed = false,
  stage = 'continental',
): Match {
  return {
    id,
    homeTeamId: `${id}-h`,
    awayTeamId: `${id}-a`,
    homeScore: isPlayed ? 1 : null,
    awayScore: isPlayed ? 0 : null,
    isPlayed,
    stage,
    matchday,
  };
}

export function makeKnockoutMatch(
  id: string,
  round: KnockoutMatch['round'],
  matchday: number,
  isPlayed = false,
  stage = 'continental',
): KnockoutMatch {
  return { ...makeMatch(id, matchday, isPlayed, stage), round };
}

export function makeEmptyBracket(region: Region): ContinentalBracket {
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

export function makeContinentalStage(
  overrides: Partial<Record<Region, ContinentalBracket>> = {},
): ContinentalStage {
  const brackets = {} as Record<Region, ContinentalBracket>;
  for (const r of REGIONS) brackets[r] = overrides[r] ?? makeEmptyBracket(r);
  return { brackets, isComplete: false };
}

export function makeConfederationsCup(): ConfederationsCup {
  return {
    groups: [],
    knockout: { semiFinals: [], thirdPlace: null, final: null },
    isComplete: false,
  };
}

export function makeCycle(overrides: Partial<Cycle> = {}): Cycle {
  const base: Cycle = {
    id: 'cycle-1',
    name: 'Ciclo 2026',
    year: 2026,
    qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
    worldCup: null,
    isQualifiersComplete: false,
    hasAnyMatchPlayed: false,
    continental: makeContinentalStage(),
    confederationsCup: makeConfederationsCup(),
    calendar: { phase: 'continental', matchday: 1 },
  };
  return { ...base, ...overrides };
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npx vitest run src/core/__tests__/calendar.fixtures.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Verificar que el proyecto sigue tipando**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/core/__tests__/calendar.fixtures.ts src/core/__tests__/calendar.fixtures.test.ts
git commit -m "feat(types): modelo Cycle (continental, confederaciones, calendario) + fixtures"
```

---

### Task 2: `getPhaseMatches` y `getMatchdayMatches`

**Files:**
- Create: `src/core/calendar.ts`
- Test: `src/core/__tests__/calendar.test.ts`

**Interfaces:**
- Consumes: tipos y fixtures de Task 1.
- Produces: `CYCLE_PHASE_ORDER: CyclePhase[]`; `getPhaseMatches(cycle: Cycle, phase: CyclePhase): Match[]`; `getMatchdayMatches(cycle: Cycle, phase: CyclePhase, matchday: number): Match[]`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/core/__tests__/calendar.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Cycle } from '../../types';
import { getPhaseMatches, getMatchdayMatches } from '../calendar';
import {
  makeCycle,
  makeContinentalStage,
  makeEmptyBracket,
  makeKnockoutMatch,
} from './calendar.fixtures';

function continentalCycle(): Cycle {
  const europe = makeEmptyBracket('Europe');
  europe.roundOf64 = [
    makeKnockoutMatch('eu-r64-1', 'round-of-64', 1),
    makeKnockoutMatch('eu-r64-2', 'round-of-64', 1, true),
  ];
  europe.roundOf32 = [makeKnockoutMatch('eu-r32-1', 'round-of-32', 2)];
  return makeCycle({ continental: makeContinentalStage({ Europe: europe }) });
}

describe('getPhaseMatches', () => {
  it('junta todos los partidos de los brackets continentales', () => {
    const cycle = continentalCycle();
    const ids = getPhaseMatches(cycle, 'continental').map((m) => m.id);
    expect(ids.sort()).toEqual(['eu-r32-1', 'eu-r64-1', 'eu-r64-2']);
  });

  it('devuelve [] para una fase sin datos', () => {
    expect(getPhaseMatches(makeCycle(), 'wc-groups')).toEqual([]);
    expect(getPhaseMatches(makeCycle(), 'completed')).toEqual([]);
  });
});

describe('getMatchdayMatches', () => {
  it('filtra por número de jornada dentro de la fase', () => {
    const cycle = continentalCycle();
    const md1 = getMatchdayMatches(cycle, 'continental', 1).map((m) => m.id);
    const md2 = getMatchdayMatches(cycle, 'continental', 2).map((m) => m.id);
    expect(md1.sort()).toEqual(['eu-r64-1', 'eu-r64-2']);
    expect(md2).toEqual(['eu-r32-1']);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/core/__tests__/calendar.test.ts`
Expected: FAIL — `Cannot find module '../calendar'`.

- [ ] **Step 3: Implementar `calendar.ts` (parte 1)**

Crear `src/core/calendar.ts`:

```ts
import type {
  Cycle,
  CyclePhase,
  ContinentalBracket,
  KnockoutBracket,
  Match,
} from '../types';

/** Orden fijo de fases del ciclo. `'completed'` es el estado terminal. */
export const CYCLE_PHASE_ORDER: CyclePhase[] = [
  'continental',
  'confed',
  'wc-qualifiers',
  'wc-groups',
  'wc-knockout',
  'completed',
];

function bracketMatches(b: ContinentalBracket): Match[] {
  return [
    ...b.roundOf64,
    ...b.roundOf32,
    ...b.roundOf16,
    ...b.quarterFinals,
    ...b.semiFinals,
    ...(b.final ? [b.final] : []),
  ];
}

function knockoutMatches(k: KnockoutBracket): Match[] {
  return [
    ...k.roundOf32,
    ...k.roundOf16,
    ...k.quarterFinals,
    ...k.semiFinals,
    ...(k.thirdPlace ? [k.thirdPlace] : []),
    ...(k.final ? [k.final] : []),
  ];
}

/** Todos los partidos que pertenecen a una fase del ciclo, aplanados. */
export function getPhaseMatches(cycle: Cycle, phase: CyclePhase): Match[] {
  switch (phase) {
    case 'continental':
      return Object.values(cycle.continental.brackets).flatMap(bracketMatches);
    case 'confed': {
      const c = cycle.confederationsCup;
      const groupMatches = c.groups.flatMap((g) => g.matches);
      const ko = [
        ...c.knockout.semiFinals,
        ...(c.knockout.thirdPlace ? [c.knockout.thirdPlace] : []),
        ...(c.knockout.final ? [c.knockout.final] : []),
      ];
      return [...groupMatches, ...ko];
    }
    case 'wc-qualifiers':
      return Object.values(cycle.qualifiers)
        .flat()
        .flatMap((g) => g.matches);
    case 'wc-groups':
      return cycle.worldCup ? cycle.worldCup.groups.flatMap((g) => g.matches) : [];
    case 'wc-knockout':
      return cycle.worldCup ? knockoutMatches(cycle.worldCup.knockout) : [];
    case 'completed':
      return [];
  }
}

/** Partidos de una jornada concreta dentro de una fase. */
export function getMatchdayMatches(
  cycle: Cycle,
  phase: CyclePhase,
  matchday: number,
): Match[] {
  return getPhaseMatches(cycle, phase).filter((m) => (m.matchday ?? 0) === matchday);
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/core/__tests__/calendar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/calendar.ts src/core/__tests__/calendar.test.ts
git commit -m "feat(calendar): getPhaseMatches y getMatchdayMatches"
```

---

### Task 3: `getPlayableMatches` e `isMatchPlayable`

**Files:**
- Modify: `src/core/calendar.ts`
- Test: `src/core/__tests__/calendar.test.ts`

**Interfaces:**
- Consumes: `getMatchdayMatches`, `cycle.calendar`.
- Produces: `getPlayableMatches(cycle: Cycle): Match[]` (jornada actual, no jugados); `isMatchPlayable(cycle: Cycle, matchId: string): boolean`.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `src/core/__tests__/calendar.test.ts`:

```ts
import { getPlayableMatches, isMatchPlayable } from '../calendar';

describe('getPlayableMatches / isMatchPlayable', () => {
  it('solo devuelve partidos no jugados de la jornada actual', () => {
    const cycle = continentalCycle(); // calendar en continental / matchday 1
    const ids = getPlayableMatches(cycle).map((m) => m.id);
    expect(ids).toEqual(['eu-r64-1']); // eu-r64-2 ya está jugado
  });

  it('isMatchPlayable es true solo para partidos de la jornada actual sin jugar', () => {
    const cycle = continentalCycle();
    expect(isMatchPlayable(cycle, 'eu-r64-1')).toBe(true); // jornada 1, sin jugar
    expect(isMatchPlayable(cycle, 'eu-r64-2')).toBe(false); // jornada 1, ya jugado
    expect(isMatchPlayable(cycle, 'eu-r32-1')).toBe(false); // jornada 2 (futura)
    expect(isMatchPlayable(cycle, 'inexistente')).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/core/__tests__/calendar.test.ts`
Expected: FAIL — `getPlayableMatches`/`isMatchPlayable` no exportados.

- [ ] **Step 3: Implementar en `calendar.ts`**

Agregar al final de `src/core/calendar.ts`:

```ts
/** Partidos jugables ahora: fase y jornada actuales del calendario, sin jugar. */
export function getPlayableMatches(cycle: Cycle): Match[] {
  const { phase, matchday } = cycle.calendar;
  return getMatchdayMatches(cycle, phase, matchday).filter((m) => !m.isPlayed);
}

/** Un partido es jugable si está en la jornada actual y todavía no se jugó. */
export function isMatchPlayable(cycle: Cycle, matchId: string): boolean {
  const { phase, matchday } = cycle.calendar;
  return getMatchdayMatches(cycle, phase, matchday).some(
    (m) => m.id === matchId && !m.isPlayed,
  );
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/core/__tests__/calendar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/calendar.ts src/core/__tests__/calendar.test.ts
git commit -m "feat(calendar): getPlayableMatches e isMatchPlayable"
```

---

### Task 4: `getPhaseMatchdayCount` e `isCurrentMatchdayComplete`

**Files:**
- Modify: `src/core/calendar.ts`
- Test: `src/core/__tests__/calendar.test.ts`

**Interfaces:**
- Consumes: `getPhaseMatches`, `getMatchdayMatches`, `cycle.calendar`.
- Produces: `getPhaseMatchdayCount(cycle: Cycle, phase: CyclePhase): number` (mayor `matchday` presente; 0 si no hay partidos); `isCurrentMatchdayComplete(cycle: Cycle): boolean` (jornada actual con partidos y todos jugados).

- [ ] **Step 1: Escribir el test que falla**

Agregar a `src/core/__tests__/calendar.test.ts`:

```ts
import { getPhaseMatchdayCount, isCurrentMatchdayComplete } from '../calendar';

describe('getPhaseMatchdayCount', () => {
  it('devuelve el mayor número de jornada de la fase', () => {
    const cycle = continentalCycle(); // jornadas 1 y 2
    expect(getPhaseMatchdayCount(cycle, 'continental')).toBe(2);
  });

  it('devuelve 0 para una fase sin partidos', () => {
    expect(getPhaseMatchdayCount(makeCycle(), 'wc-groups')).toBe(0);
  });
});

describe('isCurrentMatchdayComplete', () => {
  it('es false si algún partido de la jornada actual sigue sin jugar', () => {
    const cycle = continentalCycle(); // eu-r64-1 sin jugar
    expect(isCurrentMatchdayComplete(cycle)).toBe(false);
  });

  it('es true cuando todos los partidos de la jornada actual están jugados', () => {
    const europe = makeEmptyBracket('Europe');
    europe.roundOf64 = [
      makeKnockoutMatch('eu-r64-1', 'round-of-64', 1, true),
      makeKnockoutMatch('eu-r64-2', 'round-of-64', 1, true),
    ];
    const cycle = makeCycle({ continental: makeContinentalStage({ Europe: europe }) });
    expect(isCurrentMatchdayComplete(cycle)).toBe(true);
  });

  it('es false si la jornada actual no tiene partidos', () => {
    expect(isCurrentMatchdayComplete(makeCycle())).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/core/__tests__/calendar.test.ts`
Expected: FAIL — funciones no exportadas.

- [ ] **Step 3: Implementar en `calendar.ts`**

Agregar al final de `src/core/calendar.ts`:

```ts
/** Cantidad de jornadas de una fase = mayor `matchday` presente (0 si vacía). */
export function getPhaseMatchdayCount(cycle: Cycle, phase: CyclePhase): number {
  const matchdays = getPhaseMatches(cycle, phase).map((m) => m.matchday ?? 0);
  return matchdays.length ? Math.max(...matchdays) : 0;
}

/** ¿Están jugados todos los partidos de la jornada actual? (false si no hay). */
export function isCurrentMatchdayComplete(cycle: Cycle): boolean {
  const { phase, matchday } = cycle.calendar;
  const matches = getMatchdayMatches(cycle, phase, matchday);
  return matches.length > 0 && matches.every((m) => m.isPlayed);
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/core/__tests__/calendar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/calendar.ts src/core/__tests__/calendar.test.ts
git commit -m "feat(calendar): getPhaseMatchdayCount e isCurrentMatchdayComplete"
```

---

### Task 5: `getNextCalendarState` (planificador de avance puro)

**Files:**
- Modify: `src/core/calendar.ts`
- Test: `src/core/__tests__/calendar.test.ts`

**Interfaces:**
- Consumes: `CYCLE_PHASE_ORDER`, `getPhaseMatchdayCount`, `cycle.calendar`.
- Produces: `getNextCalendarState(cycle: Cycle): CalendarState` — dentro de la fase incrementa `matchday`; al terminar la última jornada de la fase pasa a la fase siguiente en `matchday: 1`; desde `'wc-knockout'` pasa a `'completed'` (`matchday: 0`); `'completed'` es idempotente. **Supone que la fase actual ya tiene sus partidos generados** (la generación y la persistencia las hace el store en planes posteriores).

- [ ] **Step 1: Escribir el test que falla**

Agregar a `src/core/__tests__/calendar.test.ts`:

```ts
import { getNextCalendarState } from '../calendar';

describe('getNextCalendarState', () => {
  it('avanza de jornada dentro de la misma fase', () => {
    const cycle = continentalCycle(); // continental, matchday 1, count 2
    expect(getNextCalendarState(cycle)).toEqual({ phase: 'continental', matchday: 2 });
  });

  it('al terminar la última jornada pasa a la fase siguiente en jornada 1', () => {
    const cycle = { ...continentalCycle(), calendar: { phase: 'continental' as const, matchday: 2 } };
    expect(getNextCalendarState(cycle)).toEqual({ phase: 'confed', matchday: 1 });
  });

  it('desde wc-knockout (última jornada) pasa a completed', () => {
    const cycle = makeCycle({ calendar: { phase: 'wc-knockout', matchday: 1 } });
    // sin partidos en wc-knockout → count 0 → se considera terminada
    expect(getNextCalendarState(cycle)).toEqual({ phase: 'completed', matchday: 0 });
  });

  it('completed es idempotente', () => {
    const cycle = makeCycle({ calendar: { phase: 'completed', matchday: 0 } });
    expect(getNextCalendarState(cycle)).toEqual({ phase: 'completed', matchday: 0 });
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/core/__tests__/calendar.test.ts`
Expected: FAIL — `getNextCalendarState` no exportado.

- [ ] **Step 3: Implementar en `calendar.ts`**

Agregar al final de `src/core/calendar.ts` (usa `CalendarState`, agregarlo al import de tipos):

```ts
/**
 * Próximo estado del calendario. Dentro de la fase avanza de jornada; al
 * completar la última jornada salta a la fase siguiente en jornada 1;
 * `'wc-knockout'` desemboca en `'completed'`. Función pura: no genera
 * partidos ni persiste (eso lo hace el store al ejecutar la transición).
 */
export function getNextCalendarState(cycle: Cycle): CalendarState {
  const { phase, matchday } = cycle.calendar;
  if (phase === 'completed') return { phase, matchday };

  const count = getPhaseMatchdayCount(cycle, phase);
  if (matchday < count) return { phase, matchday: matchday + 1 };

  const nextPhase = CYCLE_PHASE_ORDER[CYCLE_PHASE_ORDER.indexOf(phase) + 1] ?? 'completed';
  return { phase: nextPhase, matchday: nextPhase === 'completed' ? 0 : 1 };
}
```

Actualizar la primera línea de imports de `calendar.ts` para incluir `CalendarState`:

```ts
import type {
  CalendarState,
  Cycle,
  CyclePhase,
  ContinentalBracket,
  KnockoutBracket,
  Match,
} from '../types';
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/core/__tests__/calendar.test.ts`
Expected: PASS.

- [ ] **Step 5: Correr toda la suite y el typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: toda la suite en verde, sin errores de tipos.

- [ ] **Step 6: Commit**

```bash
git add src/core/calendar.ts src/core/__tests__/calendar.test.ts
git commit -m "feat(calendar): getNextCalendarState (planificador de avance puro)"
```

---

## Self-Review

**Spec coverage (Plan 1 cubre spec §4 y §5-parte-pura):**
- §4 Modelo de datos → Task 1 (tipos `Cycle`, `ContinentalBracket`, `ContinentalStage`, `ConfederationsCup`, `CalendarState`, `'round-of-64'`). ✓
- §5 Motor de calendario (lectura + planificador) → Tasks 2-5 (`getPlayableMatches`, `isMatchPlayable`, `isCurrentMatchdayComplete`, `getNextCalendarState`). ✓
- §5 Transiciones de fase con generación/persistencia → **fuera de alcance** (store, Plan 5). El planificador puro (`getNextCalendarState`) deja el punto de enganche listo.

**Cobertura del resto del spec (planes siguientes):**
- Plan 2: §8 Pesos de Elo por etapa.
- Plan 3: §3 y §6 Torneos continentales (generación de bracket con byes/bombos + render).
- Plan 4: §7 Copa Confederaciones (sorteo con restricción + grupos + KO + render).
- Plan 5: §9 Enforcement + Match Center + TournamentWizard + transiciones de fase (store).
- Plan 6: §10 Persistencia (migración 008 + servicios + borrado de datos viejos).

**Placeholder scan:** sin TBD/TODO; todo el código está completo en cada step. ✓

**Type consistency:** nombres consistentes entre tasks — `getPhaseMatches`, `getMatchdayMatches`, `getPlayableMatches`, `isMatchPlayable`, `getPhaseMatchdayCount`, `isCurrentMatchdayComplete`, `getNextCalendarState`, `CYCLE_PHASE_ORDER`; fixtures `makeCycle`/`makeContinentalStage`/`makeEmptyBracket`/`makeKnockoutMatch`. `CalendarState` importado en Task 5. ✓
