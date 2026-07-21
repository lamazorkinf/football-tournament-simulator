# Copa Confederaciones — Motor puro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el motor puro de la Copa Confederaciones (`src/core/confederations.ts`): sorteo de 2 grupos de 4 con exactamente un equipo por confederación por grupo y balance por skill, generación de partidos de grupo, y llave (semis 1ºA-2ºB / 1ºB-2ºA → Final + 3er puesto), todo testeado con Vitest.

**Architecture:** Módulo puro en la línea de `src/core/seeding.ts`/`src/core/knockout.ts`: reutiliza `initializeStandings`/`sortStandings` de `./scheduler` y `WORLD_CUP_FIXTURE_TEMPLATE` de `../constants/fixtureTemplate`. Genera `WorldCupGroup[]` (grupos) y `KnockoutMatch[]` (llave). El cableado al store, la simulación y el render `ConfederationsCupView` quedan para el Plan 5.

**Tech Stack:** TypeScript, Vitest (env node), nanoid. Sin React/Zustand/Supabase en el módulo.

## Global Constraints

- **Módulo puro:** `src/core/confederations.ts` puede importar `nanoid`, `initializeStandings`/`sortStandings` de `'./scheduler'`, `WORLD_CUP_FIXTURE_TEMPLATE` de `'../constants/fixtureTemplate'`, y `import type … from '../types'` (mismo set que usa `seeding.ts`). **Prohibido** React, Zustand, Supabase, o `getEngineConfig()`.
- **Etapas (crítico, análogo a FU-B):** cada partido de grupo lleva `stage: 'confed-group'`; cada partido de la llave (semis/final/3er puesto) lleva `stage: 'confed-knockout'`. Si falta, `getStageImportance` cae a `1` y los pesos Elo (`confedGroup` 1.1 / `confedKnockout` 1.4) quedan muertos.
- **Restricción del sorteo (spec §7):** 8 finalistas = 4 confederaciones × 2 (campeón + subcampeón). 2 grupos de 4 con **exactamente un equipo de cada confederación por grupo**; el campeón de una conf y su subcampeón van a **grupos opuestos**. Sorteo **balanceado por skill** (minimiza |skillTotalA − skillTotalB| sobre las 16 combinaciones campeón→A/B).
- **Jornadas globales (spec §4.2):** grupos = `matchday 1,2,3` (del `WORLD_CUP_FIXTURE_TEMPLATE`); semis = `matchday 4`; Final + 3er puesto = `matchday 5`.
- **Llave (spec §7):** semis `1ºA-2ºB` (position 0) y `1ºB-2ºA` (position 1); luego Final (ganadores) + 3er puesto (perdedores). Sede neutral + penales se resuelven al simular (Plan 5), no acá.
- **Rondas (`KnockoutMatch['round']`):** `'semi' | 'third-place' | 'final'`.
- **Tests:** en `src/core/__tests__/confederations.test.ts`, convención existente (`import { describe, it, expect } from 'vitest'`).
- **GATE por tarea (los tres):** `npx vitest run src/core/__tests__/confederations.test.ts` verde + `npx tsc -b --noEmit` exit 0 + `npx eslint src/core/confederations.ts src/core/__tests__/confederations.test.ts` exit 0. Nota: `npx tsc --noEmit` (sin `-b`) es **no-op** en este repo (tsconfig raíz solution-style) — usar SIEMPRE `tsc -b`. No dejar imports sin usar: agregá cada import junto con el código que lo consume.
- **Fuera de alcance (Plan 5):** `ConfederationsCupView`, guards del store, transiciones de fase, simulación real. No se crea ningún componente React en este plan.

---

### Task 1: Sorteo balanceado + grupos (`generateConfederationsGroups`)

**Files:**
- Create: `src/core/confederations.ts`
- Test: `src/core/__tests__/confederations.test.ts`

