# Contrato de modo y Hub único — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar `TournamentWizard` y el bloque `main` de `LeagueModeView` por una única pantalla de inicio (`HubView`) alimentada por un contrato (`ModeSnapshot`) que cada modo implementa con un adaptador puro.

**Architecture:** Dos adaptadores puros y sincrónicos (`snapshotFromCycle`, `snapshotFromLeagueSeason`) traducen el estado de cada modo al mismo objeto `ModeSnapshot`. Un hook (`useModeSnapshot`) elige el adaptador según `useModeStore.activeModeKind()` e inyecta las acciones del store. `HubView` recibe el snapshot como prop y no importa ningún store, así que se testea con objetos literales. Las tres acciones destructivas/avanzadas del wizard se mudan a las vistas de su fase **antes** de borrarlo.

**Tech Stack:** React 19, TypeScript 5.9, Zustand 5, Tailwind v4, Vitest 4 + Testing Library, sonner, lucide-react.

**Spec:** `docs/superpowers/specs/2026-07-31-contrato-modo-hub-design.md`

## Global Constraints

- Español rioplatense en toda la UI, con tildes correctas.
- **Press Start 2P (`font-arcade`) no tiene glyphs para mayúsculas acentuadas.** Todo texto en `font-arcade` + `uppercase` debe evitar vocales acentuadas (por eso "SORTEAR CONTINENTAL", no "CLASIFICACIÓN").
- Las etiquetas de `GameTabBar` topean en **6 caracteres**.
- Cero `border-radius`: hay un kill global en `src/index.css`.
- **Cero migraciones de Supabase** en esta etapa.
- **Ninguna acción del store cambia de contrato.** Los adaptadores las consumen tal como están.
- Los stores ya avisan el motivo del rechazo con su propio toast: un handler que recibe `false` **no debe festejar ni navegar**.
- Verificación con `set -o pipefail` y grep del resumen. **Nunca `npm test | tail`** — el exit code de una tubería es el de `tail` y deja pasar tests rotos.
- Correr `npx tsc -b` antes de cada commit que toque tipos.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/core/modeSnapshot.ts` | Sólo tipos: `ModeSnapshot`, `LadderStep`. Sin lógica. |
| `src/core/snapshots/cycle.ts` | `snapshotFromCycle` — adaptador de `national-cycle`. Puro. |
| `src/core/snapshots/league.ts` | `snapshotFromLeagueSeason` — adaptador de `league-system`. Puro. |
| `src/hooks/useModeSnapshot.ts` | Elige adaptador según el modo activo e inyecta acciones. Único lugar que conoce los dos modos. |
| `src/components/hub/HubView.tsx` | Presentacional. Recibe `ModeSnapshot`, no importa stores. |

---

### Task 1: Tipos del contrato y adaptador de selecciones

**Files:**
- Create: `src/core/modeSnapshot.ts`
- Create: `src/core/snapshots/cycle.ts`
- Test: `src/core/snapshots/__tests__/cycle.test.ts`

**Interfaces:**
- Consumes: `Cycle` de `src/types`, `MobileAction` de `src/hooks/useMobileAction`, `MatchResult` de `src/store/useMatchResultsStore`, `View` de `src/types/view`, los guards de `src/utils/cycleProgress` y `src/utils/tournamentProgress`.
- Produces:
  - `interface LadderStep { key: string; label: string; state: 'done'|'active'|'locked'; onSelect: () => void }`
  - `interface ModeSnapshot { title: string; phaseLabel: string; progress: number; nextAction: MobileAction | null; ladder: LadderStep[]; lastResults: MatchResult[] }`
  - `interface CycleActions` (ver Step 3)
  - `function snapshotFromCycle(cycle: Cycle | null, nav: (view: View) => void, actions: CycleActions, lastResults: MatchResult[], busy?: boolean): ModeSnapshot`

- [ ] **Step 1: Crear el archivo de tipos**

```ts
// src/core/modeSnapshot.ts
import type { MobileAction } from '../hooks/useMobileAction';
import type { MatchResult } from '../store/useMatchResultsStore';

/**
 * Un peldaño de la escalera de fases del modo. `onSelect` navega: cada modo
 * resuelve a dónde (una vista en selecciones, una pestaña en ligas).
 */
export interface LadderStep {
  key: string;
  label: string;
  state: 'done' | 'active' | 'locked';
  onSelect: () => void;
}

/**
 * Todo lo que el Hub necesita saber, sin saber de qué modo se trata. Cada modo
 * lo produce con un adaptador puro en `src/core/snapshots/`.
 */
export interface ModeSnapshot {
  /** "Ciclo 2026" | "Temporada 2027" */
  title: string;
  /** "Torneos Continentales" | "Liga A · Fecha 4" */
  phaseLabel: string;
  /** 0..1 — progreso del modo entero, no de la fase en curso. */
  progress: number;
  /** La única acción del camino feliz. `null` = no hay nada que hacer. */
  nextAction: MobileAction | null;
  ladder: LadderStep[];
  /**
   * Lo último que se simuló EN ESTA SESIÓN (viene de useMatchResultsStore, que
   * es transitorio). Al abrir la app está vacío a propósito: leer el último
   * partido de match_history llega en la etapa 2, con los titulares.
   */
  lastResults: MatchResult[];
}
```

- [ ] **Step 2: Escribir los tests del adaptador de selecciones (fallan)**

```ts
// src/core/snapshots/__tests__/cycle.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { snapshotFromCycle, type CycleActions } from '../cycle';
import { toCycle } from '../../cycle';
import { baseTournament, makeContinentalDoneCycle, makeDrawnContinentalCycle } from '../../../test/fixtures/cycle';
import type { Cycle } from '../../../types';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

function makeActions(overrides: Partial<CycleActions> = {}): CycleActions {
  return {
    drawContinental: vi.fn(() => true),
    drawConfederations: vi.fn(() => true),
    advanceToQualifiers: vi.fn(),
    generateDrawAndFixtures: vi.fn(async () => true),
    advanceToWorldCup: vi.fn(async () => true),
    advanceToKnockout: vi.fn(async () => true),
    ...overrides,
  };
}

