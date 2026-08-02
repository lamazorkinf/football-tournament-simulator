# Resumen de fecha — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `MatchResultsModal` pasa de lista plana a tres bloques — titulares, movimientos de tabla y los resultados plegables — para que una fecha de 84 partidos tenga jerarquía.

**Architecture:** Una derivación pura nueva (`src/core/tableMoves.ts`) que diffea dos tablas de posiciones, una opción nueva en la derivación de titulares que ya existe, y un tercer argumento en `showResults` para lo que es de la fecha entera. Los datos por partido viajan en `MatchResult`, que los dos productores completan capturando el estado **antes** de simular.

**Tech Stack:** TypeScript 5.9, React 19, Zustand 5, Tailwind v4, Vitest 4 + Testing Library, lucide-react.

**Spec:** `docs/superpowers/specs/2026-08-01-resumen-de-fecha-design.md`

## Global Constraints

- **Cero migraciones.** No se toca `supabase/migrations/` ni la persistencia.
- **No se toca el motor de simulación** (`src/core/engine.ts`) ni `src/modes/`.
- **No se toca el Hub**: ni `src/App.tsx`, ni `src/components/hub/HubView.tsx`, ni la lógica de `src/hooks/useRecentHeadlines.ts` — salvo el import de `HeadlineView`, que se muda.
- **`src/core/headlines.ts` y `src/core/tableMoves.ts` son PUROS**: no importan React, ni stores, ni `supabase`, ni servicios. Sólo tipos.
- **Los textos en `font-arcade` van sin tildes** (Press Start 2P no tiene glifos para mayúsculas acentuadas y las rinde como cuadrados). El resto del texto y **todos los comentarios** van en español con ortografía completa (tildes, ñ).
- **El bloque de tabla aparece sólo cuando la fecha es de UNA liga** (`run.format === 'liga'` en el modo de temporada). El ciclo mundialista nunca lo arma.
- **Verificación de la suite:** `set -o pipefail` y grep del resumen. **Nunca `| tail`** — el exit code de una tubería es el de `tail` y eso ya dejó pasar seis pruebas rotas en este repo.
- Punto de partida: 99 archivos de test, 953 tests, `npx tsc -b` limpio, `npm run build` OK.

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/core/headlines.ts` (modificar) | `stage` opcional, opciones de `deriveHeadlines`, `HeadlineView` se muda acá |
| `src/core/tableMoves.ts` (crear) | `deriveTableSummary`: diff de dos tablas de posiciones |
| `src/store/useMatchResultsStore.ts` (modificar) | `MatchResult` gana skills previos; `showResults` gana el tercer argumento |
| `src/store/useLiveMatchdayStore.ts` (modificar) | La sesión arrastra la tabla |
| `src/components/tournament/LiveMatchdayOverlay.tsx` (modificar) | Reenvía la tabla al cerrar |
| `src/components/ui/TableMovesCard.tsx` (crear) | El bloque de tabla, presentacional |
| `src/components/ui/MatchResultsModal.tsx` (modificar) | Los tres bloques y el plegable |
| `src/components/tournament/jornadaResults.ts` (modificar) | Quinto parámetro con los skills previos |
| `src/hooks/useCycleJornada.ts` (modificar) | Captura los skills previos |
| `src/hooks/useModeJornada.ts` (modificar) | Captura skills previos **y** arma la tabla |

---

### Task 1: `deriveHeadlines` gana opciones, `stage` se vuelve opcional, `HeadlineView` se muda

**Files:**
- Modify: `src/core/headlines.ts`
- Modify: `src/hooks/useRecentHeadlines.ts` (borra la definición de `HeadlineView` y la importa)
- Modify: `src/components/hub/HeadlinesCard.tsx:7`, `src/components/hub/HubView.tsx:12`, `src/components/hub/__tests__/HeadlinesCard.test.tsx:4` (cambian el import)
- Test: `src/core/__tests__/headlines.test.ts`

**Interfaces:**
- Produces: `DeriveHeadlinesOptions { limit?: number; decayByAge?: boolean }`; `deriveHeadlines(matches: HeadlineMatch[], options?: DeriveHeadlinesOptions): Headline[]`; `HeadlineMatch.stage?: MatchHistoryStage` (ahora opcional); `HeadlineView extends Headline { homeTeamName: string; awayTeamName: string }` exportada desde `src/core/headlines.ts`.

**Por qué la etapa se vuelve opcional.** Sólo pesa el puntaje vía `STAGE_WEIGHT`. Dentro de una jornada **todos los partidos comparten etapa**, así que ese peso es un multiplicador constante sobre todos los candidatos: no puede cambiar el orden, sólo el valor absoluto contra `MIN_SCORE`. El resumen de fecha no la transporta. El Hub sí la sigue mandando, porque ahí los partidos vienen de `match_history` y comparar entre etapas importa.

**Contexto:** `rank()` lo llaman dos lugares — el bucle principal de `deriveHeadlines` y `streakCandidates`. Los dos tienen que propagar la opción de decaimiento.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/core/__tests__/headlines.test.ts` (el helper `match(over)` ya está declarado arriba del archivo y arma un partido neutro 1-0 entre iguales con `stage: 'league'`):

```ts
describe('deriveHeadlines — opciones', () => {
  /** Batacazo de brecha 25 entre dos equipos que se pasan por parámetro. */
  const batacazo = (homeTeamId: string, awayTeamId: string) =>
    match({ homeTeamId, awayTeamId, homeSkillBefore: 60, awaySkillBefore: 85 });

  /** Partidos que no producen ningún titular: 1-0 entre iguales, equipos distintos. */
  const relleno = (n: number) =>
    Array.from({ length: n }, (_, i) => match({ homeTeamId: `h${i}`, awayTeamId: `a${i}` }));

  it('respeta el límite pedido', () => {
    const res = deriveHeadlines(
      [batacazo('A', 'B'), batacazo('C', 'D'), batacazo('E', 'F')],
      { limit: 1 },
    );
    expect(res).toHaveLength(1);
  });

  it('por defecto sigue decayendo por antigüedad', () => {
    const res = deriveHeadlines([batacazo('A', 'B'), ...relleno(59), batacazo('C', 'D')]);
    expect(res[0].score).toBeGreaterThan(res[1].score);
  });

  /**
   * Los partidos de una jornada son SIMULTÁNEOS: no hay más viejo ni más nuevo,
   * y penalizar por posición en el array sería arbitrario.
   */
  it('con decayByAge en false, la posición en el array no pesa', () => {
    const res = deriveHeadlines(
      [batacazo('A', 'B'), ...relleno(59), batacazo('C', 'D')],
      { decayByAge: false },
    );
    expect(res).toHaveLength(2);
    expect(res[0].score).toBe(res[1].score);
  });

  it('sin etapa, el peso de etapa es neutro', () => {
    const [conEtapa] = deriveHeadlines([
      match({ homeSkillBefore: 60, awaySkillBefore: 85, stage: 'world-cup-knockout' }),
    ]);
    const [sinEtapa] = deriveHeadlines([
      match({ homeSkillBefore: 60, awaySkillBefore: 85, stage: undefined }),
    ]);
    // 1.3 es el peso de 'world-cup-knockout'; sin etapa el multiplicador es 1.
    expect(conEtapa.score).toBeCloseTo(sinEtapa.score * 1.3);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
npx vitest run src/core/__tests__/headlines.test.ts -t opciones
```

Esperado: FAIL — `deriveHeadlines` todavía recibe un número como segundo parámetro, así que `{ limit: 1 }` no lo respeta y `stage: undefined` rompe el tipo.

- [ ] **Step 3: Hacer opcional la etapa en `src/core/headlines.ts`**

En `HeadlineMatch`, reemplazar `stage: MatchHistoryStage;` por:

