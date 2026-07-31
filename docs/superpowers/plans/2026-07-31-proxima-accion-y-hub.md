# Próxima acción y Hub único — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que todos los modos abran en una única pantalla de inicio (`HubView`) con una sola acción de "continuar", derivada del modo activo igual que ya se deriva su navegación.

**Architecture:** Se agrega `deriveNextAction` en `src/modes/`, espejo exacto de `deriveModeNav` que ya existe: pura, sin React, con dos ramas por `engine`. `useNextAction` inyecta las acciones de los stores. `HubView` recibe todo por props y no importa stores. La escalera de fases **no se inventa**: son los items de `nav.sections` con `key === 'competition'`, que ya se derivan del descriptor. `TournamentWizard` se borra al final, después de que sus tres acciones destructivas tengan hogar nuevo.

**Tech Stack:** React 19, TypeScript 5.9, Zustand 5, Tailwind v4, Vitest 4 + Testing Library, sonner, lucide-react.

**Spec:** `docs/superpowers/specs/2026-07-31-proxima-accion-y-hub-design.md`

## Global Constraints

- Español rioplatense en toda la UI, con tildes correctas.
- **Press Start 2P (`font-arcade`) no tiene glyphs para mayúsculas acentuadas.** Ningún texto en `font-arcade` + `uppercase` puede llevar vocal acentuada.
- Los rótulos cortos de navegación topean en **6 caracteres** (barra mobile de 5 columnas a 320px).
- Cero `border-radius`: hay un kill global en `src/index.css`.
- **Cero migraciones de Supabase.** Cero cambios al descriptor (`src/modes/types.ts`) y a `registry.ts`.
- **Ninguna acción de store cambia de contrato.** Se consumen tal como están.
- Los stores ya avisan el motivo del rechazo con su propio toast: un handler que recibe `false` **no festeja ni navega**.
- `src/modes/__tests__/modoNuevo.test.ts` ("un modo nuevo sin escribir código") debe seguir pasando: es el criterio de cierre de la unificación de modos.
- Verificación con `set -o pipefail` y grep del resumen. **Nunca `npm test | tail`** — el exit code de una tubería es el de `tail`.
- `npx tsc -b` antes de cada commit que toque tipos.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/modes/nextAction.ts` | `deriveNextAction` — puro, sin React. Espejo de `nav.ts`. |
| `src/hooks/useNextAction.ts` | Lee stores, inyecta acciones, llama a `deriveNextAction`. |
| `src/components/hub/HubView.tsx` | Presentacional. Props, cero stores. |

---

### Task 1: `deriveNextAction` — rama del ciclo mundialista

**Files:**
- Create: `src/modes/nextAction.ts`
- Test: `src/modes/__tests__/nextAction.cycle.test.ts`

**Interfaces:**
- Consumes: `MobileAction` de `src/hooks/useMobileAction`, `Cycle` de `src/types`, `View` de `src/types/view`, guards de `src/utils/cycleProgress` y `src/utils/tournamentProgress`.
- Produces:
  - `interface CycleActions` (ver Step 2)
  - `interface DeriveNextActionInput { engine: ModeEngine; cycle: Cycle | null; season: SeasonView | null; busy: boolean; nav: (view: View, tab?: string) => void; actions: ModeActions }`
  - `function deriveNextAction(input: DeriveNextActionInput): MobileAction | null`
  - En esta tarea la rama `season` devuelve `null`; la completa la Task 2.

- [ ] **Step 1: Escribir los tests (fallan)**

```ts
// src/modes/__tests__/nextAction.cycle.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveNextAction, type ModeActions } from '../nextAction';
import { toCycle } from '../../core/cycle';
import {
  baseTournament,
  makeContinentalDoneCycle,
  makeDrawnContinentalCycle,
} from '../../test/fixtures/cycle';
import type { Cycle } from '../../types';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

function makeActions(overrides: Partial<ModeActions> = {}): ModeActions {
  return {
    drawContinental: vi.fn(() => true),
    drawConfederations: vi.fn(() => true),
    advanceToQualifiers: vi.fn(),
    generateDrawAndFixtures: vi.fn(async () => true),
    advanceToWorldCup: vi.fn(async () => true),
    advanceToKnockout: vi.fn(async () => true),
    startSeason: vi.fn(async () => {}),
    simulateJornada: vi.fn(async () => []),
    closeSeason: vi.fn(async () => {}),
    reloadMode: vi.fn(async () => {}),
    ...overrides,
  };
}

