# Visibilidad Continental/Confed + Penales realistas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los partidos de Copa Continental y Confederaciones aparezcan en Comparación de Equipos (H2H) y en el Centro de Partidos, y que las tandas de penales produzcan marcadores realistas.

**Architecture:** Tres frentes. (1) Penales: reescribir `simulatePenalties` con muerte matemática y RNG inyectable para test determinístico. (2) Persistencia: normalizar los partidos continental/confed a `match_history` (migración DB + persistencia hacia adelante desde el store + backfill idempotente de lo ya jugado), de modo que el H2H los tome de su fuente existente. (3) Match Center: extraer el colector de partidos a un módulo puro testeable que también recorre el ciclo continental/confed, y ampliar el filtro de etapa.

**Tech Stack:** React + TypeScript, Zustand, Supabase (Postgres), Vitest.

## Global Constraints

- Idempotencia de persistencia continental/confed anclada en `metadata.cycleMatchId` (el `id` del partido dentro del ciclo). Verbatim en backfill y persistencia hacia adelante.
- Valores de `stage` para los nuevos partidos: `'continental'`, `'confed-group'`, `'confed-knockout'` (ya usados en `Match.stage`).
- El filtro de Match Center agrupa `confed-group` + `confed-knockout` bajo una única opción visual `'confederations'`.
- Persistencia a `match_history` siempre best-effort: no bloquear el estado local con `await` de red (patrón existente en el store).
- Sin Supabase configurado, toda I/O a `match_history` es no-op (el H2H usa el fallback en memoria).
- Correr `npx vitest run` tras cada tarea con test; `npx tsc -b` antes de cerrar el plan.

---

### Task 1: Penales con muerte matemática (`engine.ts`)

**Files:**
- Modify: `src/core/engine.ts:167-191` (`simulatePenalties`)
- Test: `src/core/__tests__/engine.penalties.test.ts` (crear)

**Interfaces:**
- Produces: `export function simulatePenalties(homeSkill: number, awaySkill: number, rng?: () => number): { homeScore: number; awayScore: number }`. Se exporta (antes era privada) para poder testearla. `rng` por defecto `Math.random`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/core/__tests__/engine.penalties.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { simulatePenalties } from '../engine';

// RNG determinístico: consume la secuencia en orden (cíclica).
const mkRng = (seq: number[]) => {
  let i = 0;
  return () => seq[i++ % seq.length];
};

