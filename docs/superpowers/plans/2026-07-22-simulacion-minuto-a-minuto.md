# Simulación de partidos minuto a minuto — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir ver cualquier partido individual jugarse minuto a minuto (marcador + reloj + goles), como capa visual sobre el resultado que ya decide el motor actual.

**Architecture:** *Commit-then-replay*: "Ver en vivo" ejecuta la misma acción `simulate*` de siempre (el motor Elo/Poisson decide y persiste el resultado), y luego un overlay reproduce ese resultado repartiendo los goles en minutos plausibles. Cero divergencia, motor y persistencia intactos. Piezas: una función pura de timeline (`core/liveMatch.ts`), un store controlador (`useLiveMatchStore`), un hook de reloj/revelado (`useLiveMatchPlayback`), un modal global (`LiveMatchModal`) y un botón reutilizable (`WatchLiveButton`) cableado en cada vista.

**Tech Stack:** React + TypeScript + Zustand + Vitest (jsdom + @testing-library/react, disponibles desde el Plan 5B). Componentes UI: `Button`, `TeamFlag`. Iconos: `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-07-22-simulacion-minuto-a-minuto-design.md`

## Global Constraints

- **Motor y persistencia intactos:** el modo vivo NO tira el motor una segunda vez ni recalcula skills. Reproduce exactamente el `SimulatedMatchOutcome` que devuelve la acción `simulate*`.
- **Determinismo en código puro:** nada de `Math.random`/`Date.now` en el camino testeado de `buildMatchTimeline` (se usa un `rng` inyectable, default `mulberry32(seed)`); los tests del hook usan **fake timers**.
- **Gate real del repo:** `npx tsc -b` (exit 0) **y** `npx eslint <archivos-tocados>` sin nuevos errores. El lint de base ya está roto (~106 `no-explicit-any` en archivos ajenos): **no introducir** nuevos `any` ni variables/args sin usar (eslint los flaggea aunque tengan prefijo `_`).
- **Suite:** 156 tests hoy; todo test nuevo debe pasar y ninguno existente romperse (`npx vitest run`).
- **Idioma:** UI y comentarios en español con tildes correctas. Textos fijos: "Ver en vivo", "Saltar al final", "Simulando…", "Penales", "Cerrar", "En vivo".
- **Tema retro:** clases `font-arcade`/`font-terminal`, colores `gold`/`grass`/`grass-soft`/`grass-dark`/`led`/`night`/`line`, y el componente `Button` (variants `primary`/`outline`/`ghost`).
- **Firmas de acciones:** las 4 `simulate*` pasan de `Promise<void>` a `Promise<SimulatedMatchOutcome | null>`. Los llamadores existentes ignoran el retorno (compatibles).

---

## File Structure

**Crear:**
- `src/core/liveMatch.ts` — función pura de timeline + PRNG sembrado + tipos de eventos.
- `src/core/__tests__/liveMatch.test.ts` — tests de `buildMatchTimeline`/`hashSeed`.
- `src/store/useLiveMatchStore.ts` — store controlador + tipos `LiveMatchDescriptor`/`LiveMatchKind`/`SimulatedMatchOutcome`.
- `src/store/__tests__/useLiveMatchStore.test.ts` — test de open/close.
- `src/hooks/useLiveMatchPlayback.ts` — hook de reloj y revelado.
- `src/hooks/__tests__/useLiveMatchPlayback.test.ts` — tests con fake timers.
- `src/components/tournament/LiveMatchModal.tsx` — overlay global.
- `src/components/tournament/__tests__/LiveMatchModal.test.tsx` — render + skip.
- `src/components/tournament/WatchLiveButton.tsx` — botón reutilizable.
- `src/components/tournament/__tests__/WatchLiveButton.test.tsx` — click → openLiveMatch.

**Modificar:**
- `src/types/index.ts` — firmas de las 4 acciones en `TournamentState` + `SimulatedMatchOutcome`.
- `src/store/useTournamentStore.ts` — retorno de las 4 acciones `simulate*`.
- `src/App.tsx` — montar `<LiveMatchModal />`.
- `src/components/tournament/ContinentalView.tsx`, `ConfederationsCupView.tsx`, `KnockoutView.tsx`, `GroupDetailModal.tsx`, `RegionView.tsx`, `WorldCupGridView.tsx`, `GroupView.tsx`, `MatchCenter.tsx` — agregar `WatchLiveButton`.

---

## Task 1: Motor de timeline puro (`core/liveMatch.ts`)

**Files:**
- Create: `src/core/liveMatch.ts`
- Test: `src/core/__tests__/liveMatch.test.ts`

**Interfaces:**
- Produces:
  - `type LiveSide = 'home' | 'away'`
  - `interface LiveGoalEvent { minute: number; side: LiveSide; homeScore: number; awayScore: number }`
  - `interface LivePenaltiesResult { homeScore: number; awayScore: number }`
  - `interface LiveTimeline { goals: LiveGoalEvent[]; finalHomeScore: number; finalAwayScore: number; penalties?: LivePenaltiesResult }`
  - `function hashSeed(input: string): number`
  - `function buildMatchTimeline(homeScore: number, awayScore: number, seed: number, penalties?: LivePenaltiesResult, rng?: () => number): LiveTimeline`

- [ ] **Step 1: Write the failing test**