function actionFor(cycle: Cycle | null, actions = makeActions(), nav = vi.fn(), busy = false) {
  return deriveNextAction({
    engine: 'national-cycle',
    cycle,
    season: null,
    busy,
    nav,
    actions,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deriveNextAction — ciclo, prioridad de fases', () => {
  it('ciclo nuevo: ofrece sortear los continentales', () => {
    expect(actionFor(toCycle(baseTournament()))?.label).toBe('▶ SORTEAR CONTINENTAL');
  });

  it('continental sorteado y sin terminar: ofrece jugarlo y navega', () => {
    const { cycle } = makeDrawnContinentalCycle();
    const nav = vi.fn();
    const action = actionFor(cycle, makeActions(), nav);
    expect(action?.label).toBe('▶ JUGAR CONTINENTAL');
    action?.onPress();
    expect(nav).toHaveBeenCalledWith('continental');
  });

  it('continental completo: ofrece sortear la Confederaciones', () => {
    const { cycle } = makeContinentalDoneCycle();
    expect(actionFor(cycle)?.label).toBe('▶ SORTEAR CONFED');
  });

  it('sin ciclo cargado no ofrece nada', () => {
    expect(actionFor(null)).toBeNull();
  });

  it('con un sorteo o batch en curso la accion queda deshabilitada', () => {
    const action = actionFor(toCycle(baseTournament()), makeActions(), vi.fn(), true);
    expect(action?.disabled).toBe(true);
  });
});

describe('deriveNextAction — ciclo, no festeja cuando el guard rechaza', () => {
  it('sorteo continental rechazado: no navega', () => {
    const nav = vi.fn();
    const actions = makeActions({ drawContinental: vi.fn(() => false) });
    actionFor(toCycle(baseTournament()), actions, nav)?.onPress();
    expect(actions.drawContinental).toHaveBeenCalled();
    expect(nav).not.toHaveBeenCalled();
  });

  it('sorteo continental aceptado: navega a la vista continental', () => {
    const nav = vi.fn();
    actionFor(toCycle(baseTournament()), makeActions(), nav)?.onPress();
    expect(nav).toHaveBeenCalledWith('continental');
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/modes/__tests__/nextAction.cycle.test.ts`
Expected: FAIL — `Failed to resolve import "../nextAction"`.

- [ ] **Step 3: Implementar el módulo con la rama del ciclo**

```ts
// src/modes/nextAction.ts
import { toast } from 'sonner';
import {
  canDrawContinental,
  canDrawConfederations,
  canAdvanceToQualifiers,
  canDrawQualifiers,
  isQualifiersDrawn,
} from '../utils/cycleProgress';
import {
  getQualifierProgress,
  getWorldCupGroupProgress,
  getKnockoutProgress,
  canAdvanceToWorldCup,
  canAdvanceToKnockout,
} from '../utils/tournamentProgress';
import type { Cycle } from '../types';
import type { View } from '../types/view';
import type { MobileAction } from '../hooks/useMobileAction';
import type { ModeEngine } from './types';

/**
 * LA PRÓXIMA ACCIÓN DE UN MODO — una sola derivación para toda la interfaz.
 *
 * Espejo de `modes/nav.ts`: puro, sin React, con una rama por motor. Vivía
 * suelta dentro de `TournamentWizard.mobileAction`, sólo para selecciones y
 * sólo para el dock de mobile; un modo de temporada no tenía ninguna.
 *
 * Regla transversal: si la acción del store devuelve `false`, el store ya avisó
 * el motivo con su propio toast, así que acá no se festeja ni se navega.
 */

/** Las acciones de store que el Hub puede disparar, inyectadas para que esto quede puro. */
export interface ModeActions {
  // Ciclo mundialista. Firmas de `TournamentState` en src/types/index.ts.
  drawContinental: () => boolean;
  drawConfederations: () => boolean;
  advanceToQualifiers: () => void;
  generateDrawAndFixtures: (options?: { force?: boolean }) => Promise<boolean>;
  advanceToWorldCup: () => Promise<boolean>;
  advanceToKnockout: () => Promise<boolean>;
  // Modo de temporada. Firmas de `SeasonModeState` en src/store/useSeasonModeStore.ts.
  startSeason: () => Promise<void>;
  simulateJornada: (tournamentId: string) => Promise<unknown>;
  closeSeason: () => Promise<void>;
  /** Reintentar la carga del modo tras un fallo de red. */
  reloadMode: () => Promise<void>;
}

export type Nav = (view: View, tab?: string) => void;

export interface DeriveNextActionInput {
  engine: ModeEngine;
  /** `national-cycle`: el ciclo activo. */
  cycle: Cycle | null;
  /** `season`: estado de la temporada en curso. Lo completa la rama de temporada. */
  season: SeasonView | null;
  /** Sorteo o batch en curso: la acción se ofrece deshabilitada. */
  busy: boolean;
  nav: Nav;
  actions: ModeActions;
}

/**
 * Próxima acción del ciclo mundialista, por prioridad. Es la cadena que vivía
 * en `TournamentWizard.mobileAction`, extendida hasta el final: terminaba en
 * "JUGAR CLASIFICATORIAS" porque las tarjetas-paso cubrían el resto, y al
 * borrarlas esos peldaños quedaban sin dueño.
 */
function cycleNextAction(cycle: Cycle, nav: Nav, actions: ModeActions): MobileAction | null {
  if (canDrawContinental(cycle)) {
    return {
      label: '▶ SORTEAR CONTINENTAL',
      onPress: () => {
        if (!actions.drawContinental()) return;
        toast.success('Torneos continentales sorteados');
        nav('continental');
      },
    };
  }

  if (cycle.calendar.phase === 'continental' && !cycle.continental.isComplete) {
    return { label: '▶ JUGAR CONTINENTAL', onPress: () => nav('continental') };
  }

  if (canDrawConfederations(cycle)) {
    return {
      label: '▶ SORTEAR CONFED',
      onPress: () => {
        if (!actions.drawConfederations()) return;
        toast.success('Copa Confederaciones sorteada');
        nav('confederations');
      },
    };
  }

  if (cycle.calendar.phase === 'confed' && !cycle.confederationsCup.isComplete) {
    return { label: '▶ JUGAR CONFED', onPress: () => nav('confederations') };
  }

  if (canAdvanceToQualifiers(cycle)) {
    return {
      label: '▶ IR A CLASIFICATORIAS',
      onPress: () => {
        actions.advanceToQualifiers();
        toast.success('Fase de Clasificatorias habilitada');
        nav('qualifiers');
      },
    };
  }

  const qualifiersDrawn = isQualifiersDrawn(cycle);

  if (canDrawQualifiers(cycle) && !qualifiersDrawn) {
    return {
      label: '▶ EMPEZAR',
      onPress: async () => {
        if (!(await actions.generateDrawAndFixtures())) return;
        toast.success('Sorteo y fixtures generados');
        nav('qualifiers');
      },
    };
  }

  if (
    qualifiersDrawn &&
    cycle.calendar.phase === 'wc-qualifiers' &&
    !getQualifierProgress(cycle).isComplete
  ) {
    return { label: '▶ JUGAR CLASIFICATORIAS', onPress: () => nav('qualifiers') };
  }

  if (canAdvanceToWorldCup(cycle)) {
    return {
      label: '▶ AVANZAR AL MUNDIAL',
      onPress: async () => {
        if (!(await actions.advanceToWorldCup())) return;
        toast.success('Sorteo del Mundial generado');
        nav('worldcup');
      },
    };
  }

  const worldCup = cycle.worldCup;
  if (!worldCup) return null;

  if (!getWorldCupGroupProgress(worldCup.groups).isComplete) {
    return { label: '▶ JUGAR EL MUNDIAL', onPress: () => nav('worldcup') };
  }

  const knockoutStarted = worldCup.knockout.roundOf32.length > 0;

  if (!knockoutStarted && canAdvanceToKnockout(worldCup.groups)) {
    return {
      label: '▶ IR A PLAYOFFS',
      onPress: async () => {
        if (!(await actions.advanceToKnockout())) return;
        toast.success('Playoffs generados');
        nav('worldcup');
      },
    };
  }

  if (knockoutStarted && !getKnockoutProgress(worldCup.knockout).isComplete) {
    return { label: '▶ JUGAR PLAYOFFS', onPress: () => nav('worldcup') };
  }

  // Ciclo completo: no hay camino feliz. El Hub muestra el estado de cierre.
  return null;
}

export function deriveNextAction(input: DeriveNextActionInput): MobileAction | null {
  const { engine, cycle, nav, actions, busy } = input;

  const action =
    engine === 'national-cycle' ? (cycle ? cycleNextAction(cycle, nav, actions) : null) : null;

  return action ? { ...action, disabled: busy } : null;
}
```

Declarar `SeasonView` en este mismo archivo como placeholder tipado, que la Task 2 completa:

```ts
/** Estado de la temporada que la rama `season` necesita. La completa la Task 2. */
export interface SeasonView {
  status: SeasonModeStatus;
  tournaments: ModeTournament[];
}
```

con los imports `import type { SeasonModeStatus } from '../store/useSeasonModeStore';` y `import type { ModeTournament } from '../core/formats/modeTournament';`. Si `SeasonModeStatus` no está exportado, exportarlo (sólo el tipo) en `src/store/useSeasonModeStore.ts:67`.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/modes/__tests__/nextAction.cycle.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Chequear tipos**

Run: `npx tsc -b`
Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
git add src/modes/nextAction.ts src/modes/__tests__/nextAction.cycle.test.ts src/store/useSeasonModeStore.ts
git commit -m "feat(hub): derivacion de proxima accion para el ciclo mundialista"
```

---

### Task 2: `deriveNextAction` — rama del modo de temporada

**Files:**
- Modify: `src/modes/nextAction.ts`
- Test: `src/modes/__tests__/nextAction.season.test.ts`

**Interfaces:**
- Consumes: `currentModeJornada` de `src/core/formats/modeJornada` (devuelve `{ key, label, matches, matchday? } | null`, y ya resuelve los tres formatos: liga, grupos-eliminación y eliminación), `ModeTournament` de `src/core/formats/modeTournament`, `ModeActions` de la Task 1.
- Produces: la rama `season` de `deriveNextAction`, con la misma firma.

- [ ] **Step 1: Escribir los tests (fallan)**

```ts
// src/modes/__tests__/nextAction.season.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveNextAction, type ModeActions, type SeasonView } from '../nextAction';
import type { LigaTournament } from '../../core/formats/modeTournament';
import type { Match } from '../../types';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

function match(id: string, matchday: number, isPlayed: boolean): Match {
  return {
    id,
    homeTeamId: `h${id}`,
    awayTeamId: `a${id}`,
    homeScore: isPlayed ? 1 : null,
    awayScore: isPlayed ? 0 : null,
    isPlayed,
    matchday,
  } as Match;
}

function liga(id: string, matches: Match[]): LigaTournament {
  return {
    id,
    modeId: 'villamariense',
    competitionId: 'league-A',
    year: 2027,
    name: 'Liga A 2027',
    status: 'in-progress',
    division: 'A',
    format: 'liga',
    state: { teamIds: [], legs: 1, matches, standings: [] },
  };
}

function makeActions(overrides: Partial<ModeActions> = {}): ModeActions {
  return {
    drawContinental: vi.fn(() => true),
    drawConfederations: vi.fn(() => true),
    advanceToQualifiers: vi.fn(),
    generateDrawAndFixtures: vi.fn(async () => true),
    advanceToWorldCup: vi.fn(async () => true),
    advanceToKnockout: vi.fn(async () => true),
    startSeason: vi.fn(async () => {}),
    simulateJornada: vi.fn(async () => []),
    closeSeason: vi.fn(async () => {}),
    reloadMode: vi.fn(async () => {}),
    ...overrides,
  };
}

function actionFor(season: SeasonView, actions = makeActions(), nav = vi.fn(), busy = false) {
  return deriveNextAction({ engine: 'season', cycle: null, season, busy, nav, actions });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deriveNextAction — temporada, prioridad', () => {
  it('sin clubes sembrados no ofrece nada', () => {
    expect(actionFor({ status: 'needs-seed', tournaments: [] })).toBeNull();
  });

  it('sin conexion ofrece reintentar la carga', async () => {
    const actions = makeActions();
    const action = actionFor({ status: 'error', tournaments: [] }, actions);
    expect(action?.label).toBe('▶ REINTENTAR');
    await action?.onPress();
    expect(actions.reloadMode).toHaveBeenCalled();
  });

  it('listo y sin torneos: ofrece empezar la temporada', async () => {
    const actions = makeActions();
    const action = actionFor({ status: 'ready', tournaments: [] }, actions);
    expect(action?.label).toBe('▶ EMPEZAR TEMPORADA');
    await action?.onPress();
    expect(actions.startSeason).toHaveBeenCalled();
  });

  it('con jornada pendiente: la ofrece con su rotulo y el torneo correcto', async () => {
    const lg = liga('lg-A', [match('m1', 1, true), match('m2', 2, false)]);
    const actions = makeActions();
    const action = actionFor({ status: 'ready', tournaments: [lg] }, actions);
    expect(action?.label).toBe('▶ SIMULAR FECHA 2');
    await action?.onPress();
    expect(actions.simulateJornada).toHaveBeenCalledWith('lg-A');
  });

  it('todo jugado: ofrece cerrar la temporada', async () => {
    const lg = liga('lg-A', [match('m1', 1, true)]);
    const actions = makeActions();
    const action = actionFor({ status: 'ready', tournaments: [lg] }, actions);
    expect(action?.label).toBe('▶ CERRAR TEMPORADA');
    await action?.onPress();
    expect(actions.closeSeason).toHaveBeenCalled();
  });

  it('la primera competicion con jornada pendiente gana, en orden', () => {
    const a = liga('lg-A', [match('a1', 1, true)]);
    const b = liga('lg-B', [match('b1', 1, false)]);
    expect(actionFor({ status: 'ready', tournaments: [a, b] })?.label).toBe('▶ SIMULAR FECHA 1');
  });

  it('con una accion en vuelo queda deshabilitada', () => {
    const action = actionFor({ status: 'ready', tournaments: [] }, makeActions(), vi.fn(), true);
    expect(action?.disabled).toBe(true);
  });

  it('sin estado de temporada no ofrece nada', () => {
    const action = deriveNextAction({
      engine: 'season',
      cycle: null,
      season: null,
      busy: false,
      nav: vi.fn(),
      actions: makeActions(),
    });
    expect(action).toBeNull();
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/modes/__tests__/nextAction.season.test.ts`
Expected: FAIL — la rama `season` devuelve `null` en todos los casos.

- [ ] **Step 3: Implementar la rama de temporada**

Agregar a `src/modes/nextAction.ts`:

```ts
import { currentModeJornada } from '../core/formats/modeJornada';

/**
 * Próxima acción de un modo de temporada, por prioridad.
 *
 * No hay caso "temporada cerrada": `closeSeason` aplica ascensos/descensos,
 * avanza el año y recarga, con lo cual el modo vuelve a `ready` sin torneos —
 * o sea, a "empezar temporada" del año siguiente. Un modo de temporada no
 * termina nunca; el único `null` posible es `needs-seed`.
 *
 * El rótulo de la jornada sale de `currentModeJornada`, que ya resuelve los
 * tres formatos ("Fecha 4" en una liga o una fase de grupos, "Semifinales
 * (ida)" en un cuadro). No se re-deriva acá.
 */
function seasonNextAction(season: SeasonView, actions: ModeActions): MobileAction | null {
  if (season.status === 'error') {
    return { label: '▶ REINTENTAR', onPress: () => void actions.reloadMode() };
  }

  if (season.status !== 'ready') return null;

  if (season.tournaments.length === 0) {
    return { label: '▶ EMPEZAR TEMPORADA', onPress: () => void actions.startSeason() };
  }

  for (const tournament of season.tournaments) {
    const jornada = currentModeJornada(tournament);
    if (jornada) {
      return {
        label: `▶ SIMULAR ${jornada.label.toUpperCase()}`,
        onPress: () => void actions.simulateJornada(tournament.id),
      };
    }
  }

  return { label: '▶ CERRAR TEMPORADA', onPress: () => void actions.closeSeason() };
}
```

Y reemplazar la rama de `deriveNextAction`:

```ts
  const action =
    engine === 'national-cycle'
      ? cycle
        ? cycleNextAction(cycle, nav, actions)
        : null
      : season
        ? seasonNextAction(season, actions)
        : null;
```

**Cuidado con la constraint de la fuente arcade:** `jornada.label` se pasa a mayúsculas y termina en un botón `font-arcade`. Los rótulos que produce `modeJornada.ts` no llevan tildes ("Fecha 4", "Semifinales (ida)", "Final"). Si al correr la app aparece una etiqueta con vocal acentuada, el arreglo va en `modeJornada.ts`, no acá.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/modes/__tests__/nextAction.season.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Chequear tipos y correr la suite entera**

```bash
npx tsc -b && set -o pipefail && npm test 2>&1 | grep -E "Test Files|Tests "
```
Expected: `tsc` sin salida, cero fallas.

- [ ] **Step 6: Commit**

```bash
git add src/modes/nextAction.ts src/modes/__tests__/nextAction.season.test.ts
git commit -m "feat(hub): proxima accion en los modos de temporada"
```

---

### Task 3: Hook `useNextAction`

**Files:**
- Create: `src/hooks/useNextAction.ts`
- Test: `src/hooks/__tests__/useNextAction.test.tsx`

**Interfaces:**
- Consumes: `deriveNextAction` (Tasks 1-2), `useModeDescriptor`, `useTournamentStore`, `useSeasonModeStore`, `useModeStore`.
- Produces: `function useNextAction(nav: (view: View, tab?: string) => void): MobileAction | null`

Es el espejo de `useModeNav` (`src/hooks/useModeNav.ts`): mismo patrón, mismo lugar.

- [ ] **Step 1: Escribir los tests (fallan)**

```tsx
// src/hooks/__tests__/useNextAction.test.tsx
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useNextAction } from '../useNextAction';
import { useModeStore } from '../../store/useModeStore';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useSeasonModeStore } from '../../store/useSeasonModeStore';
import { toCycle } from '../../core/cycle';
import { baseTournament } from '../../test/fixtures/cycle';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useNextAction', () => {
  it('modo selecciones: usa la rama del ciclo', () => {
    useModeStore.setState({ activeModeId: 'selecciones' });
    useTournamentStore.setState({ currentTournament: toCycle(baseTournament()) });

    const { result } = renderHook(() => useNextAction(vi.fn()));
    expect(result.current?.label).toBe('▶ SORTEAR CONTINENTAL');
  });

  it('modo de temporada: usa la rama de la temporada', () => {
    useModeStore.setState({ activeModeId: 'villamariense' });
    useSeasonModeStore.setState({ status: 'ready', tournaments: [] });

    const { result } = renderHook(() => useNextAction(vi.fn()));
    expect(result.current?.label).toBe('▶ EMPEZAR TEMPORADA');
  });
});
```

Si el test del modo de temporada no resuelve el descriptor correcto con sólo
`activeModeId`, sembrar también `modes` en `useModeStore.setState` con el
`GameMode` de Villamariense (`kind: 'league-system'`, `config: {}`), que es lo
que `useModeDescriptor` lee.

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/hooks/__tests__/useNextAction.test.tsx`
Expected: FAIL — `Failed to resolve import "../useNextAction"`.

- [ ] **Step 3: Implementar el hook**

```ts
// src/hooks/useNextAction.ts
import { useMemo } from 'react';
import { useModeStore } from '../store/useModeStore';
import { useTournamentStore } from '../store/useTournamentStore';
import { useSeasonModeStore } from '../store/useSeasonModeStore';
import { useModeDescriptor } from './useModeDescriptor';
import { deriveNextAction, type Nav } from '../modes/nextAction';
import type { MobileAction } from './useMobileAction';

/**
 * La próxima acción del modo activo. Espejo de `useModeNav`: la derivación es
 * pura y vive en `modes/`, acá sólo se leen los stores y se inyectan sus
 * acciones.
 */
export function useNextAction(nav: Nav): MobileAction | null {
  const descriptor = useModeDescriptor();

  const cycle = useTournamentStore((s) => s.currentTournament);
  // Un sorteo o un batch en curso deshabilita la acción: el store ya tiene sus
  // propios candados, esto evita el doble clic en la interfaz.
  const cycleBusy = useTournamentStore((s) => s.isDrawing || s.isBatchProcessing);

  const seasonStatus = useSeasonModeStore((s) => s.status);
  const seasonTournaments = useSeasonModeStore((s) => s.tournaments);
  const seasonBusy = useSeasonModeStore((s) => s.busy);

  return useMemo(
    () =>
      deriveNextAction({
        engine: descriptor.engine,
        cycle,
        season: { status: seasonStatus, tournaments: seasonTournaments },
        busy: descriptor.engine === 'season' ? seasonBusy : cycleBusy,
        nav,
        actions: {
          drawContinental: () => useTournamentStore.getState().drawContinental(),
          drawConfederations: () => useTournamentStore.getState().drawConfederations(),
          advanceToQualifiers: () => useTournamentStore.getState().advanceToQualifiers(),
          generateDrawAndFixtures: (options) =>
            useTournamentStore.getState().generateDrawAndFixtures(options),
          advanceToWorldCup: () => useTournamentStore.getState().advanceToWorldCup(),
          advanceToKnockout: () => useTournamentStore.getState().advanceToKnockout(),
          startSeason: () => useSeasonModeStore.getState().startSeason(),
          simulateJornada: (id) => useSeasonModeStore.getState().simulateJornada(id),
          closeSeason: () => useSeasonModeStore.getState().closeSeason(),
          reloadMode: async () => {
            const mode = useModeStore.getState().activeMode();
            if (mode) await useSeasonModeStore.getState().loadForMode(mode);
          },
        },
      }),
    [descriptor.engine, cycle, cycleBusy, seasonStatus, seasonTournaments, seasonBusy, nav],
  );
}
```

Verificar en `src/store/useSeasonModeStore.ts` que existe el flag `busy`; si se llama distinto, usar el nombre real.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/hooks/__tests__/useNextAction.test.tsx`
Expected: PASS — 2 tests.

- [ ] **Step 5: Chequear tipos**

Run: `npx tsc -b`
Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useNextAction.ts src/hooks/__tests__/useNextAction.test.tsx
git commit -m "feat(hub): hook que resuelve la proxima accion del modo activo"
```

---

### Task 4: HubView

**Files:**
- Create: `src/components/hub/HubView.tsx`
- Test: `src/components/hub/__tests__/HubView.test.tsx`

**Interfaces:**
- Consumes: `MobileAction`, `NavItem` de `src/modes/nav`, `MatchResult` de `src/store/useMatchResultsStore`, `navIcon` de `src/components/ui/navIcons`.
- Produces:
```ts
interface HubViewProps {
  title: string;
  phaseLabel: string;
  progress: number;          // 0..1
  nextAction: MobileAction | null;
  ladder: NavItem[];
  currentView: View;
  onSelectStep: (item: NavItem) => void;
  lastResult: MatchResult | null;
  isLoading?: boolean;
  onNewTournament?: () => void;
}
export function HubView(props: HubViewProps): JSX.Element
```

- [ ] **Step 1: Escribir los tests (fallan)**

```tsx
// src/components/hub/__tests__/HubView.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { HubView } from '../HubView';
import type { NavItem } from '../../../modes/nav';

const LADDER: NavItem[] = [
  {
    key: 'continental',
    label: 'Continental',
    shortLabel: 'CONTI',
    icon: 'globe',
    target: { view: 'continental' },
    locked: false,
    section: 'competition',
  },
  {
    key: 'world-cup',
    label: 'Mundial',
    shortLabel: 'COPA',
    icon: 'trophy',
    target: { view: 'worldcup' },
    locked: true,
    section: 'competition',
  },
];

function props(over: Partial<React.ComponentProps<typeof HubView>> = {}) {
  return {
    title: 'Ciclo 2026',
    phaseLabel: 'Torneos Continentales',
    progress: 0.12,
    nextAction: { label: '▶ SORTEAR CONTINENTAL', onPress: vi.fn() },
    ladder: LADDER,
    currentView: 'hub' as const,
    onSelectStep: vi.fn(),
    lastResult: null,
    ...over,
  };
}

describe('HubView', () => {
  it('muestra titulo y fase del modo', () => {
    render(<HubView {...props()} />);
    expect(screen.getByText('Ciclo 2026')).toBeInTheDocument();
    expect(screen.getByText('Torneos Continentales')).toBeInTheDocument();
  });

  it('el boton principal dispara la accion', async () => {
    const onPress = vi.fn();
    render(<HubView {...props({ nextAction: { label: '▶ EMPEZAR', onPress } })} />);
    await userEvent.click(screen.getByRole('button', { name: /EMPEZAR/ }));
    expect(onPress).toHaveBeenCalled();
  });

  it('respeta el disabled de la accion', async () => {
    const onPress = vi.fn();
    render(
      <HubView {...props({ nextAction: { label: '▶ EMPEZAR', onPress, disabled: true } })} />,
    );
    expect(screen.getByRole('button', { name: /EMPEZAR/ })).toBeDisabled();
  });

  it('sirve igual a un modo de temporada: mismo componente, otras props', () => {
    render(
      <HubView
        {...props({
          title: 'Temporada 2027',
          phaseLabel: 'Liga A',
          nextAction: { label: '▶ SIMULAR FECHA 4', onPress: vi.fn() },
        })}
      />,
    );
    expect(screen.getByText('Temporada 2027')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /SIMULAR FECHA 4/ })).toBeInTheDocument();
  });

  it('sin proxima accion muestra el cierre y ofrece torneo nuevo', async () => {
    const onNewTournament = vi.fn();
    render(<HubView {...props({ nextAction: null, onNewTournament })} />);
    expect(screen.getByText(/no queda nada por jugar/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Nuevo torneo/i }));
    expect(onNewTournament).toHaveBeenCalled();
  });

  it('sin proxima accion y sin salida no rinde boton de cierre', () => {
    render(<HubView {...props({ nextAction: null })} />);
    expect(screen.queryByRole('button', { name: /Nuevo torneo/i })).not.toBeInTheDocument();
  });

  it('cargando no ofrece ninguna accion', () => {
    render(<HubView {...props({ isLoading: true })} />);
    expect(screen.queryByRole('button', { name: /SORTEAR/ })).not.toBeInTheDocument();
  });

  it('sin ultimo resultado no rinde ese bloque', () => {
    render(<HubView {...props()} />);
    expect(screen.queryByText(/ultimo resultado/i)).not.toBeInTheDocument();
  });

  it('con ultimo resultado lo muestra', () => {
    render(
      <HubView
        {...props({
          lastResult: { homeTeam: 'Islandia', awayTeam: 'Brasil', homeScore: 2, awayScore: 1 },
        })}
      />,
    );
    expect(screen.getByText('Islandia')).toBeInTheDocument();
    expect(screen.getByText('Brasil')).toBeInTheDocument();
  });

  it('el peldano de la escalera avisa cual se eligio', async () => {
    const onSelectStep = vi.fn();
    render(<HubView {...props({ onSelectStep })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continental' }));
    expect(onSelectStep).toHaveBeenCalledWith(LADDER[0]);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/components/hub/__tests__/HubView.test.tsx`
Expected: FAIL — `Failed to resolve import "../HubView"`.

- [ ] **Step 3: Implementar el componente**

```tsx
// src/components/hub/HubView.tsx
import { Trophy } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardContent } from '../ui/Card';
import { PixelBar } from '../ui/PixelBar';
import { Skeleton } from '../ui/Skeleton';
import { TeamFlag } from '../ui/TeamFlag';
import { navIcon } from '../ui/navIcons';
import { cn } from '../../lib/utils';
import type { NavItem } from '../../modes/nav';
import type { MobileAction } from '../../hooks/useMobileAction';
import type { MatchResult } from '../../store/useMatchResultsStore';
import type { View } from '../../types/view';

interface HubViewProps {
  title: string;
  phaseLabel: string;
  /** 0..1 — progreso del modo entero. */
  progress: number;
  nextAction: MobileAction | null;
  /** Los items `competition` de la nav del modo. No se re-derivan acá. */
  ladder: NavItem[];
  currentView: View;
  onSelectStep: (item: NavItem) => void;
  lastResult: MatchResult | null;
  /** El modo todavía no resolvió su estado: no se ofrece ninguna acción. */
  isLoading?: boolean;
  /** Salida cuando el ciclo terminó. Ausente en los modos que no terminan nunca. */
  onNewTournament?: () => void;
}

/**
 * Pantalla de inicio única para todos los modos. Recibe todo por props y no
 * importa ningún store: eso la hace testeable con objetos literales y evita que
 * vuelva a crecer una rama `¿es selecciones o es temporada?` adentro.
 */
export function HubView({
  title,
  phaseLabel,
  progress,
  nextAction,
  ladder,
  currentView,
  onSelectStep,
  lastResult,
  isLoading = false,
  onNewTournament,
}: HubViewProps) {
  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Card>
        <CardContent className="space-y-4 py-6">
          <div>
            <h1 className="font-arcade text-lg text-gold text-shadow-retro">{title}</h1>
            <p className="text-grass-soft text-sm mt-1">{phaseLabel}</p>
          </div>
          <PixelBar value={Math.round(progress * 100)} max={100} color="led" />
        </CardContent>
      </Card>

      {lastResult && (
        <Card>
          <CardContent className="py-4">
            <p className="font-arcade text-[9px] text-grass-soft uppercase mb-3">
              Ultimo resultado
            </p>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0">
                {lastResult.homeTeamId && (
                  <TeamFlag teamId={lastResult.homeTeamId} teamName={lastResult.homeTeam} size={24} />
                )}
                <span className="truncate">{lastResult.homeTeam}</span>
              </span>
              <span className="font-arcade text-sm text-white shrink-0">
                {lastResult.homeScore} - {lastResult.awayScore}
              </span>
              <span className="flex items-center gap-2 min-w-0 justify-end">
                <span className="truncate">{lastResult.awayTeam}</span>
                {lastResult.awayTeamId && (
                  <TeamFlag teamId={lastResult.awayTeamId} teamName={lastResult.awayTeam} size={24} />
                )}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : nextAction ? (
        <Button
          size="lg"
          className="w-full"
          onClick={nextAction.onPress}
          disabled={nextAction.disabled}
        >
          {nextAction.label}
        </Button>
      ) : (
        <Card>
          <CardContent className="py-8 text-center space-y-4">
            <Trophy className="w-12 h-12 text-gold mx-auto" />
            <p className="text-grass-soft text-sm">No queda nada por jugar en este modo.</p>
            {onNewTournament && (
              <Button variant="secondary" size="sm" onClick={onNewTournament}>
                Nuevo torneo
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {ladder.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ladder.map((item) => {
            const Icon = navIcon(item.icon);
            const active = currentView === item.target.view;
            return (
              <button
                key={item.key}
                onClick={() => onSelectStep(item)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 font-arcade text-[10px] uppercase border-2 transition-colors',
                  item.locked
                    ? 'bg-grass-dark text-grass-soft border-grass opacity-60'
                    : active
                      ? 'bg-gold text-night border-white'
                      : 'bg-grass text-white border-line',
                )}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/hub/__tests__/HubView.test.tsx`
Expected: PASS — 10 tests.

Si "el peldaño avisa cuál se eligió" falla por nombre accesible, es porque el
icono aporta texto: confirmar que lleva `aria-hidden="true"`.

- [ ] **Step 5: Chequear tipos**

Run: `npx tsc -b`
Expected: sin salida. Si `navIcon` no está exportado desde `src/components/ui/navIcons.tsx` con esa firma, usar la real.

- [ ] **Step 6: Commit**

```bash
git add src/components/hub/HubView.tsx src/components/hub/__tests__/HubView.test.tsx
git commit -m "feat(hub): pantalla de inicio unica para todos los modos"
```

---

### Task 5: Mudar "rehacer sorteo de clasificatorias" a QualifiersView

Acción destructiva (borra y regenera 840 partidos). Su `ConfirmDialog` tiene un
comportamiento no obvio que arregló un bug real: **si el guard rechaza, el
diálogo debe quedar abierto**, no cerrarse como si hubiera funcionado. Se logra
lanzando (`throw`), no retornando.

**Files:**
- Modify: `src/components/tournament/QualifiersView.tsx`, `src/components/tournament/TournamentWizard.tsx`
- Test: `src/components/tournament/__tests__/QualifiersView.test.tsx` (crear si no existe), `src/components/tournament/__tests__/TournamentWizard.test.tsx`

- [ ] **Step 1: Mover los tests a su nuevo hogar (fallan)**

Mover el describe `TournamentWizard — rehacer sorteo de clasificatorias (ConfirmDialog)` de `TournamentWizard.test.tsx` a `QualifiersView.test.tsx`, cambiando **sólo** el componente que se rinde y el fixture de estado. No cambiar lo que los tests afirman. Los dos casos que deben sobrevivir textualmente:

1. `no festeja y deja el diálogo abierto si el guard rechaza`
2. `festeja y cierra el diálogo cuando el sorteo se rehace`

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/components/tournament/__tests__/QualifiersView.test.tsx`
Expected: FAIL — no existe el botón de rehacer en `QualifiersView`.

- [ ] **Step 3: Mover handler, estado y diálogo**

En `QualifiersView.tsx`:

```tsx
const [confirmRedrawQualifiers, setConfirmRedrawQualifiers] = useState(false);
const generateDrawAndFixtures = useTournamentStore((s) => s.generateDrawAndFixtures);

const handleRedrawQualifiers = async () => {
  const completed = await generateDrawAndFixtures({ force: true });
  // Lanzar (en vez de sólo retornar) es lo que hace que ConfirmDialog deje el
  // diálogo abierto, en vez de cerrarlo como si la acción destructiva hubiera
  // funcionado. El store ya avisó el motivo con su propio toast.
  if (!completed) throw new Error('No se pudo rehacer el sorteo de clasificatorias.');
  toast.success('Sorteo de clasificatorias rehecho');
};
```

El diálogo, copiado tal cual del wizard:

```tsx
<ConfirmDialog
  open={confirmRedrawQualifiers}
  onOpenChange={setConfirmRedrawQualifiers}
  variant="danger"
  title="Rehacer sorteo de clasificatorias"
  confirmLabel="Rehacer"
  description={
    <>
      <p>Se eliminan todos los grupos y partidos actuales de las clasificatorias y se sortean de nuevo desde cero.</p>
      <p>Esta acción no se puede deshacer.</p>
    </>
  }
  onConfirm={handleRedrawQualifiers}
/>
```

El botón que lo abre va en las acciones del `ViewHeader`, con las mismas
condiciones que lo gobernaban en el wizard — `isQualifiersDrawn(tournament)` y
`!tournament.hasAnyMatchPlayed`:

```tsx
<Button variant="danger" size="sm" onClick={() => setConfirmRedrawQualifiers(true)}>
  Rehacer sorteo
</Button>
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/tournament/__tests__/QualifiersView.test.tsx`
Expected: PASS.

- [ ] **Step 5: Borrar del wizard lo que se mudó**

Quitar de `TournamentWizard.tsx` `handleRedrawQualifiers`, `confirmRedrawQualifiers`, su botón y su `ConfirmDialog`.

- [ ] **Step 6: Correr la suite entera y chequear tipos**

```bash
npx tsc -b && set -o pipefail && npm test 2>&1 | grep -E "Test Files|Tests "
```
Expected: sin fallas. **El conteo total no debe bajar**: los tests se movieron, no se borraron.

- [ ] **Step 7: Commit**

```bash
git add -A src/components/tournament
git commit -m "refactor(hub): rehacer sorteo de clasificatorias vive en su vista"
```

---

### Task 6: Mudar "regenerar sorteo del Mundial" y "sorteo manual" a WorldCupViewEnhanced

**Files:**
- Modify: `src/components/tournament/WorldCupViewEnhanced.tsx`, `src/components/tournament/TournamentWizard.tsx`
- Test: `src/components/tournament/__tests__/WorldCupViewEnhanced.test.tsx`, `src/components/tournament/__tests__/TournamentWizard.test.tsx`

- [ ] **Step 1: Mover los tests a su nuevo hogar (fallan)**

Mover a `WorldCupViewEnhanced.test.tsx` los describes `regenerar sorteo del Mundial (ConfirmDialog)` y `handleDrawSimulatorComplete`, junto con el mock de `DrawSimulator` que ya usa `TournamentWizard.test.tsx`:

```tsx
// DrawSimulator anima 64 elecciones con setTimeout reales; para probar
// handleDrawSimulatorComplete alcanza con un stub controlable.
vi.mock('../DrawSimulator', () => ({
  DrawSimulator: ({ onComplete }: { onComplete: (groups: WorldCupGroup[]) => void }) => (
    <button onClick={() => onComplete([])}>completar sorteo manual (stub de test)</button>
  ),
}));
```

Los tres casos que deben sobrevivir textualmente:
1. `no festeja y deja el diálogo abierto si el guard rechaza` (regenerar)
2. `festeja y cierra el diálogo cuando la regeneración se completa`
3. `el más grave: si el guard rechaza, no descarta el sorteo manual ni festeja`

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/components/tournament/__tests__/WorldCupViewEnhanced.test.tsx`
Expected: FAIL en los tres casos nuevos.

- [ ] **Step 3: Mover handlers, estado, DrawSimulator y ConfirmDialog**

Copiar de `TournamentWizard.tsx`: `showDrawSimulator`, `qualifiedTeamsForDraw`, `confirmRegenWorldCup`, `handleManualDraw`, `handleDrawSimulatorComplete`, el `<DrawSimulator/>` y este `ConfirmDialog`, con sus comentarios intactos:

```tsx
<ConfirmDialog
  open={confirmRegenWorldCup}
  onOpenChange={setConfirmRegenWorldCup}
  variant="danger"
  title="Regenerar sorteo del Mundial"
  confirmLabel="Regenerar"
  description={
    <>
      <p>Se eliminan todos los partidos actuales del Mundial (grupos y playoffs) y se crean grupos nuevos con los mismos 64 equipos clasificados.</p>
      <p>Esta acción no se puede deshacer.</p>
    </>
  }
  onConfirm={async () => {
    const completed = await regenerateWorldCupDrawAndFixtures();
    // El store ya avisó el motivo del rechazo con su propio toast.
    // Lanzar acá (en vez de sólo retornar) es lo que hace que
    // ConfirmDialog deje el diálogo abierto en vez de cerrarlo como si
    // la acción destructiva hubiera funcionado — mismo patrón que
    // handleRedrawQualifiers. Los errores de base que el store relanza
    // (borrado o guardado fallidos) llegan tal cual: no hace falta
    // atraparlos acá.
    if (!completed) throw new Error('No se pudo regenerar el sorteo del Mundial.');
    toast.success('Sorteo del Mundial regenerado');
  }}
/>
```

**El punto crítico de `handleDrawSimulatorComplete`:** si
`advanceToWorldCupWithManualDraw` devuelve `false`, **no** cerrar el simulador ni
festejar — el sorteo manual que el usuario acaba de hacer no se descarta.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/tournament/__tests__/WorldCupViewEnhanced.test.tsx`
Expected: PASS.

- [ ] **Step 5: Borrar del wizard lo que se mudó**

Quitar de `TournamentWizard.tsx` todo lo copiado y su import de `DrawSimulator`.

- [ ] **Step 6: Correr la suite entera y chequear tipos**

```bash
npx tsc -b && set -o pipefail && npm test 2>&1 | grep -E "Test Files|Tests "
```
Expected: sin fallas, conteo total sin bajar.

- [ ] **Step 7: Commit**

```bash
git add -A src/components/tournament
git commit -m "refactor(hub): regenerar sorteo y sorteo manual viven en la vista del Mundial"
```

---

### Task 7: `'hub'` como raíz única, montarlo y borrar el wizard

Recién acá se borra `TournamentWizard`: sus tres acciones avanzadas ya tienen
hogar (Tasks 5-6) y el camino feliz vive en `deriveNextAction` (Tasks 1-2).

**Files:**
- Modify: `src/types/view.ts`, `src/modes/nav.ts`, `src/App.tsx`
- Modify: `src/components/tournament/{ContinentalView,ConfederationsCupView,QualifiersView,WorldCupViewEnhanced}.tsx`
- Modify: `src/modes/__tests__/nav.test.ts`, `src/modes/__tests__/modoNuevo.test.ts`
- Delete: `src/components/tournament/TournamentWizard.tsx`, `src/components/tournament/__tests__/TournamentWizard.test.tsx`

- [ ] **Step 1: Renombrar la vista en el tipo**

En `src/types/view.ts`, `| 'wizard'` → `| 'hub'`. Actualizar el comentario del bloque si menciona el wizard.

- [ ] **Step 2: Correr `tsc` para obtener el checklist de call sites**

Run: `npx tsc -b`
Expected: FAIL, con errores en `nav.ts`, `App.tsx` y las vistas de fase. Esa lista es el checklist de este task.

- [ ] **Step 3: `nav.ts` — cuatro puntos, no dos**

`VIEW_META`: reemplazar la entrada `wizard` por

```ts
hub: { label: 'Inicio', shortLabel: 'INICIO', icon: 'home' },
```

`deriveModeNav`: la raíz pasa a ser la misma para los dos motores.

```ts
const root: View = 'hub';
```

`nationalCompetitionItems`: `viewItem('wizard', 'competition', false)` → `viewItem('hub', 'competition', false)`.

`seasonCompetitionItems`: el pseudo-item `{ key: 'main', ...VIEW_META.league, target: { view: 'league', tab: 'main' } }` que se rinde cuando no hay temporada arrancada pasa a ser el item del Hub:

```ts
viewItem('hub', 'competition', false)
```

`pickPrimary`: la rama `national-cycle` busca `items.find((i) => i.key === 'wizard')` → `'hub'`. La rama `season` arma su primer item desde `root`; con `root = 'hub'` ese item ya existe en la lista, así que el `find` por `target.view === root` lo encuentra y no hace falta reconstruirlo — simplificar a `push(items.find((i) => i.target.view === root))`.

**`'league'` NO desaparece:** sigue siendo el contenedor de las pestañas de competición de los modos de temporada (`target: { view: 'league', tab: … }`). Lo que deja de ser es la raíz.

- [ ] **Step 4: `App.tsx` — montar el Hub**

Declarar el hook **junto a los demás, antes de los `return` condicionales** de `initStatus` y `!currentTournament`: si cambia la cantidad de hooks ejecutados entre renders, React lanza "Rendered more hooks than during the previous render" (ya documentado en `App.tsx`).

```tsx
const nextAction = useNextAction(handleNavigate);
const lastResult = useMatchResultsStore((s) => s.results[0] ?? null);
// Suscripción, no getState(): el Hub tiene que re-renderizar cuando la lista
// de modos termina de cargar.
const modesLoaded = useModeStore((s) => s.isLoaded);
const seasonYear = useSeasonModeStore((s) => s.year);
const seasonTournaments = useSeasonModeStore((s) => s.tournaments);
```

El Hub va en el mapa `shared` de `renderView()`, porque aplica a los dos motores y **no necesita `currentTournament`** (a diferencia de las vistas del ciclo):

```tsx
hub: (
  <HubView
    title={hubTitle}
    phaseLabel={hubPhaseLabel}
    progress={hubProgress}
    nextAction={nextAction}
    ladder={nav.sections.find((s) => s.key === 'competition')?.items ?? []}
    currentView={currentView}
    onSelectStep={(item) => {
      if (item.target.tab !== undefined) useSeasonModeStore.getState().setActiveTab(item.target.tab);
      handleNavigate(item.target.view);
    }}
    lastResult={lastResult}
    isLoading={!modesLoaded}
    onNewTournament={nav.engine === 'national-cycle' ? () => handleNavigate('tournaments') : undefined}
  />
),
```

La cabecera del Hub se calcula con un `useMemo`, también antes de los returns
condicionales:

```tsx
const CYCLE_PHASE_LABEL: Record<string, string> = {
  continental: 'Torneos Continentales',
  confed: 'Copa Confederaciones',
  'wc-qualifiers': 'Clasificatorias',
  'wc-groups': 'Mundial · Fase de grupos',
  'wc-knockout': 'Mundial · Playoffs',
};

const hub = useMemo(() => {
  if (nav.engine === 'national-cycle') {
    if (!currentTournament) return { title: 'Ciclo mundial', phaseLabel: 'Cargando…', progress: 0 };
    const parts = [
      getContinentalProgress(currentTournament),
      getConfederationsProgress(currentTournament),
      getQualifierProgress(currentTournament),
      currentTournament.worldCup
        ? getWorldCupGroupProgress(currentTournament.worldCup.groups)
        : { playedMatches: 0, totalMatches: 0 },
    ];
    const played = parts.reduce((n, p) => n + p.playedMatches, 0);
    const total = parts.reduce((n, p) => n + p.totalMatches, 0);
    return {
      title: `Ciclo ${currentTournament.year}`,
      phaseLabel: CYCLE_PHASE_LABEL[currentTournament.calendar.phase] ?? 'Ciclo completo',
      progress: total > 0 ? played / total : 0,
    };
  }

  const pending = seasonTournaments
    .map((t) => ({ t, jornada: currentModeJornada(t) }))
    .find((x) => x.jornada !== null);
  const matches = seasonTournaments.flatMap((t) =>
    t.format === 'liga' ? t.state.matches : [],
  );
  return {
    title: seasonYear !== null ? `Temporada ${seasonYear}` : 'Temporada',
    phaseLabel: pending ? `${pending.t.name} · ${pending.jornada!.label}` : 'Temporada completa',
    progress: matches.length > 0 ? matches.filter((m) => m.isPlayed).length / matches.length : 0,
  };
}, [nav.engine, currentTournament, seasonTournaments, seasonYear]);
```

El progreso de temporada suma sólo los torneos `liga` a propósito: son los que
tienen un total de partidos conocido de entrada. Un cuadro de eliminación
genera sus rondas a medida que avanza, así que contarlo daría un porcentaje que
retrocede.

- [ ] **Step 5: Vistas de fase**

En `ContinentalView`, `ConfederationsCupView`, `QualifiersView` y `WorldCupViewEnhanced`: `onNavigate?.('wizard')` → `onNavigate?.('hub')`, y la etiqueta `'Ir a Progreso'` → `'Ir al inicio'`.

- [ ] **Step 6: Actualizar los tests de navegación**

`src/modes/__tests__/nav.test.ts`: donde afirma `'wizard'` (lista de items del ciclo, `nationalNav('league').view`, `currentView: 'wizard'`) pasa a `'hub'`. En el modo de temporada, la raíz esperada pasa de `'league'` a `'hub'` (`seasonNav('worldcup').view`), y `allowed` incorpora `'hub'`.

`src/modes/__tests__/modoNuevo.test.ts` debe seguir pasando sin cambios de fondo: es el criterio de cierre de la unificación. Si falla, es señal de que el cambio de raíz rompió la promesa de "un modo nuevo sin escribir código" — parar y reportar, no parchear el test.

- [ ] **Step 7: Borrar el wizard**

```bash
git rm src/components/tournament/TournamentWizard.tsx src/components/tournament/__tests__/TournamentWizard.test.tsx
grep -rn "TournamentWizard\|'wizard'" src/ || echo "sin referencias"
```
Expected: `sin referencias`.

- [ ] **Step 8: Suite entera, tipos y build**

```bash
npx tsc -b && set -o pipefail && npm test 2>&1 | grep -E "Test Files|Tests " && npm run build 2>&1 | tail -3
```
Expected: `tsc` sin salida, cero fallas, build exitoso.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(hub): el Hub es la raiz unica de todos los modos"
```

---

### Task 8: Verificación final

- [ ] **Step 1: Suite completa, tipos, lint y build**

```bash
set -o pipefail
npx tsc -b && npm test 2>&1 | grep -E "Test Files|Tests " && npm run build 2>&1 | tail -3
```
Expected: sin errores.

- [ ] **Step 2: Smoke test manual**

```bash
npm run dev
```

Recorrer y confirmar:

1. **Selecciones, ciclo nuevo** — el Hub abre con "Ciclo 2026", fase "Torneos Continentales", 0% y "▶ SORTEAR CONTINENTAL". Apretarlo sortea y navega a Continental.
2. **Selecciones, ciclo a medias** — ofrece la acción de la fase en curso; la escalera muestra las fases bloqueadas con candado.
3. **Selecciones, ciclo completo** — estado de cierre con "Nuevo torneo", no un botón muerto.
4. **Rehacer sorteo de clasificatorias** — sigue existiendo, ahora en Clasificatorias; el diálogo queda abierto si el guard rechaza.
5. **Regenerar sorteo del Mundial y sorteo manual** — siguen existiendo, ahora en Mundial.
6. **Liga Villamariense** — el Hub abre con "Temporada 2027" y la próxima jornada; la escalera cambia de pestaña. **Ningún rótulo con vocal acentuada en mayúsculas** (la fuente no las tiene).
7. **Mobile (400px)** — el tab bar abre en INICIO y muestra el Hub en los dos modos.

- [ ] **Step 3: Actualizar la memoria del proyecto**

Escribir la entrada de esta feature en el directorio de memoria y su línea en `MEMORY.md`.

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "docs: cierra la etapa 1 de proxima accion y Hub"
```

---

## Notas para quien implemente

- **El orden no es negociable.** El wizard se borra en el Task 7, después de que sus acciones destructivas tengan hogar (Tasks 5-6). Borrarlo antes pierde tres arreglos de bugs.
- **Los tests que se mudan no se reescriben.** Si un test cambia lo que afirma al cambiar de archivo, se perdió cobertura. El conteo total de la suite no baja en ningún commit.
- **`deriveNextAction` es pura.** Si necesita importar un store, el diseño se rompió: las dependencias se inyectan por parámetro, igual que hace `deriveModeNav`.
- **No se toca el descriptor.** `src/modes/types.ts` y `registry.ts` quedan intactos: la próxima acción depende de estado de runtime, no de configuración.
- Fixtures existentes: `src/test/fixtures/cycle.ts` (`baseTournament`, `makeDrawnContinentalCycle`, `makeContinentalDoneCycle`, `makeDrawnConfedCycle`).