```ts
  /**
   * Etapa del partido. OPCIONAL a propósito: lo único que hace es pesar el
   * puntaje vía `STAGE_WEIGHT`, y dentro de una jornada todos los partidos
   * comparten etapa — con lo cual el peso es un multiplicador constante,
   * incapaz de cambiar el orden. El resumen de fecha no la transporta; el Hub
   * sí, porque ahí los partidos vienen de `match_history` y comparar entre
   * etapas importa.
   */
  stage?: MatchHistoryStage;
```

- [ ] **Step 4: Propagar la opción de decaimiento por `rank` y `streakCandidates`**

Reemplazar la función `rank` entera por:

```ts
function rank(
  candidate: Candidate,
  m: HeadlineMatch,
  index: number,
  decayByAge: boolean,
): Ranked {
  return {
    index,
    headline: {
      kind: candidate.kind,
      label: candidate.label,
      detail: candidate.detail,
      subjectTeamId: candidate.subjectTeamId,
      match: m,
      score:
        candidate.base *
        (m.stage ? STAGE_WEIGHT[m.stage] : 1) *
        (decayByAge ? DECAY ** index : 1),
    },
  };
}
```

En `streakCandidates`, cambiar la firma a `function streakCandidates(matches: HeadlineMatch[], decayByAge: boolean): Ranked[] {` y su única llamada a `rank(...)` para que pase `decayByAge` como cuarto argumento (después de `run.match, run.index`).

- [ ] **Step 5: Cambiar la firma de `deriveHeadlines`**

Agregar, justo antes de la función:

```ts
export interface DeriveHeadlinesOptions {
  /** Cuántos titulares devolver. */
  limit?: number;
  /**
   * Penalizar cada titular según su posición en el array, que en el Hub es su
   * antigüedad. `false` para una jornada: sus partidos son simultáneos, no hay
   * más viejo ni más nuevo, y castigar por posición sería arbitrario.
   */
  decayByAge?: boolean;
}
```

Y reemplazar la firma y las dos primeras sentencias del cuerpo:

```ts
/**
 * @param matches En el Hub, ordenados del más nuevo al más viejo — el orden que
 *   devuelve `getMatchesPage`, donde el índice de cada partido ES su antigüedad.
 *   En un resumen de fecha el orden no significa nada: para eso está
 *   `decayByAge: false`.
 */
export function deriveHeadlines(
  matches: HeadlineMatch[],
  options: DeriveHeadlinesOptions = {},
): Headline[] {
  const { limit = HEADLINES_LIMIT, decayByAge = true } = options;
  const ranked: Ranked[] = [];
  matches.forEach((m, index) => {
    const best = pickBest(candidatesFor(m));
    if (best) ranked.push(rank(best, m, index, decayByAge));
  });
  // Las rachas son por equipo, no por partido, así que se calculan aparte y
  // compiten en la misma tabla. La regla de "un equipo no aparece dos veces" es
  // la que evita "BATACAZO: Ben Hur" + "RACHA: Ben Hur, 6 al hilo".
  ranked.push(...streakCandidates(matches, decayByAge));
```

El resto del cuerpo (filtro por `MIN_SCORE`, orden, deduplicación por equipo y corte en `limit`) queda igual.

- [ ] **Step 6: Mudar `HeadlineView` a `src/core/headlines.ts`**

Agregar al final de `src/core/headlines.ts`:

```ts
/**
 * Un titular listo para dibujar. La derivación habla de ids; los nombres los
 * resuelve quien tiene el pool de equipos a mano. Vive acá y no en el hook que
 * lo produjo primero porque tiene dos consumidores —la portada del Hub y el
 * resumen de fecha— y un componente no debería importar un tipo desde un hook
 * de datos que no usa.
 */
export interface HeadlineView extends Headline {
  homeTeamName: string;
  awayTeamName: string;
}
```

En `src/hooks/useRecentHeadlines.ts`: borrar el bloque `export interface HeadlineView extends Headline { … }` y agregar `HeadlineView` al import que ya existe:

```ts
import {
  deriveHeadlines,
  type Headline,
  type HeadlineMatch,
  type HeadlineView,
} from '../core/headlines';
```

Cambiar el import en los tres consumidores, que hoy dicen `from '.../hooks/useRecentHeadlines'`:
- `src/components/hub/HeadlinesCard.tsx:7` → `import type { HeadlineKind, HeadlineView } from '../../core/headlines';` (unifica con el import de `HeadlineKind` que ya está en la línea 6; borrar la línea 7 vieja).
- `src/components/hub/HubView.tsx:12` → `import type { HeadlineView } from '../../core/headlines';`
- `src/components/hub/__tests__/HeadlinesCard.test.tsx:4` → `import type { HeadlineView } from '../../../core/headlines';`

- [ ] **Step 7: Correr los tests y verificar que pasan**

```bash
npx vitest run src/core/__tests__/headlines.test.ts src/components/hub src/hooks/__tests__/useRecentHeadlines.test.tsx
```

Esperado: PASS. `headlines.test.ts` sube de 25 a 29 tests.

- [ ] **Step 8: Verificar tipos**

```bash
npx tsc -b
```

Esperado: sin errores. Si aparece algún `HeadlineView` sin resolver, es un import que quedó apuntando al hook.

- [ ] **Step 9: Commit**

```bash
git add src/core/headlines.ts src/core/__tests__/headlines.test.ts src/hooks/useRecentHeadlines.ts src/components/hub
git commit -m "refactor(titulares): opciones de derivación y HeadlineView en el core"
```

---

### Task 2: `deriveTableSummary` — el diff de dos tablas

**Files:**
- Create: `src/core/tableMoves.ts`
- Test: `src/core/__tests__/tableMoves.test.ts`

**Interfaces:**
- Consumes: `TeamStanding` de `src/types/index.ts` — `{ teamId, played, won, drawn, lost, goalsFor, goalsAgainst, goalDifference, points }`.
- Produces: `TableMove { teamId: string; from: number; to: number }`; `TableSummary { leaderTeamId: string; leaderIsNew: boolean; moves: TableMove[] }`; `TableSummaryView extends TableSummary { leaderTeamName: string; moves: Array<TableMove & { teamName: string }> }`; `deriveTableSummary(before: TeamStanding[], after: TeamStanding[], limit?: number): TableSummary | null`; `TABLE_MOVES_LIMIT = 3`.

**Contexto:** `recalcLeagueStandings(state)` (`src/core/formats/league.ts:138`) devuelve la tabla **ya ordenada**, así que la posición de un equipo es su índice + 1. No hay que ordenar nada acá.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/core/__tests__/tableMoves.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveTableSummary } from '../tableMoves';
import type { TeamStanding } from '../../types';

/** Fila de tabla con un partido jugado, salvo que se pida otra cosa. */
const fila = (teamId: string, over: Partial<TeamStanding> = {}): TeamStanding => ({
  teamId,
  played: 1,
  won: 0,
  drawn: 0,
  lost: 1,
  goalsFor: 0,
  goalsAgainst: 1,
  goalDifference: -1,
  points: 0,
  ...over,
});

/** Tabla a partir de los ids, en orden de posición. */
const tabla = (...ids: string[]) => ids.map((id) => fila(id));