function snapshotOf(cycle: Cycle | null, actions = makeActions(), nav = vi.fn()) {
  return snapshotFromCycle(cycle, nav, actions, []);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('snapshotFromCycle — nextAction por prioridad', () => {
  it('ciclo nuevo: ofrece sortear los continentales', () => {
    const snap = snapshotOf(toCycle(baseTournament()));
    expect(snap.nextAction?.label).toBe('▶ SORTEAR CONTINENTAL');
  });

  it('continental sorteado y sin terminar: ofrece jugarlo', () => {
    const { cycle } = makeDrawnContinentalCycle();
    const nav = vi.fn();
    const snap = snapshotOf(cycle, makeActions(), nav);
    expect(snap.nextAction?.label).toBe('▶ JUGAR CONTINENTAL');
    snap.nextAction?.onPress();
    expect(nav).toHaveBeenCalledWith('continental');
  });

  it('continental completo: ofrece sortear la Confederaciones', () => {
    const { cycle } = makeContinentalDoneCycle();
    const snap = snapshotOf(cycle);
    expect(snap.nextAction?.label).toBe('▶ SORTEAR CONFED');
  });

  it('sin torneo: no ofrece ninguna accion', () => {
    expect(snapshotOf(null).nextAction).toBeNull();
  });

  it('con un sorteo o batch en curso la proxima accion queda deshabilitada', () => {
    const snap = snapshotFromCycle(toCycle(baseTournament()), vi.fn(), makeActions(), [], true);
    expect(snap.nextAction?.disabled).toBe(true);
  });
});

describe('snapshotFromCycle — no festeja cuando el guard rechaza', () => {
  it('sortear continental rechazado: no navega', async () => {
    const nav = vi.fn();
    const actions = makeActions({ drawContinental: vi.fn(() => false) });
    const snap = snapshotOf(toCycle(baseTournament()), actions, nav);
    await snap.nextAction?.onPress();
    expect(actions.drawContinental).toHaveBeenCalled();
    expect(nav).not.toHaveBeenCalled();
  });

  it('sortear continental aceptado: navega a la vista continental', async () => {
    const nav = vi.fn();
    const snap = snapshotOf(toCycle(baseTournament()), makeActions(), nav);
    await snap.nextAction?.onPress();
    expect(nav).toHaveBeenCalledWith('continental');
  });
});

describe('snapshotFromCycle — escalera y cabecera', () => {
  it('ciclo nuevo: cuatro peldanos, el primero activo y el resto bloqueado', () => {
    const snap = snapshotOf(toCycle(baseTournament()));
    expect(snap.ladder.map((s) => s.key)).toEqual([
      'continental', 'confederations', 'qualifiers', 'worldcup',
    ]);
    expect(snap.ladder[0].state).toBe('active');
    expect(snap.ladder.slice(1).every((s) => s.state === 'locked')).toBe(true);
  });

  it('el peldano navega a su vista', () => {
    const nav = vi.fn();
    const snap = snapshotOf(toCycle(baseTournament()), makeActions(), nav);
    snap.ladder[2].onSelect();
    expect(nav).toHaveBeenCalledWith('qualifiers');
  });

  it('titulo y progreso salen del ciclo', () => {
    const snap = snapshotOf(toCycle(baseTournament()));
    expect(snap.title).toBe('Ciclo 2026');
    expect(snap.progress).toBe(0);
  });

  it('sin torneo devuelve un snapshot vacio pero valido', () => {
    const snap = snapshotOf(null);
    expect(snap.ladder).toEqual([]);
    expect(snap.progress).toBe(0);
    expect(snap.lastResults).toEqual([]);
  });
});
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `npx vitest run src/core/snapshots/__tests__/cycle.test.ts`
Expected: FAIL — `Failed to resolve import "../cycle"` (el adaptador todavía no existe).

- [ ] **Step 4: Implementar el adaptador**

```ts
// src/core/snapshots/cycle.ts
import { toast } from 'sonner';
import {
  canDrawContinental,
  canDrawConfederations,
  canAdvanceToQualifiers,
  canDrawQualifiers,
  isQualifiersDrawn,
  isContinentalDrawn,
  isConfederationsDrawn,
  getContinentalProgress,
  getConfederationsProgress,
} from '../../utils/cycleProgress';
import {
  getQualifierProgress,
  getWorldCupGroupProgress,
  getKnockoutProgress,
  canAdvanceToWorldCup,
  canAdvanceToKnockout,
} from '../../utils/tournamentProgress';
import type { Cycle } from '../../types';
import type { View } from '../../types/view';
import type { MobileAction } from '../../hooks/useMobileAction';
import type { MatchResult } from '../../store/useMatchResultsStore';
import type { LadderStep, ModeSnapshot } from '../modeSnapshot';

/**
 * Las acciones del ciclo que el Hub puede disparar. Se inyectan (en vez de
 * importar el store) para que el adaptador quede puro y testeable con vi.fn().
 * Las firmas son las de `TournamentState` en src/types/index.ts.
 */
export interface CycleActions {
  drawContinental: () => boolean;
  drawConfederations: () => boolean;
  advanceToQualifiers: () => void;
  generateDrawAndFixtures: (options?: { force?: boolean }) => Promise<boolean>;
  advanceToWorldCup: () => Promise<boolean>;
  advanceToKnockout: () => Promise<boolean>;
}

type Nav = (view: View) => void;

/**
 * Próxima acción del ciclo, por prioridad. Es la cadena que vivía en
 * `TournamentWizard.mobileAction`, extendida hasta el final del ciclo: las
 * tarjetas-paso cubrían los últimos cuatro peldaños y al borrarlas quedaban
 * sin dueño.
 *
 * Regla transversal: si la acción del store devuelve `false`, el store ya
 * avisó el motivo con su propio toast, así que acá no se festeja ni se navega.
 */
function nextActionForCycle(cycle: Cycle, nav: Nav, actions: CycleActions): MobileAction | null {
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

  const knockoutProgress = getKnockoutProgress(worldCup.knockout);
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

  if (knockoutStarted && !knockoutProgress.isComplete) {
    return { label: '▶ JUGAR PLAYOFFS', onPress: () => nav('worldcup') };
  }

  // Ciclo completo: no hay camino feliz. El Hub muestra el estado de cierre.
  return null;
}

/** Etiqueta de la fase activa, legible para la cabecera del Hub. */
function phaseLabelForCycle(cycle: Cycle): string {
  switch (cycle.calendar.phase) {
    case 'continental':
      return 'Torneos Continentales';
    case 'confed':
      return 'Copa Confederaciones';
    case 'wc-qualifiers':
      return 'Clasificatorias';
    case 'wc-groups':
      return 'Mundial · Fase de grupos';
    case 'wc-knockout':
      return 'Mundial · Playoffs';
    default:
      return 'Ciclo completo';
  }
}

/**
 * Progreso del ciclo entero (0..1): partidos jugados sobre partidos existentes,
 * sumando las cuatro fases. Un ciclo recién creado no tiene partidos todavía,
 * así que devuelve 0 en vez de dividir por cero.
 */
function progressForCycle(cycle: Cycle): number {
  const continental = getContinentalProgress(cycle);
  const confed = getConfederationsProgress(cycle);
  const qualifiers = getQualifierProgress(cycle);
  const wcGroups = cycle.worldCup
    ? getWorldCupGroupProgress(cycle.worldCup.groups)
    : { playedMatches: 0, totalMatches: 0 };

  const played =
    continental.playedMatches + confed.playedMatches + qualifiers.playedMatches + wcGroups.playedMatches;
  const total =
    continental.totalMatches + confed.totalMatches + qualifiers.totalMatches + wcGroups.totalMatches;

  return total > 0 ? played / total : 0;
}

function ladderForCycle(cycle: Cycle, nav: Nav): LadderStep[] {
  const step = (key: string, label: string, view: View, done: boolean, unlocked: boolean): LadderStep => ({
    key,
    label,
    state: done ? 'done' : unlocked ? 'active' : 'locked',
    onSelect: () => nav(view),
  });

  const worldCupDone = Boolean(cycle.worldCup?.champion);

  return [
    step('continental', 'Continental', 'continental', cycle.continental.isComplete, true),
    step(
      'confederations',
      'Confederaciones',
      'confederations',
      cycle.confederationsCup.isComplete,
      isContinentalDrawn(cycle) && cycle.continental.isComplete,
    ),
    step(
      'qualifiers',
      'Clasificatorias',
      'qualifiers',
      getQualifierProgress(cycle).isComplete,
      isConfederationsDrawn(cycle) && cycle.confederationsCup.isComplete,
    ),
    step('worldcup', 'Mundial', 'worldcup', worldCupDone, Boolean(cycle.worldCup)),
  ];
}

export function snapshotFromCycle(
  cycle: Cycle | null,
  nav: Nav,
  actions: CycleActions,
  lastResults: MatchResult[],
  /** Sorteo o batch en curso: la próxima acción se deshabilita para no dispararla dos veces. */
  busy = false,
): ModeSnapshot {
  if (!cycle) {
    return {
      title: 'Ciclo mundial',
      phaseLabel: 'Cargando…',
      progress: 0,
      nextAction: null,
      ladder: [],
      lastResults: [],
    };
  }

  const nextAction = nextActionForCycle(cycle, nav, actions);

  return {
    title: `Ciclo ${cycle.year}`,
    phaseLabel: phaseLabelForCycle(cycle),
    progress: progressForCycle(cycle),
    nextAction: nextAction ? { ...nextAction, disabled: busy } : null,
    ladder: ladderForCycle(cycle, nav),
    lastResults,
  };
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx vitest run src/core/snapshots/__tests__/cycle.test.ts`
Expected: PASS — 11 tests.

Si "ciclo nuevo" falla porque `progress` no es 0, revisar que las cuatro fases de un ciclo recién creado tengan `totalMatches === 0`.

- [ ] **Step 6: Chequear tipos**

Run: `npx tsc -b`
Expected: sin salida.

- [ ] **Step 7: Commit**

```bash
git add src/core/modeSnapshot.ts src/core/snapshots/cycle.ts src/core/snapshots/__tests__/cycle.test.ts
git commit -m "feat(hub): contrato ModeSnapshot y adaptador de selecciones"
```

---

### Task 2: Adaptador del modo de ligas

**Files:**
- Create: `src/core/snapshots/league.ts`
- Test: `src/core/snapshots/__tests__/league.test.ts`
- Modify: `src/store/useLeagueModeStore.ts` (exportar dos tipos)

**Interfaces:**
- Consumes: `ModeSnapshot`/`LadderStep` de Task 1, `ModeTournament`/`LeagueTournament`/`CupTournament` de `src/core/formats/modeTournament`, `isLeagueComplete` de `src/core/formats/league`.
- Produces:
  - `interface LeagueSeasonView { status: LeagueModeStatus; year: number | null; tournaments: ModeTournament[]; busy: boolean }`
  - `interface LeagueActions { startSeason: () => Promise<void>; simulateLeagueMatchday: (tournamentId: string, matchday: number) => Promise<void>; closeSeason: () => Promise<void> }`
  - `function snapshotFromLeagueSeason(season: LeagueSeasonView, goToTab: (tab: string) => void, actions: LeagueActions): ModeSnapshot`

- [ ] **Step 1: Exportar los tipos que el adaptador necesita**

En `src/store/useLeagueModeStore.ts`, agregar `export` a las dos declaraciones (hoy son locales al módulo):

```ts
// línea ~54
export type LeagueModeStatus = 'idle' | 'loading' | 'ready' | 'needs-seed' | 'error';

// línea ~87
export interface LeagueModeState {
```

- [ ] **Step 2: Escribir los tests del adaptador de ligas (fallan)**

```ts
// src/core/snapshots/__tests__/league.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { snapshotFromLeagueSeason, type LeagueActions, type LeagueSeasonView } from '../league';
import type { LeagueTournament } from '../../formats/modeTournament';
import type { Match } from '../../../types';

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

function league(division: string, matches: Match[]): LeagueTournament {
  return {
    id: `lg-${division}`,
    modeId: 'villamariense',
    year: 2027,
    name: `Liga ${division} 2027`,
    status: 'in-progress',
    division,
    format: 'league',
    state: { teamIds: [], legs: 1, matches, standings: [] },
  };
}

function makeActions(overrides: Partial<LeagueActions> = {}): LeagueActions {
  return {
    startSeason: vi.fn(async () => {}),
    simulateLeagueMatchday: vi.fn(async () => {}),
    closeSeason: vi.fn(async () => {}),
    reload: vi.fn(async () => {}),
    ...overrides,
  };
}

function season(over: Partial<LeagueSeasonView> = {}): LeagueSeasonView {
  return { status: 'ready', year: 2027, tournaments: [], busy: false, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('snapshotFromLeagueSeason — nextAction por prioridad', () => {
  it('sin clubes sembrados no ofrece ninguna accion', () => {
    const snap = snapshotFromLeagueSeason(season({ status: 'needs-seed' }), vi.fn(), makeActions());
    expect(snap.nextAction).toBeNull();
  });

  it('listo y sin torneos: ofrece empezar la temporada', async () => {
    const actions = makeActions();
    const snap = snapshotFromLeagueSeason(season(), vi.fn(), actions);
    expect(snap.nextAction?.label).toBe('▶ EMPEZAR TEMPORADA');
    await snap.nextAction?.onPress();
    expect(actions.startSeason).toHaveBeenCalled();
  });

  it('con fecha pendiente: ofrece simularla y pasa el id y la fecha correctos', async () => {
    const lg = league('A', [match('m1', 1, true), match('m2', 2, false)]);
    const actions = makeActions();
    const snap = snapshotFromLeagueSeason(season({ tournaments: [lg] }), vi.fn(), actions);
    expect(snap.nextAction?.label).toBe('▶ SIMULAR FECHA 2');
    await snap.nextAction?.onPress();
    expect(actions.simulateLeagueMatchday).toHaveBeenCalledWith('lg-A', 2);
  });

  it('ambas ligas completas: ofrece cerrar la temporada', async () => {
    const a = league('A', [match('a1', 1, true)]);
    const b = league('B', [match('b1', 1, true)]);
    const actions = makeActions();
    const snap = snapshotFromLeagueSeason(season({ tournaments: [a, b] }), vi.fn(), actions);
    expect(snap.nextAction?.label).toBe('▶ CERRAR TEMPORADA');
    await snap.nextAction?.onPress();
    expect(actions.closeSeason).toHaveBeenCalled();
  });

  it('mientras hay una accion en vuelo la proxima queda deshabilitada', () => {
    const snap = snapshotFromLeagueSeason(season({ busy: true }), vi.fn(), makeActions());
    expect(snap.nextAction?.disabled).toBe(true);
  });

  it('sin conexion la proxima accion es reintentar la carga', async () => {
    const actions = makeActions();
    const snap = snapshotFromLeagueSeason(season({ status: 'error' }), vi.fn(), actions);
    expect(snap.nextAction?.label).toBe('▶ REINTENTAR');
    await snap.nextAction?.onPress();
    expect(actions.reload).toHaveBeenCalled();
  });
});

describe('snapshotFromLeagueSeason — cabecera y escalera', () => {
  it('titulo con el ano de la temporada', () => {
    const snap = snapshotFromLeagueSeason(season(), vi.fn(), makeActions());
    expect(snap.title).toBe('Temporada 2027');
  });

  it('la escalera no incluye escudos ni main', () => {
    const a = league('A', [match('a1', 1, false)]);
    const snap = snapshotFromLeagueSeason(season({ tournaments: [a] }), vi.fn(), makeActions());
    expect(snap.ladder.map((s) => s.key)).not.toContain('crests');
    expect(snap.ladder.map((s) => s.key)).not.toContain('main');
  });

  it('el peldano cambia de pestana', () => {
    const a = league('A', [match('a1', 1, false)]);
    const goToTab = vi.fn();
    const snap = snapshotFromLeagueSeason(season({ tournaments: [a] }), goToTab, makeActions());
    snap.ladder[0].onSelect();
    expect(goToTab).toHaveBeenCalledWith('league-A');
  });

  it('progreso: partidos jugados sobre el total', () => {
    const a = league('A', [match('a1', 1, true), match('a2', 2, false)]);
    const snap = snapshotFromLeagueSeason(season({ tournaments: [a] }), vi.fn(), makeActions());
    expect(snap.progress).toBe(0.5);
  });
});
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `npx vitest run src/core/snapshots/__tests__/league.test.ts`
Expected: FAIL — `Failed to resolve import "../league"`.

- [ ] **Step 4: Implementar el adaptador**

```ts
// src/core/snapshots/league.ts
import { isLeagueComplete } from '../formats/league';
import type {
  CupTournament,
  LeagueTournament,
  ModeTournament,
} from '../formats/modeTournament';
import type { LeagueModeStatus } from '../../store/useLeagueModeStore';
import type { MobileAction } from '../../hooks/useMobileAction';
import type { LadderStep, ModeSnapshot } from '../modeSnapshot';

/** Los campos del store de ligas que el adaptador necesita. */
export interface LeagueSeasonView {
  status: LeagueModeStatus;
  year: number | null;
  tournaments: ModeTournament[];
  busy: boolean;
}

/** Las acciones del store de ligas que el Hub puede disparar. */
export interface LeagueActions {
  startSeason: () => Promise<void>;
  simulateLeagueMatchday: (tournamentId: string, matchday: number) => Promise<void>;
  closeSeason: () => Promise<void>;
  /** Reintentar la carga del modo tras un fallo de red. */
  reload: () => Promise<void>;
}

type GoToTab = (tab: string) => void;

function leaguesOf(tournaments: ModeTournament[]): LeagueTournament[] {
  return tournaments.filter((t): t is LeagueTournament => t.format === 'league');
}

function cupOf(tournaments: ModeTournament[]): CupTournament | null {
  return tournaments.find((t): t is CupTournament => t.format === 'cup') ?? null;
}

/** Primera fecha con algún partido sin jugar, o null si la liga está completa. */
function nextMatchdayOf(league: LeagueTournament): number | null {
  const unplayed = league.state.matches.filter((m) => !m.isPlayed);
  if (unplayed.length === 0) return null;
  return Math.min(...unplayed.map((m) => m.matchday ?? 0));
}

/**
 * Próxima acción de la temporada, por prioridad.
 *
 * No hay caso "temporada cerrada": `closeSeason` aplica ascensos/descensos,
 * avanza `currentYear` y recarga, con lo cual el modo vuelve a `ready` sin
 * torneos — o sea, a "empezar temporada" del año siguiente. Un modo de ligas
 * no termina nunca; los únicos `null` posibles son `needs-seed` y la carga.
 */
function nextActionForSeason(
  season: LeagueSeasonView,
  goToTab: GoToTab,
  actions: LeagueActions,
): MobileAction | null {
  const { status, tournaments, busy } = season;

  // Sin conexión el modo no tiene estado que mostrar: la única salida útil es
  // reintentar la carga, así que la próxima acción ES el reintento.
  if (status === 'error') {
    return { label: '▶ REINTENTAR', onPress: () => void actions.reload(), disabled: busy };
  }

  if (status !== 'ready') return null;

  const withBusy = (action: MobileAction): MobileAction => ({ ...action, disabled: busy });

  if (tournaments.length === 0) {
    return withBusy({ label: '▶ EMPEZAR TEMPORADA', onPress: () => void actions.startSeason() });
  }

  const leagues = leaguesOf(tournaments);

  for (const league of leagues) {
    const matchday = nextMatchdayOf(league);
    if (matchday !== null) {
      return withBusy({
        label: `▶ SIMULAR FECHA ${matchday}`,
        onPress: () => void actions.simulateLeagueMatchday(league.id, matchday),
      });
    }
  }

  const cup = cupOf(tournaments);
  if (cup && !cup.state.championId) {
    return withBusy({ label: '▶ JUGAR LA COPA', onPress: () => goToTab('cup') });
  }

  if (leagues.length > 0 && leagues.every((l) => isLeagueComplete(l.state))) {
    return withBusy({ label: '▶ CERRAR TEMPORADA', onPress: () => void actions.closeSeason() });
  }

  return null;
}

function phaseLabelForSeason(season: LeagueSeasonView): string {
  if (season.status === 'error') return 'Sin conexion';
  if (season.status === 'needs-seed') return 'Sin clubes sembrados';
  if (season.status !== 'ready') return 'Cargando…';
  if (season.tournaments.length === 0) return 'Lista para arrancar';

  for (const league of leaguesOf(season.tournaments)) {
    const matchday = nextMatchdayOf(league);
    if (matchday !== null) return `Liga ${league.division} · Fecha ${matchday}`;
  }

  const cup = cupOf(season.tournaments);
  if (cup && !cup.state.championId) return 'Copa';
  return 'Temporada completa';
}

/** Progreso de la temporada: partidos jugados sobre el total de las ligas. */
function progressForSeason(season: LeagueSeasonView): number {
  const matches = leaguesOf(season.tournaments).flatMap((l) => l.state.matches);
  if (matches.length === 0) return 0;
  return matches.filter((m) => m.isPlayed).length / matches.length;
}

/**
 * Escalera: una liga por división, la copa y el panel de temporada. Deja afuera
 * `crests` (herramienta de administración, no una fase) y `main` (que deja de
 * existir al absorberlo el Hub).
 */
function ladderForSeason(season: LeagueSeasonView, goToTab: GoToTab): LadderStep[] {
  if (season.status !== 'ready' || season.tournaments.length === 0) return [];

  const leagues = leaguesOf(season.tournaments);
  const cup = cupOf(season.tournaments);
  const allLeaguesDone = leagues.length > 0 && leagues.every((l) => isLeagueComplete(l.state));

  const steps: LadderStep[] = leagues.map((l) => ({
    key: `league-${l.division}`,
    label: `Liga ${l.division}`,
    state: isLeagueComplete(l.state) ? 'done' : 'active',
    onSelect: () => goToTab(`league-${l.division}`),
  }));

  if (cup) {
    steps.push({
      key: 'cup',
      label: 'Copa',
      state: cup.state.championId ? 'done' : 'active',
      onSelect: () => goToTab('cup'),
    });
  }

  steps.push({
    key: 'season',
    label: 'Temporada',
    state: allLeaguesDone ? 'active' : 'locked',
    onSelect: () => goToTab('season'),
  });

  return steps;
}

export function snapshotFromLeagueSeason(
  season: LeagueSeasonView,
  goToTab: GoToTab,
  actions: LeagueActions,
): ModeSnapshot {
  return {
    title: season.year !== null ? `Temporada ${season.year}` : 'Temporada',
    phaseLabel: phaseLabelForSeason(season),
    progress: progressForSeason(season),
    nextAction: nextActionForSeason(season, goToTab, actions),
    ladder: ladderForSeason(season, goToTab),
    // La liga simula por su cuenta y ya empuja sus resultados al store; el Hub
    // los recibe desde useModeSnapshot, no desde acá.
    lastResults: [],
  };
}
```

Borrar la función `cupHasPendingTie` del bloque de arriba antes de commitear: quedó sin uso (la condición real es `!cup.state.championId`). Si el linter no la marca, borrarla igual.

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npx vitest run src/core/snapshots/__tests__/league.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 6: Chequear tipos y lint del archivo nuevo**

Run: `npx tsc -b && npx eslint src/core/snapshots/league.ts`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/core/snapshots/league.ts src/core/snapshots/__tests__/league.test.ts src/store/useLeagueModeStore.ts
git commit -m "feat(hub): adaptador ModeSnapshot del modo de ligas"
```

---

### Task 3: HubView

**Files:**
- Create: `src/components/hub/HubView.tsx`
- Test: `src/components/hub/__tests__/HubView.test.tsx`

**Interfaces:**
- Consumes: `ModeSnapshot` de Task 1.
- Produces: `function HubView(props: { snapshot: ModeSnapshot; isLoading?: boolean; onNewTournament?: () => void }): JSX.Element`

- [ ] **Step 1: Escribir los tests (fallan)**

```tsx
// src/components/hub/__tests__/HubView.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { HubView } from '../HubView';
import type { ModeSnapshot } from '../../../core/modeSnapshot';

function snapshot(over: Partial<ModeSnapshot> = {}): ModeSnapshot {
  return {
    title: 'Ciclo 2026',
    phaseLabel: 'Torneos Continentales',
    progress: 0.12,
    nextAction: { label: '▶ SORTEAR CONTINENTAL', onPress: vi.fn() },
    ladder: [
      { key: 'continental', label: 'Continental', state: 'active', onSelect: vi.fn() },
      { key: 'worldcup', label: 'Mundial', state: 'locked', onSelect: vi.fn() },
    ],
    lastResults: [],
    ...over,
  };
}

describe('HubView', () => {
  it('muestra titulo y fase del modo', () => {
    render(<HubView snapshot={snapshot()} />);
    expect(screen.getByText('Ciclo 2026')).toBeInTheDocument();
    expect(screen.getByText('Torneos Continentales')).toBeInTheDocument();
  });

  it('el boton principal dispara la accion del snapshot', async () => {
    const onPress = vi.fn();
    render(<HubView snapshot={snapshot({ nextAction: { label: '▶ EMPEZAR', onPress } })} />);
    await userEvent.click(screen.getByRole('button', { name: /EMPEZAR/ }));
    expect(onPress).toHaveBeenCalled();
  });

  it('sirve igual a un modo de ligas: mismo componente, otro snapshot', () => {
    render(
      <HubView
        snapshot={snapshot({
          title: 'Temporada 2027',
          phaseLabel: 'Liga A · Fecha 4',
          nextAction: { label: '▶ SIMULAR FECHA 4', onPress: vi.fn() },
          ladder: [{ key: 'league-A', label: 'Liga A', state: 'active', onSelect: vi.fn() }],
        })}
      />,
    );
    expect(screen.getByText('Temporada 2027')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /SIMULAR FECHA 4/ })).toBeInTheDocument();
  });

  it('sin proxima accion muestra el cierre y ofrece torneo nuevo', async () => {
    const onNewTournament = vi.fn();
    render(
      <HubView snapshot={snapshot({ nextAction: null })} onNewTournament={onNewTournament} />,
    );
    expect(screen.getByText(/no queda nada por jugar/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /NUEVO TORNEO/ }));
    expect(onNewTournament).toHaveBeenCalled();
  });

  it('sin proxima accion y sin salida no rinde ningun boton principal', () => {
    render(<HubView snapshot={snapshot({ nextAction: null })} />);
    expect(screen.queryByRole('button', { name: /NUEVO TORNEO/ })).not.toBeInTheDocument();
  });

  it('sin resultados no rinde el bloque de que paso recien', () => {
    render(<HubView snapshot={snapshot()} />);
    expect(screen.queryByText(/que paso recien/i)).not.toBeInTheDocument();
  });

  it('con resultados muestra el ultimo', () => {
    render(
      <HubView
        snapshot={snapshot({
          lastResults: [
            { homeTeam: 'Islandia', awayTeam: 'Brasil', homeScore: 2, awayScore: 1 },
          ],
        })}
      />,
    );
    expect(screen.getByText('Islandia')).toBeInTheDocument();
    expect(screen.getByText('Brasil')).toBeInTheDocument();
  });

  it('cargando: no ofrece ninguna accion', () => {
    render(<HubView snapshot={snapshot()} isLoading />);
    expect(screen.queryByRole('button', { name: /SORTEAR/ })).not.toBeInTheDocument();
  });

  it('el peldano de la escalera navega', async () => {
    const onSelect = vi.fn();
    render(
      <HubView
        snapshot={snapshot({
          ladder: [{ key: 'continental', label: 'Continental', state: 'active', onSelect }],
        })}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Continental' }));
    expect(onSelect).toHaveBeenCalled();
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
import { cn } from '../../lib/utils';
import type { LadderStep, ModeSnapshot } from '../../core/modeSnapshot';

interface HubViewProps {
  snapshot: ModeSnapshot;
  /** El modo todavía no resolvió su estado: no se ofrece ninguna acción. */
  isLoading?: boolean;
  /** Salida cuando el ciclo terminó. Ausente en los modos que no terminan nunca. */
  onNewTournament?: () => void;
}

const LADDER_STATE_CLASS: Record<LadderStep['state'], string> = {
  done: 'bg-grass text-white border-line',
  active: 'bg-gold text-night border-white',
  locked: 'bg-grass-dark text-grass-soft border-grass opacity-60',
};

/**
 * Pantalla de inicio única para todos los modos. Recibe un ModeSnapshot y no
 * importa ningún store: eso es lo que la hace testeable con objetos literales y
 * lo que impide que vuelva a crecer una rama `if (isNationalMode)` adentro.
 */
export function HubView({ snapshot, isLoading = false, onNewTournament }: HubViewProps) {
  const { title, phaseLabel, progress, nextAction, ladder, lastResults } = snapshot;
  const lastResult = lastResults[0] ?? null;

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
            <p className="font-arcade text-[9px] text-grass-soft uppercase mb-3">Ultimo resultado</p>
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
            <p className="text-grass-soft text-sm">
              No queda nada por jugar en este modo.
            </p>
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
          {ladder.map((step) => (
            <button
              key={step.key}
              onClick={step.onSelect}
              className={cn(
                'px-3 py-2 font-arcade text-[10px] uppercase border-2 transition-colors',
                LADDER_STATE_CLASS[step.state],
              )}
            >
              {step.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/hub/__tests__/HubView.test.tsx`
Expected: PASS — 9 tests.

Si "el peldaño navega" falla por nombre accesible, verificar que el `<button>` del chip no tenga más texto que `step.label`.

Si el test del último resultado falla por `TeamFlag`, revisar sus props reales en `src/components/ui/TeamFlag.tsx` y ajustar el `size`; el test no pasa `homeTeamId`, así que ese camino no debería ejecutarse.

- [ ] **Step 5: Chequear tipos**

Run: `npx tsc -b`
Expected: sin salida. Si `Card`/`CardContent`/`Skeleton` no aceptan `className`, ajustar el markup a lo que esos primitivos exponen.

- [ ] **Step 6: Commit**

```bash
git add src/components/hub/HubView.tsx src/components/hub/__tests__/HubView.test.tsx
git commit -m "feat(hub): pantalla de inicio unica alimentada por ModeSnapshot"
```

---

### Task 4: Hook `useModeSnapshot`

**Files:**
- Create: `src/hooks/useModeSnapshot.ts`
- Test: `src/hooks/__tests__/useModeSnapshot.test.tsx`

**Interfaces:**
- Consumes: `snapshotFromCycle` (Task 1), `snapshotFromLeagueSeason` (Task 2), `useModeStore`, `useTournamentStore`, `useLeagueModeStore`, `useMatchResultsStore`.
- Produces: `function useModeSnapshot(nav: (view: View) => void): { snapshot: ModeSnapshot; isLoading: boolean }`

- [ ] **Step 1: Escribir los tests (fallan)**

```tsx
// src/hooks/__tests__/useModeSnapshot.test.tsx
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useModeSnapshot } from '../useModeSnapshot';
import { useModeStore } from '../../store/useModeStore';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useLeagueModeStore } from '../../store/useLeagueModeStore';
import { toCycle } from '../../core/cycle';
import { baseTournament } from '../../test/fixtures/cycle';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useModeSnapshot', () => {
  it('modo selecciones: usa el adaptador del ciclo', () => {
    useModeStore.setState({
      modes: [{ id: 'selecciones', name: 'Selecciones', kind: 'national-cycle', currentYear: 2026 }],
      activeModeId: 'selecciones',
      isLoaded: true,
    });
    useTournamentStore.setState({ currentTournament: toCycle(baseTournament()) });

    const { result } = renderHook(() => useModeSnapshot(vi.fn()));
    expect(result.current.snapshot.title).toBe('Ciclo 2026');
    expect(result.current.isLoading).toBe(false);
  });

  it('modo de ligas: usa el adaptador de la temporada', () => {
    useModeStore.setState({
      modes: [{ id: 'villamariense', name: 'Liga Villamariense', kind: 'league-system', currentYear: 2027 }],
      activeModeId: 'villamariense',
      isLoaded: true,
    });
    useLeagueModeStore.setState({ status: 'ready', year: 2027, tournaments: [], busy: false });

    const { result } = renderHook(() => useModeSnapshot(vi.fn()));
    expect(result.current.snapshot.title).toBe('Temporada 2027');
    expect(result.current.snapshot.nextAction?.label).toBe('▶ EMPEZAR TEMPORADA');
  });

  it('lista de modos sin cargar: isLoading true', () => {
    useModeStore.setState({ modes: [], activeModeId: 'selecciones', isLoaded: false });
    const { result } = renderHook(() => useModeSnapshot(vi.fn()));
    expect(result.current.isLoading).toBe(true);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/hooks/__tests__/useModeSnapshot.test.tsx`
Expected: FAIL — `Failed to resolve import "../useModeSnapshot"`.

- [ ] **Step 3: Implementar el hook**

```ts
// src/hooks/useModeSnapshot.ts
import { useMemo } from 'react';
import { useModeStore } from '../store/useModeStore';
import { useTournamentStore } from '../store/useTournamentStore';
import { useLeagueModeStore } from '../store/useLeagueModeStore';
import { useMatchResultsStore } from '../store/useMatchResultsStore';
import { snapshotFromCycle } from '../core/snapshots/cycle';
import { snapshotFromLeagueSeason } from '../core/snapshots/league';
import type { ModeSnapshot } from '../core/modeSnapshot';
import type { View } from '../types/view';

/**
 * Resuelve el ModeSnapshot del modo activo. Es el ÚNICO lugar de la feature que
 * conoce los dos modos: los adaptadores son puros y el Hub es ciego. Agregar un
 * modo nuevo se reduce a agregar un adaptador y una rama acá.
 */
export function useModeSnapshot(nav: (view: View) => void): {
  snapshot: ModeSnapshot;
  isLoading: boolean;
} {
  const isLoaded = useModeStore((s) => s.isLoaded);
  const modeKind = useModeStore((s) => s.activeModeKind());

  const currentTournament = useTournamentStore((s) => s.currentTournament);
  // Un sorteo o un batch en curso deshabilita la próxima acción: el store ya
  // tiene sus propios candados, esto evita el doble clic en la UI.
  const cycleBusy = useTournamentStore((s) => s.isDrawing || s.isBatchProcessing);
  const leagueStatus = useLeagueModeStore((s) => s.status);
  const leagueYear = useLeagueModeStore((s) => s.year);
  const leagueTournaments = useLeagueModeStore((s) => s.tournaments);
  const leagueBusy = useLeagueModeStore((s) => s.busy);
  const lastResults = useMatchResultsStore((s) => s.results);

  const snapshot = useMemo<ModeSnapshot>(() => {
    if (modeKind === 'league-system') {
      return snapshotFromLeagueSeason(
        { status: leagueStatus, year: leagueYear, tournaments: leagueTournaments, busy: leagueBusy },
        (tab) => {
          useLeagueModeStore.getState().setActiveTab(tab);
          nav('league');
        },
        {
          startSeason: () => useLeagueModeStore.getState().startSeason(),
          simulateLeagueMatchday: (id, md) =>
            useLeagueModeStore.getState().simulateLeagueMatchday(id, md),
          closeSeason: () => useLeagueModeStore.getState().closeSeason(),
          reload: async () => {
            const mode = useModeStore.getState().activeMode();
            if (mode) await useLeagueModeStore.getState().loadForMode(mode);
          },
        },
      );
    }

    return snapshotFromCycle(
      currentTournament,
      nav,
      {
        drawContinental: () => useTournamentStore.getState().drawContinental(),
        drawConfederations: () => useTournamentStore.getState().drawConfederations(),
        advanceToQualifiers: () => useTournamentStore.getState().advanceToQualifiers(),
        generateDrawAndFixtures: (options) =>
          useTournamentStore.getState().generateDrawAndFixtures(options),
        advanceToWorldCup: () => useTournamentStore.getState().advanceToWorldCup(),
        advanceToKnockout: () => useTournamentStore.getState().advanceToKnockout(),
      },
      lastResults,
      cycleBusy,
    );
  }, [
    modeKind,
    currentTournament,
    cycleBusy,
    leagueStatus,
    leagueYear,
    leagueTournaments,
    leagueBusy,
    lastResults,
    nav,
  ]);

  return { snapshot, isLoading: !isLoaded };
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/hooks/__tests__/useModeSnapshot.test.tsx`
Expected: PASS — 3 tests.

Si `useModeStore.setState` con un `GameMode` da error de tipos, agregar al literal los campos que exija `src/types/index.ts` (revisar `interface GameMode`).

- [ ] **Step 5: Chequear tipos y correr la suite entera**

```bash
npx tsc -b && set -o pipefail && npm test 2>&1 | grep -E "Test Files|Tests "
```
Expected: `tsc` sin salida y ningún test fallando. La suite antes de esta feature estaba en 605.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useModeSnapshot.ts src/hooks/__tests__/useModeSnapshot.test.tsx
git commit -m "feat(hub): hook que resuelve el snapshot del modo activo"
```

---

### Task 5: Mudar "rehacer sorteo de clasificatorias" a QualifiersView

Esta acción es destructiva (borra y regenera 840 partidos) y su `ConfirmDialog`
tiene un comportamiento no obvio que arregló un bug real: **si el guard rechaza,
el diálogo debe quedar abierto**, no cerrarse como si hubiera funcionado. Eso se
logra lanzando (`throw`) en vez de retornar.

**Files:**
- Modify: `src/components/tournament/QualifiersView.tsx`
- Test: `src/components/tournament/__tests__/QualifiersView.test.tsx` (crear si no existe)
- Reference: `src/components/tournament/TournamentWizard.tsx:381-460` y `TournamentWizard.test.tsx` describe "rehacer sorteo de clasificatorias"

- [ ] **Step 1: Escribir los tests en su nuevo hogar (fallan)**

Copiar el describe "TournamentWizard — rehacer sorteo de clasificatorias (ConfirmDialog)" de `src/components/tournament/__tests__/TournamentWizard.test.tsx` a `QualifiersView.test.tsx`, cambiando sólo el componente que se rinde y el fixture de estado. **No cambiar lo que los tests afirman.**

Los dos casos que deben sobrevivir textualmente:
1. `no festeja y deja el diálogo abierto si el guard rechaza`
2. `festeja y cierra el diálogo cuando el sorteo se rehace`

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/components/tournament/__tests__/QualifiersView.test.tsx`
Expected: FAIL — no existe el botón "Rehacer sorteo" en `QualifiersView`.

- [ ] **Step 3: Mover el handler, el estado y el ConfirmDialog**

En `QualifiersView.tsx`, agregar (copiando de `TournamentWizard.tsx`):

```tsx
const [confirmRedrawQualifiers, setConfirmRedrawQualifiers] = useState(false);
const { generateDrawAndFixtures } = useTournamentStore();

const handleRedrawQualifiers = async () => {
  const completed = await generateDrawAndFixtures({ force: true });
  // Lanzar (en vez de sólo retornar) es lo que hace que ConfirmDialog deje el
  // diálogo abierto, en vez de cerrarlo como si la acción destructiva hubiera
  // funcionado. El store ya avisó el motivo con su propio toast.
  if (!completed) throw new Error('No se pudo rehacer el sorteo de clasificatorias.');
  toast.success('Sorteo de clasificatorias rehecho');
};
```

Y el `ConfirmDialog`, copiado tal cual de `TournamentWizard.tsx:650-663`:

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

El botón que lo abre va en las acciones del `ViewHeader` de la vista, visible sólo cuando `isQualifiersDrawn(tournament)` y `!tournament.hasAnyMatchPlayed` — las mismas condiciones que lo gobernaban en el wizard:

```tsx
<Button variant="danger" size="sm" onClick={() => setConfirmRedrawQualifiers(true)}>
  Rehacer sorteo
</Button>
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/tournament/__tests__/QualifiersView.test.tsx`
Expected: PASS — 2 tests.

- [ ] **Step 5: Borrar del wizard lo que se mudó**

Quitar de `TournamentWizard.tsx` `handleRedrawQualifiers`, `confirmRedrawQualifiers`, su botón y su `ConfirmDialog`. Quitar de `TournamentWizard.test.tsx` el describe correspondiente (ya vive en su nuevo hogar).

- [ ] **Step 6: Correr la suite y chequear tipos**

```bash
npx tsc -b && set -o pipefail && npm test 2>&1 | grep -E "Test Files|Tests "
```
Expected: sin fallas. El conteo total no debe bajar: los tests se movieron, no se borraron.

- [ ] **Step 7: Commit**

```bash
git add src/components/tournament/QualifiersView.tsx src/components/tournament/__tests__/QualifiersView.test.tsx src/components/tournament/TournamentWizard.tsx src/components/tournament/__tests__/TournamentWizard.test.tsx
git commit -m "refactor(hub): rehacer sorteo de clasificatorias vive en QualifiersView"
```

---

### Task 6: Mudar "regenerar sorteo del Mundial" y "sorteo manual" a WorldCupViewEnhanced

**Files:**
- Modify: `src/components/tournament/WorldCupViewEnhanced.tsx`
- Test: `src/components/tournament/__tests__/WorldCupViewEnhanced.test.tsx`
- Reference: `TournamentWizard.tsx:453-523` y `TournamentWizard.test.tsx` describes "regenerar sorteo del Mundial (ConfirmDialog)" y "handleDrawSimulatorComplete"

- [ ] **Step 1: Escribir los tests en su nuevo hogar (fallan)**

Copiar a `WorldCupViewEnhanced.test.tsx` los dos describes, incluido el mock de `DrawSimulator` que ya usa `TournamentWizard.test.tsx`:

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

Copiar de `TournamentWizard.tsx` a `WorldCupViewEnhanced.tsx`: `showDrawSimulator`, `qualifiedTeamsForDraw`, `confirmRegenWorldCup`, `handleManualDraw`, `handleDrawSimulatorComplete`, `handleRegenerateWorldCupDraw`, el `<DrawSimulator/>` y el `<ConfirmDialog/>` de regeneración, con sus comentarios intactos.

El `ConfirmDialog` va tal cual, de `TournamentWizard.tsx:624-647`:

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

El punto crítico de `handleDrawSimulatorComplete`: si `advanceToWorldCupWithManualDraw` devuelve `false`, **no** cerrar el simulador ni festejar — el sorteo manual que el usuario acaba de hacer no se descarta.

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/components/tournament/__tests__/WorldCupViewEnhanced.test.tsx`
Expected: PASS.

- [ ] **Step 5: Borrar del wizard lo que se mudó**

Quitar de `TournamentWizard.tsx` todo lo copiado y su import de `DrawSimulator`. Quitar de `TournamentWizard.test.tsx` los dos describes y el mock de `DrawSimulator`.

- [ ] **Step 6: Correr la suite y chequear tipos**

```bash
npx tsc -b && set -o pipefail && npm test 2>&1 | grep -E "Test Files|Tests "
```
Expected: sin fallas, conteo total sin bajar.

- [ ] **Step 7: Commit**

```bash
git add src/components/tournament/WorldCupViewEnhanced.tsx src/components/tournament/__tests__/WorldCupViewEnhanced.test.tsx src/components/tournament/TournamentWizard.tsx src/components/tournament/__tests__/TournamentWizard.test.tsx
git commit -m "refactor(hub): regenerar sorteo y sorteo manual viven en la vista del Mundial"
```

---

### Task 7: Cambiar la navegación a `hub`, montarlo y borrar el wizard

Recién acá se borra `TournamentWizard`: sus tres acciones avanzadas ya tienen
hogar nuevo (Tasks 5 y 6) y el camino feliz vive en el adaptador (Task 1).

**Files:**
- Modify: `src/types/view.ts`, `src/App.tsx`, `src/components/ui/Sidebar.tsx`, `src/components/ui/GameTabBar.tsx`, `src/components/tournament/LeagueModeView.tsx`, `src/store/useLeagueModeStore.ts`
- Modify: `src/components/tournament/{ContinentalView,ConfederationsCupView,QualifiersView,WorldCupViewEnhanced}.tsx`
- Delete: `src/components/tournament/TournamentWizard.tsx`, `src/components/tournament/__tests__/TournamentWizard.test.tsx`

- [ ] **Step 1: Renombrar la vista en el tipo**

En `src/types/view.ts`, cambiar `| 'wizard'` por `| 'hub'` y actualizar el comentario del bloque si menciona el wizard.

- [ ] **Step 2: Correr `tsc` para que el compilador liste todos los call sites**

Run: `npx tsc -b`
Expected: FAIL con errores en `App.tsx`, `Sidebar.tsx`, `GameTabBar.tsx` y las cuatro vistas de fase. Esa lista es el checklist de este task.

- [ ] **Step 3: Actualizar navegación y montar el Hub**

`src/components/ui/Sidebar.tsx`:
- En `NATIONAL_SECTIONS`, cambiar `{ id: 'wizard', icon: Workflow, label: 'Progreso' }` por `{ id: 'hub', icon: Home, label: 'Inicio' }` (`Home` ya está importado).
- Antes de la sección "Temporada" de los modos de ligas, agregar un bloque con `renderViewItem({ id: 'hub', icon: Home, label: 'Inicio' })`.

`src/components/ui/GameTabBar.tsx`: en `NATIONAL_TABS` y `LEAGUE_TABS`, el primer tab pasa a `{ id: 'hub', icon: Home, label: 'INICIO' }`. Ambos ya decían "INICIO", así que no cambia el ancho.

Las cuatro vistas de fase: `onNavigate?.('wizard')` → `onNavigate?.('hub')`, y la etiqueta `'Ir a Progreso'` → `'Ir al inicio'`.

`src/App.tsx`:
- `useState<View>('hub')`.
- La rama de encarrilado de vistas usa `'hub'` donde decía `'wizard'`, y `leagueValid` incorpora `'hub'`.
- Reemplazar el render del wizard por el Hub, y hacerlo válido también sin `currentTournament`:

```tsx
const { snapshot, isLoading } = useModeSnapshot(handleNavigate);
```

```tsx
) : currentView === 'hub' ? (
  <HubView
    snapshot={snapshot}
    isLoading={isLoading}
    onNewTournament={isNationalMode ? () => setCurrentView('tournaments') : undefined}
  />
) : ...
```

En la rama `!currentTournament` (modos de ligas), agregar `currentView === 'hub'` antes del fallback a `LeagueModeView`.

**Cuidado con el orden de los hooks:** `useModeSnapshot` debe declararse junto a los demás hooks, **antes** de los `return` condicionales de `initStatus` y de `!currentTournament && isNationalMode`. Si no, al pasar `currentTournament` de `null` a existente cambia la cantidad de hooks ejecutados y React lanza "Rendered more hooks than during the previous render" — el mismo problema ya documentado en `App.tsx` y `TournamentWizard.tsx`.

- [ ] **Step 4: Sacar la pestaña `main` del modo de ligas**

En `src/store/useLeagueModeStore.ts`, `deriveLeagueTabs` deja de emitir `main`:

```ts
export function deriveLeagueTabs(status: LeagueModeStatus, tournaments: ModeTournament[]): LeagueTab[] {
  const ready = status === 'ready' && tournaments.length > 0;
  // 'main' ya no existe: sus dos estados (sin sembrar / lista para arrancar) los
  // absorbió el Hub, que es la pantalla de inicio de todos los modos.
  if (!ready) return [{ key: 'crests', label: 'Escudos' }];
  ...
}
```

En `src/components/tournament/LeagueModeView.tsx`, borrar los dos bloques `activeTab === 'main'` y el import de `Play` si queda sin uso.

Actualizar `src/store/__tests__/useLeagueModeStore.test.ts`: los casos de `deriveLeagueTabs` que esperan `main` ahora esperan la lista sin él.

- [ ] **Step 5: Borrar el wizard**

```bash
git rm src/components/tournament/TournamentWizard.tsx src/components/tournament/__tests__/TournamentWizard.test.tsx
```

Verificar que no quedó ninguna referencia:

```bash
grep -rn "TournamentWizard\|'wizard'" src/ || echo "sin referencias"
```
Expected: `sin referencias`.

- [ ] **Step 6: Correr la suite entera y chequear tipos**

```bash
npx tsc -b && set -o pipefail && npm test 2>&1 | grep -E "Test Files|Tests "
```
Expected: `tsc` sin salida y ningún test fallando.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(hub): el Hub reemplaza al wizard como inicio de todos los modos"
```