describe('simulatePenalties — muerte matemática', () => {
  it('corta la tanda: local mete siempre, visitante falla siempre → 3-0 (no 5-0)', () => {
    // Llamadas alternadas: local(par), visitante(impar).
    // 0 => convierte (rng < rate); 0.999 => falla.
    const rng = mkRng([0, 0.999]);
    const res = simulatePenalties(90, 10, rng);
    expect(res).toEqual({ homeScore: 3, awayScore: 0 });
  });

  it('nunca produce marcadores imposibles (5-0/5-1/5-2) en 10.000 tandas', () => {
    for (let n = 0; n < 10_000; n++) {
      const { homeScore, awayScore } = simulatePenalties(80, 70);
      const max = Math.max(homeScore, awayScore);
      const min = Math.min(homeScore, awayScore);
      // Siempre hay ganador (no empate final).
      expect(homeScore).not.toBe(awayScore);
      // El caso reportado por el usuario: un lado en 5 y el otro <= 2 es imposible.
      expect(max === 5 && min <= 2).toBe(false);
      // En muerte súbita (max > 5) la diferencia es exactamente 1.
      if (max > 5) expect(max - min).toBe(1);
    }
  });

  it('empate en fase regular → muerte súbita que resuelve por diferencia de 1', () => {
    // 10 llamadas convirtiendo (5-5), luego local mete y visitante falla.
    const rng = mkRng([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.999]);
    const res = simulatePenalties(50, 50, rng);
    expect(res).toEqual({ homeScore: 6, awayScore: 5 });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/core/__tests__/engine.penalties.test.ts`
Expected: FAIL — `simulatePenalties` no está exportada (o el marcador 3-0 no se cumple con la implementación vieja).

- [ ] **Step 3: Reescribir `simulatePenalties`**

En `src/core/engine.ts`, reemplazar las líneas 164-191 (el bloque `/** Simulates penalty shootout */ function simulatePenalties(...) { ... }`) por:

```ts
/**
 * Simula una tanda de penales realista: tiros alternados con "muerte
 * matemática" (la tanda termina en cuanto un equipo ya no puede ser
 * alcanzado con los tiros que le quedan al rival) y muerte súbita si
 * la fase regular termina empatada. `rng` inyectable para tests.
 */
export function simulatePenalties(
  homeSkill: number,
  awaySkill: number,
  rng: () => number = Math.random,
): { homeScore: number; awayScore: number } {
  // Tasa de conversión según skill (75-90%).
  const homeConversionRate = 0.75 + (homeSkill / 100) * 0.15;
  const awayConversionRate = 0.75 + (awaySkill / 100) * 0.15;

  let homeScore = 0;
  let awayScore = 0;
  let homeRemaining = 5;
  let awayRemaining = 5;

  const decided = () =>
    homeScore > awayScore + awayRemaining || awayScore > homeScore + homeRemaining;

  // Fase regular: hasta 5 por lado, alternando; corta al quedar decidida.
  while (homeRemaining > 0 || awayRemaining > 0) {
    if (homeRemaining > 0) {
      if (rng() < homeConversionRate) homeScore++;
      homeRemaining--;
      if (decided()) break;
    }
    if (awayRemaining > 0) {
      if (rng() < awayConversionRate) awayScore++;
      awayRemaining--;
      if (decided()) break;
    }
  }

  // Muerte súbita: de a pares hasta que un par rompa el empate.
  while (homeScore === awayScore) {
    const homeGoal = rng() < homeConversionRate;
    const awayGoal = rng() < awayConversionRate;
    if (homeGoal) homeScore++;
    if (awayGoal) awayScore++;
  }

  return { homeScore, awayScore };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/core/__tests__/engine.penalties.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verificar que no rompió otros tests**

Run: `npx vitest run`
Expected: toda la suite en verde.

- [ ] **Step 6: Commit**

```bash
git add src/core/engine.ts src/core/__tests__/engine.penalties.test.ts
git commit -m "fix(engine): penales con muerte matematica (evita marcadores imposibles 5-0/5-2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U45g7vtYzFMd25RUxY7uKQ"
```

---

### Task 2: Migración DB + ampliar tipos de `stage`

**Files:**
- Create: `supabase/migrations/010_continental_confed_match_history.sql`
- Modify: `supabase/schema.sql:28`
- Modify: `src/types/database.ts:48,67,86`
- Modify: `src/services/matchHistoryService.ts:13,32`

**Interfaces:**
- Produces: el tipo `stage` en `MatchHistoryEntry`, `CreateMatchHistoryParams` (matchHistoryService) y en `Database['public']['Tables']['match_history']` (database.ts) pasa a ser `'qualifier' | 'world-cup-group' | 'world-cup-knockout' | 'continental' | 'confed-group' | 'confed-knockout'`.

- [ ] **Step 1: Crear la migración SQL**

Crear `supabase/migrations/010_continental_confed_match_history.sql`:

```sql
-- 010: admitir partidos de Copa Continental y Confederaciones en match_history.
-- El detalle por-partido queryable de estas fases faltaba: solo se guardaba el
-- snapshot JSONB del ciclo, invisibilizando esos partidos en H2H y Match Center.
ALTER TABLE match_history DROP CONSTRAINT IF EXISTS match_history_stage_check;
ALTER TABLE match_history ADD CONSTRAINT match_history_stage_check
  CHECK (stage IN (
    'qualifier',
    'world-cup-group',
    'world-cup-knockout',
    'continental',
    'confed-group',
    'confed-knockout'
  ));
```

- [ ] **Step 2: Actualizar `supabase/schema.sql`**

En `supabase/schema.sql:28`, reemplazar:

```sql
  stage TEXT NOT NULL CHECK (stage IN ('qualifier', 'world-cup-group', 'world-cup-knockout')),
```

por:

```sql
  stage TEXT NOT NULL CHECK (stage IN ('qualifier', 'world-cup-group', 'world-cup-knockout', 'continental', 'confed-group', 'confed-knockout')),
```

- [ ] **Step 3: Ampliar tipos en `database.ts`**

En `src/types/database.ts`, en las tres apariciones (líneas 48 `Row`, 67 `Insert`, 86 `Update`) reemplazar:

```ts
          stage: 'qualifier' | 'world-cup-group' | 'world-cup-knockout'
```
(y la variante `stage?:` en `Update`) por la unión ampliada:

```ts
          stage: 'qualifier' | 'world-cup-group' | 'world-cup-knockout' | 'continental' | 'confed-group' | 'confed-knockout'
```
En `Update` mantener el `?`: `stage?: 'qualifier' | ... | 'confed-knockout'`.

- [ ] **Step 4: Ampliar tipos en `matchHistoryService.ts`**

En `src/services/matchHistoryService.ts`, líneas 13 (`MatchHistoryEntry.stage`) y 32 (`CreateMatchHistoryParams.stage`), reemplazar:

```ts
  stage: 'qualifier' | 'world-cup-group' | 'world-cup-knockout';
```
por:
```ts
  stage: 'qualifier' | 'world-cup-group' | 'world-cup-knockout' | 'continental' | 'confed-group' | 'confed-knockout';
```

- [ ] **Step 5: Verificar compilación de tipos**

Run: `npx tsc -b`
Expected: 0 errores.

- [ ] **Step 6: Aplicar la migración a Supabase**

Aplicar vía el MCP de Supabase (`apply_migration`) con name `010_continental_confed_match_history` y el contenido del `.sql` del Step 1. Es un `CHECK` aditivo (no toca filas existentes). **Requiere aprobación del usuario por ser una acción sobre la DB remota.** Confirmar luego con `list_migrations` que aparece la 010.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/010_continental_confed_match_history.sql supabase/schema.sql src/types/database.ts src/services/matchHistoryService.ts
git commit -m "feat(db): match_history admite stages continental/confed (migracion 010 + tipos)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U45g7vtYzFMd25RUxY7uKQ"
```

---

### Task 3: Colector de Match Center (extraer módulo puro + incluir continental/confed)

**Files:**
- Create: `src/components/tournament/matchCenterCollector.ts`
- Test: `src/components/tournament/__tests__/matchCenterCollector.test.ts` (crear)
- Modify: `src/components/tournament/MatchCenter.tsx:1-99` (imports + tipos + `allMatches`), `:452-461` (dropdown)

**Interfaces:**
- Produces: `export type MatchStage = 'qualifier' | 'world-cup' | 'knockout' | 'continental' | 'confederations'`; `export type MatchWithContext = { match: Match; stage: MatchStage; groupId: string; groupName: string; region?: Region }`; `export function collectAllMatches(tournament: Cycle): MatchWithContext[]`.
- Consumes: tipos `Cycle`, `Match`, `Region` de `../../types`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/components/tournament/__tests__/matchCenterCollector.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { collectAllMatches } from '../matchCenterCollector';
import type { Cycle } from '../../../types';

// Cycle mínimo: solo lo que el colector recorre. `as unknown as Cycle`
// para no construir el objeto entero.
function makeCycle(): Cycle {
  const played = (id: string) => ({
    id, homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 0,
    isPlayed: true, round: 'final' as const,
  });
  return {
    qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
    worldCup: null,
    continental: {
      isComplete: true,
      brackets: {
        Europe: {
          region: 'Europe', roundOf64: [], roundOf32: [], roundOf16: [],
          quarterFinals: [], semiFinals: [], final: played('cont-final'),
          thirdPlace: null, byeTeamIds: [],
        },
        America: { region: 'America', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: null, thirdPlace: null, byeTeamIds: [] },
        Africa: { region: 'Africa', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: null, thirdPlace: null, byeTeamIds: [] },
        Asia: { region: 'Asia', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: null, thirdPlace: null, byeTeamIds: [] },
      },
    },
    confederationsCup: {
      isComplete: true,
      groups: [{ id: 'cg1', name: 'Grupo A', teamIds: [], matches: [played('confg-1')], standings: [] }],
      knockout: { semiFinals: [], thirdPlace: null, final: played('confko-final') },
    },
  } as unknown as Cycle;
}

describe('collectAllMatches — continental/confed', () => {
  it('incluye el partido continental con stage y región', () => {
    const res = collectAllMatches(makeCycle());
    const cont = res.find((m) => m.match.id === 'cont-final');
    expect(cont).toBeDefined();
    expect(cont!.stage).toBe('continental');
    expect(cont!.region).toBe('Europe');
  });

  it('incluye grupos y knockout de confederaciones bajo stage "confederations"', () => {
    const res = collectAllMatches(makeCycle());
    const grp = res.find((m) => m.match.id === 'confg-1');
    const ko = res.find((m) => m.match.id === 'confko-final');
    expect(grp?.stage).toBe('confederations');
    expect(ko?.stage).toBe('confederations');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/components/tournament/__tests__/matchCenterCollector.test.ts`
Expected: FAIL — `matchCenterCollector` no existe.

- [ ] **Step 3: Crear el módulo colector**

Crear `src/components/tournament/matchCenterCollector.ts`:

```ts
import type { Cycle, Match, Region } from '../../types';

export type MatchStage =
  | 'qualifier'
  | 'world-cup'
  | 'knockout'
  | 'continental'
  | 'confederations';

export type MatchWithContext = {
  match: Match;
  stage: MatchStage;
  groupId: string;
  groupName: string;
  region?: Region;
};

/** Recorre todas las fases del ciclo y devuelve los partidos con su contexto. */
export function collectAllMatches(tournament: Cycle): MatchWithContext[] {
  const matches: MatchWithContext[] = [];

  // Clasificatorias
  Object.entries(tournament.qualifiers).forEach(([region, groups]) => {
    groups.forEach((group) => {
      group.matches.forEach((match) => {
        matches.push({ match, stage: 'qualifier', groupId: group.id, groupName: group.name, region: region as Region });
      });
    });
  });

  // Mundial: grupos + knockout
  if (tournament.worldCup) {
    tournament.worldCup.groups.forEach((group) => {
      group.matches.forEach((match) => {
        matches.push({ match, stage: 'world-cup', groupId: group.id, groupName: group.name });
      });
    });
    const knockoutMatches = [
      ...tournament.worldCup.knockout.roundOf32,
      ...tournament.worldCup.knockout.roundOf16,
      ...tournament.worldCup.knockout.quarterFinals,
      ...tournament.worldCup.knockout.semiFinals,
      ...(tournament.worldCup.knockout.thirdPlace ? [tournament.worldCup.knockout.thirdPlace] : []),
      ...(tournament.worldCup.knockout.final ? [tournament.worldCup.knockout.final] : []),
    ];
    knockoutMatches.forEach((match) => {
      matches.push({ match, stage: 'knockout', groupId: 'knockout', groupName: match.round || 'Knockout' });
    });
  }

  // Continental: un bracket por región
  if (tournament.continental?.brackets) {
    (Object.keys(tournament.continental.brackets) as Region[]).forEach((region) => {
      const b = tournament.continental.brackets[region];
      const bracketMatches = [
        ...b.roundOf64, ...b.roundOf32, ...b.roundOf16,
        ...b.quarterFinals, ...b.semiFinals,
        ...(b.final ? [b.final] : []),
        ...(b.thirdPlace ? [b.thirdPlace] : []),
      ];
      bracketMatches.forEach((match) => {
        matches.push({ match, stage: 'continental', groupId: `continental-${region}`, groupName: match.round || 'Continental', region });
      });
    });
  }

  // Confederaciones: grupos + knockout (todo bajo el filtro visual "confederations")
  if (tournament.confederationsCup) {
    tournament.confederationsCup.groups.forEach((group) => {
      group.matches.forEach((match) => {
        matches.push({ match, stage: 'confederations', groupId: group.id, groupName: group.name });
      });
    });
    const ko = tournament.confederationsCup.knockout;
    const koMatches = [
      ...ko.semiFinals,
      ...(ko.final ? [ko.final] : []),
      ...(ko.thirdPlace ? [ko.thirdPlace] : []),
    ];
    koMatches.forEach((match) => {
      matches.push({ match, stage: 'confederations', groupId: 'confed-knockout', groupName: match.round || 'Confederaciones' });
    });
  }

  return matches;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/components/tournament/__tests__/matchCenterCollector.test.ts`
Expected: PASS.

- [ ] **Step 5: Integrar el colector en `MatchCenter.tsx`**

En `src/components/tournament/MatchCenter.tsx`:

1. En los imports (arriba), agregar:
```ts
import { collectAllMatches, type MatchStage, type MatchWithContext } from './matchCenterCollector';
```
2. Borrar las definiciones locales de `type MatchStage = ...` (`:23`) y `type MatchWithContext = { ... }` (`:24-30`).
3. Reemplazar todo el `useMemo` de `allMatches` (`:46-99`) por:
```ts
  // Collect all matches from all sources (qualifiers, world cup, continental, confed)
  const allMatches = useMemo(() => collectAllMatches(tournament), [tournament]);
```
4. En el dropdown de etapa (`:457-460`), agregar dos opciones tras `knockout`:
```tsx
                <option value="continental">Continental</option>
                <option value="confederations">Confederaciones</option>
```

- [ ] **Step 6: Verificar tipos y suite**

Run: `npx tsc -b && npx vitest run`
Expected: 0 errores de tipos; suite en verde.

- [ ] **Step 7: Commit**

```bash
git add src/components/tournament/matchCenterCollector.ts src/components/tournament/__tests__/matchCenterCollector.test.ts src/components/tournament/MatchCenter.tsx
git commit -m "feat(match-center): incluye partidos continental/confed en el colector y filtros

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U45g7vtYzFMd25RUxY7uKQ"
```

---

### Task 4: Módulo `cycleMatchHistory` — mapeo puro de partidos del ciclo a `match_history`

**Files:**
- Create: `src/services/cycleMatchHistory.ts`
- Test: `src/services/__tests__/cycleMatchHistory.test.ts` (crear)

**Interfaces:**
- Produces:
  - `export interface CycleMatchInput { homeTeamId; awayTeamId; homeScore; awayScore; stage: 'continental'|'confed-group'|'confed-knockout'; region?: Region; groupName?: string; cycleMatchId: string; tournamentId: string; homeSkillBefore; awaySkillBefore; homeSkillAfter; awaySkillAfter }` (todos los numéricos `number`).
  - `export function buildMatchParams(input: CycleMatchInput): CreateMatchHistoryParams`
  - `export function collectPlayedCycleMatches(cycle: Cycle, teams: Team[]): CreateMatchHistoryParams[]`
- Consumes: `CreateMatchHistoryParams` de `./matchHistoryService`; tipos `Cycle`, `Team`, `Region` de `../types`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/services/__tests__/cycleMatchHistory.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildMatchParams, collectPlayedCycleMatches } from '../cycleMatchHistory';
import type { Cycle, Team } from '../../types';

describe('buildMatchParams', () => {
  it('mapea a CreateMatchHistoryParams con cycleMatchId en metadata y change derivado', () => {
    const p = buildMatchParams({
      homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 1,
      stage: 'continental', region: 'Europe', groupName: 'final',
      cycleMatchId: 'm1', tournamentId: 't1',
      homeSkillBefore: 80, awaySkillBefore: 70, homeSkillAfter: 81, awaySkillAfter: 69,
    });
    expect(p.stage).toBe('continental');
    expect(p.homeSkillChange).toBe(1);
    expect(p.awaySkillChange).toBe(-1);
    expect((p.metadata as { cycleMatchId?: string }).cycleMatchId).toBe('m1');
    expect(p.tournamentId).toBe('t1');
  });
});

describe('collectPlayedCycleMatches', () => {
  const teams: Team[] = [
    { id: 'A', name: 'A', flag: '', region: 'Europe', skill: 80 },
    { id: 'B', name: 'B', flag: '', region: 'Europe', skill: 70 },
  ];
  const played = (id: string) => ({ id, homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 0, isPlayed: true, round: 'final' as const });
  const unplayed = (id: string) => ({ id, homeTeamId: 'A', awayTeamId: 'B', homeScore: null, awayScore: null, isPlayed: false, round: 'semi' as const });

  const cycle = {
    id: 'cycle-1',
    continental: {
      isComplete: true,
      brackets: {
        Europe: { region: 'Europe', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [unplayed('c-semi')], final: played('c-final'), thirdPlace: null, byeTeamIds: [] },
        America: { region: 'America', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: null, thirdPlace: null, byeTeamIds: [] },
        Africa: { region: 'Africa', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: null, thirdPlace: null, byeTeamIds: [] },
        Asia: { region: 'Asia', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: null, thirdPlace: null, byeTeamIds: [] },
      },
    },
    confederationsCup: {
      isComplete: false,
      groups: [{ id: 'g', name: 'Grupo A', teamIds: [], matches: [played('cf-g1')], standings: [] }],
      knockout: { semiFinals: [], thirdPlace: null, final: null },
    },
  } as unknown as Cycle;

  it('reúne solo los partidos jugados, con el stage correcto', () => {
    const res = collectPlayedCycleMatches(cycle, teams);
    const ids = res.map((p) => (p.metadata as { cycleMatchId?: string }).cycleMatchId).sort();
    expect(ids).toEqual(['c-final', 'cf-g1']);
    expect(res.find((p) => (p.metadata as any).cycleMatchId === 'c-final')!.stage).toBe('continental');
    expect(res.find((p) => (p.metadata as any).cycleMatchId === 'cf-g1')!.stage).toBe('confed-group');
    expect(res.every((p) => p.tournamentId === 'cycle-1')).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/services/__tests__/cycleMatchHistory.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Crear el módulo**

Crear `src/services/cycleMatchHistory.ts`:

```ts
import type { Cycle, Team, Region } from '../types';
import type { CreateMatchHistoryParams } from './matchHistoryService';

export interface CycleMatchInput {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  stage: 'continental' | 'confed-group' | 'confed-knockout';
  region?: Region;
  groupName?: string;
  cycleMatchId: string;
  tournamentId: string;
  homeSkillBefore: number;
  awaySkillBefore: number;
  homeSkillAfter: number;
  awaySkillAfter: number;
}

/** Construye los params normalizados de match_history para un partido del ciclo. */
export function buildMatchParams(input: CycleMatchInput): CreateMatchHistoryParams {
  return {
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    homeScore: input.homeScore,
    awayScore: input.awayScore,
    stage: input.stage,
    region: input.region,
    groupName: input.groupName,
    tournamentId: input.tournamentId,
    homeSkillBefore: input.homeSkillBefore,
    awaySkillBefore: input.awaySkillBefore,
    homeSkillAfter: input.homeSkillAfter,
    awaySkillAfter: input.awaySkillAfter,
    homeSkillChange: input.homeSkillAfter - input.homeSkillBefore,
    awaySkillChange: input.awaySkillAfter - input.awaySkillBefore,
    metadata: { cycleMatchId: input.cycleMatchId },
  };
}

/**
 * Reúne todos los partidos continental/confed JUGADOS del ciclo como params.
 * Uso: backfill de lo ya jugado. Los skills before/after no se guardaron
 * históricamente, así que se rellenan con el skill actual del equipo (change 0);
 * el H2H usa solo el resultado (goles/stage), no estos campos.
 */
export function collectPlayedCycleMatches(cycle: Cycle, teams: Team[]): CreateMatchHistoryParams[] {
  const skillOf = (id: string) => teams.find((t) => t.id === id)?.skill ?? 0;
  const params: CreateMatchHistoryParams[] = [];

  const pushPlayed = (
    m: { id: string; homeTeamId: string; awayTeamId: string; homeScore: number | null; awayScore: number | null; isPlayed: boolean },
    stage: CycleMatchInput['stage'],
    groupName: string | undefined,
    region?: Region,
  ) => {
    if (!m.isPlayed || m.homeScore == null || m.awayScore == null) return;
    params.push(buildMatchParams({
      homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
      homeScore: m.homeScore, awayScore: m.awayScore,
      stage, region, groupName, cycleMatchId: m.id, tournamentId: cycle.id,
      homeSkillBefore: skillOf(m.homeTeamId), awaySkillBefore: skillOf(m.awayTeamId),
      homeSkillAfter: skillOf(m.homeTeamId), awaySkillAfter: skillOf(m.awayTeamId),
    }));
  };

  // Continental
  if (cycle.continental?.brackets) {
    (Object.keys(cycle.continental.brackets) as Region[]).forEach((region) => {
      const b = cycle.continental.brackets[region];
      [
        ...b.roundOf64, ...b.roundOf32, ...b.roundOf16,
        ...b.quarterFinals, ...b.semiFinals,
        ...(b.final ? [b.final] : []),
        ...(b.thirdPlace ? [b.thirdPlace] : []),
      ].forEach((m) => pushPlayed(m, 'continental', m.round, region));
    });
  }

  // Confederaciones — grupos
  cycle.confederationsCup?.groups.forEach((g) => {
    g.matches.forEach((m) => pushPlayed(m, 'confed-group', g.name));
  });

  // Confederaciones — knockout
  const ko = cycle.confederationsCup?.knockout;
  if (ko) {
    [
      ...ko.semiFinals,
      ...(ko.final ? [ko.final] : []),
      ...(ko.thirdPlace ? [ko.thirdPlace] : []),
    ].forEach((m) => pushPlayed(m, 'confed-knockout', m.round));
  }

  return params;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/services/__tests__/cycleMatchHistory.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/cycleMatchHistory.ts src/services/__tests__/cycleMatchHistory.test.ts
git commit -m "feat(services): cycleMatchHistory — mapeo puro de partidos del ciclo a match_history

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U45g7vtYzFMd25RUxY7uKQ"
```

---

### Task 5: Persistencia hacia adelante en el store (continental + confed)

**Files:**
- Modify: `src/store/useTournamentStore.ts:2090-2147` (`simulateContinentalMatch`), `:2161-2218` (`simulateConfederationsMatch`)

**Interfaces:**
- Consumes: `buildMatchParams` de `../services/cycleMatchHistory`; `matchHistoryService` de `../services/matchHistoryService`.

- [ ] **Step 1: Importar dependencias**

En `src/store/useTournamentStore.ts`, junto a los imports de servicios (cerca de `import { cycleStateService } ...`), agregar:

```ts
import { buildMatchParams } from '../services/cycleMatchHistory';
```
Verificar que `matchHistoryService` ya esté importado (lo usan las acciones qualifier/mundial); si no, agregarlo.

- [ ] **Step 2: Persistir el partido continental**

En `simulateContinentalMatch`, dentro del bloque `if (isSupabaseConfigured()) { ... }` que hace `teamsService.batchUpdateTeams(...)` (`:2130-2137`), añadir después del `.catch(...)` de skills, una llamada best-effort a `createMatch`:

```ts
          matchHistoryService
            .createMatch(buildMatchParams({
              homeTeamId: home.id, awayTeamId: away.id,
              homeScore: result.homeScore, awayScore: result.awayScore,
              stage: 'continental', region: home.region, groupName: match.round,
              cycleMatchId: matchId, tournamentId: cycle.id,
              homeSkillBefore: home.skill, awaySkillBefore: away.skill,
              homeSkillAfter: newHome, awaySkillAfter: newAway,
            }))
            .catch((error) => console.error('❌ Error persistiendo partido continental:', error));
```
Nota: `region` del partido = región del bracket; ambos equipos de un bracket continental son de la misma región, así que `home.region` es correcto.

- [ ] **Step 3: Persistir el partido de confederaciones**

En `simulateConfederationsMatch`, dentro del `if (isSupabaseConfigured()) { ... }` de skills (`:2193-2200`), añadir tras el `.catch(...)`:

```ts
          matchHistoryService
            .createMatch(buildMatchParams({
              homeTeamId: home.id, awayTeamId: away.id,
              homeScore: result.homeScore, awayScore: result.awayScore,
              stage: isKo ? 'confed-knockout' : 'confed-group',
              groupName: isKo ? (match as KnockoutMatch).round : undefined,
              cycleMatchId: matchId, tournamentId: cycle.id,
              homeSkillBefore: home.skill, awaySkillBefore: away.skill,
              homeSkillAfter: newHome, awaySkillAfter: newAway,
            }))
            .catch((error) => console.error('❌ Error persistiendo partido confed:', error));
```
Nota: `isKo` ya está definido en esa acción (`:2183`). Confed no tiene región → `region` omitido. Para `confed-group`, `groupName` podría ser el nombre del grupo; si no se dispone barato en ese punto, dejar `undefined` (el H2H no lo usa). No pasar `region`.

- [ ] **Step 4: Verificar tipos y suite**

Run: `npx tsc -b && npx vitest run`
Expected: 0 errores; suite en verde (esta tarea no agrega test unit propio: la persistencia es I/O best-effort verificada por integración/manual; la construcción de params ya está cubierta por Task 4).

- [ ] **Step 5: Commit**

```bash
git add src/store/useTournamentStore.ts
git commit -m "feat(store): persistir partidos continental/confed en match_history al simular

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U45g7vtYzFMd25RUxY7uKQ"
```

---

### Task 6: Backfill idempotente de lo ya jugado + disparo en la carga del ciclo

**Files:**
- Modify: `src/services/matchHistoryService.ts` (agregar `getExistingCycleMatchIds`)
- Modify: `src/services/cycleMatchHistory.ts` (agregar `backfillCycleMatchHistory`)
- Test: `src/services/__tests__/cycleMatchHistory.test.ts` (extender)
- Modify: `src/store/useTournamentStore.ts` (`initializeTournament`, tras cargar el ciclo)

**Interfaces:**
- Produces: `matchHistoryService.getExistingCycleMatchIds(tournamentId: string): Promise<Set<string>>`; `export async function backfillCycleMatchHistory(cycle: Cycle, teams: Team[]): Promise<number>` (devuelve cuántas filas insertó).
- Consumes: `collectPlayedCycleMatches` (Task 4); `matchHistoryService.createMatchesBatch` (existente `:293`) y `getExistingCycleMatchIds` (nuevo).

- [ ] **Step 1: Escribir el test del backfill (falla)**

Extender `src/services/__tests__/cycleMatchHistory.test.ts` con un bloque que mockea el service:

```ts
import { vi } from 'vitest';
import { backfillCycleMatchHistory } from '../cycleMatchHistory';
import * as supa from '../../lib/supabase';
import { matchHistoryService } from '../matchHistoryService';

describe('backfillCycleMatchHistory — idempotencia', () => {
  it('inserta solo los partidos jugados que faltan (por cycleMatchId)', async () => {
    vi.spyOn(supa, 'isSupabaseConfigured').mockReturnValue(true);
    // 'c-final' ya existe; 'cf-g1' falta.
    vi.spyOn(matchHistoryService, 'getExistingCycleMatchIds').mockResolvedValue(new Set(['c-final']));
    const batchSpy = vi.spyOn(matchHistoryService, 'createMatchesBatch').mockResolvedValue([]);

    const inserted = await backfillCycleMatchHistory(cycle, teams); // cycle/teams del describe anterior — mover a scope compartido

    expect(inserted).toBe(1);
    expect(batchSpy).toHaveBeenCalledTimes(1);
    const arg = batchSpy.mock.calls[0][0];
    expect(arg.map((p) => (p.metadata as any).cycleMatchId)).toEqual(['cf-g1']);
    vi.restoreAllMocks();
  });

  it('no-op sin Supabase', async () => {
    vi.spyOn(supa, 'isSupabaseConfigured').mockReturnValue(false);
    const inserted = await backfillCycleMatchHistory(cycle, teams);
    expect(inserted).toBe(0);
    vi.restoreAllMocks();
  });
});
```
Mover las constantes `cycle` y `teams` del `describe('collectPlayedCycleMatches')` a un scope compartido del archivo para reutilizarlas aquí.

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/services/__tests__/cycleMatchHistory.test.ts`
Expected: FAIL — `backfillCycleMatchHistory`/`getExistingCycleMatchIds` no existen.

- [ ] **Step 3: Agregar `getExistingCycleMatchIds` al service**

En `src/services/matchHistoryService.ts`, dentro del objeto `matchHistoryService` (junto a `createMatchesBatch`), agregar:

```ts
  // IDs (metadata.cycleMatchId) de partidos continental/confed ya persistidos
  // para un torneo — base de la idempotencia del backfill.
  async getExistingCycleMatchIds(tournamentId: string): Promise<Set<string>> {
    if (!isSupabaseConfigured()) return new Set();
    const { data, error } = await supabase
      .from('match_history')
      .select('metadata')
      .eq('tournament_id', tournamentId)
      .in('stage', ['continental', 'confed-group', 'confed-knockout']);
    if (error) {
      console.error('getExistingCycleMatchIds:', error);
      return new Set();
    }
    const ids = new Set<string>();
    for (const row of data ?? []) {
      const cid = (row.metadata as { cycleMatchId?: string } | null)?.cycleMatchId;
      if (cid) ids.add(cid);
    }
    return ids;
  },
```

- [ ] **Step 4: Agregar `backfillCycleMatchHistory` al módulo**

En `src/services/cycleMatchHistory.ts`, agregar imports y la función:

```ts
import { isSupabaseConfigured } from '../lib/supabase';
import { matchHistoryService } from './matchHistoryService';
```
```ts
/**
 * Persiste en match_history los partidos continental/confed JUGADOS del ciclo
 * que todavía no estén (idempotente por metadata.cycleMatchId). No-op sin
 * Supabase. Devuelve cuántas filas insertó.
 */
export async function backfillCycleMatchHistory(cycle: Cycle, teams: Team[]): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const all = collectPlayedCycleMatches(cycle, teams);
  if (all.length === 0) return 0;
  const existing = await matchHistoryService.getExistingCycleMatchIds(cycle.id);
  const missing = all.filter((p) => {
    const cid = (p.metadata as { cycleMatchId?: string }).cycleMatchId;
    return cid != null && !existing.has(cid);
  });
  if (missing.length === 0) return 0;
  await matchHistoryService.createMatchesBatch(missing);
  return missing.length;
}
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `npx vitest run src/services/__tests__/cycleMatchHistory.test.ts`
Expected: PASS (todos los bloques).

- [ ] **Step 6: Disparar el backfill al cargar el ciclo**

En `src/store/useTournamentStore.ts`, importar la función:
```ts
import { backfillCycleMatchHistory } from '../services/cycleMatchHistory';
```
En `initializeTournament`, en la rama donde se cargó `latestCycle` desde Supabase (tras el `set({ ... currentTournament: latestCycle })` en `:177-183`, antes del `return` de `:184`), agregar un backfill best-effort que no bloquee la carga:
```ts
              // Backfill best-effort: exponer en H2H los partidos continental/
              // confed ya jugados (antes de que se normalizaran a match_history).
              backfillCycleMatchHistory(latestCycle, get().teams)
                .then((n) => { if (n > 0) console.log(`🔁 Backfill continental/confed: +${n} partidos`); })
                .catch((error) => console.error('Backfill continental/confed falló:', error));
```

- [ ] **Step 7: Verificar tipos y suite completa**

Run: `npx tsc -b && npx vitest run`
Expected: 0 errores; suite en verde.

- [ ] **Step 8: Commit**

```bash
git add src/services/matchHistoryService.ts src/services/cycleMatchHistory.ts src/services/__tests__/cycleMatchHistory.test.ts src/store/useTournamentStore.ts
git commit -m "feat(services): backfill idempotente de partidos continental/confed a match_history

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U45g7vtYzFMd25RUxY7uKQ"
```

---

### Task 7: Fallback H2H en memoria recorre continental/confed

**Files:**
- Modify: `src/services/headToHeadService.ts:137-186` (`getMatchesBetweenTeams`)
- Test: `src/services/__tests__/headToHeadService.test.ts` (crear)

**Interfaces:**
- Modifica el comportamiento de `getMatchesBetweenTeams(team1Id, team2Id): Match[]` (sin cambiar su firma) para incluir partidos continental/confed del `currentTournament`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/services/__tests__/headToHeadService.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getMatchesBetweenTeams } from '../headToHeadService';
import { useTournamentStore } from '../../store/useTournamentStore';
import type { Cycle } from '../../types';

function cycleWithContinentalMatch(): Cycle {
  const m = { id: 'x', homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 1, isPlayed: true, round: 'final' as const };
  return {
    qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
    worldCup: null,
    continental: {
      isComplete: true,
      brackets: {
        Europe: { region: 'Europe', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: m, thirdPlace: null, byeTeamIds: [] },
        America: { region: 'America', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: null, thirdPlace: null, byeTeamIds: [] },
        Africa: { region: 'Africa', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: null, thirdPlace: null, byeTeamIds: [] },
        Asia: { region: 'Asia', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: null, thirdPlace: null, byeTeamIds: [] },
      },
    },
    confederationsCup: { isComplete: false, groups: [], knockout: { semiFinals: [], thirdPlace: null, final: null } },
  } as unknown as Cycle;
}

describe('getMatchesBetweenTeams — incluye continental/confed', () => {
  beforeEach(() => {
    useTournamentStore.setState({ currentTournament: cycleWithContinentalMatch() });
  });

  it('devuelve el partido continental jugado entre los dos equipos', () => {
    const res = getMatchesBetweenTeams('A', 'B');
    expect(res.map((m) => m.id)).toContain('x');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/services/__tests__/headToHeadService.test.ts`
Expected: FAIL — el partido continental no se incluye.

- [ ] **Step 3: Ampliar `getMatchesBetweenTeams`**

En `src/services/headToHeadService.ts`, dentro de `getMatchesBetweenTeams`, antes del `return allMatches;` (`:185`), agregar un helper local y los recorridos de continental/confed:

```ts
  // Helper: partido jugado entre los dos equipos (cualquier orientación).
  const isBetween = (match: Match) => {
    const t1Home = match.homeTeamId === team1Id && match.awayTeamId === team2Id;
    const t1Away = match.homeTeamId === team2Id && match.awayTeamId === team1Id;
    return (t1Home || t1Away) && match.isPlayed;
  };

  // Continental
  if (currentTournament.continental?.brackets) {
    Object.values(currentTournament.continental.brackets).forEach((b) => {
      allMatches.push(...[
        ...b.roundOf64, ...b.roundOf32, ...b.roundOf16,
        ...b.quarterFinals, ...b.semiFinals,
        ...(b.final ? [b.final] : []),
        ...(b.thirdPlace ? [b.thirdPlace] : []),
      ].filter(isBetween));
    });
  }

  // Confederaciones — grupos + knockout
  if (currentTournament.confederationsCup) {
    currentTournament.confederationsCup.groups.forEach((g) => {
      allMatches.push(...g.matches.filter(isBetween));
    });
    const ck = currentTournament.confederationsCup.knockout;
    allMatches.push(...[
      ...ck.semiFinals,
      ...(ck.final ? [ck.final] : []),
      ...(ck.thirdPlace ? [ck.thirdPlace] : []),
    ].filter(isBetween));
  }
```
Nota: `Match` ya está importado en el archivo (tipo de retorno). Si el helper `isBetween` colisiona con los filtros inline existentes, dejarlos como están: el helper solo se usa en los bloques nuevos.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/services/__tests__/headToHeadService.test.ts`
Expected: PASS.

- [ ] **Step 5: Verificar tipos y suite completa**

Run: `npx tsc -b && npx vitest run`
Expected: 0 errores; suite en verde.

- [ ] **Step 6: Commit**

```bash
git add src/services/headToHeadService.ts src/services/__tests__/headToHeadService.test.ts
git commit -m "feat(h2h): fallback en memoria recorre continental/confed (modo sin Supabase)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01U45g7vtYzFMd25RUxY7uKQ"
```

---

## Verificación final

- [ ] `npx tsc -b` → 0 errores.
- [ ] `npx vitest run` → toda la suite en verde (los ~143 previos + los nuevos).
- [ ] `list_migrations` (Supabase MCP) muestra la `010`.
- [ ] Verificación manual en la app (por el usuario): jugar un partido continental y otro de confed, y confirmar que aparecen en el Centro de Partidos (con sus filtros Continental/Confederaciones) y en la Comparación de Equipos; verificar que un empate en knockout muestra un marcador de penales realista.

## Notas de decisión

- **Skills placeholder en el backfill:** los partidos jugados antes del fix no guardaron los skills before/after, así que el backfill los rellena con el skill actual (change 0). El H2H solo consume goles/stage, no estos campos; es una limitación aceptada y documentada.
- **Penales fuera de match_history:** igual que el mundial, `match_history` guarda goles del partido, no el marcador de penales. Fuera de alcance.
- **Match Center lee del estado en memoria del ciclo** (no de match_history), consistente con su patrón actual: por eso muestra lo ya jugado sin depender de la DB ni del backfill.