describe('deriveTableSummary', () => {
  it('anuncia al puntero', () => {
    const res = deriveTableSummary(tabla('A', 'B', 'C'), tabla('A', 'B', 'C'));
    expect(res?.leaderTeamId).toBe('A');
  });

  it('avisa cuando el puntero es nuevo', () => {
    const res = deriveTableSummary(tabla('A', 'B', 'C'), tabla('B', 'A', 'C'));
    expect(res?.leaderTeamId).toBe('B');
    expect(res?.leaderIsNew).toBe(true);
  });

  it('el puntero que se sostiene no es nuevo', () => {
    const res = deriveTableSummary(tabla('A', 'B', 'C'), tabla('A', 'C', 'B'));
    expect(res?.leaderIsNew).toBe(false);
  });

  it('reporta subidas y bajadas con posiciones 1-based', () => {
    const res = deriveTableSummary(tabla('A', 'B', 'C'), tabla('C', 'A', 'B'));
    expect(res?.moves).toEqual([
      { teamId: 'C', from: 3, to: 1 },
      { teamId: 'A', from: 1, to: 2 },
      { teamId: 'B', from: 2, to: 3 },
    ]);
  });

  it('ordena por magnitud del salto, de mayor a menor', () => {
    const res = deriveTableSummary(
      tabla('A', 'B', 'C', 'D', 'E'),
      tabla('A', 'E', 'B', 'C', 'D'),
    );
    // E saltó 3 posiciones; B, C y D bajaron 1 cada uno.
    expect(res?.moves[0]).toEqual({ teamId: 'E', from: 5, to: 2 });
  });

  it('corta en el límite pedido', () => {
    const res = deriveTableSummary(
      tabla('A', 'B', 'C', 'D', 'E'),
      tabla('E', 'D', 'C', 'B', 'A'),
      2,
    );
    expect(res?.moves).toHaveLength(2);
  });

  it('quien no se movió no aparece', () => {
    const res = deriveTableSummary(tabla('A', 'B', 'C'), tabla('A', 'C', 'B'));
    expect(res?.moves.map((m) => m.teamId)).toEqual(['B', 'C']);
  });

  it('un equipo que antes no estaba no produce movimiento', () => {
    const res = deriveTableSummary(tabla('A', 'B'), tabla('A', 'NUEVO', 'B'));
    expect(res?.moves.map((m) => m.teamId)).toEqual(['B']);
  });

  it('sin tabla después, no hay resumen', () => {
    expect(deriveTableSummary(tabla('A', 'B'), [])).toBeNull();
  });

  /**
   * LA REGLA DE HONESTIDAD. Antes de la primera fecha nadie jugó: el orden que
   * trae `before` es el de siembra, no una tabla. Reportar "subió del 3º al 1º"
   * contra un orden arbitrario sería inventar, así que se anuncia el puntero y
   * nada más. Si este test se cae porque alguien "arregló" el borde reportando
   * los saltos que ve, la app pasa a mentir en cada fecha 1.
   */
  it('en la primera fecha anuncia al puntero pero no reporta movimientos', () => {
    const sinJugar = ['A', 'B', 'C'].map((id) =>
      fila(id, { played: 0, lost: 0, goalsAgainst: 0, goalDifference: 0 }),
    );
    const res = deriveTableSummary(sinJugar, tabla('C', 'A', 'B'));
    expect(res?.leaderTeamId).toBe('C');
    expect(res?.leaderIsNew).toBe(false);
    expect(res?.moves).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx vitest run src/core/__tests__/tableMoves.test.ts
```

Esperado: FAIL — `Failed to resolve import "../tableMoves"`.

- [ ] **Step 3: Escribir `src/core/tableMoves.ts`**

```ts
import type { TeamStanding } from '../types';

/**
 * QUÉ CAMBIÓ EN LA TABLA — la quinta derivación pura del proyecto, al lado de
 * `core/headlines.ts` (qué pasó) y las tres de `modes/`. Contesta la otra
 * pregunta de un resumen de fecha: además de los resultados, qué se movió.
 *
 * Sin React y sin stores: recibe dos tablas ya calculadas y devuelve el diff.
 */

export interface TableMove {
  teamId: string;
  /** Posiciones 1-based dentro de la tabla. */
  from: number;
  to: number;
}

export interface TableSummary {
  leaderTeamId: string;
  /** El puntero cambió en esta fecha. */
  leaderIsNew: boolean;
  /** Los que más se movieron, de mayor a menor salto. Puede venir vacío. */
  moves: TableMove[];
}

/**
 * El resumen con los nombres ya resueltos, que es lo que dibuja la pantalla.
 * Misma división que `Headline` / `HeadlineView`: la derivación habla de ids y
 * quien tiene el pool de equipos los traduce.
 */
export interface TableSummaryView extends TableSummary {
  leaderTeamName: string;
  moves: Array<TableMove & { teamName: string }>;
}

/** Cuántos movimientos entran en el resumen. */
export const TABLE_MOVES_LIMIT = 3;

/**
 * @param before Tabla ANTES de la fecha, ordenada por posición.
 * @param after Tabla DESPUÉS, ordenada por posición. `recalcLeagueStandings` ya
 *   las devuelve ordenadas, así que la posición es el índice + 1.
 */
export function deriveTableSummary(
  before: TeamStanding[],
  after: TeamStanding[],
  limit: number = TABLE_MOVES_LIMIT,
): TableSummary | null {
  const leader = after[0];
  if (!leader) return null;

  // LA REGLA DE HONESTIDAD. Si nadie había jugado, no había tabla: ese orden es
  // el de siembra. Decir "subió del 14º al 3º" contra un orden arbitrario sería
  // inventar, así que se anuncia el puntero y nada más.
  const hadTable = before.some((s) => s.played > 0);
  if (!hadTable) {
    return { leaderTeamId: leader.teamId, leaderIsNew: false, moves: [] };
  }

  const positionBefore = new Map(before.map((s, i) => [s.teamId, i + 1]));
  const moves: TableMove[] = [];
  after.forEach((s, i) => {
    const from = positionBefore.get(s.teamId);
    // Un equipo que antes no estaba no se movió: apareció.
    if (from === undefined) return;
    const to = i + 1;
    if (from !== to) moves.push({ teamId: s.teamId, from, to });
  });

  moves.sort(
    (a, b) =>
      Math.abs(b.from - b.to) - Math.abs(a.from - a.to) ||
      a.to - b.to ||
      // Último desempate para que el orden sea determinista.
      a.teamId.localeCompare(b.teamId),
  );

  return {
    leaderTeamId: leader.teamId,
    leaderIsNew: before[0]?.teamId !== leader.teamId,
    moves: moves.slice(0, limit),
  };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx vitest run src/core/__tests__/tableMoves.test.ts
```

Esperado: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/tableMoves.ts src/core/__tests__/tableMoves.test.ts
git commit -m "feat(resumen): derivación pura de los movimientos de la tabla"
```

---

### Task 3: los stores transportan el resumen

**Files:**
- Modify: `src/store/useMatchResultsStore.ts`
- Modify: `src/store/useLiveMatchdayStore.ts:32-41` (`LiveMatchdaySession`)
- Modify: `src/components/tournament/LiveMatchdayOverlay.tsx` (dos llamadas a `showResults`)
- Test: `src/components/tournament/__tests__/LiveMatchdayOverlay.test.tsx`

**Interfaces:**
- Consumes: `TableSummaryView` de `src/core/tableMoves.ts` (Task 2).
- Produces: `MatchResult` gana `homeSkillBefore?: number`, `awaySkillBefore?: number`, `wentToExtraTime?: boolean`; `showResults(results: MatchResult[], title: string, table?: TableSummaryView): void`; el estado del store gana `table: TableSummaryView | null`; `LiveMatchdaySession` gana `table?: TableSummaryView`.

**Contexto:** `LiveMatchdayOverlay` llama a `showResults(session.allResults, session.title)` en dos lugares — el handler de Escape dentro del `useEffect` y `finishAndShowSummary`. Los dos tienen que reenviar `session.table`.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `src/components/tournament/__tests__/LiveMatchdayOverlay.test.tsx`, dentro del `describe('LiveMatchdayOverlay')` que ya existe. El archivo ya importa `useMatchResultsStore`, `useLiveMatchdayStore`, `fireEvent` y el helper local `entry`:

```tsx
  it('al cerrar reenvía la tabla de la sesión al resumen', () => {
    const table = {
      leaderTeamId: 'arg',
      leaderTeamName: 'Argentina',
      leaderIsNew: true,
      moves: [{ teamId: 'bra', teamName: 'Brasil', from: 1, to: 3 }],
    };
    useLiveMatchdayStore.setState({
      session: {
        title: 'Liga A · Fecha 12',
        entries: [entry],
        allResults: [],
        hiddenCount: 0,
        table,
      },
    });
    render(<LiveMatchdayOverlay />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(useMatchResultsStore.getState().table).toEqual(table);
  });
```

En el `beforeEach` de ese archivo, agregar `table: null` al reset del store de resultados —`setState` es parcial y sin eso la tabla de un test se filtra al siguiente:

```ts
  useMatchResultsStore.setState({ isOpen: false, results: [], title: '', table: null });
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx vitest run src/components/tournament/__tests__/LiveMatchdayOverlay.test.tsx -t tabla
```

Esperado: FAIL — `table` no existe ni en la sesión ni en el store de resultados.

- [ ] **Step 3: Ampliar `src/store/useMatchResultsStore.ts`**

Agregar el import:

```ts
import type { TableSummaryView } from '../core/tableMoves';
```

En `MatchResult`, antes del cierre de la interfaz:

```ts
  /**
   * Skill de cada lado ANTES de este partido: es lo que mide la sorpresa de un
   * titular. Opcionales porque sólo los completa quien capturó el pool de
   * equipos antes de simular — al volver del await, el store ya aplicó los
   * deltas y el skill de "antes" ya no existe.
   */
  homeSkillBefore?: number;
  awaySkillBefore?: number;
  /** El partido se resolvió en el alargue. */
  wentToExtraTime?: boolean;
```

Reemplazar `MatchResultsState` y el store por:

```ts
interface MatchResultsState {
  isOpen: boolean;
  results: MatchResult[];
  title: string;
  /**
   * Movimientos de la tabla de esta fecha. Sólo lo trae una jornada de UNA
   * liga: una fecha de clasificatorias reparte sus partidos en ~14 grupos y no
   * hay una tabla única que resumir.
   */
  table: TableSummaryView | null;
  showResults: (results: MatchResult[], title: string, table?: TableSummaryView) => void;
  close: () => void;
}

export const useMatchResultsStore = create<MatchResultsState>((set) => ({
  isOpen: false,
  results: [],
  title: '',
  table: null,

  showResults: (results: MatchResult[], title: string, table?: TableSummaryView) => {
    set({
      isOpen: true,
      results,
      title,
      table: table ?? null,
    });
  },

  close: () => {
    set({
      isOpen: false,
      results: [],
      title: '',
      table: null,
    });
  },
}));
```

- [ ] **Step 4: Ampliar la sesión de jornada en vivo**

En `src/store/useLiveMatchdayStore.ts`, agregar el import:

```ts
import type { TableSummaryView } from '../core/tableMoves';
```

Y dentro de `LiveMatchdaySession`, después de `hiddenCount`:

```ts
  /** Movimientos de la tabla, para que el resumen final los muestre. */
  table?: TableSummaryView;
```

- [ ] **Step 5: Reenviar la tabla desde el overlay**

En `src/components/tournament/LiveMatchdayOverlay.tsx`, cambiar las **dos** llamadas —la del handler de Escape dentro del `useEffect` y la de `finishAndShowSummary`— de:

```tsx
showResults(session.allResults, session.title);
```

a:

```tsx
showResults(session.allResults, session.title, session.table);
```

- [ ] **Step 6: Correr los tests**

```bash
npx vitest run src/components/tournament/__tests__/LiveMatchdayOverlay.test.tsx src/components/ui/__tests__/MatchResultsModal.test.tsx
```

Esperado: PASS. Los tests existentes del modal no se tocan: el tercer argumento es opcional.

- [ ] **Step 7: Commit**

```bash
git add src/store/useMatchResultsStore.ts src/store/useLiveMatchdayStore.ts src/components/tournament/LiveMatchdayOverlay.tsx src/components/tournament/__tests__/LiveMatchdayOverlay.test.tsx
git commit -m "feat(resumen): los stores transportan skills previos y tabla"
```

---

### Task 4: `TableMovesCard`

**Files:**
- Create: `src/components/ui/TableMovesCard.tsx`
- Test: `src/components/ui/__tests__/TableMovesCard.test.tsx`

**Interfaces:**
- Consumes: `TableSummaryView` de `src/core/tableMoves.ts` (Task 2) — `{ leaderTeamId, leaderTeamName, leaderIsNew, moves: Array<{ teamId, teamName, from, to }> }`; `cn` de `src/lib/utils.ts`.
- Produces: `TableMovesCard({ table }: { table: TableSummaryView })`.

**Referencia de estilo:** vive dentro del cuerpo de `MatchResultsModal`, que usa `bg-night border-2 border-grass` para sus tarjetas de resultado. Paleta: `text-gold` (destacado), `text-led` (positivo), `text-grass-soft` (secundario). El único texto en `font-arcade` es el título, y va sin tildes.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/ui/__tests__/TableMovesCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TableMovesCard } from '../TableMovesCard';
import type { TableSummaryView } from '../../../core/tableMoves';

const table = (over: Partial<TableSummaryView> = {}): TableSummaryView => ({
  leaderTeamId: 'A',
  leaderTeamName: 'Ben Hur',
  leaderIsNew: true,
  moves: [
    { teamId: 'B', teamName: 'Talleres', from: 7, to: 4 },
    { teamId: 'C', teamName: 'Alumni', from: 1, to: 3 },
  ],
  ...over,
});

describe('TableMovesCard', () => {
  it('anuncia al puntero nuevo', () => {
    render(<TableMovesCard table={table()} />);
    expect(screen.getByText('Ben Hur')).toBeInTheDocument();
    expect(screen.getByText(/nuevo puntero/i)).toBeInTheDocument();
  });

  it('el puntero que se sostiene se lee distinto', () => {
    render(<TableMovesCard table={table({ leaderIsNew: false })} />);
    expect(screen.getByText(/sigue puntero/i)).toBeInTheDocument();
    expect(screen.queryByText(/nuevo puntero/i)).not.toBeInTheDocument();
  });

  it('muestra cada movimiento con sus dos posiciones', () => {
    render(<TableMovesCard table={table()} />);
    expect(screen.getByText('Talleres')).toBeInTheDocument();
    expect(screen.getByText('7º → 4º')).toBeInTheDocument();
    expect(screen.getByText('1º → 3º')).toBeInTheDocument();
  });

  it('sin movimientos rinde igual al puntero', () => {
    render(<TableMovesCard table={table({ moves: [] })} />);
    expect(screen.getByText('Ben Hur')).toBeInTheDocument();
    expect(screen.queryByText('Talleres')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx vitest run src/components/ui/__tests__/TableMovesCard.test.tsx
```

Esperado: FAIL — `Failed to resolve import "../TableMovesCard"`.

- [ ] **Step 3: Escribir `src/components/ui/TableMovesCard.tsx`**

```tsx
import { ArrowDown, ArrowUp, Crown } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { TableSummaryView } from '../../core/tableMoves';

/**
 * El bloque "qué cambió en la tabla" del resumen de fecha. Presentacional puro:
 * recibe el resumen ya con los nombres resueltos y no importa ningún store.
 *
 * Sin movimientos igual se rinde: que nadie se haya movido también es
 * información, y el puntero se anuncia siempre.
 */
export function TableMovesCard({ table }: { table: TableSummaryView }) {
  return (
    <div className="bg-night border-2 border-grass p-3 sm:p-4 space-y-2">
      {/* "La tabla" en minúscula, con la mayúscula puesta por CSS: Press Start
          2P no tiene mayúsculas acentuadas, así que los rótulos arcade se
          eligen sin tildes. */}
      <p className="font-arcade text-[9px] text-grass-soft uppercase">La tabla</p>

      <p className="flex items-center gap-2 text-sm min-w-0">
        <Crown className="w-4 h-4 text-gold shrink-0" aria-hidden="true" />
        <span className="truncate text-gold">{table.leaderTeamName}</span>
        <span className="text-grass-soft shrink-0">
          {table.leaderIsNew ? 'es el nuevo puntero' : 'sigue puntero'}
        </span>
      </p>

      {table.moves.map((move) => {
        // Menor número de posición es mejor: bajar de 7º a 4º es subir.
        const subio = move.to < move.from;
        const Icon = subio ? ArrowUp : ArrowDown;
        return (
          <p key={move.teamId} className="flex items-center gap-2 text-xs min-w-0">
            <Icon
              className={cn('w-3.5 h-3.5 shrink-0', subio ? 'text-led' : 'text-grass-soft')}
              aria-hidden="true"
            />
            <span className="truncate">{move.teamName}</span>
            <span className="text-grass-soft shrink-0 tabular-nums">
              {move.from}º → {move.to}º
            </span>
          </p>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx vitest run src/components/ui/__tests__/TableMovesCard.test.tsx
```

Esperado: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/TableMovesCard.tsx src/components/ui/__tests__/TableMovesCard.test.tsx
git commit -m "feat(resumen): tarjeta de movimientos de la tabla"
```

---

### Task 5: el modal pasa a tres bloques

**Files:**
- Modify: `src/components/ui/MatchResultsModal.tsx`
- Test: `src/components/ui/__tests__/MatchResultsModal.test.tsx`

**Interfaces:**
- Consumes: `deriveHeadlines(matches, options?)` y los tipos `HeadlineMatch` / `HeadlineView` de `src/core/headlines.ts` (Task 1); `TableMovesCard` de `src/components/ui/TableMovesCard.tsx` (Task 4); `HeadlinesCard` de `src/components/hub/HeadlinesCard.tsx` (ya existe, presentacional puro, recibe `HeadlineView[]` y con lista vacía no rinde nada); el campo `table` del store (Task 3).
- Produces: nada hacia afuera.

**Tres cosas que hay que respetar:**

1. **Todos los hooks van antes del `if (!isOpen) return null;`** que ya está en la línea 29. `useFocusTrap` y el `useEffect` ya están ahí arriba; los nuevos van al lado.
2. **El estado del plegable se deriva de las props sin efecto**, con el patrón que el repo ya usa en `src/components/ui/TeamFlag.tsx:50-55` (guardar el valor anterior y compararlo durante el render). Un `useEffect` con `setState` dispara la regla `react-hooks/set-state-in-effect`, que en este repo suma un error de lint nuevo.
3. **Los tests existentes de este archivo pasan 3 o 4 resultados**, o sea por debajo del umbral de colapso: siguen viendo la lista expandida y no hay que tocarlos.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/components/ui/__tests__/MatchResultsModal.test.tsx`. El helper `result(homeTeam, awayTeam, isFavorite?)` ya está declarado arriba del archivo:

```tsx
/** Resultado con los datos que hacen falta para que produzca un titular. */
const conSkills = (
  homeTeam: string,
  awayTeam: string,
  over: Partial<MatchResult> = {},
): MatchResult => ({
  ...result(homeTeam, awayTeam),
  homeTeamId: homeTeam.toLowerCase(),
  awayTeamId: awayTeam.toLowerCase(),
  homeSkillBefore: 55,
  awaySkillBefore: 90,
  ...over,
});

const tabla = {
  leaderTeamId: 'a',
  leaderTeamName: 'Ben Hur',
  leaderIsNew: true,
  moves: [{ teamId: 'b', teamName: 'Talleres', from: 7, to: 4 }],
};

describe('MatchResultsModal — resumen de fecha', () => {
  it('titula el batacazo de la fecha', () => {
    useMatchResultsStore.getState().showResults([conSkills('Colon', 'Alumni')], 'Fecha 12');
    render(<MatchResultsModal />);
    expect(screen.getByText('BATACAZO')).toBeInTheDocument();
  });

  it('sin skills previos no hay bloque de titulares', () => {
    useMatchResultsStore.getState().showResults([result('Colon', 'Alumni')], 'Fecha 12');
    render(<MatchResultsModal />);
    expect(screen.queryByText(/titulares/i)).not.toBeInTheDocument();
  });

  it('rinde el bloque de tabla sólo cuando la fecha lo trae', () => {
    useMatchResultsStore.getState().showResults([result('Colon', 'Alumni')], 'Fecha 12', tabla);
    render(<MatchResultsModal />);
    expect(screen.getByText('Ben Hur')).toBeInTheDocument();
    expect(screen.getByText('7º → 4º')).toBeInTheDocument();
  });

  it('sin tabla no rinde ese bloque', () => {
    useMatchResultsStore.getState().showResults([result('Colon', 'Alumni')], 'Fecha 12');
    render(<MatchResultsModal />);
    expect(screen.queryByText(/la tabla/i)).not.toBeInTheDocument();
  });

  /**
   * Una fecha de Villamariense son 10 partidos y se sigue viendo como siempre;
   * una de clasificatorias son 84 y era un muro.
   */
  it('con pocos resultados la lista arranca abierta', () => {
    useMatchResultsStore
      .getState()
      .showResults(
        Array.from({ length: 10 }, (_, i) => result(`Local ${i}`, `Visita ${i}`)),
        'Fecha 12',
      );
    render(<MatchResultsModal />);
    expect(screen.getAllByTestId('match-result')).toHaveLength(10);
  });

  it('con muchos resultados la lista arranca colapsada', () => {
    useMatchResultsStore
      .getState()
      .showResults(
        Array.from({ length: 20 }, (_, i) => result(`Local ${i}`, `Visita ${i}`)),
        'Jornada 3',
      );
    render(<MatchResultsModal />);
    expect(screen.queryAllByTestId('match-result')).toHaveLength(0);
    expect(screen.getByRole('button', { name: /20 resultados/i })).toBeInTheDocument();
  });

  it('el plegable abre la lista', () => {
    useMatchResultsStore
      .getState()
      .showResults(
        Array.from({ length: 20 }, (_, i) => result(`Local ${i}`, `Visita ${i}`)),
        'Jornada 3',
      );
    render(<MatchResultsModal />);

    fireEvent.click(screen.getByRole('button', { name: /20 resultados/i }));

    expect(screen.getAllByTestId('match-result')).toHaveLength(20);
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
npx vitest run src/components/ui/__tests__/MatchResultsModal.test.tsx -t "resumen de fecha"
```

Esperado: FAIL — no hay bloque de titulares, ni de tabla, ni plegable.

- [ ] **Step 3: Agregar los imports y el adaptador en `MatchResultsModal.tsx`**

Agregar a los imports de arriba del archivo:

```tsx
import { useMemo, useState } from 'react';
import { deriveHeadlines, type HeadlineMatch, type HeadlineView } from '../../core/headlines';
import { HeadlinesCard } from '../hub/HeadlinesCard';
import { TableMovesCard } from './TableMovesCard';
import type { MatchResult } from '../../store/useMatchResultsStore';
```

(`useEffect` ya se importa de `react`; sumar `useMemo` y `useState` al mismo import.)

Agregar, entre los imports y el componente:

```tsx
/**
 * Por encima de esto la lista de resultados arranca plegada. 12 es el mismo
 * tope que usa la grilla de la jornada en vivo: una fecha de liga (10 partidos)
 * se sigue viendo entera y una de clasificatorias (84) deja de ser un muro.
 */
const RESULTS_COLLAPSE_THRESHOLD = 12;

/**
 * Un resultado sólo produce titular si trae con qué medir la sorpresa. Los
 * productores viejos —o cualquiera que no haya capturado el pool de equipos
 * antes de simular— devuelven `null` y quedan afuera sin romper nada.
 */
function resultToHeadlineMatch(r: MatchResult): HeadlineMatch | null {
  if (!r.homeTeamId || !r.awayTeamId) return null;
  if (r.homeSkillBefore === undefined || r.awaySkillBefore === undefined) return null;
  return {
    homeTeamId: r.homeTeamId,
    awayTeamId: r.awayTeamId,
    homeScore: r.homeScore,
    awayScore: r.awayScore,
    homeSkillBefore: r.homeSkillBefore,
    awaySkillBefore: r.awaySkillBefore,
    wentToExtraTime: r.wentToExtraTime,
    // La etapa no viaja: dentro de una jornada todos los partidos comparten la
    // misma, así que su peso sería un multiplicador constante.
    ...(r.penalties ? { penalties: r.penalties } : {}),
  };
}
```

- [ ] **Step 4: Derivar titulares y estado del plegable dentro del componente**

Reemplazar la primera línea del componente:

```tsx
  const { isOpen, results, title, close } = useMatchResultsStore();
```

por:

```tsx
  const { isOpen, results, title, table, close } = useMatchResultsStore();
```

Y agregar, **después** del `useEffect` que ya existe y **antes** del `if (!isOpen) return null;`:

```tsx
  // Estado del plegable derivado de las props, sin efecto: el mismo patrón que
  // `TeamFlag.tsx:50-55`. Un `useEffect` con `setState` dispararía la regla
  // `react-hooks/set-state-in-effect`.
  const [prevResults, setPrevResults] = useState(results);
  const [showList, setShowList] = useState(results.length <= RESULTS_COLLAPSE_THRESHOLD);
  if (results !== prevResults) {
    setPrevResults(results);
    setShowList(results.length <= RESULTS_COLLAPSE_THRESHOLD);
  }

  const headlines = useMemo<HeadlineView[]>(() => {
    const matches = results
      .map(resultToHeadlineMatch)
      .filter((m): m is HeadlineMatch => m !== null);
    // Los partidos de una fecha son SIMULTÁNEOS: no hay más viejo ni más nuevo.
    const derived = deriveHeadlines(matches, { decayByAge: false });
    const nameById = new Map<string, string>();
    for (const r of results) {
      if (r.homeTeamId) nameById.set(r.homeTeamId, r.homeTeam);
      if (r.awayTeamId) nameById.set(r.awayTeamId, r.awayTeam);
    }
    return derived.map((h) => ({
      ...h,
      homeTeamName: nameById.get(h.match.homeTeamId) ?? h.match.homeTeamId,
      awayTeamName: nameById.get(h.match.awayTeamId) ?? h.match.awayTeamId,
    }));
  }, [results]);
```

- [ ] **Step 5: Rendir los tres bloques**

En el cuerpo scrollable (el `<div className="p-3 sm:p-6 overflow-y-auto …">`), envolver el contenido en `space-y-4` y anteponer los dos bloques nuevos y el plegable. La lista de resultados queda igual, sólo condicionada por `showList`:

```tsx
        <div className="p-3 sm:p-6 overflow-y-auto max-h-[calc(90vh-140px)] sm:max-h-[calc(85vh-80px)] space-y-4">
          <HeadlinesCard headlines={headlines} />

          {table && <TableMovesCard table={table} />}

          <button
            onClick={() => setShowList((open) => !open)}
            aria-expanded={showList}
            className="w-full flex items-center gap-2 font-arcade text-[10px] text-grass-soft uppercase hover:text-white transition-colors"
          >
            <span aria-hidden="true">{showList ? '▾' : '▸'}</span>
            Los {results.length} resultados
          </button>

          {showList && (
            <div className="space-y-2 sm:space-y-3">
              {/* …el map de orderedResults, sin cambios… */}
            </div>
          )}

          {/* …el pie de partidos/goles/promedio, sin cambios… */}
        </div>
```

El `<div className="space-y-2 sm:space-y-3">` que ya existe con el map de `orderedResults` es exactamente el que se envuelve en `{showList && ( … )}`. No se toca ni una línea de la tarjeta de resultado.

- [ ] **Step 6: Correr los tests del modal**

```bash
npx vitest run src/components/ui/__tests__/MatchResultsModal.test.tsx
```

Esperado: PASS — los 7 nuevos y los que ya estaban.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/MatchResultsModal.tsx src/components/ui/__tests__/MatchResultsModal.test.tsx
git commit -m "feat(resumen): el modal de resultados pasa a tres bloques"
```

---

### Task 6: los productores completan los datos, y el test del cable

**Files:**
- Modify: `src/components/tournament/jornadaResults.ts`
- Modify: `src/components/tournament/__tests__/jornadaResults.test.ts`
- Modify: `src/hooks/useCycleJornada.ts`
- Modify: `src/hooks/useModeJornada.ts`
- Create: `src/hooks/__tests__/useModeJornada.test.tsx`

**Interfaces:**
- Consumes: `deriveTableSummary(before, after, limit?)`, `TableSummaryView` de `src/core/tableMoves.ts` (Task 2); `showResults(results, title, table?)` y los campos nuevos de `MatchResult` (Task 3); `recalcLeagueStandings(state: LeagueState): TeamStanding[]` de `src/core/formats/league.ts`.
- Produces: `buildJornadaResults(jornada, outcomes, teams, favoriteTeamIds, skillBefore)` — quinto parámetro `skillBefore: ReadonlyMap<string, number>`.

**Por qué el mapa se captura explícitamente.** Al volver de `await simulateJornada(...)` el store ya aplicó los deltas de Elo. La variable `teams` cerrada por el callback todavía apunta al array viejo, así que leerla después "funciona" **por accidente**. Se captura antes de simular, explícito, como ya hace `useCycleJornada.simulateLive` con su `skillMap`.

**Sobre los dos caminos de cada hook.** Simular de una y ver en vivo arman sus `MatchResult` con la MISMA función (`toResults` en el modo de temporada, `results` en el ciclo), así que completar esa función cubre los dos.

- [ ] **Step 1: Escribir el test de `buildJornadaResults` que falla**

Agregar al final de `src/components/tournament/__tests__/jornadaResults.test.ts`, dentro del `describe` existente (los helpers `teams`, `match`, `ctx`, `jornada` ya están declarados arriba del archivo):

```ts
  it('estampa el skill previo de cada equipo', () => {
    const m = match('m1', 'arg', 'bra');
    const outcomes: MatchdayOutcome[] = [
      { matchId: 'm1', homeTeamId: 'arg', awayTeamId: 'bra', homeScore: 2, awayScore: 1 },
    ];
    const skillBefore = new Map([['arg', 88], ['bra', 84]]);

    const [res] = buildJornadaResults(jornada([ctx(m)]), outcomes, teams, new Set(), skillBefore);

    // El pool de equipos ya trae los skills NUEVOS (90 y 85): lo que se estampa
    // es el mapa capturado antes de simular.
    expect(res.homeSkillBefore).toBe(88);
    expect(res.awaySkillBefore).toBe(84);
  });

  it('un equipo que no está en el mapa queda sin skill previo', () => {
    const m = match('m1', 'arg', 'bra');
    const outcomes: MatchdayOutcome[] = [
      { matchId: 'm1', homeTeamId: 'arg', awayTeamId: 'bra', homeScore: 2, awayScore: 1 },
    ];

    const [res] = buildJornadaResults(jornada([ctx(m)]), outcomes, teams, new Set(), new Map());

    expect(res.homeSkillBefore).toBeUndefined();
  });

  it('marca el alargue del partido que lo tuvo', () => {
    const m = match('m1', 'arg', 'bra');
    const outcomes: MatchdayOutcome[] = [
      {
        matchId: 'm1',
        homeTeamId: 'arg',
        awayTeamId: 'bra',
        homeScore: 2,
        awayScore: 1,
        extraTime: { homeGoals: 1, awayGoals: 0 },
      },
    ];

    const [res] = buildJornadaResults(jornada([ctx(m)]), outcomes, teams, new Set(), new Map());

    expect(res.wentToExtraTime).toBe(true);
  });
```

Hay que actualizar las llamadas a `buildJornadaResults` que ya existen en ese archivo agregándoles un quinto argumento `new Map()`.

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
npx vitest run src/components/tournament/__tests__/jornadaResults.test.ts
```

Esperado: FAIL — `buildJornadaResults` recibe 4 parámetros.

- [ ] **Step 3: Ampliar `buildJornadaResults`**

En `src/components/tournament/jornadaResults.ts`, agregar el quinto parámetro a la firma:

```ts
export function buildJornadaResults(
  jornada: JornadaGroup,
  outcomes: MatchdayOutcome[],
  teams: Team[],
  favoriteTeamIds: ReadonlySet<string>,
  /**
   * Skill de cada equipo ANTES de esta jornada. Se pasa capturado y no se lee
   * de `teams` porque, para cuando esta función corre, el store ya aplicó los
   * deltas: el skill de "antes" ya no existe en ningún lado.
   */
  skillBefore: ReadonlyMap<string, number>,
): MatchResult[] {
```

Y en el objeto que se hace `push`, después de `penalties`:

```ts
      homeSkillBefore: skillBefore.get(homeTeam.id),
      awaySkillBefore: skillBefore.get(awayTeam.id),
      // Sólo se sabe del partido recién simulado: un partido ya jugado no
      // guarda si fue al alargue.
      wentToExtraTime: outcome ? outcome.extraTime !== undefined : undefined,
```

- [ ] **Step 4: Correr el test y verificar que pasa**

```bash
npx vitest run src/components/tournament/__tests__/jornadaResults.test.ts
```

Esperado: PASS.

- [ ] **Step 5: Capturar los skills previos en `useCycleJornada`**

En `src/hooks/useCycleJornada.ts`, cambiar el callback `results` para que reciba el mapa:

```ts
  const results = useCallback(
    (
      jornada: JornadaGroup,
      outcomes: MatchdayOutcome[],
      skillBefore: ReadonlyMap<string, number>,
    ): MatchResult[] =>
      buildJornadaResults(jornada, outcomes, teams, new Set(favoriteTeamIds), skillBefore),
    [teams, favoriteTeamIds],
  );
```

En `simulate`, capturar el mapa **antes** del `await` y pasarlo:

```ts
      // Skills PRE-simulación: al volver del await el store ya aplicó los deltas.
      const skillBefore = new Map(teams.map((t) => [t.id, t.skill]));
      const outcomes = await run(toSimulate);
      showResults(results(jornada, outcomes, skillBefore), `${title} — Resultados`);
```

y agregar `teams` a su array de dependencias.

En `simulateLive` ya existe `const skillMap = new Map(teams.map((t) => [t.id, t.skill]));` antes del `await`: reusarlo en las **dos** llamadas a `results(jornada, outcomes)` de esa función, que pasan a ser `results(jornada, outcomes, skillMap)`.

- [ ] **Step 6: Escribir el test de cableado que falla**

Crear `src/hooks/__tests__/useModeJornada.test.tsx`:

```tsx
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useModeJornada } from '../useModeJornada';
import { useSeasonModeStore } from '../../store/useSeasonModeStore';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useMatchResultsStore } from '../../store/useMatchResultsStore';
import { useFavoritesStore } from '../../store/useFavoritesStore';
import type { LigaTournament } from '../../core/formats/modeTournament';
import type { Match, Team } from '../../types';

const teams: Team[] = [
  { id: 'A', name: 'Ben Hur', flag: '', skill: 70 },
  { id: 'B', name: 'Alumni', flag: '', skill: 70 },
  { id: 'C', name: 'Talleres', flag: '', skill: 70 },
  { id: 'D', name: 'Colon', flag: '', skill: 70 },
];

const partido = (id: string, home: string, away: string, played: boolean, hs = 0, as = 0): Match => ({
  id,
  homeTeamId: home,
  awayTeamId: away,
  homeScore: played ? hs : null,
  awayScore: played ? as : null,
  isPlayed: played,
  matchday: played ? 1 : 2,
});

/** Liga con la fecha 1 jugada (B puntero) y la fecha 2 pendiente. */
const liga = (matches: Match[]): LigaTournament => ({
  id: 't1',
  modeId: 'villamariense',
  competitionId: 'liga-a',
  year: 2028,
  name: 'Liga A 2028',
  status: 'in-progress',
  division: 'A',
  format: 'liga',
  state: {
    teamIds: ['A', 'B', 'C', 'D'],
    legs: 1,
    matches,
    standings: [],
  },
});

const fecha1 = [partido('m1', 'B', 'A', true, 3, 0), partido('m2', 'C', 'D', true, 1, 1)];
const fecha2 = [partido('m3', 'A', 'C', false), partido('m4', 'B', 'D', false)];

beforeEach(() => {
  useTournamentStore.setState({ teams });
  useFavoritesStore.setState({ favoriteTeamIds: [] });
  useMatchResultsStore.setState({ isOpen: false, results: [], title: '', table: null });
});

/**
 * EL TEST DEL CABLE. La derivación de la tabla y la tarjeta que la dibuja tienen
 * sus propios tests; éste es el único que se rompe si el hook deja de pasarle el
 * resumen al store. En las dos etapas anteriores de este proyecto un bug así
 * pasó con la suite entera en verde.
 */
describe('useModeJornada — el resumen llega al store', () => {
  it('una fecha de liga entrega los movimientos de la tabla', async () => {
    const run = liga([...fecha1, ...fecha2]);
    // Después de simular, la fecha 2 queda jugada: A le gana a C y pasa arriba.
    const jugada = liga([
      ...fecha1,
      partido('m3', 'A', 'C', true, 3, 0),
      partido('m4', 'B', 'D', true, 0, 2),
    ]);
    useSeasonModeStore.setState({
      busy: false,
      tournaments: [jugada],
      simulateJornada: vi.fn(async () => [
        { matchId: 'm3', homeTeamId: 'A', awayTeamId: 'C', homeScore: 3, awayScore: 0 },
        { matchId: 'm4', homeTeamId: 'B', awayTeamId: 'D', homeScore: 0, awayScore: 2 },
      ]),
    });

    const { result } = renderHook(() => useModeJornada(run, 'Liga A'));
    await act(async () => {
      await result.current.simulate();
    });

    const table = useMatchResultsStore.getState().table;
    expect(table).not.toBeNull();
    expect(table?.leaderTeamName).toBe('Ben Hur');
    expect(table?.moves.length).toBeGreaterThan(0);
  });

  /**
   * El torneo que el hook tiene en la clausura es el de ANTES de simular; la
   * tabla de después se relee del store. Si ahí no está, no se inventa nada.
   */
  it('si el torneo no está en el store, no entrega tabla', async () => {
    const run = liga([...fecha1, ...fecha2]);
    useSeasonModeStore.setState({
      busy: false,
      tournaments: [],
      simulateJornada: vi.fn(async () => [
        { matchId: 'm3', homeTeamId: 'A', awayTeamId: 'C', homeScore: 3, awayScore: 0 },
      ]),
    });

    const { result } = renderHook(() => useModeJornada(run, 'Liga A'));
    await act(async () => {
      await result.current.simulate();
    });

    expect(useMatchResultsStore.getState().table).toBeNull();
    // Pero los resultados sí llegan: la tabla es un extra, no un requisito.
    expect(useMatchResultsStore.getState().results).toHaveLength(1);
  });

  it('los resultados llevan el skill previo de cada equipo', async () => {
    const run = liga([...fecha1, ...fecha2]);
    useSeasonModeStore.setState({
      busy: false,
      tournaments: [run],
      simulateJornada: vi.fn(async () => {
        // El store aplica los deltas antes de que el hook arme los resultados.
        useTournamentStore.setState({ teams: teams.map((t) => ({ ...t, skill: 99 })) });
        return [{ matchId: 'm3', homeTeamId: 'A', awayTeamId: 'C', homeScore: 3, awayScore: 0 }];
      }),
    });

    const { result } = renderHook(() => useModeJornada(run, 'Liga A'));
    await act(async () => {
      await result.current.simulate();
    });

    expect(useMatchResultsStore.getState().results[0].homeSkillBefore).toBe(70);
  });
});
```

- [ ] **Step 7: Correr el test y verificar que falla**

```bash
npx vitest run src/hooks/__tests__/useModeJornada.test.tsx
```

Esperado: FAIL — `table` sigue en `null` y `homeSkillBefore` viene `undefined`.

- [ ] **Step 8: Completar `useModeJornada`**

En `src/hooks/useModeJornada.ts`, sumar `TeamStanding` al import de `../types` que ya existe (hoy dice `import type { MatchdayOutcome, Team } from '../types';`) y agregar dos imports nuevos:

```ts
import type { MatchdayOutcome, Team, TeamStanding } from '../types';
import { recalcLeagueStandings } from '../core/formats/league';
import { deriveTableSummary, type TableSummaryView } from '../core/tableMoves';
```

`ModeTournament` ya está importado en ese archivo desde `../core/formats/modeTournament`.

Cambiar `toResults` para que reciba el mapa de skills:

```ts
  const toResults = useCallback(
    (
      outcomes: MatchdayOutcome[],
      skillBefore: ReadonlyMap<string, number>,
    ): MatchResult[] => {
      const favorites = new Set(favoriteTeamIds);
      return outcomes.map((o) => ({
        homeTeam: teamName(o.homeTeamId),
        awayTeam: teamName(o.awayTeamId),
        homeTeamId: o.homeTeamId,
        awayTeamId: o.awayTeamId,
        homeScore: o.homeScore,
        awayScore: o.awayScore,
        groupName: title,
        isFavorite: favorites.has(o.homeTeamId) || favorites.has(o.awayTeamId),
        homeSkillBefore: skillBefore.get(o.homeTeamId),
        awaySkillBefore: skillBefore.get(o.awayTeamId),
        wentToExtraTime: o.extraTime !== undefined,
        ...(o.penalties ? { penalties: o.penalties } : {}),
      }));
    },
    [favoriteTeamIds, teamName, title],
  );
```

Agregar dos helpers, después de `toResults`:

```ts
  /** La tabla de una liga; vacía para cualquier otro formato. */
  const standingsOf = useCallback(
    (t: ModeTournament | null | undefined): TeamStanding[] =>
      t && t.format === 'liga' ? recalcLeagueStandings(t.state) : [],
    [],
  );

  /**
   * El resumen de la tabla, con los nombres ya resueltos. Sólo para ligas: una
   * copa no tiene tabla, y una fase de grupos tiene muchas.
   *
   * Relee el torneo del store en vez de usar el `run` de la clausura: la
   * simulación lo reemplazó por una versión nueva.
   */
  const buildTable = useCallback(
    (before: TeamStanding[]): TableSummaryView | undefined => {
      if (!run || run.format !== 'liga') return undefined;
      const updated = useSeasonModeStore.getState().tournaments.find((t) => t.id === run.id);
      const summary = deriveTableSummary(before, standingsOf(updated));
      if (!summary) return undefined;
      return {
        ...summary,
        leaderTeamName: teamName(summary.leaderTeamId),
        moves: summary.moves.map((m) => ({ ...m, teamName: teamName(m.teamId) })),
      };
    },
    [run, standingsOf, teamName],
  );
```

Reemplazar el cuerpo de `simulate` por:

```ts
  const simulate = useCallback(async () => {
    if (!run || !jornada) {
      toast.info('No hay partidos pendientes para simular');
      return;
    }
    // Se capturan ANTES de simular: después, el store ya aplicó los deltas de
    // Elo y ya escribió los partidos en la tabla.
    const skillBefore = new Map(teams.map((t: Team) => [t.id, t.skill]));
    const standingsBefore = standingsOf(run);

    const outcomes = await useSeasonModeStore.getState().simulateJornada(run.id);
    if (outcomes.length === 0) {
      toast.info('No se pudo simular la jornada');
      return;
    }
    showResults(
      toResults(outcomes, skillBefore),
      `${title} — Resultados`,
      buildTable(standingsBefore),
    );
    toast.success(`${jornada.label} completada — ${outcomes.length} partidos simulados`);
  }, [run, jornada, teams, standingsOf, showResults, toResults, buildTable, title]);
```

En `simulateLive`, capturar lo mismo antes del `await` y pasar la tabla a la sesión. El `skillMap` que ese callback ya construye sirve tal cual:

```ts
    const skillMap = new Map(teams.map((t: Team) => [t.id, t.skill]));
    const standingsBefore = standingsOf(run);
    const outcomes = await useSeasonModeStore.getState().simulateJornada(run.id);
```

y en la llamada a `openLiveSession`:

```ts
    openLiveSession({
      title,
      entries,
      allResults: toResults(outcomes, skillMap),
      hiddenCount: outcomes.length - entries.length,
      table: buildTable(standingsBefore),
    });
```

Agregar `standingsOf` y `buildTable` al array de dependencias de `simulateLive`.

**Ojo con el orden:** en `simulateLive` el `skillMap` hoy se construye **después** del `await`. Hay que moverlo antes, junto a `standingsBefore`, y usarlo también para `selectLiveMatches`, que ya lo necesitaba pre-simulación.

- [ ] **Step 9: Correr los tests y verificar que pasan**

```bash
npx vitest run src/hooks/__tests__/useModeJornada.test.tsx src/components/tournament/__tests__/jornadaResults.test.ts
```

Esperado: PASS.

- [ ] **Step 10: Verificar el cable de verdad**

Cambiar en `src/hooks/useModeJornada.ts` la llamada a `showResults` para que NO pase el tercer argumento, correr el test de cableado y confirmar que falla; después volver a ponerlo y confirmar que pasa. Dejar constancia del antes/después.

```bash
npx vitest run src/hooks/__tests__/useModeJornada.test.tsx -t "movimientos de la tabla"
```

- [ ] **Step 11: Correr la suite completa, tipos y build**

```bash
set -o pipefail; npm test 2>&1 | grep -E "Test Files|Tests |FAIL"
npx tsc -b && npm run build
```

Esperado: 0 failed. El total sube 32 tests sobre los 953 de la etapa 2 (≈985): 4 de titulares, 10 de la tabla, 1 del overlay, 4 de la tarjeta, 7 del modal, 3 de `jornadaResults` y 3 del cable.

- [ ] **Step 12: Commit**

```bash
git add src/components/tournament/jornadaResults.ts src/components/tournament/__tests__/jornadaResults.test.ts src/hooks/useCycleJornada.ts src/hooks/useModeJornada.ts src/hooks/__tests__/useModeJornada.test.tsx
git commit -m "feat(resumen): los productores completan skills previos y tabla"
```
