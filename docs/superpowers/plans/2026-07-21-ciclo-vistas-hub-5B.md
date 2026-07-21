# Ciclo 5B — Vistas, wizard y hub (UI del ciclo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer el Ciclo (Torneos Continentales + Copa Confederaciones) **alcanzable y jugable** desde la app, con infraestructura de tests de componentes (jsdom + Testing Library).

**Architecture:** Toda la capa de datos + store + motor ya existe (Planes 1–5A: `core/cycle.ts`, `core/calendar.ts`, 5 acciones en `useTournamentStore`, tipos `Cycle`/`ContinentalStage`/`ConfederationsCup`/`CalendarState`). 5B agrega **solo UI**: 2 vistas nuevas (`ContinentalView`, `ConfederationsCupView`), pasos nuevos en `TournamentWizard`, entradas de navegación, y un banner de fase en `MatchCenter`. Las vistas reciben `cycle` + `teams` por props y solo consumen del store la acción de simulación + `isSavingMatch` (fáciles de testear). El orden de fases se hace cumplir a nivel wizard (los pasos se bloquean/desbloquean según `cycle.continental.isComplete` / `cycle.confederationsCup.isComplete` / `cycle.calendar.phase`).

**Tech Stack:** React 19.2, TypeScript 5.9, Vite 7, Zustand 5, Tailwind v4 (arcade/retro), Vitest 4, `@testing-library/react` (nuevo), jsdom (nuevo).

## Global Constraints

- **Gate real del repo = `npx tsc -b --noEmit` + `npx eslint` (ambos exit 0).** `tsc --noEmit` (sin `-b`) es NO-OP (tsconfig raíz solution-style). Lint de base ya roto: ~106 `no-explicit-any` en archivos ajenos. **NO introducir NINGÚN `any` nuevo** (ni `as any`). eslint `recommended` **flaggea vars/args sin usar AUNQUE tengan prefijo `_`** (no hay `argsIgnorePattern`): no dejar nada sin usar. Para mocks async sin parámetros usar `vi.fn(async () => {})` (una función con menos parámetros es asignable a una con más).
- **Full gate por tarea** (todas las tareas): `npx vitest run` (suite completa verde) + `npx tsc -b --noEmit` (0) + `npx eslint <archivos tocados>` (0 nuevos).
- **Suite base a preservar: 123 tests.** Ninguna tarea puede romperlos.
- **Las vistas nuevas NO llaman a las acciones async del store en los tests** (se mockean con `vi.fn`). En la app real (browser) sí las usan; en node/jsdom se cuelgan por `confirm()`+Supabase, por eso se mockean.
- **Estética arcade obligatoria** (reusar primitivos): `Card`/`CardHeader`/`CardTitle`/`CardContent` (`../ui/Card`), `Button` (`../ui/Button`, variants `primary|secondary|outline|ghost|danger`, sizes `sm|md|lg`), `ScoreBug` (`../ui/ScoreBug`, `size='narrow'|'md'|'lg'`), `StandingsTable` (`../ui/StandingsTable`). Tokens: `font-arcade`, `text-shadow-retro`, `text-gold`, `text-led`, `bg-grass-dark`, `border-line`, `shadow-hard-panel`, `text-grass-soft`. Íconos `lucide-react`. Toasts `sonner`.
- **`type View`** está declarado **por separado en 4 archivos** (`App.tsx`, `ui/Sidebar.tsx`, `ui/GameTabBar.tsx`, `ui/PauseMenu.tsx`): al agregar valores nuevos hay que tocar los 4 o `tsc -b` falla.
- **Nombres exactos de acciones del store** (ya existen): `drawContinental(): void`, `simulateContinentalMatch(matchId: string): Promise<void>`, `drawConfederations(): void`, `simulateConfederationsMatch(matchId: string): Promise<void>`, `advanceToQualifiers(): void`. Flags de estado: `isSavingMatch: boolean`, `teams: Team[]`, `currentTournament: Cycle | null`.
- **Helpers de calendario** (`../../core/calendar`): `isMatchPlayable(cycle, matchId): boolean`, `getPhaseMatches(cycle, phase): Match[]`. Regiones del ciclo: `CYCLE_REGIONS: Region[]` (= `['Europe','America','Africa','Asia']`) de `../../core/cycle`.

## Divergencias vs spec (cortes de alcance aprobados por contexto)

Documentadas acá para que el review NO las trate como defectos (son decisiones de alcance, no omisiones):

1. **Lockstep de jornada de Clasificatorias/Mundial DIFERIDO.** 5A no implementó el auto-avance intra-fase de esas fases, así que 5B NO mata el cherry-picking DENTRO de clasificatorias/mundial. El orden **entre fases** sí se hace cumplir (los pasos del wizard de Clasificatorias/Mundial quedan bloqueados hasta que el ciclo llega a `wc-qualifiers`). El lockstep fino de esas fases + rechazo a nivel store es un follow-up.
2. **`calendar.phase` NO avanza a `wc-groups`/`wc-knockout`/`completed` en 5B.** Tras `advanceToQualifiers` queda en `wc-qualifiers`; el flujo Mundial existente sigue guiándose por la presencia de `worldCup`/knockout (no por `calendar.phase`), así que no se rompe. Avanzar la fase por el Mundial es del Plan 6.
3. **Match Center NO fusiona los partidos continental/confed en su lista** (evita cirugía en un archivo de 793 líneas). En su lugar muestra un **banner de fase** que dirige a la vista dedicada. La fusión completa + "Simular jornada" para continental/confed es follow-up.
4. **Nombre de vista:** se usa `ConfederationsCupView` (coincide con spec §9/§12).

---

## File Structure

**Crear:**
- `src/utils/cycleProgress.ts` — helpers puros de progreso/gating del ciclo (consumidos por wizard + Match Center).
- `src/test/fixtures/cycle.ts` — fábricas de fixtures (equipos + ciclos sorteados) reutilizadas por todos los tests de componentes.
- `src/components/tournament/ContinentalView.tsx` — bracket por confederación (R64→Final), jugar jornada actual.
- `src/components/tournament/ConfederationsCupView.tsx` — 2 grupos + eliminación.
- Tests: `src/utils/__tests__/cycleProgress.test.ts`, `src/test/__tests__/jsdom-smoke.test.tsx`, `src/components/tournament/__tests__/ContinentalView.test.tsx`, `src/components/tournament/__tests__/ConfederationsCupView.test.tsx`, `src/components/tournament/__tests__/TournamentWizard.test.tsx`, `src/components/ui/__tests__/Sidebar.test.tsx`.

**Modificar:**
- `vitest.config.ts` (raíz) — `environment: 'jsdom'`, include `.tsx`.
- `src/test/setup.ts` — stub de storage con guarda + `@testing-library/jest-dom` + `cleanup`.
- `package.json` — devDeps de test.
- `src/App.tsx` — union `View`, ternario, montar vistas, pasar `onNavigate` al wizard.
- `src/components/ui/Sidebar.tsx`, `src/components/ui/GameTabBar.tsx`, `src/components/ui/PauseMenu.tsx` — union `View` (+ entradas de nav donde corresponda).
- `src/components/tournament/TournamentWizard.tsx` — 2 pasos nuevos + gating + acción móvil.
- `src/components/tournament/MatchCenter.tsx` — tipar `Cycle` + banner de fase.