Create `src/core/__tests__/liveMatch.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildMatchTimeline, hashSeed } from '../liveMatch';

// rng determinista que devuelve valores de una secuencia (cicla si se agota)
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('hashSeed', () => {
  it('es determinista para el mismo string', () => {
    expect(hashSeed('match-1')).toBe(hashSeed('match-1'));
  });
  it('difiere para strings distintos', () => {
    expect(hashSeed('match-1')).not.toBe(hashSeed('match-2'));
  });
});

describe('buildMatchTimeline', () => {
  it('0-0 produce timeline vacío', () => {
    const tl = buildMatchTimeline(0, 0, 123);
    expect(tl.goals).toEqual([]);
    expect(tl.finalHomeScore).toBe(0);
    expect(tl.finalAwayScore).toBe(0);
  });

  it('el total y el conteo por lado coinciden con el marcador', () => {
    const tl = buildMatchTimeline(3, 2, hashSeed('m'));
    expect(tl.goals).toHaveLength(5);
    expect(tl.goals.filter((g) => g.side === 'home')).toHaveLength(3);
    expect(tl.goals.filter((g) => g.side === 'away')).toHaveLength(2);
    expect(tl.finalHomeScore).toBe(3);
    expect(tl.finalAwayScore).toBe(2);
  });

  it('todos los minutos están en [1, 90] y ordenados ascendente', () => {
    const tl = buildMatchTimeline(4, 4, hashSeed('x'));
    for (const g of tl.goals) {
      expect(g.minute).toBeGreaterThanOrEqual(1);
      expect(g.minute).toBeLessThanOrEqual(90);
    }
    const minutes = tl.goals.map((g) => g.minute);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
  });

  it('el marcador acumulado del último evento coincide con el final', () => {
    const tl = buildMatchTimeline(2, 3, hashSeed('y'));
    const last = tl.goals[tl.goals.length - 1];
    expect(last.homeScore).toBe(2);
    expect(last.awayScore).toBe(3);
  });

  it('es determinista para la misma (marcador, seed)', () => {
    const a = buildMatchTimeline(3, 1, 999);
    const b = buildMatchTimeline(3, 1, 999);
    expect(a).toEqual(b);
  });

  it('pasa las penales sin tocarlas', () => {
    const tl = buildMatchTimeline(1, 1, 5, { homeScore: 4, awayScore: 3 });
    expect(tl.penalties).toEqual({ homeScore: 4, awayScore: 3 });
  });

  it('con rng inyectado ubica los goles en minutos calculables', () => {
    // rng=0 → minute = 1 + floor(0*90) = 1 para todos
    const tl = buildMatchTimeline(1, 1, 0, undefined, seqRng([0, 0]));
    expect(tl.goals.map((g) => g.minute)).toEqual([1, 1]);
    // tie-break estable: el gol local (encolado primero) va antes que el visitante
    expect(tl.goals[0].side).toBe('home');
    expect(tl.goals[1].side).toBe('away');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/__tests__/liveMatch.test.ts`
Expected: FAIL — `Cannot find module '../liveMatch'` / `buildMatchTimeline is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/core/liveMatch.ts`:

```ts
export type LiveSide = 'home' | 'away';

export interface LiveGoalEvent {
  minute: number; // 1..90
  side: LiveSide;
  homeScore: number; // marcador acumulado tras este gol
  awayScore: number;
}

export interface LivePenaltiesResult {
  homeScore: number;
  awayScore: number;
}

export interface LiveTimeline {
  goals: LiveGoalEvent[]; // ordenados ascendente por minuto
  finalHomeScore: number;
  finalAwayScore: number;
  penalties?: LivePenaltiesResult;
}

/** Hash FNV-1a determinista de un string a uint32, para sembrar el PRNG. */
export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** PRNG mulberry32 sembrado: puro y determinista. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Reparte `homeScore`+`awayScore` goles en minutos plausibles [1,90] y arma el
 * timeline con el marcador acumulado. Determinista dado (marcador, seed).
 * `rng` inyectable para tests. No recalcula nada del resultado.
 */
export function buildMatchTimeline(
  homeScore: number,
  awayScore: number,
  seed: number,
  penalties?: LivePenaltiesResult,
  rng: () => number = mulberry32(seed),
): LiveTimeline {
  const pending: { minute: number; side: LiveSide }[] = [];
  for (let i = 0; i < homeScore; i++) pending.push({ minute: 1 + Math.floor(rng() * 90), side: 'home' });
  for (let i = 0; i < awayScore; i++) pending.push({ minute: 1 + Math.floor(rng() * 90), side: 'away' });
  // Array.prototype.sort es estable (ES2019+): a igual minuto, se conserva el
  // orden de encolado (locales antes que visitantes).
  pending.sort((a, b) => a.minute - b.minute);

  let h = 0;
  let a = 0;
  const goals: LiveGoalEvent[] = pending.map((p) => {
    if (p.side === 'home') h++;
    else a++;
    return { minute: p.minute, side: p.side, homeScore: h, awayScore: a };
  });

  return { goals, finalHomeScore: homeScore, finalAwayScore: awayScore, penalties };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/__tests__/liveMatch.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc -b` → exit 0.

```bash
git add src/core/liveMatch.ts src/core/__tests__/liveMatch.test.ts
git commit -m "feat(live): motor de timeline puro (buildMatchTimeline + hashSeed)"
```

---

## Task 2: Store controlador (`useLiveMatchStore`) + tipos

**Files:**
- Create: `src/store/useLiveMatchStore.ts`
- Test: `src/store/__tests__/useLiveMatchStore.test.ts`

**Interfaces:**
- Produces:
  - `type LiveMatchKind = 'qualifier' | 'world-cup' | 'knockout' | 'continental' | 'confederations'`
  - `interface LiveMatchDescriptor { matchId: string; homeTeamId: string; awayTeamId: string; kind: LiveMatchKind; groupId?: string }`
  - `useLiveMatchStore` con `{ activeMatch: LiveMatchDescriptor | null; openLiveMatch(d): void; closeLiveMatch(): void }`
- Nota: `SimulatedMatchOutcome` NO vive acá; se define en `types/index.ts` (Task 3) para no invertir la dependencia tipos→store.

- [ ] **Step 1: Write the failing test**

Create `src/store/__tests__/useLiveMatchStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useLiveMatchStore } from '../useLiveMatchStore';

describe('useLiveMatchStore', () => {
  beforeEach(() => {
    useLiveMatchStore.setState({ activeMatch: null });
  });

  it('arranca sin partido activo', () => {
    expect(useLiveMatchStore.getState().activeMatch).toBeNull();
  });

  it('openLiveMatch setea el descriptor', () => {
    useLiveMatchStore.getState().openLiveMatch({
      matchId: 'm1', homeTeamId: 'h', awayTeamId: 'a', kind: 'continental',
    });
    expect(useLiveMatchStore.getState().activeMatch).toEqual({
      matchId: 'm1', homeTeamId: 'h', awayTeamId: 'a', kind: 'continental',
    });
  });

  it('closeLiveMatch limpia el partido activo', () => {
    useLiveMatchStore.getState().openLiveMatch({
      matchId: 'm1', homeTeamId: 'h', awayTeamId: 'a', kind: 'qualifier', groupId: 'g1',
    });
    useLiveMatchStore.getState().closeLiveMatch();
    expect(useLiveMatchStore.getState().activeMatch).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/__tests__/useLiveMatchStore.test.ts`
Expected: FAIL — `Cannot find module '../useLiveMatchStore'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/store/useLiveMatchStore.ts`:

```ts
import { create } from 'zustand';

/** Tipo de partido (coincide con MatchStage del colector del Match Center). */
export type LiveMatchKind =
  | 'qualifier'
  | 'world-cup'
  | 'knockout'
  | 'continental'
  | 'confederations';

/** Lo que necesita el modal para simular y reproducir un partido. */
export interface LiveMatchDescriptor {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  kind: LiveMatchKind;
  groupId?: string; // requerido para kind 'qualifier' | 'world-cup'
}

interface LiveMatchState {
  activeMatch: LiveMatchDescriptor | null;
  openLiveMatch: (descriptor: LiveMatchDescriptor) => void;
  closeLiveMatch: () => void;
}

export const useLiveMatchStore = create<LiveMatchState>((set) => ({
  activeMatch: null,
  openLiveMatch: (descriptor) => set({ activeMatch: descriptor }),
  closeLiveMatch: () => set({ activeMatch: null }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/store/__tests__/useLiveMatchStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc -b` → exit 0.

```bash
git add src/store/useLiveMatchStore.ts src/store/__tests__/useLiveMatchStore.test.ts
git commit -m "feat(live): store controlador useLiveMatchStore + tipos"
```

---

## Task 3: Las acciones `simulate*` devuelven el resultado

Cambio type-driven: se cambia la firma de retorno y `tsc -b` señala cada `return;`
que hay que convertir a `return null;`, y cada camino de éxito recibe el
`return { homeScore, awayScore, penalties? }`. No se agrega test unitario del store
(las acciones async del store no son node-testeables de forma confiable — ver memoria
del proyecto; el comportamiento del retorno se cubre en Task 5 con la acción mockeada).

**Files:**
- Modify: `src/types/index.ts:130-142` (firmas en `TournamentState`)
- Modify: `src/store/useTournamentStore.ts` (retornos de las 4 acciones)

**Interfaces:**
- Produces: `interface SimulatedMatchOutcome { homeScore: number; awayScore: number; penalties?: { homeScore: number; awayScore: number } }` (en `types/index.ts`) y las 4 acciones devuelven `Promise<SimulatedMatchOutcome | null>`.

- [ ] **Step 1: Definir el tipo y cambiar las firmas en `types/index.ts`**

En `src/types/index.ts`, agregar la interfaz cerca de `MatchResult` (al final del archivo, junto a los demás tipos exportados):

```ts
/** Resultado comprometido por una acción simulate*, para reproducir en vivo. */
export interface SimulatedMatchOutcome {
  homeScore: number;
  awayScore: number;
  penalties?: { homeScore: number; awayScore: number };
}
```

Reemplazar las 4 firmas dentro de `interface TournamentState` (líneas ~130-142). `SimulatedMatchOutcome` queda en el mismo archivo, así que no hace falta import:

```ts
  simulateMatch: (matchId: string, groupId: string, stage: 'qualifier' | 'world-cup') => Promise<SimulatedMatchOutcome | null>;
```
```ts
  simulateKnockoutMatch: (matchId: string) => Promise<SimulatedMatchOutcome | null>;
```
```ts
  simulateContinentalMatch: (matchId: string) => Promise<SimulatedMatchOutcome | null>;
```
```ts
  simulateConfederationsMatch: (matchId: string) => Promise<SimulatedMatchOutcome | null>;
```

(No tocar `simulateMatchdayBatch` ni `simulateKnockoutMatch`'s callers.)

- [ ] **Step 2: Ver los errores de tsc que guían los cambios**

Run: `npx tsc -b`
Expected: FAIL — errores del tipo "Type 'undefined' is not assignable to type 'SimulatedMatchOutcome | null'" en cada `return;` de las 4 acciones, y "Not all code paths return a value" en los caminos de éxito. **Usá esos errores como checklist.**

- [ ] **Step 3: `simulateMatch` (`useTournamentStore.ts` ~609-788)**

Convertir cada salida temprana `return;` de la acción a `return null;` (guards en ~611, ~616-617, ~638, ~641, ~644, ~658). Al final de la acción, después de `set({ isSavingMatch: false });` (línea ~787), agregar:

```ts
        set({ isSavingMatch: false });
        return { homeScore: result.homeScore, awayScore: result.awayScore };
```

(Los partidos de grupos/clasificatorias no tienen penales.)

- [ ] **Step 4: `simulateKnockoutMatch` (`useTournamentStore.ts` ~1750-2084)**

Convertir las salidas tempranas `return;` a `return null;` (guards en ~1752, ~1757, ~1787, ~1798, ~1828). **Hay TRES caminos de éxito**, cada uno debe devolver el outcome con penales:

En la rama de la final completa (~2048-2049):
```ts
          set({ isSavingMatch: false });
          return { homeScore: result.homeScore, awayScore: result.awayScore, penalties: result.penalties };
```
En la rama de tercer puesto (~2067-2068):
```ts
          set({ isSavingMatch: false });
          return { homeScore: result.homeScore, awayScore: result.awayScore, penalties: result.penalties };
```
En el camino final por defecto (~2082-2083):
```ts
        set({ isSavingMatch: false });
        return { homeScore: result.homeScore, awayScore: result.awayScore, penalties: result.penalties };
```

- [ ] **Step 5: `simulateContinentalMatch` (`useTournamentStore.ts` ~2096-2166)**

Convertir salidas tempranas `return;` a `return null;` (guards en ~2099, ~2100, ~2103, ~2112, ~2115). Al final (~2165):
```ts
        set({ isSavingMatch: false });
        return { homeScore: result.homeScore, awayScore: result.awayScore, penalties: result.penalties };
```

- [ ] **Step 6: `simulateConfederationsMatch` (`useTournamentStore.ts` ~2180-2249)**

Convertir salidas tempranas `return;` a `return null;` (guards en ~2183, ~2186, ~2196, ~2199). Al final (~2248):
```ts
        set({ isSavingMatch: false });
        return { homeScore: result.homeScore, awayScore: result.awayScore, penalties: result.penalties };
```

- [ ] **Step 7: Typecheck, suite y lint**

Run: `npx tsc -b` → exit 0.
Run: `npx vitest run` → 156 tests siguen pasando (sin regresión; los llamadores ignoran el retorno).
Run: `npx eslint src/store/useTournamentStore.ts src/types/index.ts` → sin nuevos errores.

- [ ] **Step 8: Commit**

```bash
git add src/store/useTournamentStore.ts src/types/index.ts
git commit -m "feat(store): las acciones simulate* devuelven el resultado comprometido"
```

---

## Task 4: Hook de reloj y revelado (`useLiveMatchPlayback`)

**Files:**
- Create: `src/hooks/useLiveMatchPlayback.ts`
- Test: `src/hooks/__tests__/useLiveMatchPlayback.test.ts`

**Interfaces:**
- Consumes: `LiveTimeline`, `LiveGoalEvent`, `LivePenaltiesResult` (Task 1).
- Produces:
  - `type LivePhase = 'playing' | 'penalties' | 'finished'`
  - `type LiveSpeed = 1 | 2 | 4`
  - `useLiveMatchPlayback(timeline: LiveTimeline | null, initialSpeed?: LiveSpeed): LivePlaybackState`
  - `interface LivePlaybackState { phase; minute; displayHomeScore; displayAwayScore; revealedGoals; penalties?; speed; setSpeed; skipToEnd }`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useLiveMatchPlayback.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLiveMatchPlayback } from '../useLiveMatchPlayback';