**Interfaces:**
- Consumes: `initializeStandings` (`./scheduler`), `WORLD_CUP_FIXTURE_TEMPLATE` (`../constants/fixtureTemplate`), tipos `Team`, `Region`, `WorldCupGroup`, `Match`.
- Produces:
  - `export interface ConfederationFinalists { region: Region; championId: string; runnerUpId: string; }`
  - `generateConfederationsGroups(finalists: ConfederationFinalists[], teams: Team[]): WorldCupGroup[]` — 2 grupos ("Group A", "Group B"), 4 equipos c/u (uno por conf), balanceados por skill; letras A-D por skill dentro del grupo; 6 partidos por grupo (`stage:'confed-group'`, matchdays 1-3); standings inicializadas.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/core/__tests__/confederations.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateConfederationsGroups } from '../confederations';
import type { ConfederationFinalists } from '../confederations';
import type { Team, Region } from '../../types';

/** 4 confederaciones (Europe, America, Africa, Asia), campeón + subcampeón c/u. */
const FINALISTS: ConfederationFinalists[] = [
  { region: 'Europe', championId: 'EUR-C', runnerUpId: 'EUR-R' },
  { region: 'America', championId: 'AME-C', runnerUpId: 'AME-R' },
  { region: 'Africa', championId: 'AFR-C', runnerUpId: 'AFR-R' },
  { region: 'Asia', championId: 'ASI-C', runnerUpId: 'ASI-R' },
];

/**
 * Skills elegidos para que exista un reparto PERFECTO (diff 0):
 * {100,30,40,70} = 240 y {20,90,80,50} = 240.
 */
function makeFinalistTeams(): Team[] {
  const skills: Record<string, number> = {
    'EUR-C': 100, 'EUR-R': 20,
    'AME-C': 90, 'AME-R': 30,
    'AFR-C': 80, 'AFR-R': 40,
    'ASI-C': 70, 'ASI-R': 50,
  };
  const regionOf: Record<string, Region> = {
    'EUR-C': 'Europe', 'EUR-R': 'Europe',
    'AME-C': 'America', 'AME-R': 'America',
    'AFR-C': 'Africa', 'AFR-R': 'Africa',
    'ASI-C': 'Asia', 'ASI-R': 'Asia',
  };
  return Object.keys(skills).map((id) => ({
    id,
    name: id,
    flag: '🏳️',
    region: regionOf[id],
    skill: skills[id],
  }));
}