---

## Task 1: Infra de tests (jsdom + Testing Library)

**Modelo sugerido:** sonnet (config + criterio sobre el stub de `localStorage`).

**Files:**
- Modify: `package.json` (devDependencies)
- Modify: `vitest.config.ts`
- Modify: `src/test/setup.ts`
- Test: `src/test/__tests__/jsdom-smoke.test.tsx` (Create)

**Interfaces:**
- Produces: entorno jsdom global + matchers `@testing-library/jest-dom` + auto-cleanup, habilitando `.test.tsx`. Consumido por Tasks 3–7.

- [ ] **Step 1: Instalar dependencias de test**

Run: `npm install -D jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event`
Expected: se agregan a `devDependencies` sin errores de peer (RTL 16 soporta React 19).

- [ ] **Step 2: Ampliar `vitest.config.ts`**

Reemplazar el contenido completo por:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
```

- [ ] **Step 3: Actualizar `src/test/setup.ts`**

Reemplazar el contenido completo por (la guarda evita pisar el `localStorage` real de jsdom, que es de solo-getter y tiraría al asignarle):

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Los stores usan el middleware `persist` de Zustand, que necesita
 * localStorage. jsdom ya lo provee; solo instalamos un stub en memoria cuando
 * NO existe (por si algún test corre en entorno node).
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = new MemoryStorage();
}
if (typeof globalThis.sessionStorage === 'undefined') {
  globalThis.sessionStorage = new MemoryStorage();
}

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 4: Test de humo del harness**

Crear `src/test/__tests__/jsdom-smoke.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