import type { LiveTimeline } from '../../core/liveMatch';

const timeline: LiveTimeline = {
  goals: [
    { minute: 10, side: 'home', homeScore: 1, awayScore: 0 },
    { minute: 80, side: 'away', homeScore: 1, awayScore: 1 },
  ],
  finalHomeScore: 1,
  finalAwayScore: 1,
};

const timelineWithPens: LiveTimeline = {
  ...timeline,
  penalties: { homeScore: 5, awayScore: 4 },
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useLiveMatchPlayback', () => {
  it('timeline null → sin correr, marcador 0-0', () => {
    const { result } = renderHook(() => useLiveMatchPlayback(null, 1));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.minute).toBe(0);
    expect(result.current.displayHomeScore).toBe(0);
  });

  it('revela cada gol al llegar su minuto (1x = 1000ms/min)', () => {
    const { result } = renderHook(() => useLiveMatchPlayback(timeline, 1));
    act(() => vi.advanceTimersByTime(10 * 1000));
    expect(result.current.minute).toBe(10);
    expect(result.current.displayHomeScore).toBe(1);
    expect(result.current.displayAwayScore).toBe(0);
    act(() => vi.advanceTimersByTime(70 * 1000));
    expect(result.current.displayAwayScore).toBe(1);
  });

  it('al llegar a 90 sin penales termina en finished', () => {
    const { result } = renderHook(() => useLiveMatchPlayback(timeline, 1));
    act(() => vi.advanceTimersByTime(90 * 1000));
    expect(result.current.minute).toBe(90);
    expect(result.current.phase).toBe('finished');
    expect(result.current.revealedGoals).toHaveLength(2);
  });

  it('con penales: playing → penalties → finished y revela el marcador de penales', () => {
    const { result } = renderHook(() => useLiveMatchPlayback(timelineWithPens, 1));
    act(() => vi.advanceTimersByTime(90 * 1000));
    expect(result.current.phase).toBe('penalties');
    expect(result.current.penalties).toBeUndefined();
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.phase).toBe('finished');
    expect(result.current.penalties).toEqual({ homeScore: 5, awayScore: 4 });
  });

  it('setSpeed acelera el reloj (2x = 500ms/min)', () => {
    const { result } = renderHook(() => useLiveMatchPlayback(timeline, 1));
    act(() => result.current.setSpeed(2));
    act(() => vi.advanceTimersByTime(10 * 500));
    expect(result.current.minute).toBe(10);
  });

  it('skipToEnd revela todo y termina', () => {
    const { result } = renderHook(() => useLiveMatchPlayback(timelineWithPens, 1));
    act(() => result.current.skipToEnd());
    expect(result.current.phase).toBe('finished');
    expect(result.current.minute).toBe(90);
    expect(result.current.revealedGoals).toHaveLength(2);
    expect(result.current.displayHomeScore).toBe(1);
    expect(result.current.displayAwayScore).toBe(1);
    expect(result.current.penalties).toEqual({ homeScore: 5, awayScore: 4 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/hooks/__tests__/useLiveMatchPlayback.test.ts`
Expected: FAIL — `Cannot find module '../useLiveMatchPlayback'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/hooks/useLiveMatchPlayback.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import type { LiveGoalEvent, LivePenaltiesResult, LiveTimeline } from '../core/liveMatch';

export type LivePhase = 'playing' | 'penalties' | 'finished';
export type LiveSpeed = 1 | 2 | 4;

const MATCH_MINUTES = 90;
const PENALTY_REVEAL_MS = 900;

export interface LivePlaybackState {
  phase: LivePhase;
  minute: number;
  displayHomeScore: number;
  displayAwayScore: number;
  revealedGoals: LiveGoalEvent[];
  penalties?: LivePenaltiesResult;
  speed: LiveSpeed;
  setSpeed: (s: LiveSpeed) => void;
  skipToEnd: () => void;
}

export function useLiveMatchPlayback(
  timeline: LiveTimeline | null,
  initialSpeed: LiveSpeed = 1,
): LivePlaybackState {
  const [minute, setMinute] = useState(0);
  const [phase, setPhase] = useState<LivePhase>('playing');
  const [penaltiesShown, setPenaltiesShown] = useState(false);
  const [speed, setSpeed] = useState<LiveSpeed>(initialSpeed);

  // Reset al recibir un timeline nuevo (o null).
  useEffect(() => {
    setMinute(0);
    setPhase('playing');
    setPenaltiesShown(false);
  }, [timeline]);

  // Reloj: incrementa el minuto mientras se juega.
  useEffect(() => {
    if (!timeline || phase !== 'playing') return;
    const id = setInterval(() => {
      setMinute((prev) => (prev + 1 >= MATCH_MINUTES ? MATCH_MINUTES : prev + 1));
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [timeline, phase, speed]);

  // Transición al llegar a los 90'.
  useEffect(() => {
    if (!timeline || phase !== 'playing') return;
    if (minute >= MATCH_MINUTES) {
      setPhase(timeline.penalties ? 'penalties' : 'finished');
    }
  }, [minute, timeline, phase]);

  // Suspenso de penales y cierre.
  useEffect(() => {
    if (phase !== 'penalties') return;
    const id = setTimeout(() => {
      setPenaltiesShown(true);
      setPhase('finished');
    }, PENALTY_REVEAL_MS / speed);
    return () => clearTimeout(id);
  }, [phase, speed]);

  const skipToEnd = useCallback(() => {
    if (!timeline) return;
    setMinute(MATCH_MINUTES);
    setPenaltiesShown(Boolean(timeline.penalties));
    setPhase('finished');
  }, [timeline]);

  const revealedGoals = timeline ? timeline.goals.filter((g) => g.minute <= minute) : [];
  const last = revealedGoals[revealedGoals.length - 1];

  return {
    phase,
    minute,
    displayHomeScore: last ? last.homeScore : 0,
    displayAwayScore: last ? last.awayScore : 0,
    revealedGoals,
    penalties: penaltiesShown ? timeline?.penalties : undefined,
    speed,
    setSpeed,
    skipToEnd,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/__tests__/useLiveMatchPlayback.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Typecheck + lint + commit**

Run: `npx tsc -b` → exit 0.
Run: `npx eslint src/hooks/useLiveMatchPlayback.ts` → sin nuevos errores.

```bash
git add src/hooks/useLiveMatchPlayback.ts src/hooks/__tests__/useLiveMatchPlayback.test.ts
git commit -m "feat(live): hook useLiveMatchPlayback (reloj, revelado, velocidad, saltar)"
```

---

## Task 5: Modal global (`LiveMatchModal`) + montaje en `App`

**Files:**
- Create: `src/components/tournament/LiveMatchModal.tsx`
- Modify: `src/App.tsx` (montar el modal junto a los overlays globales, ~línea 96)
- Test: `src/components/tournament/__tests__/LiveMatchModal.test.tsx`

**Interfaces:**
- Consumes: `useLiveMatchStore` (Task 2), `useTournamentStore` acciones (Task 3), `buildMatchTimeline`/`hashSeed` (Task 1), `useLiveMatchPlayback`/`LiveSpeed` (Task 4), `Button`, `TeamFlag`.
- Produces: `<LiveMatchModal />` (sin props).

- [ ] **Step 1: Write the failing test**

Create `src/components/tournament/__tests__/LiveMatchModal.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { Team } from '../../../types';
import { LiveMatchModal } from '../LiveMatchModal';
import { useLiveMatchStore } from '../../../store/useLiveMatchStore';
import { useTournamentStore } from '../../../store/useTournamentStore';

const teams: Team[] = [
  { id: 'h', name: 'Local', flag: '🏠', region: 'Europe', skill: 80 },
  { id: 'a', name: 'Visita', flag: '✈️', region: 'Asia', skill: 75 },
];

beforeEach(() => {
  useLiveMatchStore.setState({ activeMatch: null });
  // Override de teams y de una acción del store real (zustand permite setState de campos).
  // El mock devuelve un resultado conocido; el modal lo reproduce.
  useTournamentStore.setState({
    teams,
    simulateContinentalMatch: async () => ({ homeScore: 2, awayScore: 1 }),
  });
});

describe('LiveMatchModal', () => {
  it('sin partido activo no renderiza nada', () => {
    const { container } = render(<LiveMatchModal />);
    expect(container).toBeEmptyDOMElement();
  });

  it('simula y reproduce: "Saltar al final" muestra el marcador final', async () => {
    render(<LiveMatchModal />);
    act(() => {
      useLiveMatchStore.getState().openLiveMatch({
        matchId: 'm1', homeTeamId: 'h', awayTeamId: 'a', kind: 'continental',
      });
    });
    // Sin fake timers: la promesa mock resuelve y arma el timeline; "Saltar al
    // final" solo aparece una vez que hay timeline.
    const skip = await screen.findByText('Saltar al final');
    act(() => skip.click());
    expect(screen.getByText('2 - 1')).toBeInTheDocument();
    expect(screen.getByText('FINAL')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/tournament/__tests__/LiveMatchModal.test.tsx`
Expected: FAIL — `Cannot find module '../LiveMatchModal'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/tournament/LiveMatchModal.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useLiveMatchStore } from '../../store/useLiveMatchStore';
import { useTournamentStore } from '../../store/useTournamentStore';
import { buildMatchTimeline, hashSeed, type LiveTimeline } from '../../core/liveMatch';
import { useLiveMatchPlayback, type LiveSpeed } from '../../hooks/useLiveMatchPlayback';
import { Button } from '../ui/Button';
import { TeamFlag } from '../ui/TeamFlag';
import { Radio, X } from 'lucide-react';

const SPEEDS: LiveSpeed[] = [1, 2, 4];

export function LiveMatchModal() {
  const activeMatch = useLiveMatchStore((s) => s.activeMatch);
  const closeLiveMatch = useLiveMatchStore((s) => s.closeLiveMatch);
  const teams = useTournamentStore((s) => s.teams);
  const simulateMatch = useTournamentStore((s) => s.simulateMatch);
  const simulateKnockoutMatch = useTournamentStore((s) => s.simulateKnockoutMatch);
  const simulateContinentalMatch = useTournamentStore((s) => s.simulateContinentalMatch);
  const simulateConfederationsMatch = useTournamentStore((s) => s.simulateConfederationsMatch);

  const [timeline, setTimeline] = useState<LiveTimeline | null>(null);
  const [failed, setFailed] = useState(false);
  const startedRef = useRef<string | null>(null);

  const playback = useLiveMatchPlayback(timeline, 1);

  useEffect(() => {
    if (!activeMatch) {
      setTimeline(null);
      setFailed(false);
      startedRef.current = null;
      return;
    }
    // Dispara la simulación una sola vez por partido (evita doble efecto).
    if (startedRef.current === activeMatch.matchId) return;
    startedRef.current = activeMatch.matchId;
    setTimeline(null);
    setFailed(false);

    const run = async () => {
      let outcome;
      switch (activeMatch.kind) {
        case 'qualifier':
        case 'world-cup':
          outcome = await simulateMatch(activeMatch.matchId, activeMatch.groupId ?? '', activeMatch.kind);
          break;
        case 'knockout':
          outcome = await simulateKnockoutMatch(activeMatch.matchId);
          break;
        case 'continental':
          outcome = await simulateContinentalMatch(activeMatch.matchId);
          break;
        case 'confederations':
          outcome = await simulateConfederationsMatch(activeMatch.matchId);
          break;
      }
      if (!outcome) {
        setFailed(true);
        return;
      }
      setTimeline(
        buildMatchTimeline(outcome.homeScore, outcome.awayScore, hashSeed(activeMatch.matchId), outcome.penalties),
      );
    };
    void run();
  }, [activeMatch, simulateMatch, simulateKnockoutMatch, simulateContinentalMatch, simulateConfederationsMatch]);

  if (!activeMatch) return null;

  const home = teams.find((t) => t.id === activeMatch.homeTeamId);
  const away = teams.find((t) => t.id === activeMatch.awayTeamId);
  const clockLabel =
    playback.phase === 'finished' ? 'FINAL' : playback.phase === 'penalties' ? 'PENALES' : `${playback.minute}'`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-lg bg-grass-dark border-4 border-line shadow-hard-panel p-6 space-y-6">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-gold font-arcade text-xs uppercase">
            <Radio className="w-4 h-4" /> En vivo
          </span>
          <button onClick={closeLiveMatch} aria-label="Cerrar" className="text-grass-soft hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {failed ? (
          <p className="text-center text-grass-soft py-8">No se pudo simular el partido.</p>
        ) : !timeline ? (
          <p className="text-center text-grass-soft py-8 font-arcade text-xs">Simulando…</p>
        ) : (
          <>
            <div className="flex items-center justify-center gap-4">
              <div className="flex flex-col items-center gap-1 w-24">
                {home && <TeamFlag teamId={home.id} teamName={home.name} flagUrl={home.flag} size={32} />}
                <span className="font-arcade text-[10px] text-white text-center uppercase truncate w-full">
                  {home?.name ?? activeMatch.homeTeamId}
                </span>
              </div>
              <div className="font-terminal text-4xl text-led tabular-nums whitespace-nowrap">
                {`${playback.displayHomeScore} - ${playback.displayAwayScore}`}
              </div>
              <div className="flex flex-col items-center gap-1 w-24">
                {away && <TeamFlag teamId={away.id} teamName={away.name} flagUrl={away.flag} size={32} />}
                <span className="font-arcade text-[10px] text-white text-center uppercase truncate w-full">
                  {away?.name ?? activeMatch.awayTeamId}
                </span>
              </div>
            </div>

            <div className="text-center font-arcade text-xs text-gold">{clockLabel}</div>

            {playback.penalties && (
              <p className="text-center text-grass-soft text-sm">
                Penales {playback.penalties.homeScore}-{playback.penalties.awayScore}
              </p>
            )}

            <div className="max-h-40 overflow-y-auto space-y-1">
              {playback.revealedGoals.length === 0 ? (
                <p className="text-center text-grass-soft text-xs">Sin goles aún</p>
              ) : (
                playback.revealedGoals.map((g, i) => {
                  const scorer = g.side === 'home' ? home : away;
                  return (
                    <div key={i} className="flex items-center gap-2 text-sm text-white">
                      <span className="font-terminal text-gold tabular-nums w-8">{g.minute}'</span>
                      <span>⚽ {scorer?.name ?? (g.side === 'home' ? activeMatch.homeTeamId : activeMatch.awayTeamId)}</span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => playback.setSpeed(s)}
                    className={`px-2 py-1 min-h-9 font-arcade text-[10px] border-2 transition-colors ${
                      playback.speed === s ? 'bg-grass text-white border-line' : 'text-grass-soft border-grass'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
              {playback.phase === 'finished' ? (
                <Button variant="primary" size="sm" onClick={closeLiveMatch}>
                  Cerrar
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={playback.skipToEnd}>
                  Saltar al final
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Montar en `App.tsx`**

En `src/App.tsx`, agregar el import junto a los otros de componentes:
```ts
import { LiveMatchModal } from './components/tournament/LiveMatchModal';
```
Y montar el modal junto a los overlays globales, inmediatamente después de `<MatchResultsModal />` (~línea 96):
```tsx
        {/* Match Results Modal */}
        <MatchResultsModal />

        {/* Live Match Modal */}
        <LiveMatchModal />
```

- [ ] **Step 5: Run test + suite + typecheck + lint**

Run: `npx vitest run src/components/tournament/__tests__/LiveMatchModal.test.tsx` → PASS.
Run: `npx vitest run` → sin regresión.
Run: `npx tsc -b` → exit 0.
Run: `npx eslint src/components/tournament/LiveMatchModal.tsx src/App.tsx` → sin nuevos errores.

- [ ] **Step 6: Commit**

```bash
git add src/components/tournament/LiveMatchModal.tsx src/components/tournament/__tests__/LiveMatchModal.test.tsx src/App.tsx
git commit -m "feat(live): LiveMatchModal (overlay commit-then-replay) montado en App"
```

---

## Task 6: Botón reutilizable (`WatchLiveButton`)

**Files:**
- Create: `src/components/tournament/WatchLiveButton.tsx`
- Test: `src/components/tournament/__tests__/WatchLiveButton.test.tsx`

**Interfaces:**
- Consumes: `useLiveMatchStore`/`LiveMatchKind` (Task 2), `Button`.
- Produces:
  - `interface WatchLiveButtonProps { matchId: string; homeTeamId: string; awayTeamId: string; kind: LiveMatchKind; groupId?: string; disabled?: boolean; className?: string }`
  - `<WatchLiveButton />`

- [ ] **Step 1: Write the failing test**

Create `src/components/tournament/__tests__/WatchLiveButton.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WatchLiveButton } from '../WatchLiveButton';
import { useLiveMatchStore } from '../../../store/useLiveMatchStore';

beforeEach(() => useLiveMatchStore.setState({ activeMatch: null }));

describe('WatchLiveButton', () => {
  it('al hacer click abre el partido en vivo con el descriptor', () => {
    render(
      <WatchLiveButton matchId="m1" homeTeamId="h" awayTeamId="a" kind="qualifier" groupId="g1" />,
    );
    screen.getByRole('button', { name: /ver en vivo/i }).click();
    expect(useLiveMatchStore.getState().activeMatch).toEqual({
      matchId: 'm1', homeTeamId: 'h', awayTeamId: 'a', kind: 'qualifier', groupId: 'g1',
    });
  });

  it('respeta disabled', () => {
    render(<WatchLiveButton matchId="m1" homeTeamId="h" awayTeamId="a" kind="knockout" disabled />);
    screen.getByRole('button', { name: /ver en vivo/i }).click();
    expect(useLiveMatchStore.getState().activeMatch).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/tournament/__tests__/WatchLiveButton.test.tsx`
Expected: FAIL — `Cannot find module '../WatchLiveButton'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/tournament/WatchLiveButton.tsx`:

```tsx
import { Button } from '../ui/Button';
import { Radio } from 'lucide-react';
import { useLiveMatchStore, type LiveMatchKind } from '../../store/useLiveMatchStore';

interface WatchLiveButtonProps {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  kind: LiveMatchKind;
  groupId?: string;
  disabled?: boolean;
  className?: string;
}

export function WatchLiveButton({
  matchId,
  homeTeamId,
  awayTeamId,
  kind,
  groupId,
  disabled = false,
  className,
}: WatchLiveButtonProps) {
  const openLiveMatch = useLiveMatchStore((s) => s.openLiveMatch);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        openLiveMatch({ matchId, homeTeamId, awayTeamId, kind, groupId });
      }}
      className={`gap-1 ${className ?? ''}`}
    >
      <Radio className="w-3 h-3" /> Ver en vivo
    </Button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/tournament/__tests__/WatchLiveButton.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint + commit**

Run: `npx tsc -b` → exit 0.
Run: `npx eslint src/components/tournament/WatchLiveButton.tsx` → sin nuevos errores.

```bash
git add src/components/tournament/WatchLiveButton.tsx src/components/tournament/__tests__/WatchLiveButton.test.tsx
git commit -m "feat(live): WatchLiveButton reutilizable"
```

---

## Task 7: Cablear vistas del ciclo (Continental + Confederaciones)

**Files:**
- Modify: `src/components/tournament/ContinentalView.tsx` (componente `BracketMatch`, ~194-198)
- Modify: `src/components/tournament/ConfederationsCupView.tsx` (componente `ConfedMatch`, ~164-168)
- Test: extender `src/components/tournament/__tests__/ContinentalView.test.tsx`

**Interfaces:**
- Consumes: `WatchLiveButton` (Task 6). En ambos leaves están en scope `match` (con `id`/`homeTeamId`/`awayTeamId`), `home`, `away`, `playable`, `isSaving`.

- [ ] **Step 1: ContinentalView — import + botón**

En `src/components/tournament/ContinentalView.tsx`, agregar el import:
```ts
import { WatchLiveButton } from './WatchLiveButton';
```
En `BracketMatch`, reemplazar el bloque del botón Play (~194-198) para añadir el botón vivo debajo:
```tsx
      {!match.isPlayed && playable && (
        <div className="space-y-1">
          <Button variant="primary" size="sm" onClick={() => onPlay(match.id)} disabled={isSaving} className="w-full gap-1">
            <Play className="w-3 h-3" /> Play
          </Button>
          <WatchLiveButton
            matchId={match.id}
            homeTeamId={match.homeTeamId}
            awayTeamId={match.awayTeamId}
            kind="continental"
            disabled={isSaving}
            className="w-full"
          />
        </div>
      )}
```

- [ ] **Step 2: ConfederationsCupView — import + botón**

En `src/components/tournament/ConfederationsCupView.tsx`, agregar el import:
```ts
import { WatchLiveButton } from './WatchLiveButton';
```
En `ConfedMatch`, reemplazar el bloque del botón Play (~164-168):
```tsx
      {!match.isPlayed && playable && (
        <div className="space-y-1">
          <Button variant="primary" size="sm" onClick={() => onPlay(match.id)} disabled={isSaving} className="w-full gap-1">
            <Play className="w-3 h-3" /> Play
          </Button>
          <WatchLiveButton
            matchId={match.id}
            homeTeamId={match.homeTeamId}
            awayTeamId={match.awayTeamId}
            kind="confederations"
            disabled={isSaving}
            className="w-full"
          />
        </div>
      )}
```

- [ ] **Step 3: Extender el test de ContinentalView**

En `src/components/tournament/__tests__/ContinentalView.test.tsx`, agregar un caso que, con un partido jugable en el bracket, verifique que aparece el botón "Ver en vivo". Usar el mismo fixture/setup que los tests existentes del archivo (leerlos primero). Ejemplo del assert a incluir dentro de un `it(...)` que renderice `<ContinentalView cycle={...} teams={...} />` con al menos un partido jugable:
```tsx
expect(screen.getAllByRole('button', { name: /ver en vivo/i }).length).toBeGreaterThan(0);
```

- [ ] **Step 4: Tests + typecheck + lint**

Run: `npx vitest run src/components/tournament/__tests__/ContinentalView.test.tsx src/components/tournament/__tests__/ConfederationsCupView.test.tsx` → PASS.
Run: `npx tsc -b` → exit 0.
Run: `npx eslint src/components/tournament/ContinentalView.tsx src/components/tournament/ConfederationsCupView.tsx` → sin nuevos errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/tournament/ContinentalView.tsx src/components/tournament/ConfederationsCupView.tsx src/components/tournament/__tests__/ContinentalView.test.tsx
git commit -m "feat(live): botón Ver en vivo en Continental y Confederaciones"
```

---

## Task 8: Cablear Mundial knockout (`KnockoutView`)

**Files:**
- Modify: `src/components/tournament/KnockoutView.tsx` (componente `MatchCard`, bloque de botón ~127-141)

**Interfaces:**
- Consumes: `WatchLiveButton` (Task 6). En `MatchCard` están en scope `match`, `isPlayed`, `onSimulate`, `disabled`.

- [ ] **Step 1: Import + botón**

En `src/components/tournament/KnockoutView.tsx`, agregar el import:
```ts
import { WatchLiveButton } from './WatchLiveButton';
```
En `MatchCard`, dentro del contenedor de botones (`<div className="flex gap-2">`, ~127), después del bloque `{!isPlayed && onSimulate && (...)}` (~128-141), agregar:
```tsx
          {!isPlayed && onSimulate && (
            <WatchLiveButton
              matchId={match.id}
              homeTeamId={match.homeTeamId}
              awayTeamId={match.awayTeamId}
              kind="knockout"
              disabled={disabled}
              className="w-full"
            />
          )}
```

- [ ] **Step 2: Typecheck + lint + suite**

Run: `npx tsc -b` → exit 0.
Run: `npx eslint src/components/tournament/KnockoutView.tsx` → sin nuevos errores.
Run: `npx vitest run` → sin regresión.

- [ ] **Step 3: Commit**

```bash
git add src/components/tournament/KnockoutView.tsx
git commit -m "feat(live): botón Ver en vivo en el knockout del Mundial"
```

---

## Task 9: Cablear partidos de grupo (clasificatorias + grupos del Mundial)

Los partidos de grupo comparten el leaf `GroupDetailModal` (usado por `RegionView` para
clasificatorias y por `WorldCupGridView` para el Mundial). Se agrega un prop `liveKind`
que los padres pasan. Además `GroupView` (vista de grupo único de clasificatorias) tiene
su propio `MatchCard`.

**Files:**
- Modify: `src/components/tournament/GroupDetailModal.tsx` (props + botones Simular ~114-121 y ~166-176)
- Modify: `src/components/tournament/RegionView.tsx` (pasar `liveKind="qualifier"`, ~188-197)
- Modify: `src/components/tournament/WorldCupGridView.tsx` (pasar `liveKind="world-cup"`, ~215-224)
- Modify: `src/components/tournament/GroupView.tsx` (componente `MatchCard`, ~190+)

**Interfaces:**
- Consumes: `WatchLiveButton` (Task 6), `LiveMatchKind` (Task 2).
- `GroupDetailModal` gana el prop `liveKind?: LiveMatchKind` y usa `group.id` como `groupId`.

- [ ] **Step 1: GroupDetailModal — prop + botones**

En `src/components/tournament/GroupDetailModal.tsx`:

Agregar imports:
```ts
import { WatchLiveButton } from './WatchLiveButton';
import type { LiveMatchKind } from '../../store/useLiveMatchStore';
```
Agregar `liveKind` a la interfaz de props (junto a `onSimulate`, ~línea 14):
```ts
  liveKind?: LiveMatchKind;
```
Y a la desestructuración del componente (~línea 22):
```ts
  liveKind,
```
En **ambos** bloques `{!match.isPlayed && onSimulate && (<Button ...>Simular</Button>)}` (~114-121 y ~166-176), agregar el botón vivo justo después del `</Button>` correspondiente, condicionado a `liveKind`:
```tsx
                              {!match.isPlayed && liveKind && (
                                <WatchLiveButton
                                  matchId={match.id}
                                  homeTeamId={match.homeTeamId}
                                  awayTeamId={match.awayTeamId}
                                  kind={liveKind}
                                  groupId={group.id}
                                />
                              )}
```

- [ ] **Step 2: RegionView — pasar liveKind**

En `src/components/tournament/RegionView.tsx`, en el `<GroupDetailModal ...>` (~188-197), agregar el prop:
```tsx
        <GroupDetailModal
          group={selectedGroup}
          teams={teams}
          region={region}
          liveKind="qualifier"
          onClose={() => setSelectedGroup(null)}
          onSimulate={onSimulateMatch ? (matchId) => {
            onSimulateMatch(matchId, selectedGroup.id);
          } : undefined}
        />
```

- [ ] **Step 3: WorldCupGridView — pasar liveKind**

En `src/components/tournament/WorldCupGridView.tsx`, en el `<GroupDetailModal ...>` (~215-224), agregar el prop:
```tsx
        <GroupDetailModal
          group={selectedGroup as Group}
          teams={teams}
          region="Copa del Mundo"
          liveKind="world-cup"
          onClose={() => setSelectedGroup(null)}
          onSimulate={onSimulateMatch ? (matchId) => {
            onSimulateMatch(matchId, selectedGroup.id);
          } : undefined}
        />
```

- [ ] **Step 4: GroupView — botón en MatchCard**

En `src/components/tournament/GroupView.tsx`:

Agregar el import:
```ts
import { WatchLiveButton } from './WatchLiveButton';
```
`MatchCard` recibe `match` y `onSimulate`, pero necesita `groupId`. Pasar `group.id` al `MatchCard`: en el `.map` que renderiza `MatchCard` (~143, `onSimulate={() => handleSimulateMatch(match.id)}`), añadir la prop `groupId={group.id}`. Añadir `groupId: string` a `MatchCardProps` (~157) y a la desestructuración (~161). Dentro de `MatchCard`, en el bloque `{!match.isPlayed && (<Button>Simular</Button>)}` (~190+), añadir después del botón:
```tsx
        {!match.isPlayed && (
          <WatchLiveButton
            matchId={match.id}
            homeTeamId={match.homeTeamId}
            awayTeamId={match.awayTeamId}
            kind="qualifier"
            groupId={groupId}
            className="w-full"
          />
        )}
```

- [ ] **Step 5: Typecheck + lint + suite**

Run: `npx tsc -b` → exit 0.
Run: `npx eslint src/components/tournament/GroupDetailModal.tsx src/components/tournament/RegionView.tsx src/components/tournament/WorldCupGridView.tsx src/components/tournament/GroupView.tsx` → sin nuevos errores.
Run: `npx vitest run` → sin regresión.

- [ ] **Step 6: Commit**

```bash
git add src/components/tournament/GroupDetailModal.tsx src/components/tournament/RegionView.tsx src/components/tournament/WorldCupGridView.tsx src/components/tournament/GroupView.tsx
git commit -m "feat(live): botón Ver en vivo en partidos de grupo (clasificatorias + Mundial)"
```

---

## Task 10: Cablear el Centro de Partidos (`MatchCenter`)

**Files:**
- Modify: `src/components/tournament/MatchCenter.tsx` (componente `MatchRow`, botón Play ~765-777, y el `<MatchRow>` en la lista ~527-533)

**Interfaces:**
- Consumes: `WatchLiveButton` (Task 6). `MatchRow` recibe `matchCtx: MatchWithContext` (con `match`, `stage`, `groupId`); `stage` coincide con `LiveMatchKind`.

- [ ] **Step 1: Import + botón en MatchRow**

En `src/components/tournament/MatchCenter.tsx`, agregar el import:
```ts
import { WatchLiveButton } from './WatchLiveButton';
```
En `MatchRow` (~680), dentro del bloque del botón Play (~765-777), donde hoy está:
```tsx
        {!match.isPlayed && onSimulate ? (
          <Button ...>
            <Play className="w-3 h-3" />
            {disabled ? '...' : 'Play'}
          </Button>
        ) : ( ... )}
```
Añadir el botón vivo junto al Play (dentro del mismo contenedor, después del `<Button>` Play), usando `matchCtx`:
```tsx
        {!match.isPlayed && onSimulate && (
          <WatchLiveButton
            matchId={matchCtx.match.id}
            homeTeamId={matchCtx.match.homeTeamId}
            awayTeamId={matchCtx.match.awayTeamId}
            kind={matchCtx.stage}
            groupId={matchCtx.groupId}
            disabled={disabled}
          />
        )}
```
Nota: `matchCtx.stage` es del tipo `MatchStage` del colector, con los mismos literales que `LiveMatchKind`, así que asigna directo. Para kinds knockout/continental/confederations el `groupId` es sintético y las acciones lo ignoran (solo usan `matchId`); solo qualifier/world-cup lo usan de verdad.

- [ ] **Step 2: Typecheck + lint + suite**

Run: `npx tsc -b` → exit 0.
Run: `npx eslint src/components/tournament/MatchCenter.tsx` → sin nuevos errores.
Run: `npx vitest run` → 156 + nuevos, sin regresión.

- [ ] **Step 3: Commit**

```bash
git add src/components/tournament/MatchCenter.tsx
git commit -m "feat(live): botón Ver en vivo por partido en el Centro de Partidos"
```

---

## Verificación final (tras todas las tareas)

- [ ] `npx tsc -b` → exit 0.
- [ ] `npx vitest run` → todo verde (156 previos + nuevos de Tasks 1,2,4,5,6,7).
- [ ] `npx eslint <archivos tocados>` → sin nuevos errores respecto a la base.
- [ ] Revisión manual sugerida: abrir un partido no jugado en cada fase (clasificatorias, grupo Mundial, knockout, continental, confederaciones) y en el Centro de Partidos, tocar "Ver en vivo", verificar reloj + goles + velocidad + saltar, y que un knockout empatado revele "Penales".