---

### Task 8: Verificación final

- [ ] **Step 1: Suite completa, tipos y build**

```bash
set -o pipefail
npx tsc -b && npm test 2>&1 | grep -E "Test Files|Tests " && npm run build 2>&1 | tail -5
```
Expected: `tsc` sin salida, cero tests fallando, build exitoso.

- [ ] **Step 2: Smoke test manual en la app**

```bash
npm run dev
```

Recorrer y confirmar:

1. **Selecciones, ciclo nuevo** — el Hub abre con "Ciclo 2026", fase "Torneos Continentales", progreso 0% y el botón "▶ SORTEAR CONTINENTAL". Apretarlo sortea y navega a Continental.
2. **Selecciones, ciclo a medias** (torneo 2054) — el Hub ofrece "▶ JUGAR CLASIFICATORIAS" y la escalera muestra Continental y Confederaciones en `done`.
3. **Selecciones, ciclo completo** (torneo 2050) — el Hub muestra el estado de cierre con "Nuevo torneo", no un botón muerto.
4. **Rehacer sorteo de clasificatorias** — sigue existiendo, ahora en Clasificatorias, y su diálogo queda abierto si el guard rechaza.
5. **Regenerar sorteo del Mundial y sorteo manual** — siguen existiendo, ahora en Mundial.
6. **Liga Villamariense** — el Hub abre con "Temporada 2027" y la próxima acción de la liga; la escalera cambia de pestaña.
7. **Mobile (400px)** — el tab bar abre en INICIO y muestra el Hub en los dos modos.

- [ ] **Step 3: Actualizar la memoria del proyecto**

Escribir en `/Users/augustoniedfeld/.claude/projects/-Users-augustoniedfeld-Desarrollo-football-tournament-simulator/memory/` una entrada para esta feature y su línea en `MEMORY.md`.

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "docs: cierra la etapa 1 del contrato de modo y Hub"
```

---

## Notas para quien implemente

- **El orden de las tareas no es negociable.** El wizard se borra en el Task 7, después de que sus acciones destructivas tengan hogar nuevo (Tasks 5 y 6). Borrarlo antes pierde tres arreglos de bugs.
- **Los tests que se mudan no se reescriben.** Si un test cambia lo que afirma al cambiar de archivo, se perdió cobertura. El conteo total de la suite no debe bajar en ningún commit.
- **Los adaptadores son puros.** Si alguno necesita importar un store, el diseño se rompió: las dependencias se inyectan por parámetro.
- Fixtures útiles ya existentes: `src/test/fixtures/cycle.ts` (`baseTournament`, `makeDrawnContinentalCycle`, `makeContinentalDoneCycle`, `makeDrawnConfedCycle`).