describe('harness jsdom + testing-library', () => {
  it('renderiza un componente y usa matchers de jest-dom', () => {
    render(<div>hola ciclo</div>);
    expect(screen.getByText('hola ciclo')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Correr la suite completa**

Run: `npx vitest run`
Expected: **124 tests verdes** (123 existentes bajo jsdom + 1 smoke). Si algún test existente falla por `localStorage`, revisar la guarda del Step 3 (no debe reinstalar el stub cuando jsdom ya provee storage).

- [ ] **Step 6: Gate de tipos + lint**

Run: `npx tsc -b --noEmit && npx eslint vitest.config.ts src/test/setup.ts src/test/__tests__/jsdom-smoke.test.tsx`
Expected: exit 0, sin `any`/unused nuevos.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/test/setup.ts src/test/__tests__/jsdom-smoke.test.tsx
git commit -m "test(infra): jsdom + testing-library para tests de componentes"
```

---

## Task 2: Helpers puros del ciclo + fixtures de test

**Modelo sugerido:** haiku (transcripción del código provisto + TDD node).

**Files:**
- Create: `src/utils/cycleProgress.ts`
- Create: `src/test/fixtures/cycle.ts`
- Test: `src/utils/__tests__/cycleProgress.test.ts`

**Interfaces:**
- Consumes: `getPhaseMatches` (`../core/calendar`), `toCycle`/`drawContinentalStage`/`recordContinentalMatch`/`drawConfederationsStage`/`recordConfedGroupMatch`/`recordConfedKnockoutMatch`/`KnockoutResult` (`../../core/cycle`), tipos `Cycle`/`KnockoutMatch`/`Region`/`Team`/`Tournament`.
- Produces (cycleProgress):
  - `getContinentalProgress(cycle): PhaseProgress`
  - `getConfederationsProgress(cycle): PhaseProgress`
  - `isContinentalDrawn(cycle): boolean`
  - `isConfederationsDrawn(cycle): boolean`
  - `canDrawContinental(cycle): boolean`
  - `canDrawConfederations(cycle): boolean`
  - `canAdvanceToQualifiers(cycle): boolean`
  - `canDrawQualifiers(cycle): boolean`
  - `continentalRoundLabel(matchday): string`, `confedRoundLabel(matchday): string`
  - `getCyclePhaseBanner(cycle): CyclePhaseBanner | null`
- Produces (fixtures): `baseTournament()`, `teamsByRegion()`, `makeDrawnContinentalCycle()`, `makeContinentalDoneCycle()`, `cycleWithContinentalDone()`, `makeDrawnConfedCycle()`.

- [ ] **Step 1: Escribir `src/utils/cycleProgress.ts`**

```ts
import type { Cycle } from '../types';
import { getPhaseMatches } from '../core/calendar';

export interface PhaseProgress {
  playedMatches: number;
  totalMatches: number;
  percentage: number;
  isComplete: boolean;
}

function phaseProgress(cycle: Cycle, phase: 'continental' | 'confed', isComplete: boolean): PhaseProgress {
  const matches = getPhaseMatches(cycle, phase);
  const total = matches.length;
  const played = matches.filter((m) => m.isPlayed).length;
  return {
    playedMatches: played,
    totalMatches: total,
    percentage: total > 0 ? Math.round((played / total) * 100) : 0,
    isComplete,
  };
}

export function getContinentalProgress(cycle: Cycle): PhaseProgress {
  return phaseProgress(cycle, 'continental', cycle.continental.isComplete);
}

export function getConfederationsProgress(cycle: Cycle): PhaseProgress {
  return phaseProgress(cycle, 'confed', cycle.confederationsCup.isComplete);
}

/** ¿Ya se sortearon los brackets continentales? (algún bracket tiene R64). */
export function isContinentalDrawn(cycle: Cycle): boolean {
  return Object.values(cycle.continental.brackets).some((b) => b.roundOf64.length > 0);
}

/** ¿Ya se sortearon los grupos de la Copa Confederaciones? */
export function isConfederationsDrawn(cycle: Cycle): boolean {
  return cycle.confederationsCup.groups.length > 0;
}

export function canDrawContinental(cycle: Cycle): boolean {
  return cycle.calendar.phase === 'continental' && !isContinentalDrawn(cycle);
}

export function canDrawConfederations(cycle: Cycle): boolean {
  return cycle.continental.isComplete && !isConfederationsDrawn(cycle);
}

export function canAdvanceToQualifiers(cycle: Cycle): boolean {
  return cycle.confederationsCup.isComplete && cycle.calendar.phase !== 'wc-qualifiers';
}

export function canDrawQualifiers(cycle: Cycle): boolean {
  return (
    cycle.calendar.phase === 'wc-qualifiers' &&
    !getPhaseMatches(cycle, 'wc-qualifiers').some((m) => m.isPlayed)
  );
}

const CONTINENTAL_ROUND: Record<number, string> = {
  1: 'R64', 2: 'R32', 3: 'R16', 4: 'Cuartos', 5: 'Semis', 6: 'Final',
};
export function continentalRoundLabel(matchday: number): string {
  return CONTINENTAL_ROUND[matchday] ?? '—';
}

const CONFED_ROUND: Record<number, string> = {
  1: 'Grupos J1', 2: 'Grupos J2', 3: 'Grupos J3', 4: 'Semifinales', 5: 'Final + 3º',
};
export function confedRoundLabel(matchday: number): string {
  return CONFED_ROUND[matchday] ?? '—';
}

export interface CyclePhaseBanner {
  label: string;
  targetView: 'continental' | 'confederations';
}

/** Banner de "fase activa" para el Match Center; null si no es fase de ciclo. */
export function getCyclePhaseBanner(cycle: Cycle): CyclePhaseBanner | null {
  if (cycle.calendar.phase === 'continental') {
    return {
      label: `Torneos Continentales · ${continentalRoundLabel(cycle.calendar.matchday)}`,
      targetView: 'continental',
    };
  }
  if (cycle.calendar.phase === 'confed') {
    return {
      label: `Copa Confederaciones · ${confedRoundLabel(cycle.calendar.matchday)}`,
      targetView: 'confederations',
    };
  }
  return null;
}
```

- [ ] **Step 2: Escribir `src/test/fixtures/cycle.ts`**

Fábricas deterministas (patrones tomados de `src/core/__tests__/cycle.test.ts`; `Team` = `{ id, name, flag, region, skill }`):

```ts
import {
  toCycle,
  drawContinentalStage,
  recordContinentalMatch,
  drawConfederationsStage,
  recordConfedGroupMatch,
  recordConfedKnockoutMatch,
  type KnockoutResult,
} from '../../core/cycle';
import type { Cycle, KnockoutMatch, Region, Team, Tournament } from '../../types';

const REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

export function baseTournament(): Tournament {
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

function makeRegionTeams(region: Region, count: number): Team[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${region}-${i}`,
    name: `${region} ${i}`,
    flag: '🏳️',
    region,
    skill: 100 - i,
  }));
}

export function teamsByRegion(): Record<Region, Team[]> {
  return {
    Europe: makeRegionTeams('Europe', 55),
    Asia: makeRegionTeams('Asia', 55),
    Africa: makeRegionTeams('Africa', 55),
    America: makeRegionTeams('America', 45),
  };
}

/** Ciclo con continental sorteado (calendario en continental md1, R64 poblada). */
export function makeDrawnContinentalCycle(): { cycle: Cycle; teams: Team[] } {
  const byRegion = teamsByRegion();
  const teams = REGIONS.flatMap((r) => byRegion[r]);
  const cycle = drawContinentalStage(toCycle(baseTournament()), byRegion);
  return { cycle, teams };
}

/** Juega toda la jornada continental actual (gana el local) y devuelve el ciclo avanzado. */
export function playContinentalMatchday(cycle: Cycle): Cycle {
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

/** Ciclo con continental COMPLETO (6 jornadas jugadas). */
export function makeContinentalDoneCycle(): { cycle: Cycle; teams: Team[] } {
  const { teams } = makeDrawnContinentalCycle();
  let cycle = makeDrawnContinentalCycle().cycle;
  for (let i = 0; i < 6; i++) cycle = playContinentalMatchday(cycle);
  return { cycle, teams };
}

/** Continental completo con finalistas sintéticos (rápido; sin correr 6 jornadas). */
export function cycleWithContinentalDone(): { cycle: Cycle; teams: Team[] } {
  const teams: Team[] = [];
  const base = toCycle(baseTournament());
  const brackets = { ...base.continental.brackets };
  REGIONS.forEach((r, ri) => {
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

/** Ciclo con Copa Confederaciones sorteada (calendario en confed md1, 2 grupos). */
export function makeDrawnConfedCycle(): { cycle: Cycle; teams: Team[] } {
  const { cycle, teams } = cycleWithContinentalDone();
  return { cycle: drawConfederationsStage(cycle, teams), teams };
}
```

Nota: `recordConfedGroupMatch`/`recordConfedKnockoutMatch` se importan aunque no se usen en este archivo → **eliminar los imports que no uses** (eslint flaggea imports sin usar). Dejar solo `toCycle, drawContinentalStage, recordContinentalMatch, drawConfederationsStage, type KnockoutResult`.

- [ ] **Step 3: Escribir el test (falla primero)**

Crear `src/utils/__tests__/cycleProgress.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  getContinentalProgress, getConfederationsProgress,
  isContinentalDrawn, isConfederationsDrawn,
  canDrawContinental, canDrawConfederations,
  canAdvanceToQualifiers, canDrawQualifiers,
  continentalRoundLabel, getCyclePhaseBanner,
} from '../cycleProgress';
import { toCycle } from '../../core/cycle';
import {
  baseTournament, makeDrawnContinentalCycle,
  makeContinentalDoneCycle, makeDrawnConfedCycle,
} from '../../test/fixtures/cycle';

describe('cycleProgress', () => {
  it('ciclo nuevo: continental sin sortear', () => {
    const cycle = toCycle(baseTournament());
    expect(isContinentalDrawn(cycle)).toBe(false);
    expect(canDrawContinental(cycle)).toBe(true);
    expect(getContinentalProgress(cycle)).toMatchObject({ totalMatches: 0, percentage: 0, isComplete: false });
  });

  it('tras sortear continental hay partidos y no se puede re-sortear', () => {
    const { cycle } = makeDrawnContinentalCycle();
    expect(isContinentalDrawn(cycle)).toBe(true);
    expect(canDrawContinental(cycle)).toBe(false);
    const p = getContinentalProgress(cycle);
    expect(p.totalMatches).toBeGreaterThan(0);
    expect(p.playedMatches).toBe(0);
  });

  it('continental completo habilita sortear confederaciones', () => {
    const { cycle } = makeContinentalDoneCycle();
    expect(getContinentalProgress(cycle).isComplete).toBe(true);
    expect(canDrawConfederations(cycle)).toBe(true);
    expect(isConfederationsDrawn(cycle)).toBe(false);
  });

  it('confederaciones sorteadas: no re-sortea, progreso desde 0', () => {
    const { cycle } = makeDrawnConfedCycle();
    expect(isConfederationsDrawn(cycle)).toBe(true);
    expect(canDrawConfederations(cycle)).toBe(false);
    expect(getConfederationsProgress(cycle).totalMatches).toBeGreaterThan(0);
  });

  it('gates de clasificatorias según fase', () => {
    const { cycle } = makeDrawnConfedCycle();
    expect(canAdvanceToQualifiers(cycle)).toBe(false); // confed no completo
    const done = { ...cycle, confederationsCup: { ...cycle.confederationsCup, isComplete: true } };
    expect(canAdvanceToQualifiers(done)).toBe(true);
    const inQuali = { ...done, calendar: { phase: 'wc-qualifiers' as const, matchday: 1 } };
    expect(canAdvanceToQualifiers(inQuali)).toBe(false);
    expect(canDrawQualifiers(inQuali)).toBe(true);
  });

  it('labels y banner de fase', () => {
    expect(continentalRoundLabel(1)).toBe('R64');
    expect(continentalRoundLabel(6)).toBe('Final');
    const { cycle } = makeDrawnContinentalCycle();
    expect(getCyclePhaseBanner(cycle)).toEqual({ label: 'Torneos Continentales · R64', targetView: 'continental' });
    expect(getCyclePhaseBanner(toCycle(baseTournament()))).toEqual({ label: 'Torneos Continentales · R64', targetView: 'continental' });
  });
});
```

Nota: el banner del ciclo recién creado (`calendar.matchday: 0`) daría `continentalRoundLabel(0) = '—'`; ajustá la última aserción a `'Torneos Continentales · —'` si tu fixture arranca en md0. Verificá el valor real y fijá la aserción a lo que corresponde (NO al revés).

- [ ] **Step 4: Correr y verificar verde**

Run: `npx vitest run src/utils/__tests__/cycleProgress.test.ts`
Expected: PASS.

- [ ] **Step 5: Gate completo**

Run: `npx vitest run && npx tsc -b --noEmit && npx eslint src/utils/cycleProgress.ts src/test/fixtures/cycle.ts src/utils/__tests__/cycleProgress.test.ts`
Expected: suite verde, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/utils/cycleProgress.ts src/test/fixtures/cycle.ts src/utils/__tests__/cycleProgress.test.ts
git commit -m "feat(cycle): helpers de progreso/gating + fixtures de test del ciclo"
```

---

## Task 3: `ContinentalView`

**Modelo sugerido:** haiku (transcripción del componente + test provistos).

**Files:**
- Create: `src/components/tournament/ContinentalView.tsx`
- Test: `src/components/tournament/__tests__/ContinentalView.test.tsx`

**Interfaces:**
- Consumes: props `{ cycle: Cycle; teams: Team[] }`; store `{ simulateContinentalMatch, isSavingMatch }`; `isMatchPlayable`, `CYCLE_REGIONS`, `continentalRoundLabel`.
- Produces: componente `ContinentalView`.

- [ ] **Step 1: Escribir `src/components/tournament/ContinentalView.tsx`**

```tsx
import { useState } from 'react';
import type { Cycle, Team, KnockoutMatch, Region } from '../../types';
import { CYCLE_REGIONS } from '../../core/cycle';
import { isMatchPlayable } from '../../core/calendar';
import { continentalRoundLabel } from '../../utils/cycleProgress';
import { useTournamentStore } from '../../store/useTournamentStore';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { ScoreBug } from '../ui/ScoreBug';
import { Play, Trophy, Globe2 } from 'lucide-react';
import { toast } from 'sonner';

const REGION_LABELS: Record<Region, string> = {
  Europe: 'Europa', America: 'América', Africa: 'África', Asia: 'Asia',
};

const ROUND_KEYS: { key: 'roundOf64' | 'roundOf32' | 'roundOf16' | 'quarterFinals' | 'semiFinals'; label: string }[] = [
  { key: 'roundOf64', label: 'R64' },
  { key: 'roundOf32', label: 'R32' },
  { key: 'roundOf16', label: 'R16' },
  { key: 'quarterFinals', label: 'CUARTOS' },
  { key: 'semiFinals', label: 'SEMIS' },
];

interface ContinentalViewProps {
  cycle: Cycle;
  teams: Team[];
}

export function ContinentalView({ cycle, teams }: ContinentalViewProps) {
  const { simulateContinentalMatch, isSavingMatch } = useTournamentStore();
  const [region, setRegion] = useState<Region>(CYCLE_REGIONS[0]);

  const getTeam = (id: string) => teams.find((t) => t.id === id);
  const bracket = cycle.continental.brackets[region];

  const handlePlay = async (matchId: string) => {
    if (isSavingMatch) {
      toast.warning('Espera a que se guarde el partido anterior');
      return;
    }
    await simulateContinentalMatch(matchId);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Globe2 className="w-6 h-6 text-gold" />
            <CardTitle>Torneos Continentales</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-grass-soft text-sm">
            Jornada {cycle.calendar.matchday} · {continentalRoundLabel(cycle.calendar.matchday)}
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {CYCLE_REGIONS.map((r) => (
              <button
                key={r}
                onClick={() => setRegion(r)}
                className={`px-4 py-2 min-h-11 lg:min-h-0 font-arcade text-[10px] uppercase border-2 transition-colors ${
                  region === r
                    ? 'bg-grass text-white border-line'
                    : 'text-grass-soft border-grass hover:bg-grass/40 hover:text-white'
                }`}
              >
                {REGION_LABELS[r]}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{REGION_LABELS[region]}</CardTitle>
        </CardHeader>
        <CardContent>
          {bracket.championId && (
            <div className="mb-4 flex items-center gap-2 text-gold font-arcade text-xs">
              <Trophy className="w-5 h-5" />
              Campeón: {getTeam(bracket.championId)?.name ?? bracket.championId}
            </div>
          )}

          <div className="overflow-x-auto">
            <div className="flex gap-4 min-w-max pb-2">
              {ROUND_KEYS.map(({ key, label }) => (
                <RoundColumn
                  key={key}
                  label={label}
                  matches={bracket[key]}
                  cycle={cycle}
                  getTeam={getTeam}
                  onPlay={handlePlay}
                  isSaving={isSavingMatch}
                />
              ))}
              <RoundColumn
                label="FINAL"
                matches={bracket.final ? [bracket.final] : []}
                cycle={cycle}
                getTeam={getTeam}
                onPlay={handlePlay}
                isSaving={isSavingMatch}
              />
            </div>
          </div>

          {bracket.byeTeamIds.length > 0 && (
            <div className="mt-4 text-xs text-grass-soft">
              <span className="font-arcade text-[10px] uppercase">Byes a R32:</span>{' '}
              {bracket.byeTeamIds.map((id) => getTeam(id)?.id.toUpperCase() ?? id).join(' · ')}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface RoundColumnProps {
  label: string;
  matches: KnockoutMatch[];
  cycle: Cycle;
  getTeam: (id: string) => Team | undefined;
  onPlay: (id: string) => void;
  isSaving: boolean;
}

function RoundColumn({ label, matches, cycle, getTeam, onPlay, isSaving }: RoundColumnProps) {
  return (
    <div className="flex flex-col gap-3 w-64 flex-shrink-0">
      <h4 className="font-arcade text-[10px] text-gold uppercase text-center">{label}</h4>
      {matches.length === 0 ? (
        <p className="text-center text-grass-soft text-xs">—</p>
      ) : (
        matches.map((m) => (
          <BracketMatch key={m.id} match={m} cycle={cycle} getTeam={getTeam} onPlay={onPlay} isSaving={isSaving} />
        ))
      )}
    </div>
  );
}

interface BracketMatchProps {
  match: KnockoutMatch;
  cycle: Cycle;
  getTeam: (id: string) => Team | undefined;
  onPlay: (id: string) => void;
  isSaving: boolean;
}

function BracketMatch({ match, cycle, getTeam, onPlay, isSaving }: BracketMatchProps) {
  const home = getTeam(match.homeTeamId);
  const away = getTeam(match.awayTeamId);
  const playable = isMatchPlayable(cycle, match.id);
  return (
    <div className="space-y-2">
      {home && away ? (
        <ScoreBug
          size="narrow"
          homeTeam={home}
          awayTeam={away}
          homeScore={match.isPlayed ? match.homeScore : null}
          awayScore={match.isPlayed ? match.awayScore : null}
        />
      ) : (
        <div className="text-grass-soft text-xs text-center">
          {match.homeTeamId} vs {match.awayTeamId}
        </div>
      )}
      {match.penalties && (
        <p className="text-[10px] text-center text-grass-soft">
          Pen. {match.penalties.homeScore}-{match.penalties.awayScore}
        </p>
      )}
      {!match.isPlayed && playable && (
        <Button variant="primary" size="sm" onClick={() => onPlay(match.id)} disabled={isSaving} className="w-full gap-1">
          <Play className="w-3 h-3" /> Play
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Escribir el test**

Crear `src/components/tournament/__tests__/ContinentalView.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ContinentalView } from '../ContinentalView';
import { useTournamentStore } from '../../../store/useTournamentStore';
import { makeDrawnContinentalCycle } from '../../../test/fixtures/cycle';

describe('ContinentalView', () => {
  it('renderiza el bracket de Europa con partidos R64 jugables e invoca la acción', async () => {
    const { cycle, teams } = makeDrawnContinentalCycle();
    const simulateContinentalMatch = vi.fn(async () => {});
    useTournamentStore.setState({ simulateContinentalMatch, isSavingMatch: false });

    render(<ContinentalView cycle={cycle} teams={teams} />);

    expect(screen.getByText('Torneos Continentales')).toBeInTheDocument();
    const playButtons = screen.getAllByRole('button', { name: /play/i });
    // Europa: 23 cruces R64, todos en la jornada actual (md1).
    expect(playButtons).toHaveLength(cycle.continental.brackets.Europe.roundOf64.length);

    await userEvent.click(playButtons[0]);
    expect(simulateContinentalMatch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Correr el test**

Run: `npx vitest run src/components/tournament/__tests__/ContinentalView.test.tsx`
Expected: PASS. Si `getAllByRole('button', { name: /play/i })` no matchea, verificá que el `<Button>` renderiza el texto "Play" accesible (lo hace: `<span className="hidden sm:inline">Play</span>` está oculto por CSS pero presente en el DOM/accessible name en jsdom).

- [ ] **Step 4: Gate completo**

Run: `npx vitest run && npx tsc -b --noEmit && npx eslint src/components/tournament/ContinentalView.tsx src/components/tournament/__tests__/ContinentalView.test.tsx`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/tournament/ContinentalView.tsx src/components/tournament/__tests__/ContinentalView.test.tsx
git commit -m "feat(ui): ContinentalView (bracket R64→Final por confederación)"
```

---

## Task 4: `ConfederationsCupView`

**Modelo sugerido:** haiku (transcripción del componente + test provistos).

**Files:**
- Create: `src/components/tournament/ConfederationsCupView.tsx`
- Test: `src/components/tournament/__tests__/ConfederationsCupView.test.tsx`

**Interfaces:**
- Consumes: props `{ cycle: Cycle; teams: Team[] }`; store `{ simulateConfederationsMatch, isSavingMatch }`; `isMatchPlayable`; `StandingsTable`.
- Produces: componente `ConfederationsCupView`.

- [ ] **Step 1: Escribir `src/components/tournament/ConfederationsCupView.tsx`**

```tsx
import type { Cycle, Team, Match, KnockoutMatch, WorldCupGroup } from '../../types';
import { isMatchPlayable } from '../../core/calendar';
import { useTournamentStore } from '../../store/useTournamentStore';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { StandingsTable } from '../ui/StandingsTable';
import { ScoreBug } from '../ui/ScoreBug';
import { Play, Trophy, Award } from 'lucide-react';
import { toast } from 'sonner';

type MatchWithPenalties = Match & { penalties?: { homeScore: number; awayScore: number } };

interface ConfederationsCupViewProps {
  cycle: Cycle;
  teams: Team[];
}

export function ConfederationsCupView({ cycle, teams }: ConfederationsCupViewProps) {
  const { simulateConfederationsMatch, isSavingMatch } = useTournamentStore();
  const getTeam = (id: string) => teams.find((t) => t.id === id);
  const confed = cycle.confederationsCup;

  const handlePlay = async (matchId: string) => {
    if (isSavingMatch) {
      toast.warning('Espera a que se guarde el partido anterior');
      return;
    }
    await simulateConfederationsMatch(matchId);
  };

  const knockout: { label: string; match: KnockoutMatch | null }[] = [
    ...confed.knockout.semiFinals.map((m, i) => ({ label: `Semifinal ${i + 1}`, match: m })),
    { label: '3er Puesto', match: confed.knockout.thirdPlace },
    { label: 'Final', match: confed.knockout.final },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Award className="w-6 h-6 text-gold" />
            <CardTitle>Copa Confederaciones</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {confed.championId ? (
            <div className="flex items-center gap-2 text-gold font-arcade text-xs">
              <Trophy className="w-5 h-5" />
              Campeón: {getTeam(confed.championId)?.name ?? confed.championId}
            </div>
          ) : (
            <p className="text-grass-soft text-sm">Jornada {cycle.calendar.matchday}</p>
          )}
        </CardContent>
      </Card>

      {confed.groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-grass-soft">
            El sorteo de la Copa Confederaciones todavía no se realizó.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {confed.groups.map((group) => (
              <ConfedGroup
                key={group.id}
                group={group}
                teams={teams}
                cycle={cycle}
                getTeam={getTeam}
                onPlay={handlePlay}
                isSaving={isSavingMatch}
              />
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Eliminación</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {knockout.map(({ label, match }) => (
                  <div key={label} className="space-y-2">
                    <h4 className="font-arcade text-[10px] text-gold uppercase">{label}</h4>
                    {match ? (
                      <ConfedMatch match={match} cycle={cycle} getTeam={getTeam} onPlay={handlePlay} isSaving={isSavingMatch} />
                    ) : (
                      <p className="text-grass-soft text-xs">Pendiente</p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

interface ConfedGroupProps {
  group: WorldCupGroup;
  teams: Team[];
  cycle: Cycle;
  getTeam: (id: string) => Team | undefined;
  onPlay: (id: string) => void;
  isSaving: boolean;
}

function ConfedGroup({ group, teams, cycle, getTeam, onPlay, isSaving }: ConfedGroupProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{group.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <StandingsTable standings={group.standings} teams={teams} matches={group.matches} highlightQualified={2} />
        <div className="space-y-2">
          {group.matches.map((m) => (
            <ConfedMatch key={m.id} match={m} cycle={cycle} getTeam={getTeam} onPlay={onPlay} isSaving={isSaving} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface ConfedMatchProps {
  match: MatchWithPenalties;
  cycle: Cycle;
  getTeam: (id: string) => Team | undefined;
  onPlay: (id: string) => void;
  isSaving: boolean;
}

function ConfedMatch({ match, cycle, getTeam, onPlay, isSaving }: ConfedMatchProps) {
  const home = getTeam(match.homeTeamId);
  const away = getTeam(match.awayTeamId);
  const playable = isMatchPlayable(cycle, match.id);
  return (
    <div className="space-y-2">
      {home && away ? (
        <ScoreBug
          size="narrow"
          homeTeam={home}
          awayTeam={away}
          homeScore={match.isPlayed ? match.homeScore : null}
          awayScore={match.isPlayed ? match.awayScore : null}
        />
      ) : (
        <div className="text-grass-soft text-xs text-center">
          {match.homeTeamId} vs {match.awayTeamId}
        </div>
      )}
      {match.penalties && (
        <p className="text-[10px] text-center text-grass-soft">
          Pen. {match.penalties.homeScore}-{match.penalties.awayScore}
        </p>
      )}
      {!match.isPlayed && playable && (
        <Button variant="primary" size="sm" onClick={() => onPlay(match.id)} disabled={isSaving} className="w-full gap-1">
          <Play className="w-3 h-3" /> Play
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Escribir el test**

Crear `src/components/tournament/__tests__/ConfederationsCupView.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ConfederationsCupView } from '../ConfederationsCupView';
import { useTournamentStore } from '../../../store/useTournamentStore';
import { makeDrawnConfedCycle } from '../../../test/fixtures/cycle';

describe('ConfederationsCupView', () => {
  it('renderiza 2 grupos con partidos de la jornada 1 jugables e invoca la acción', async () => {
    const { cycle, teams } = makeDrawnConfedCycle();
    const simulateConfederationsMatch = vi.fn(async () => {});
    useTournamentStore.setState({ simulateConfederationsMatch, isSavingMatch: false });

    render(<ConfederationsCupView cycle={cycle} teams={teams} />);

    expect(screen.getByText('Copa Confederaciones')).toBeInTheDocument();
    const playButtons = screen.getAllByRole('button', { name: /play/i });
    // md1: 2 partidos jugables por grupo × 2 grupos = 4.
    expect(playButtons).toHaveLength(4);

    await userEvent.click(playButtons[0]);
    expect(simulateConfederationsMatch).toHaveBeenCalledTimes(1);
  });
});
```

Nota: verificá que el template de grupos genera 2 partidos en la jornada 1 (matchday 1) por grupo. Si el conteo real difiere, ajustá la aserción al valor REAL observado (los partidos con `matchday === 1` de ambos grupos).

- [ ] **Step 3: Correr el test**

Run: `npx vitest run src/components/tournament/__tests__/ConfederationsCupView.test.tsx`
Expected: PASS.

- [ ] **Step 4: Gate completo**

Run: `npx vitest run && npx tsc -b --noEmit && npx eslint src/components/tournament/ConfederationsCupView.tsx src/components/tournament/__tests__/ConfederationsCupView.test.tsx`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/tournament/ConfederationsCupView.tsx src/components/tournament/__tests__/ConfederationsCupView.test.tsx
git commit -m "feat(ui): ConfederationsCupView (grupos + eliminación)"
```

---

## Task 5: Pasos del ciclo en `TournamentWizard`

**Modelo sugerido:** sonnet (integración + gating en componente existente).

**Files:**
- Modify: `src/components/tournament/TournamentWizard.tsx`
- Test: `src/components/tournament/__tests__/TournamentWizard.test.tsx` (Create)

**Interfaces:**
- Consumes: acciones `drawContinental`, `drawConfederations`, `advanceToQualifiers`; helpers de `cycleProgress`; prop nueva `onNavigate?`.
- Produces: wizard con 5 pasos (Continental, Confederaciones, Clasificatorias, Mundial grupos, Playoffs) + acción móvil contextual.

- [ ] **Step 1: Firma del componente + prop `onNavigate`**

Cambiar la firma (línea 29):
```tsx
export function TournamentWizard({ onNavigate }: { onNavigate?: (view: string) => void }) {
```

- [ ] **Step 2: Imports**

Agregar al destructure del store (líneas 30–38) las 3 acciones nuevas: `drawContinental`, `drawConfederations`, `advanceToQualifiers`.

Agregar import de helpers (junto a los imports existentes de `../../utils/tournamentProgress`):
```tsx
import {
  getContinentalProgress,
  getConfederationsProgress,
  canDrawContinental,
  canDrawConfederations,
  canAdvanceToQualifiers,
  canDrawQualifiers,
  isContinentalDrawn,
  isConfederationsDrawn,
  continentalRoundLabel,
  confedRoundLabel,
} from '../../utils/cycleProgress';
```

- [ ] **Step 3: Handlers nuevos (antes del `useMobileAction`, junto a `handleGenerateDraw`, ~línea 61)**

```tsx
  const handleDrawContinental = () => {
    if (confirm('¿Sortear los 4 torneos continentales?\n\nSe generarán los brackets (byes + bombos) y comenzará la fase continental.')) {
      drawContinental();
      toast.success('🌍 ¡Torneos continentales sorteados!');
      onNavigate?.('continental');
    }
  };

  const handleDrawConfederations = () => {
    if (confirm('¿Sortear la Copa Confederaciones con los 8 finalistas continentales?')) {
      drawConfederations();
      toast.success('🏆 ¡Copa Confederaciones sorteada!');
      onNavigate?.('confederations');
    }
  };

  const handleAdvanceToQualifiers = () => {
    if (confirm('¿Avanzar a las Clasificatorias del Mundial?\n\nLa Copa Confederaciones quedará cerrada.')) {
      advanceToQualifiers();
      toast.success('⚽ ¡Fase de Clasificatorias habilitada!');
      onNavigate?.('qualifiers');
    }
  };
```

- [ ] **Step 4: Acción móvil contextual (reemplaza el `useMobileAction` actual, líneas 63–67)**

```tsx
  const mobileAction = (() => {
    if (!currentTournament) return null;
    const c = currentTournament;
    if (canDrawContinental(c)) return { label: '▶ SORTEAR CONTINENTAL', onPress: handleDrawContinental };
    if (c.calendar.phase === 'continental' && !c.continental.isComplete) {
      return { label: '▶ JUGAR CONTINENTAL', onPress: () => onNavigate?.('continental') };
    }
    if (canDrawConfederations(c)) return { label: '▶ SORTEAR CONFED', onPress: handleDrawConfederations };
    if (c.calendar.phase === 'confed' && !c.confederationsCup.isComplete) {
      return { label: '▶ JUGAR CONFED', onPress: () => onNavigate?.('confederations') };
    }
    if (canAdvanceToQualifiers(c)) return { label: '▶ IR A CLASIFICATORIAS', onPress: handleAdvanceToQualifiers };
    if (canDrawQualifiers(c)) return { label: '▶ PRESS START', onPress: handleGenerateDraw };
    return null;
  })();
  useMobileAction(mobileAction);
```

- [ ] **Step 5: Progreso/gating del ciclo (después del guard `if (!currentTournament || !qualifierProgress) return null;`, junto a `canGenerateDraw`, ~línea 92)**

```tsx
  const continentalProgress = getContinentalProgress(currentTournament);
  const confederationsProgress = getConfederationsProgress(currentTournament);
  const canDrawCont = canDrawContinental(currentTournament);
  const canDrawConfed = canDrawConfederations(currentTournament);
  const canAdvanceQual = canAdvanceToQualifiers(currentTournament);
```

Cambiar `canGenerateDraw` (línea 93) de `!currentTournament.hasAnyMatchPlayed` a:
```tsx
  const canGenerateDraw = canDrawQualifiers(currentTournament);
```

- [ ] **Step 6: Insertar los 2 StepCards nuevos ANTES del StepCard de Clasificatorias (antes de `{/* Step 1: Qualifiers */}`, línea 216)**

```tsx
          {/* Step 1: Torneos Continentales */}
          <StepCard
            number={1}
            title="Torneos Continentales"
            description="Eliminación directa por confederación (R64 → Final)"
            icon={<Globe2 className="w-6 h-6" />}
            status={
              continentalProgress.isComplete
                ? 'complete'
                : continentalProgress.playedMatches > 0
                ? 'in-progress'
                : 'pending'
            }
            progress={continentalProgress.percentage}
            stats={[
              { label: 'Partidos jugados', value: `${continentalProgress.playedMatches}/${continentalProgress.totalMatches}` },
              { label: 'Fase', value: continentalRoundLabel(currentTournament.calendar.matchday) },
            ]}
            actions={
              canDrawCont ? (
                <Button variant="primary" size="sm" onClick={handleDrawContinental} className="gap-2">
                  <Sparkles className="w-4 h-4" />
                  Sortear Continentales
                </Button>
              ) : isContinentalDrawn(currentTournament) && !continentalProgress.isComplete ? (
                <Button variant="secondary" size="sm" onClick={() => onNavigate?.('continental')} className="gap-2">
                  <Globe2 className="w-4 h-4" />
                  Ver / Jugar
                </Button>
              ) : null
            }
          />

          {/* Step 2: Copa Confederaciones */}
          <StepCard
            number={2}
            title="Copa Confederaciones"
            description="8 finalistas · 2 grupos → semis → final + 3º"
            icon={<Award className="w-6 h-6" />}
            status={
              !currentTournament.continental.isComplete
                ? 'locked'
                : confederationsProgress.isComplete
                ? 'complete'
                : confederationsProgress.playedMatches > 0
                ? 'in-progress'
                : 'pending'
            }
            progress={confederationsProgress.percentage}
            stats={
              currentTournament.continental.isComplete
                ? [
                    { label: 'Partidos jugados', value: `${confederationsProgress.playedMatches}/${confederationsProgress.totalMatches}` },
                    { label: 'Fase', value: confedRoundLabel(currentTournament.calendar.matchday) },
                  ]
                : []
            }
            actions={
              canDrawConfed ? (
                <Button variant="primary" size="sm" onClick={handleDrawConfederations} className="gap-2">
                  <Sparkles className="w-4 h-4" />
                  Sortear Confederaciones
                </Button>
              ) : isConfederationsDrawn(currentTournament) && !confederationsProgress.isComplete ? (
                <Button variant="secondary" size="sm" onClick={() => onNavigate?.('confederations')} className="gap-2">
                  <Award className="w-4 h-4" />
                  Ver / Jugar
                </Button>
              ) : null
            }
          />
```

- [ ] **Step 7: Re-numerar y re-gatear los 3 StepCards existentes**

- **Clasificatorias:** `number={1}` → `number={3}`. Cambiar `status` a bloqueado hasta confed completo, y `actions` para ofrecer "Ir a Clasificatorias":
```tsx
            status={
              !currentTournament.confederationsCup.isComplete
                ? 'locked'
                : qualifierProgress.isComplete
                ? 'complete'
                : qualifierProgress.playedMatches > 0
                ? 'in-progress'
                : 'pending'
            }
```
```tsx
            actions={
              canAdvanceQual ? (
                <Button variant="primary" size="lg" onClick={handleAdvanceToQualifiers} className="gap-2">
                  ⚽ Ir a Clasificatorias
                </Button>
              ) : canGenerateDraw ? (
                <Button size="lg" onClick={handleGenerateDraw} className="hidden lg:inline-flex">
                  ▶ PRESS START
                </Button>
              ) : null
            }
```
- **Mundial - Fase de Grupos:** `number={2}` → `number={4}` (sin otros cambios).
- **Playoffs - Eliminación Directa:** `number={3}` → `number={5}` (sin otros cambios).

- [ ] **Step 8: Escribir el test**

Crear `src/components/tournament/__tests__/TournamentWizard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TournamentWizard } from '../TournamentWizard';
import { MobileActionProvider } from '../../../hooks/useMobileAction';
import { useTournamentStore } from '../../../store/useTournamentStore';
import { toCycle } from '../../../core/cycle';
import { baseTournament, makeContinentalDoneCycle } from '../../../test/fixtures/cycle';

function renderWizard() {
  return render(
    <MobileActionProvider>
      <TournamentWizard />
    </MobileActionProvider>
  );
}

describe('TournamentWizard — pasos del ciclo', () => {
  it('ciclo nuevo: muestra los pasos Continental y Confederaciones', () => {
    useTournamentStore.setState({ currentTournament: toCycle(baseTournament()), teams: [] });
    renderWizard();
    expect(screen.getByText('Torneos Continentales')).toBeInTheDocument();
    expect(screen.getByText('Copa Confederaciones')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sortear continentales/i })).toBeInTheDocument();
  });

  it('continental completo: el paso Confederaciones ofrece sortear', () => {
    const { cycle, teams } = makeContinentalDoneCycle();
    useTournamentStore.setState({ currentTournament: cycle, teams });
    renderWizard();
    expect(screen.getByRole('button', { name: /sortear confederaciones/i })).toBeInTheDocument();
  });
});
```

Nota: si `MobileActionProvider` no es el nombre exacto exportado por `../../hooks/useMobileAction`, verificá el export real (en `App.tsx` se usa `MobileActionProvider`) y ajustá el import. Si `TournamentWizard` lee más campos del store que rompan el render con el fixture, seedeá esos campos en `setState` (p. ej. `tournaments: [cycle]`).

- [ ] **Step 9: Correr tests + gate completo**

Run: `npx vitest run && npx tsc -b --noEmit && npx eslint src/components/tournament/TournamentWizard.tsx src/components/tournament/__tests__/TournamentWizard.test.tsx`
Expected: suite completa verde (incl. los tests nuevos), exit 0.

- [ ] **Step 10: Commit**

```bash
git add src/components/tournament/TournamentWizard.tsx src/components/tournament/__tests__/TournamentWizard.test.tsx
git commit -m "feat(ui): pasos Continental + Confederaciones en el wizard (con gating de fase)"
```

---

## Task 6: Router + navegación

**Modelo sugerido:** sonnet (union `View` en 4 archivos + wiring en `App`; footgun de las 4 declaraciones separadas).

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/ui/Sidebar.tsx`
- Modify: `src/components/ui/GameTabBar.tsx`
- Modify: `src/components/ui/PauseMenu.tsx`
- Test: `src/components/ui/__tests__/Sidebar.test.tsx` (Create)

**Interfaces:**
- Consumes: `ContinentalView`, `ConfederationsCupView`, `handleNavigate`.
- Produces: vistas `continental` y `confederations` alcanzables desde Sidebar (desktop) y PauseMenu (mobile).

- [ ] **Step 1: Extender el union `View` en los 4 archivos**

En `App.tsx:26`, `Sidebar.tsx:5`, `GameTabBar.tsx:3`, `PauseMenu.tsx:5`, cambiar el type a (agregar `'continental' | 'confederations'`):
```tsx
type View = 'wizard' | 'qualifiers' | 'worldcup' | 'stats' | 'settings' | 'history' | 'matches' | 'comparison' | 'tournaments' | 'champions' | 'continental' | 'confederations';
```

- [ ] **Step 2: `App.tsx` — imports + montaje + prop del wizard**

Agregar imports (junto a los otros de `./components/tournament/`):
```tsx
import { ContinentalView } from './components/tournament/ContinentalView';
import { ConfederationsCupView } from './components/tournament/ConfederationsCupView';
```

Pasar `onNavigate` al wizard (línea 120–121):
```tsx
        {currentView === 'wizard' ? (
          <TournamentWizard onNavigate={handleNavigate} />
```

Agregar dos ramas al ternario del `<main>` (p. ej. después de la rama `champions`, antes del `: null`):
```tsx
        ) : currentView === 'continental' ? (
          <ContinentalView cycle={currentTournament} teams={teams} />
        ) : currentView === 'confederations' ? (
          <ConfederationsCupView cycle={currentTournament} teams={teams} />
```

(Type-check OK: `currentTournament` es `Cycle` tras el guard `if (!currentTournament) return ...`.)

- [ ] **Step 3: `Sidebar.tsx` — entradas de nav**

Agregar al array `menuItems` (después de `worldcup`, línea 19), reusando íconos ya importados (`Globe2`, `Award`) o agregando uno nuevo de `lucide-react`:
```tsx
    { id: 'continental' as View, icon: Globe2, label: 'Continental' },
    { id: 'confederations' as View, icon: Award, label: 'Confederaciones' },
```
(`Globe2` y `Award` ya se importan en Sidebar; si no, agregarlos al import de `lucide-react` en línea 1.)

- [ ] **Step 4: `PauseMenu.tsx` — entradas de nav (mobile)**

Agregar íconos al import (línea 2) y al array `MENU_ITEMS` (línea 7), al principio:
```tsx
import { Globe2, Award, BarChart3, GitCompare, Medal, History, Archive, Settings } from 'lucide-react';
```
```tsx
  { id: 'continental' as View, icon: Globe2, label: 'Continental' },
  { id: 'confederations' as View, icon: Award, label: 'Confederaciones' },
```

(`GameTabBar.tsx`: solo se extiende el type `View` — NO se agrega a `TABS` porque la barra inferior tiene 4 tabs + START fijos. Continental/Confed se alcanzan por Sidebar/PauseMenu.)

- [ ] **Step 5: Test de navegación (Sidebar)**

Crear `src/components/ui/__tests__/Sidebar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Sidebar } from '../Sidebar';
import { useTournamentStore } from '../../../store/useTournamentStore';

describe('Sidebar', () => {
  it('incluye entradas Continental y Confederaciones y navega al hacer click', async () => {
    useTournamentStore.setState({ tournaments: [], currentTournamentId: null });
    const onViewChange = vi.fn();
    render(<Sidebar currentView="wizard" onViewChange={onViewChange} tournamentYear={2026} />);

    await userEvent.click(screen.getByRole('button', { name: /continental/i }));
    expect(onViewChange).toHaveBeenCalledWith('continental');

    await userEvent.click(screen.getByRole('button', { name: /confederaciones/i }));
    expect(onViewChange).toHaveBeenCalledWith('confederations');
  });
});
```

Nota: `Sidebar` renderiza `TournamentSelector` (lee el store). Si crashea sin torneos, el `setState` de arriba debería bastar; si no, seedeá lo mínimo que pida. Si `getByRole('button', { name: /continental/i })` matchea de más por el prefijo "▶", usá `name: /^Continental$/i` o `screen.getByText('Continental')` y subí al botón.

- [ ] **Step 6: Gate completo**

Run: `npx vitest run && npx tsc -b --noEmit && npx eslint src/App.tsx src/components/ui/Sidebar.tsx src/components/ui/GameTabBar.tsx src/components/ui/PauseMenu.tsx src/components/ui/__tests__/Sidebar.test.tsx`
Expected: suite completa verde, exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/ui/Sidebar.tsx src/components/ui/GameTabBar.tsx src/components/ui/PauseMenu.tsx src/components/ui/__tests__/Sidebar.test.tsx
git commit -m "feat(ui): rutas + navegación para Continental y Confederaciones"
```

---

## Task 7: Banner de fase en `MatchCenter`

**Modelo sugerido:** sonnet (archivo grande; el cambio es acotado).

**Files:**
- Modify: `src/components/tournament/MatchCenter.tsx`

**Interfaces:**
- Consumes: `getCyclePhaseBanner` (de `cycleProgress`), prop `onNavigate` (ya en `MatchCenterProps`).
- Produces: banner que dirige a la vista dedicada cuando la fase activa es continental/confed.

- [ ] **Step 1: Tipar `Cycle` + destructurar `onNavigate`**

Cambiar el import de tipos (línea 2) para incluir `Cycle`, y la prop `tournament` a `Cycle`:
```tsx
import type { Cycle, Team, Match, Region } from '../../types';
```
```tsx
interface MatchCenterProps {
  tournament: Cycle;
  teams: Team[];
  onNavigate?: (view: string, options?: { region?: Region; groupId?: string }) => void;
}
```
Destructurar `onNavigate` (línea 31):
```tsx
export function MatchCenter({ tournament, teams, onNavigate }: MatchCenterProps) {
```

- [ ] **Step 2: Import del helper**

```tsx
import { getCyclePhaseBanner } from '../../utils/cycleProgress';
```

- [ ] **Step 3: Calcular el banner (dentro del componente, antes del `return`)**

```tsx
  const phaseBanner = getCyclePhaseBanner(tournament);
```

- [ ] **Step 4: Renderizar el banner al principio del árbol devuelto**

Envolver/insertar al tope del contenedor raíz del `return` del componente (el primer elemento dentro del contenedor principal):
```tsx
      {phaseBanner && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-grass/20 border-2 border-gold p-4">
          <p className="font-arcade text-[10px] uppercase text-gold">
            Fase activa: {phaseBanner.label}
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigate?.(phaseBanner.targetView)}
            className="gap-2"
          >
            Ir a la vista →
          </Button>
        </div>
      )}
```

(No se modifica `allMatches` ni la lógica de simulación: la fusión de partidos continental/confed en la lista es follow-up — ver Divergencia #3.)

- [ ] **Step 5: Gate completo**

Run: `npx vitest run && npx tsc -b --noEmit && npx eslint src/components/tournament/MatchCenter.tsx`
Expected: suite completa verde, exit 0. (Verificá que `onNavigate` quedó usado y que no hay imports sin usar.)

- [ ] **Step 6: Commit**

```bash
git add src/components/tournament/MatchCenter.tsx
git commit -m "feat(ui): banner de fase del ciclo en Match Center"
```

---

## Cierre del plan (post-tareas)

- Review final de rama completa (opus) sobre `git merge-base HEAD <base-5A>..HEAD`.
- **Follow-ups documentados** (NO son parte de 5B): (1) lockstep de jornada de Clasificatorias/Mundial + rechazo store; (2) avance de `calendar.phase` por wc-groups/wc-knockout/completed; (3) fusión de partidos continental/confed en la lista del Match Center + "Simular jornada" para esas fases; (4) FU-A: test directo del migrate v2→v3 del config store.
- **Plan 6** (siguiente): persistencia Supabase (migración 008 + servicios + borrado de datos viejos).

## Self-Review (checklist del autor)

- **Cobertura del spec §9/§12:** ✅ `ContinentalView` (T3), `ConfederationsCupView` (T4), pasos del wizard (T5), rutas/nav (T6), Match Center como hub → **parcial** (banner en T7; fusión completa diferida, documentada). Enforcement de orden **entre fases** vía wizard (T5); lockstep intra-fase de Clasif/Mundial **diferido** (documentado).
- **Placeholders:** ninguno — todo el código de componentes/tests/helpers está completo.
- **Consistencia de tipos:** `simulateContinentalMatch(matchId)`/`simulateConfederationsMatch(matchId)` (1 arg), `drawContinental`/`drawConfederations`/`advanceToQualifiers` (0 args), `isMatchPlayable(cycle, id)`, `getPhaseMatches(cycle, phase)`, `CYCLE_REGIONS`, props `{ cycle, teams }` — todos verificados contra el código real leído (App/Wizard/MatchCenter/GroupView/ScoreBug/calendar/cycle/tipos).
- **`any`/unused:** mocks async sin params (`vi.fn(async () => {})`); imports de fixtures podados; `MatchWithPenalties` evita `as any` para penales.