describe('generateConfederationsGroups', () => {
  const teams = makeFinalistTeams();
  const skillOf = (id: string) => teams.find((t) => t.id === id)!.skill;
  const regionOf = (id: string) => teams.find((t) => t.id === id)!.region;

  it('devuelve 2 grupos de 4 equipos, sin duplicados, con los 8 finalistas', () => {
    const groups = generateConfederationsGroups(FINALISTS, teams);
    expect(groups).toHaveLength(2);
    expect(groups[0].teamIds).toHaveLength(4);
    expect(groups[1].teamIds).toHaveLength(4);
    const all = [...groups[0].teamIds, ...groups[1].teamIds];
    expect(new Set(all).size).toBe(8);
  });

  it('cada grupo tiene exactamente un equipo de cada confederación', () => {
    const groups = generateConfederationsGroups(FINALISTS, teams);
    for (const g of groups) {
      const regions = g.teamIds.map(regionOf).sort();
      expect(regions).toEqual(['Africa', 'America', 'Asia', 'Europe']);
    }
  });

  it('campeón y subcampeón de cada conf caen en grupos opuestos', () => {
    const groups = generateConfederationsGroups(FINALISTS, teams);
    const groupOf = (id: string) =>
      groups[0].teamIds.includes(id) ? 0 : 1;
    for (const f of FINALISTS) {
      expect(groupOf(f.championId)).not.toBe(groupOf(f.runnerUpId));
    }
  });

  it('el sorteo balancea el skill (reparto perfecto: skill total igual)', () => {
    const groups = generateConfederationsGroups(FINALISTS, teams);
    const total = (g: (typeof groups)[number]) =>
      g.teamIds.reduce((s, id) => s + skillOf(id), 0);
    expect(total(groups[0])).toBe(total(groups[1])); // 240 = 240
  });

  it('cada grupo: 6 partidos confed-group, matchdays 1-3, standings en 0', () => {
    const groups = generateConfederationsGroups(FINALISTS, teams);
    for (const g of groups) {
      expect(g.matches).toHaveLength(6);
      expect(g.matches.every((m) => m.stage === 'confed-group')).toBe(true);
      expect(g.matches.every((m) => !m.isPlayed)).toBe(true);
      expect([...new Set(g.matches.map((m) => m.matchday))].sort()).toEqual([1, 2, 3]);
      expect(g.standings).toHaveLength(4);
      expect(g.standings.every((s) => s.played === 0 && s.points === 0)).toBe(true);
      // letras A-D asignadas una vez cada una
      const letters = Object.values(g.letterAssignments ?? {}).sort();
      expect(letters).toEqual(['A', 'B', 'C', 'D']);
    }
  });

  it('los partidos referencian solo equipos del propio grupo', () => {
    const groups = generateConfederationsGroups(FINALISTS, teams);
    for (const g of groups) {
      const ids = new Set(g.teamIds);
      for (const m of g.matches) {
        expect(ids.has(m.homeTeamId)).toBe(true);
        expect(ids.has(m.awayTeamId)).toBe(true);
      }
    }
  });

  it('rechaza un número de confederaciones distinto de 4', () => {
    expect(() => generateConfederationsGroups(FINALISTS.slice(0, 3), teams)).toThrow();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/core/__tests__/confederations.test.ts`
Expected: FAIL — `Cannot find module '../confederations'`.

- [ ] **Step 3: Implementación mínima**

Crear `src/core/confederations.ts`:

```ts
import { nanoid } from 'nanoid';
import { initializeStandings } from './scheduler';
import { WORLD_CUP_FIXTURE_TEMPLATE } from '../constants/fixtureTemplate';
import type { Match, Region, Team, WorldCupGroup } from '../types';

/** Finalistas de una confederación (entran a la Copa Confederaciones). */
export interface ConfederationFinalists {
  region: Region;
  championId: string;
  runnerUpId: string;
}

type PotLetter = 'A' | 'B' | 'C' | 'D';
const POT_LETTERS: PotLetter[] = ['A', 'B', 'C', 'D'];

/**
 * Reparte campeón/subcampeón de cada conf en grupos opuestos, eligiendo la
 * combinación (de 2^4 = 16) que minimiza |skillTotalA − skillTotalB|. Empates
 * de diferencia se resuelven por orden de enumeración (determinista).
 */
function pickBalancedAssignment(
  finalists: ConfederationFinalists[],
  skillOf: (id: string) => number,
): { groupA: string[]; groupB: string[] } {
  let best: { groupA: string[]; groupB: string[]; diff: number } | null = null;

  for (let mask = 0; mask < 1 << finalists.length; mask++) {
    const groupA: string[] = [];
    const groupB: string[] = [];
    finalists.forEach((f, i) => {
      const championToA = (mask & (1 << i)) === 0;
      if (championToA) {
        groupA.push(f.championId);
        groupB.push(f.runnerUpId);
      } else {
        groupA.push(f.runnerUpId);
        groupB.push(f.championId);
      }
    });
    const skillA = groupA.reduce((s, id) => s + skillOf(id), 0);
    const skillB = groupB.reduce((s, id) => s + skillOf(id), 0);
    const diff = Math.abs(skillA - skillB);
    if (!best || diff < best.diff) best = { groupA, groupB, diff };
  }

  return { groupA: best!.groupA, groupB: best!.groupB };
}

/** Partidos de un grupo confed a partir del template FIFA (letras A-D). */
function generateConfedGroupMatches(
  letterAssignments: Record<string, PotLetter>,
): Match[] {
  const letterToTeam = {} as Record<PotLetter, string>;
  for (const [teamId, letter] of Object.entries(letterAssignments)) {
    letterToTeam[letter] = teamId;
  }
  return WORLD_CUP_FIXTURE_TEMPLATE.map((f) => ({
    id: nanoid(),
    homeTeamId: letterToTeam[f.home],
    awayTeamId: letterToTeam[f.away],
    homeScore: null,
    awayScore: null,
    isPlayed: false,
    stage: 'confed-group',
    matchday: f.matchday,
  }));
}

/** Construye un `WorldCupGroup` con letras por skill (más fuerte → 'A'). */
function buildGroup(
  name: string,
  teamIds: string[],
  skillOf: (id: string) => number,
): WorldCupGroup {
  const sorted = [...teamIds].sort((a, b) => skillOf(b) - skillOf(a));
  const letterAssignments: Record<string, PotLetter> = {};
  sorted.forEach((id, i) => {
    letterAssignments[id] = POT_LETTERS[i];
  });
  return {
    id: nanoid(),
    name,
    teamIds: sorted,
    matches: generateConfedGroupMatches(letterAssignments),
    standings: initializeStandings(sorted),
    letterAssignments,
  };
}

/**
 * Sorteo de la Copa Confederaciones: 2 grupos de 4, uno por conf por grupo,
 * balanceados por skill. Requiere exactamente 4 confederaciones finalistas.
 */
export function generateConfederationsGroups(
  finalists: ConfederationFinalists[],
  teams: Team[],
): WorldCupGroup[] {
  if (finalists.length !== 4) {
    throw new Error(
      `generateConfederationsGroups: se esperaban 4 confederaciones, recibió ${finalists.length}`,
    );
  }
  const skillById = new Map(teams.map((t) => [t.id, t.skill]));
  const skillOf = (id: string) => skillById.get(id) ?? 0;

  const { groupA, groupB } = pickBalancedAssignment(finalists, skillOf);

  return [
    buildGroup('Group A', groupA, skillOf),
    buildGroup('Group B', groupB, skillOf),
  ];
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/core/__tests__/confederations.test.ts`
Expected: PASS (7 casos).
Run: `npx tsc -b --noEmit` → exit 0.
Run: `npx eslint src/core/confederations.ts src/core/__tests__/confederations.test.ts` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/confederations.ts src/core/__tests__/confederations.test.ts
git commit -m "feat(confed): sorteo balanceado + grupos de la Copa Confederaciones"
```

---

### Task 2: Semifinales (`generateConfederationsSemiFinals`)

**Files:**
- Modify: `src/core/confederations.ts`
- Test: `src/core/__tests__/confederations.test.ts`

**Interfaces:**
- Consumes: `sortStandings` (`./scheduler`), `WorldCupGroup` con `standings` y `matches` (todos jugados), tipos `KnockoutMatch`, `Team`.
- Produces: `generateConfederationsSemiFinals(groups: WorldCupGroup[], teams: Team[]): KnockoutMatch[]`
  - Guard: exactamente 2 grupos y **todos** los partidos jugados; si no, `[]`.
  - Ordena por `name` (A, B). SF1 = `1ºA vs 2ºB` (position 0); SF2 = `1ºB vs 2ºA` (position 1). `round:'semi'`, `stage:'confed-knockout'`, `matchday:4`.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `src/core/__tests__/confederations.test.ts`:

```ts
import { generateConfederationsSemiFinals } from '../confederations';
import type { WorldCupGroup, TeamStanding } from '../../types';

/** Standing con puntos/GD dados (para forzar orden 1º/2º sin simular). */
function standing(teamId: string, points: number, gd = 0): TeamStanding {
  return {
    teamId,
    played: 3,
    won: points,
    drawn: 0,
    lost: 3 - points,
    goalsFor: gd + 3,
    goalsAgainst: 3,
    goalDifference: gd,
    points: points * 3,
  };
}

/** Grupo "jugado": 6 partidos isPlayed + standings con orden explícito. */
function playedGroup(name: string, order: string[]): WorldCupGroup {
  // order[0] = 1º, order[3] = 4º (puntos decrecientes 3,2,1,0)
  const standings = order.map((id, i) => standing(id, 3 - i));
  const matches = Array.from({ length: 6 }, (_, i) => ({
    id: `${name}-m${i}`,
    homeTeamId: order[0],
    awayTeamId: order[1],
    homeScore: 1,
    awayScore: 0,
    isPlayed: true,
    stage: 'confed-group',
    matchday: (i % 3) + 1,
  }));
  return { id: name, name, teamIds: order, matches, standings };
}

describe('generateConfederationsSemiFinals', () => {
  const teams: Team[] = [];

  it('SF1 = 1ºA vs 2ºB, SF2 = 1ºB vs 2ºA (position 0 y 1)', () => {
    const groups = [
      playedGroup('Group A', ['A1', 'A2', 'A3', 'A4']),
      playedGroup('Group B', ['B1', 'B2', 'B3', 'B4']),
    ];
    const semis = generateConfederationsSemiFinals(groups, teams);
    expect(semis).toHaveLength(2);

    const sf1 = semis.find((m) => m.position === 0)!;
    const sf2 = semis.find((m) => m.position === 1)!;
    expect(sf1.homeTeamId).toBe('A1');
    expect(sf1.awayTeamId).toBe('B2');
    expect(sf2.homeTeamId).toBe('B1');
    expect(sf2.awayTeamId).toBe('A2');

    for (const m of semis) {
      expect(m.round).toBe('semi');
      expect(m.stage).toBe('confed-knockout');
      expect(m.matchday).toBe(4);
      expect(m.isPlayed).toBe(false);
    }
  });

  it('ordena por nombre: da igual el orden del array de grupos', () => {
    const groups = [
      playedGroup('Group B', ['B1', 'B2', 'B3', 'B4']),
      playedGroup('Group A', ['A1', 'A2', 'A3', 'A4']),
    ];
    const semis = generateConfederationsSemiFinals(groups, teams);
    const sf1 = semis.find((m) => m.position === 0)!;
    expect(sf1.homeTeamId).toBe('A1');
    expect(sf1.awayTeamId).toBe('B2');
  });

  it('guard: si algún partido de grupo no se jugó, devuelve []', () => {
    const groups = [
      playedGroup('Group A', ['A1', 'A2', 'A3', 'A4']),
      playedGroup('Group B', ['B1', 'B2', 'B3', 'B4']),
    ];
    groups[1].matches[0].isPlayed = false;
    expect(generateConfederationsSemiFinals(groups, teams)).toEqual([]);
  });

  it('guard: distinto de 2 grupos devuelve []', () => {
    const groups = [playedGroup('Group A', ['A1', 'A2', 'A3', 'A4'])];
    expect(generateConfederationsSemiFinals(groups, teams)).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/core/__tests__/confederations.test.ts`
Expected: FAIL — `generateConfederationsSemiFinals is not a function`.

- [ ] **Step 3: Implementación mínima**

Agregar a `src/core/confederations.ts` (y agregar `sortStandings` al import de `'./scheduler'`, y `KnockoutMatch` al import de tipos):

```ts
/** Factory de partido de llave confed (siempre `stage:'confed-knockout'`). */
function newConfedKnockoutMatch(
  homeTeamId: string,
  awayTeamId: string,
  round: KnockoutMatch['round'],
  matchday: number,
  position: number,
): KnockoutMatch {
  return {
    id: nanoid(),
    homeTeamId,
    awayTeamId,
    homeScore: null,
    awayScore: null,
    isPlayed: false,
    stage: 'confed-knockout',
    round,
    matchday,
    position,
  };
}

/**
 * Semifinales: 1ºA-2ºB y 1ºB-2ºA. Requiere 2 grupos con TODOS los partidos
 * jugados (si no, `[]`). Los grupos se ordenan por `name` para que "A"/"B" sean
 * estables sin importar el orden del array.
 */
export function generateConfederationsSemiFinals(
  groups: WorldCupGroup[],
  teams: Team[],
): KnockoutMatch[] {
  if (groups.length !== 2) return [];
  const allPlayed = groups.every((g) => g.matches.every((m) => m.isPlayed));
  if (!allPlayed) return [];

  const [groupA, groupB] = [...groups].sort((a, b) => a.name.localeCompare(b.name));
  const rankedA = sortStandings(groupA.standings, teams, groupA.matches);
  const rankedB = sortStandings(groupB.standings, teams, groupB.matches);

  const a1 = rankedA[0]?.teamId;
  const a2 = rankedA[1]?.teamId;
  const b1 = rankedB[0]?.teamId;
  const b2 = rankedB[1]?.teamId;
  if (!a1 || !a2 || !b1 || !b2) return [];

  return [
    newConfedKnockoutMatch(a1, b2, 'semi', 4, 0),
    newConfedKnockoutMatch(b1, a2, 'semi', 4, 1),
  ];
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/core/__tests__/confederations.test.ts`
Expected: PASS.
Run: `npx tsc -b --noEmit` → exit 0.
Run: `npx eslint src/core/confederations.ts src/core/__tests__/confederations.test.ts` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/confederations.ts src/core/__tests__/confederations.test.ts
git commit -m "feat(confed): semifinales 1ºA-2ºB / 1ºB-2ºA con guards"
```

---

### Task 3: Final + 3er puesto

**Files:**
- Modify: `src/core/confederations.ts`
- Test: `src/core/__tests__/confederations.test.ts`

**Interfaces:**
- Consumes: `newConfedKnockoutMatch` (Task 2), semis jugadas (`winnerId`/`loserId` seteados).
- Produces:
  - `generateConfederationsFinal(semiFinals: KnockoutMatch[]): KnockoutMatch | null` — ganadores de las 2 semis; `round:'final'`, `matchday:5`, position 0. `null` si faltan ganadores.
  - `generateConfederationsThirdPlace(semiFinals: KnockoutMatch[]): KnockoutMatch | null` — perdedores de las 2 semis; `round:'third-place'`, `matchday:5`, position 0. `null` si faltan perdedores.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `src/core/__tests__/confederations.test.ts`:

```ts
import {
  generateConfederationsFinal,
  generateConfederationsThirdPlace,
} from '../confederations';

function playedSemis(): KnockoutMatch[] {
  return [
    {
      id: 'sf0', homeTeamId: 'A1', awayTeamId: 'B2',
      homeScore: 2, awayScore: 1, isPlayed: true,
      stage: 'confed-knockout', round: 'semi', matchday: 4, position: 0,
      winnerId: 'A1', loserId: 'B2',
    },
    {
      id: 'sf1', homeTeamId: 'B1', awayTeamId: 'A2',
      homeScore: 0, awayScore: 3, isPlayed: true,
      stage: 'confed-knockout', round: 'semi', matchday: 4, position: 1,
      winnerId: 'A2', loserId: 'B1',
    },
  ];
}

describe('final y tercer puesto confed', () => {
  it('final = ganadores de las semis; matchday 5, round final', () => {
    const final = generateConfederationsFinal(playedSemis());
    expect(final).not.toBeNull();
    expect(final!.homeTeamId).toBe('A1');
    expect(final!.awayTeamId).toBe('A2');
    expect(final!.round).toBe('final');
    expect(final!.stage).toBe('confed-knockout');
    expect(final!.matchday).toBe(5);
  });

  it('tercer puesto = perdedores de las semis; matchday 5, round third-place', () => {
    const third = generateConfederationsThirdPlace(playedSemis());
    expect(third).not.toBeNull();
    expect(third!.homeTeamId).toBe('B2');
    expect(third!.awayTeamId).toBe('B1');
    expect(third!.round).toBe('third-place');
    expect(third!.stage).toBe('confed-knockout');
    expect(third!.matchday).toBe(5);
  });

  it('guards: semis incompletas → null', () => {
    expect(generateConfederationsFinal([])).toBeNull();
    expect(generateConfederationsThirdPlace([])).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/core/__tests__/confederations.test.ts`
Expected: FAIL — funciones no definidas.

- [ ] **Step 3: Implementación mínima**

Agregar a `src/core/confederations.ts`:

```ts
/** Final: ganadores de las 2 semis. `null` si aún no están definidos. */
export function generateConfederationsFinal(
  semiFinals: KnockoutMatch[],
): KnockoutMatch | null {
  const winners = semiFinals
    .filter((m) => m.winnerId)
    .map((m) => m.winnerId!);
  if (winners.length !== 2) return null;
  return newConfedKnockoutMatch(winners[0], winners[1], 'final', 5, 0);
}

/** Tercer puesto: perdedores de las 2 semis. `null` si aún no están definidos. */
export function generateConfederationsThirdPlace(
  semiFinals: KnockoutMatch[],
): KnockoutMatch | null {
  const losers = semiFinals
    .filter((m) => m.loserId)
    .map((m) => m.loserId!);
  if (losers.length !== 2) return null;
  return newConfedKnockoutMatch(losers[0], losers[1], 'third-place', 5, 0);
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/core/__tests__/confederations.test.ts`
Expected: PASS.
Run: `npx tsc -b --noEmit` → exit 0.
Run: `npx eslint src/core/confederations.ts src/core/__tests__/confederations.test.ts` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/confederations.ts src/core/__tests__/confederations.test.ts
git commit -m "feat(confed): final + 3er puesto desde las semifinales"
```

---

### Task 4: Integración + acceptance (pesos Elo confed vivos)

**Files:**
- Test: `src/core/__tests__/confederations.test.ts`

**Interfaces:**
- Consumes: todo `confederations.ts` + `getStageImportance` de `../engine` + `useConfigStore`.
- Produces: solo tests (cierra el análogo de FU-B: `confed-group` ⇒ 1.1, `confed-knockout` ⇒ 1.4).

- [ ] **Step 1: Escribir el test que falla**

Agregar a `src/core/__tests__/confederations.test.ts`:

```ts
import { getStageImportance } from '../engine';
import { useConfigStore } from '../../store/useConfigStore';

describe('acceptance: pesos Elo confed vivos', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('un partido de grupo confed da importance 1.1 y uno de llave 1.4', () => {
    const cfg = useConfigStore.getState().config;
    const groups = generateConfederationsGroups(FINALISTS, makeFinalistTeams());
    const groupMatch = groups[0].matches[0];
    expect(getStageImportance(groupMatch.stage, undefined, cfg)).toBe(1.1);
    expect(getStageImportance(groupMatch.stage, undefined, cfg)).not.toBe(1);

    const final = generateConfederationsFinal(playedSemis())!;
    expect(getStageImportance(final.stage, final.round, cfg)).toBe(1.4);
  });
});
```

Añadir `beforeEach` al import de vitest de arriba si no está: `import { describe, it, expect, beforeEach } from 'vitest';`.

- [ ] **Step 2: Correr el test**

Run: `npx vitest run src/core/__tests__/confederations.test.ts`
Expected: si faltaba `beforeEach` en el import → FALLA por referencia; al agregarlo → PASA. No hace falta código nuevo en `confederations.ts`.

- [ ] **Step 3: Sin implementación nueva**

Task de acceptance: si algún assert falla, es un bug real de tareas previas → corregir el módulo, no el test.

- [ ] **Step 4: Correr toda la suite + gate**

Run: `npx vitest run` → toda la suite verde.
Run: `npx tsc -b --noEmit` → exit 0.
Run: `npx eslint src/core/confederations.ts src/core/__tests__/confederations.test.ts` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/__tests__/confederations.test.ts
git commit -m "test(confed): integración + acceptance de pesos Elo confed"
```

---

## Notas de cierre (para el review final de rama)

- **Análogo de FU-B cerrado** para confed por la Task 4 (`confed-group` ⇒ 1.1, `confed-knockout` ⇒ 1.4).
- **Diferido a Plan 5:** `ConfederationsCupView`, guards del store, transiciones de fase, simulación real (neutral + penales vía `simulateMatchWithPenalties(..., importance)`), y el armado de `ConfederationFinalists[]` desde `championId`/`runnerUpId` de los brackets continentales.
- El módulo es puro: cualquier `import` de React/Zustand/Supabase/`getEngineConfig` en `confederations.ts` es un defecto bloqueante. (Importar de `./scheduler` y `../constants/fixtureTemplate` está permitido — son core/constantes puros.)
- **Determinismo del sorteo:** el balance por skill es determinista (primera combinación de mínima diferencia). Si en Plan 5 se quiere una animación/aleatoriedad de sorteo, se puede barajar entre las combinaciones empatadas — no afecta la corrección de la restricción.
