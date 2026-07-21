# Torneos Continentales — Motor puro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el motor puro de los torneos continentales (`src/core/continental.ts`): matemática de byes, sorteo del bracket con bombos por skill, y avance de rondas R64 → Final, todo testeado con Vitest.

**Architecture:** Módulo puro y sin efectos, en la misma línea que `src/core/knockout.ts`: solo importa `nanoid` y tipos. Genera `KnockoutMatch[]` por ronda, con siembra estándar (byes = cabezas de serie separados). El cableado al store, la simulación y el render `ContinentalView` quedan para el Plan 5; este plan produce funciones puras que ese plan consumirá.

**Tech Stack:** TypeScript, Vitest (env node), nanoid. Sin React/Zustand/Supabase en el módulo.

## Global Constraints

- **Módulo puro:** `src/core/continental.ts` importa **solo** `nanoid` y `import type … from '../types'`. Prohibido React, Zustand, Supabase, o `getEngineConfig()`. (Espeja `src/core/knockout.ts`.)
- **FU-B (crítico):** **cada** `KnockoutMatch` generado DEBE llevar `stage: 'continental'`. Si falta, `getStageImportance` cae a `1` y los pesos Elo continentales quedan muertos en silencio.
- **Jornadas globales (spec §4.2):** R64 = `matchday 1`, R32 = 2, R16 = 3, QF = 4, SF = 5, Final = 6.
- **Matemática (spec §3):** `byeCount = 64 − teamCount`; cruces R64 = `teamCount − 32`; R32 siempre 16 partidos (32 ocupantes = byes ∪ ganadores R64).
- **Rondas (`KnockoutMatch['round']`):** `'round-of-64' | 'round-of-32' | 'round-of-16' | 'quarter' | 'semi' | 'final'`. Continental **no** tiene tercer puesto (finalistas = campeón + subcampeón).
- **Sede neutral / penales:** se resuelven al simular (Plan 5). Este módulo **no** simula ni setea `winnerId`/scores en la generación.
- **Tests:** en `src/core/__tests__/continental.test.ts`, siguiendo la convención existente (`import { describe, it, expect } from 'vitest'`, imports relativos `../continental`).
- **GATE por tarea (los tres):** Vitest en verde (`npx vitest run src/core/__tests__/continental.test.ts`) + `npx tsc -b --noEmit` exit 0 + `npx eslint src/core/continental.ts src/core/__tests__/continental.test.ts` exit 0. Nota: `npx tsc --noEmit` (sin `-b`) es un **no-op** en este repo (tsconfig raíz solution-style, chequea 0 archivos) — usar SIEMPRE `tsc -b`. No dejar imports sin usar: agregá cada import junto con el código que lo consume.
- **Fuera de alcance (Plan 5):** `ContinentalView`, guards del store, transiciones de fase, simulación real. No se crea ningún componente React en este plan.

---

### Task 1: Matemática de byes + siembra de slots

**Files:**
- Create: `src/core/continental.ts`
- Test: `src/core/__tests__/continental.test.ts`

**Interfaces:**
- Consumes: nada (funciones aritméticas puras).
- Produces:
  - `getContinentalByeCount(teamCount: number): number`
  - `getContinentalRoundOf64Count(teamCount: number): number`
  - `seedSlots(size: number): number[]` — `size` potencia de 2; `slots[k]` = índice de siembra (0-based) colocado en el slot `k`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/core/__tests__/continental.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  getContinentalByeCount,
  getContinentalRoundOf64Count,
  seedSlots,
} from '../continental';

describe('getContinentalByeCount', () => {
  it('confederaciones de 55 → 9 byes, de 45 → 19 byes', () => {
    expect(getContinentalByeCount(55)).toBe(9);
    expect(getContinentalByeCount(45)).toBe(19);
  });

  it('64 equipos → 0 byes; 32 equipos → 32 byes', () => {
    expect(getContinentalByeCount(64)).toBe(0);
    expect(getContinentalByeCount(32)).toBe(32);
  });

  it('fuera de rango [32,64] lanza error', () => {
    expect(() => getContinentalByeCount(31)).toThrow();
    expect(() => getContinentalByeCount(65)).toThrow();
  });
});

describe('getContinentalRoundOf64Count', () => {
  it('cruces R64 = teamCount − 32', () => {
    expect(getContinentalRoundOf64Count(55)).toBe(23);
    expect(getContinentalRoundOf64Count(45)).toBe(13);
    expect(getContinentalRoundOf64Count(64)).toBe(32);
    expect(getContinentalRoundOf64Count(32)).toBe(0);
  });

  it('byes + 2×cruces = teamCount (los byes no juegan R64)', () => {
    for (const n of [45, 55, 64]) {
      expect(getContinentalByeCount(n) + 2 * getContinentalRoundOf64Count(n)).toBe(n);
    }
  });
});

describe('seedSlots', () => {
  it('tamaños chicos: arrays exactos del bracket estándar', () => {
    expect(seedSlots(1)).toEqual([0]);
    expect(seedSlots(2)).toEqual([0, 1]);
    expect(seedSlots(4)).toEqual([0, 3, 1, 2]);
    expect(seedSlots(8)).toEqual([0, 7, 3, 4, 1, 6, 2, 5]);
  });

  it('size=32: 32 slots, cada semilla 0..31 exactamente una vez', () => {
    const slots = seedSlots(32);
    expect(slots).toHaveLength(32);
    expect([...slots].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 32 }, (_, i) => i),
    );
  });

  it('siembra 0 en la 1ª mitad y siembra 1 en la 2ª mitad (mitades opuestas)', () => {
    const slots = seedSlots(32);
    expect(slots[0]).toBe(0); // top seed, slot 0 → match 0 (mitad alta)
    expect(slots[16]).toBe(1); // seed 1, slot 16 → match 8 (mitad baja)
  });

  it('rechaza tamaños que no son potencia de 2', () => {
    expect(() => seedSlots(0)).toThrow();
    expect(() => seedSlots(6)).toThrow();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/core/__tests__/continental.test.ts`
Expected: FAIL — `Cannot find module '../continental'` (el archivo no existe todavía).

- [ ] **Step 3: Implementación mínima**

Crear `src/core/continental.ts` (sin imports: son funciones aritméticas puras; `nanoid` y los tipos los agrega la Task 2 cuando los usa):

```ts
/**
 * Byes directos a R32 en un torneo continental de `teamCount` equipos.
 * Fórmula (spec §3): los que juegan R64 son `2·(teamCount − 32)`, así que
 * `byes = teamCount − 2·(teamCount − 32) = 64 − teamCount`.
 * 55 → 9, 45 → 19, 64 → 0. Requiere 32 ≤ teamCount ≤ 64 (si no, no se puede
 * formar un R32 de 32 equipos).
 */
export function getContinentalByeCount(teamCount: number): number {
  if (teamCount < 32 || teamCount > 64) {
    throw new Error(
      `getContinentalByeCount: teamCount debe estar en [32,64], recibió ${teamCount}`,
    );
  }
  return 64 - teamCount;
}

/** Cantidad de cruces reales en R64 = `teamCount − 32` (spec §3). */
export function getContinentalRoundOf64Count(teamCount: number): number {
  if (teamCount < 32 || teamCount > 64) {
    throw new Error(
      `getContinentalRoundOf64Count: teamCount debe estar en [32,64], recibió ${teamCount}`,
    );
  }
  return teamCount - 32;
}

/**
 * Orden de siembra estándar de un cuadro de `size` slots (`size` potencia de 2).
 * `slots[k]` = índice de semilla (0-based) que va en el slot `k`. Emparejando
 * slots consecutivos (2m, 2m+1) y fusionando rondas por adyacencia, dos semillas
 * altas solo pueden reencontrarse en la final.
 * seedSlots(8) → [0,7,3,4,1,6,2,5].
 */
export function seedSlots(size: number): number[] {
  if (size < 1 || (size & (size - 1)) !== 0) {
    throw new Error(`seedSlots requiere una potencia de 2 ≥ 1, recibió ${size}`);
  }
  let slots = [0];
  while (slots.length < size) {
    const total = slots.length * 2 - 1;
    const next: number[] = [];
    for (const s of slots) {
      next.push(s);
      next.push(total - s);
    }
    slots = next;
  }
  return slots;
}
```

Nota: esta tarea NO importa nada. `nanoid` y los tipos (`Team`, `Region`, `ContinentalBracket`, `KnockoutMatch`) se agregan en la Task 2, junto con el código que los usa — así el gate real (`tsc -b --noEmit` + `eslint`) queda en verde en cada tarea, sin imports sin usar.

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/core/__tests__/continental.test.ts`
Expected: PASS (4 + 2 + 4 casos).
Run: `npx tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/continental.ts src/core/__tests__/continental.test.ts
git commit -m "feat(continental): matemática de byes + siembra de slots"
```

---

### Task 2: Sorteo del bracket (R64 con byes + bombos por skill)

**Files:**
- Modify: `src/core/continental.ts`
- Test: `src/core/__tests__/continental.test.ts`

**Interfaces:**
- Consumes: `getContinentalByeCount` (Task 1), tipos `Team`, `Region`, `ContinentalBracket`, `KnockoutMatch`.
- Produces: `generateContinentalBracket(region: Region, teams: Team[]): ContinentalBracket`
  - Ordena por skill desc; los mejores `byeCount` reciben bye (`byeTeamIds`) y NO juegan R64.
  - Los `2·W` restantes se parten en bombo alto (mejores `W`) y bombo bajo (peores `W`); el bombo bajo se baraja (Fisher-Yates) y se cruza posición a posición contra el bombo alto.
  - `roundOf64[i]` = `{ home: bomboAlto[i], away: bomboBajo_barajado[i], round:'round-of-64', matchday:1, position:i, stage:'continental' }`.
  - Resto de rondas vacías; `final: null`.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `src/core/__tests__/continental.test.ts`:

```ts
import { generateContinentalBracket } from '../continental';
import type { Team, Region } from '../../types';

/** Equipos sintéticos con skills estrictamente descendentes (100, 99, …). */
function makeTeams(region: Region, count: number): Team[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${region}-${i}`,
    name: `${region} ${i}`,
    flag: '🏳️',
    region,
    skill: 100 - i, // único y descendente
  }));
}

describe('generateContinentalBracket', () => {
  it('55 equipos: 9 byes fuera de R64 y 23 cruces de R64', () => {
    const teams = makeTeams('Europe', 55);
    const b = generateContinentalBracket('Europe', teams);

    expect(b.region).toBe('Europe');
    expect(b.byeTeamIds).toHaveLength(9);
    expect(b.roundOf64).toHaveLength(23);
    expect(b.roundOf32).toEqual([]);
    expect(b.final).toBeNull();

    // Los 9 byes son los de mayor skill (ids Europe-0..Europe-8).
    expect(b.byeTeamIds).toEqual(teams.slice(0, 9).map((t) => t.id));

    // Ningún bye juega R64.
    const r64Ids = new Set(b.roundOf64.flatMap((m) => [m.homeTeamId, m.awayTeamId]));
    for (const id of b.byeTeamIds) expect(r64Ids.has(id)).toBe(false);

    // 9 byes + 46 en R64 = 55 equipos, sin duplicados.
    expect(r64Ids.size).toBe(46);
    expect(new Set([...b.byeTeamIds, ...r64Ids]).size).toBe(55);
  });

  it('45 equipos: 19 byes y 13 cruces de R64', () => {
    const b = generateContinentalBracket('America', makeTeams('America', 45));
    expect(b.byeTeamIds).toHaveLength(19);
    expect(b.roundOf64).toHaveLength(13);
  });

  it('cada cruce de R64 empareja bombo alto (home) vs bombo bajo (away)', () => {
    const teams = makeTeams('Asia', 55);
    const skill = new Map(teams.map((t) => [t.id, t.skill]));
    const b = generateContinentalBracket('Asia', teams);
    // El bombo alto = 23 mejores de los 46 no-cabeza; el bajo = 23 peores.
    // Con skills únicos descendentes, home.skill > away.skill en TODO cruce.
    for (const m of b.roundOf64) {
      expect(skill.get(m.homeTeamId)!).toBeGreaterThan(skill.get(m.awayTeamId)!);
    }
  });

  it('cada partido R64: stage continental, ronda round-of-64, matchday 1, posición única', () => {
    const b = generateContinentalBracket('Africa', makeTeams('Africa', 55));
    const positions = b.roundOf64.map((m) => m.position);
    expect(new Set(positions).size).toBe(b.roundOf64.length);
    for (const m of b.roundOf64) {
      expect(m.stage).toBe('continental');
      expect(m.round).toBe('round-of-64');
      expect(m.matchday).toBe(1);
      expect(m.isPlayed).toBe(false);
      expect(m.homeScore).toBeNull();
    }
    // posiciones 0..22 contiguas
    expect([...positions].sort((a, b2) => (a ?? 0) - (b2 ?? 0))).toEqual(
      Array.from({ length: 23 }, (_, i) => i),
    );
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/core/__tests__/continental.test.ts`
Expected: FAIL — `generateContinentalBracket is not a function`.

- [ ] **Step 3: Implementación mínima**

Agregar a `src/core/continental.ts`:

```ts
/** Baraja una copia del array (Fisher-Yates). No muta el original. */
function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function newKnockoutMatch(
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
    stage: 'continental',
    round,
    position,
  };
}

/**
 * Sorteo de un torneo continental. Los mejores `byeCount` por skill reciben bye
 * directo a R32; el resto se cruza en R64 con siembra por bombos: el bombo alto
 * (mejores) hace de local contra un rival barajado del bombo bajo.
 */
export function generateContinentalBracket(
  region: Region,
  teams: Team[],
): ContinentalBracket {
  const sorted = [...teams].sort((a, b) => b.skill - a.skill);
  const byeCount = getContinentalByeCount(sorted.length);

  const byeTeamIds = sorted.slice(0, byeCount).map((t) => t.id);
  const r64Teams = sorted.slice(byeCount);
  const w = r64Teams.length / 2; // entero: r64Teams.length siempre es par

  const topPot = r64Teams.slice(0, w);
  const bottomPot = shuffle(r64Teams.slice(w));

  const roundOf64: KnockoutMatch[] = topPot.map((home, i) =>
    newKnockoutMatch(home.id, bottomPot[i].id, 'round-of-64', 1, i),
  );

  return {
    region,
    roundOf64,
    roundOf32: [],
    roundOf16: [],
    quarterFinals: [],
    semiFinals: [],
    final: null,
    byeTeamIds,
  };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/core/__tests__/continental.test.ts`
Expected: PASS.
Run: `npx tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/continental.ts src/core/__tests__/continental.test.ts
git commit -m "feat(continental): sorteo del bracket R64 con byes y bombos por skill"
```

---

### Task 3: Generación de R32 (byes + ganadores de R64, sembrado)

**Files:**
- Modify: `src/core/continental.ts`
- Test: `src/core/__tests__/continental.test.ts`

**Interfaces:**
- Consumes: `seedSlots` (Task 1), `ContinentalBracket` con `roundOf64` ya jugado (`winnerId` seteado) + `byeTeamIds`.
- Produces: `generateContinentalRoundOf32(bracket: ContinentalBracket): KnockoutMatch[]`
  - Ocupantes = `[...byeTeamIds, ...ganadoresR64]` en ese orden (byes = semillas altas). Debe haber exactamente 32; si no, devuelve `[]` (guard, espeja `knockout.ts`).
  - Coloca ocupantes en 32 slots vía `seedSlots(32)` y forma 16 partidos (slot `2m` vs `2m+1`), `round:'round-of-32'`, `matchday:2`, `position:m`, `stage:'continental'`.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `src/core/__tests__/continental.test.ts`:

```ts
import { generateContinentalRoundOf32 } from '../continental';
import type { ContinentalBracket, KnockoutMatch } from '../../types';

/** Marca cada partido de una ronda como jugado, con `home` ganador. */
function playAllHomeWins(matches: KnockoutMatch[]): KnockoutMatch[] {
  return matches.map((m) => ({
    ...m,
    isPlayed: true,
    homeScore: 1,
    awayScore: 0,
    winnerId: m.homeTeamId,
    loserId: m.awayTeamId,
  }));
}

describe('generateContinentalRoundOf32', () => {
  it('produce 16 partidos con byes ∪ ganadores R64 (32 equipos distintos)', () => {
    const base = generateContinentalBracket('Europe', makeTeams('Europe', 55));
    const bracket: ContinentalBracket = {
      ...base,
      roundOf64: playAllHomeWins(base.roundOf64),
    };

    const r32 = generateContinentalRoundOf32(bracket);
    expect(r32).toHaveLength(16);

    const winnerIds = base.roundOf64.map((m) => m.homeTeamId); // 23 ganadores
    const expected = new Set([...bracket.byeTeamIds, ...winnerIds]); // 9 + 23 = 32
    const actual = new Set(r32.flatMap((m) => [m.homeTeamId, m.awayTeamId]));
    expect(actual.size).toBe(32);
    expect(actual).toEqual(expected);
  });

  it('cada partido de R32: stage continental, round-of-32, matchday 2, posiciones 0..15', () => {
    const base = generateContinentalBracket('Asia', makeTeams('Asia', 55));
    const r32 = generateContinentalRoundOf32({
      ...base,
      roundOf64: playAllHomeWins(base.roundOf64),
    });
    for (const m of r32) {
      expect(m.stage).toBe('continental');
      expect(m.round).toBe('round-of-32');
      expect(m.matchday).toBe(2);
    }
    expect(r32.map((m) => m.position)).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });

  it('los dos mejores byes caen en mitades opuestas del cuadro', () => {
    const base = generateContinentalBracket('Africa', makeTeams('Africa', 55));
    const r32 = generateContinentalRoundOf32({
      ...base,
      roundOf64: playAllHomeWins(base.roundOf64),
    });
    const seed0 = base.byeTeamIds[0];
    const seed1 = base.byeTeamIds[1];
    const matchOf = (id: string) =>
      r32.find((m) => m.homeTeamId === id || m.awayTeamId === id)!;
    expect(matchOf(seed0).position! < 8).toBe(true); // mitad alta (0..7)
    expect(matchOf(seed1).position! >= 8).toBe(true); // mitad baja (8..15)
  });

  it('guard: si faltan ganadores de R64, devuelve []', () => {
    const base = generateContinentalBracket('America', makeTeams('America', 45));
    // roundOf64 sin winnerId → ocupantes incompletos
    expect(generateContinentalRoundOf32(base)).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/core/__tests__/continental.test.ts`
Expected: FAIL — `generateContinentalRoundOf32 is not a function`.

- [ ] **Step 3: Implementación mínima**

Agregar a `src/core/continental.ts`:

```ts
/**
 * Forma la R32 a partir de los byes (semillas altas) y los ganadores de R64.
 * Ocupantes = byes ++ ganadores (32 en total); se colocan por `seedSlots(32)` y
 * se emparejan slots consecutivos. Si no hay exactamente 32 ocupantes con id
 * (p.ej. faltan `winnerId`), devuelve `[]` sin generar (igual que knockout.ts).
 */
export function generateContinentalRoundOf32(bracket: ContinentalBracket): KnockoutMatch[] {
  const winners = [...bracket.roundOf64]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((m) => m.winnerId)
    .filter((id): id is string => Boolean(id));

  const occupants = [...bracket.byeTeamIds, ...winners];
  if (occupants.length !== 32) {
    console.warn(
      `⚠️ generateContinentalRoundOf32: se esperaban 32 ocupantes, hay ${occupants.length}. No se genera R32.`,
    );
    return [];
  }

  const slots = seedSlots(32); // slots[k] = índice de semilla en el slot k
  const placed = slots.map((seedIdx) => occupants[seedIdx]);

  const matches: KnockoutMatch[] = [];
  for (let m = 0; m < 16; m++) {
    matches.push(newKnockoutMatch(placed[2 * m], placed[2 * m + 1], 'round-of-32', 2, m));
  }
  return matches;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/core/__tests__/continental.test.ts`
Expected: PASS.
Run: `npx tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/continental.ts src/core/__tests__/continental.test.ts
git commit -m "feat(continental): generación de R32 sembrada (byes + ganadores R64)"
```

---

### Task 4: Avance de rondas R16 → QF → SF → Final

**Files:**
- Modify: `src/core/continental.ts`
- Test: `src/core/__tests__/continental.test.ts`

**Interfaces:**
- Consumes: rondas previas como `KnockoutMatch[]` con `winnerId` seteado.
- Produces (emparejamiento por adyacencia: `next[j]` = ganador(prev pos `2j`) vs ganador(prev pos `2j+1`)):
  - `generateContinentalRoundOf16(roundOf32: KnockoutMatch[]): KnockoutMatch[]` — 8 partidos, `matchday 3`.
  - `generateContinentalQuarterFinals(roundOf16: KnockoutMatch[]): KnockoutMatch[]` — 4, `matchday 4`.
  - `generateContinentalSemiFinals(quarterFinals: KnockoutMatch[]): KnockoutMatch[]` — 2, `matchday 5`.
  - `generateContinentalFinal(semiFinals: KnockoutMatch[]): KnockoutMatch | null` — 1 o `null`, `matchday 6`.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `src/core/__tests__/continental.test.ts`:

```ts
import {
  generateContinentalRoundOf16,
  generateContinentalQuarterFinals,
  generateContinentalSemiFinals,
  generateContinentalFinal,
} from '../continental';

/** Construye una ronda "jugada" de `count` partidos con winner = `w{pos}`. */
function playedRound(
  round: KnockoutMatch['round'],
  matchday: number,
  count: number,
): KnockoutMatch[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${round}-${i}`,
    homeTeamId: `h${i}`,
    awayTeamId: `a${i}`,
    homeScore: 1,
    awayScore: 0,
    isPlayed: true,
    stage: 'continental',
    round,
    position: i,
    winnerId: `w${i}`,
    loserId: `l${i}`,
  }));
}

describe('avance de rondas continentales', () => {
  it('R16: 8 partidos, matchday 3, empareja ganadores adyacentes de R32', () => {
    const r32 = playedRound('round-of-32', 2, 16);
    const r16 = generateContinentalRoundOf16(r32);
    expect(r16).toHaveLength(8);
    expect(r16.every((m) => m.matchday === 3)).toBe(true);
    expect(r16.every((m) => m.round === 'round-of-16')).toBe(true);
    expect(r16.every((m) => m.stage === 'continental')).toBe(true);
    // pos 0 = ganador(R32 pos0) vs ganador(R32 pos1)
    expect(r16[0].homeTeamId).toBe('w0');
    expect(r16[0].awayTeamId).toBe('w1');
    expect(r16[0].position).toBe(0);
  });

  it('QF: 4 partidos, matchday 4', () => {
    const qf = generateContinentalQuarterFinals(playedRound('round-of-16', 3, 8));
    expect(qf).toHaveLength(4);
    expect(qf.every((m) => m.matchday === 4 && m.round === 'quarter')).toBe(true);
  });

  it('SF: 2 partidos, matchday 5', () => {
    const sf = generateContinentalSemiFinals(playedRound('quarter', 4, 4));
    expect(sf).toHaveLength(2);
    expect(sf.every((m) => m.matchday === 5 && m.round === 'semi')).toBe(true);
  });

  it('Final: 1 partido, matchday 6, ganadores de las 2 semis', () => {
    const final = generateContinentalFinal(playedRound('semi', 5, 2));
    expect(final).not.toBeNull();
    expect(final!.matchday).toBe(6);
    expect(final!.round).toBe('final');
    expect(final!.stage).toBe('continental');
    expect(final!.homeTeamId).toBe('w0');
    expect(final!.awayTeamId).toBe('w1');
  });

  it('guards: ronda incompleta (sin winnerId) no genera la siguiente', () => {
    const r32Sin = Array.from({ length: 16 }, (_, i) => ({
      id: `r32-${i}`,
      homeTeamId: `h${i}`,
      awayTeamId: `a${i}`,
      homeScore: null,
      awayScore: null,
      isPlayed: false,
      stage: 'continental',
      round: 'round-of-32' as const,
      position: i,
    }));
    expect(generateContinentalRoundOf16(r32Sin)).toEqual([]);
    expect(generateContinentalFinal([])).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/core/__tests__/continental.test.ts`
Expected: FAIL — funciones de avance no definidas.

- [ ] **Step 3: Implementación mínima**

Agregar a `src/core/continental.ts`:

```ts
/**
 * Avanza una ronda emparejando ganadores adyacentes: `next[j]` = ganador de
 * `prev` en posición `2j` vs ganador en `2j+1`. Solo genera un partido si AMBOS
 * ganadores están definidos; si falta alguno, se omite (ronda incompleta ⇒ []).
 */
function advanceContinentalRound(
  prev: KnockoutMatch[],
  round: KnockoutMatch['round'],
  matchday: number,
): KnockoutMatch[] {
  const sorted = [...prev].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const matches: KnockoutMatch[] = [];
  for (let j = 0; 2 * j + 1 < sorted.length; j++) {
    const a = sorted[2 * j];
    const b = sorted[2 * j + 1];
    if (a?.winnerId && b?.winnerId) {
      matches.push(newKnockoutMatch(a.winnerId, b.winnerId, round, matchday, j));
    }
  }
  return matches;
}

export function generateContinentalRoundOf16(roundOf32: KnockoutMatch[]): KnockoutMatch[] {
  return advanceContinentalRound(roundOf32, 'round-of-16', 3);
}

export function generateContinentalQuarterFinals(roundOf16: KnockoutMatch[]): KnockoutMatch[] {
  return advanceContinentalRound(roundOf16, 'quarter', 4);
}

export function generateContinentalSemiFinals(quarterFinals: KnockoutMatch[]): KnockoutMatch[] {
  return advanceContinentalRound(quarterFinals, 'semi', 5);
}

export function generateContinentalFinal(semiFinals: KnockoutMatch[]): KnockoutMatch | null {
  return advanceContinentalRound(semiFinals, 'final', 6)[0] ?? null;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/core/__tests__/continental.test.ts`
Expected: PASS.
Run: `npx tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/continental.ts src/core/__tests__/continental.test.ts
git commit -m "feat(continental): avance de rondas R16 → QF → SF → Final"
```

---

### Task 5: Integración end-to-end + acceptance FU-B (peso Elo vivo)

**Files:**
- Test: `src/core/__tests__/continental.test.ts`

**Interfaces:**
- Consumes: todo el módulo `continental.ts` + `getStageImportance` de `../engine` + `useConfigStore` (defaults).
- Produces: solo tests (cierra FU-B con una aserción real: un partido continental generado da `importance ≠ 1`).

- [ ] **Step 1: Escribir el test que falla**

Agregar a `src/core/__tests__/continental.test.ts`:

```ts
import { getStageImportance } from '../engine';
import { useConfigStore } from '../../store/useConfigStore';

describe('continental — integración end-to-end', () => {
  it('55 equipos: corre R64 → Final y produce un único campeón', () => {
    const teams = makeTeams('Europe', 55);
    const base = generateContinentalBracket('Europe', teams);

    const r64 = playAllHomeWins(base.roundOf64);
    const r32 = playAllHomeWins(generateContinentalRoundOf32({ ...base, roundOf64: r64 }));
    expect(r32).toHaveLength(16);
    const r16 = playAllHomeWins(generateContinentalRoundOf16(r32));
    expect(r16).toHaveLength(8);
    const qf = playAllHomeWins(generateContinentalQuarterFinals(r16));
    expect(qf).toHaveLength(4);
    const sf = playAllHomeWins(generateContinentalSemiFinals(qf));
    expect(sf).toHaveLength(2);
    const final = generateContinentalFinal(sf);
    expect(final).not.toBeNull();
    // El campeón sale de un cruce válido de semifinalistas.
    expect(final!.homeTeamId).not.toBe(final!.awayTeamId);
  });
});

describe('FU-B: los pesos Elo continentales están vivos', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('un partido continental generado da importance ≠ 1 (early y late)', () => {
    const cfg = useConfigStore.getState().config;
    const base = generateContinentalBracket('Asia', makeTeams('Asia', 55));

    // R64 → temprana (0.9)
    const r64Match = base.roundOf64[0];
    expect(getStageImportance(r64Match.stage, r64Match.round, cfg)).toBe(0.9);
    expect(getStageImportance(r64Match.stage, r64Match.round, cfg)).not.toBe(1);

    // Final → tardía (1.2)
    const sf = [
      { round: 'semi', winnerId: 'w0', position: 0 },
      { round: 'semi', winnerId: 'w1', position: 1 },
    ].map((m, i) => ({
      id: `sf-${i}`,
      homeTeamId: `h${i}`,
      awayTeamId: `a${i}`,
      homeScore: 1,
      awayScore: 0,
      isPlayed: true,
      stage: 'continental',
      round: m.round as KnockoutMatch['round'],
      position: m.position,
      winnerId: m.winnerId,
    }));
    const final = generateContinentalFinal(sf)!;
    expect(getStageImportance(final.stage, final.round, cfg)).toBe(1.2);
  });
});
```

Añadir `beforeEach` al import de vitest si no está: `import { describe, it, expect, beforeEach } from 'vitest';`.

- [ ] **Step 2: Correr el test y verificar que falla o pasa según corresponda**

Run: `npx vitest run src/core/__tests__/continental.test.ts`
Expected: los tests nuevos corren; si el import de `beforeEach` faltaba, primero FALLA por referencia no definida, luego PASA al agregarlo. (El resto del módulo ya existe, así que estos tests validan integración, no piden código nuevo.)

- [ ] **Step 3: Sin implementación nueva**

Este task es solo de cobertura/acceptance; no agrega código a `continental.ts`. Si algún assert falla, es un bug real de las tareas previas → corregir el módulo, no el test.

- [ ] **Step 4: Correr toda la suite + tsc**

Run: `npx vitest run`
Expected: toda la suite en verde (incluye la del ciclo previa).
Run: `npx tsc -b --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/core/__tests__/continental.test.ts
git commit -m "test(continental): integración end-to-end + acceptance FU-B (peso Elo vivo)"
```

---

## Notas de cierre (para el review final de rama)

- **FU-B queda cerrado** por el acceptance de la Task 5 (partido continental ⇒ `importance ≠ 1`).
- **Diferido a Plan 5:** `ContinentalView` (render R64 reutilizando `BracketLine`/`KnockoutView`), guards del store, transiciones de fase, simulación real (sede neutral + penales vía `simulateMatchWithPenalties(..., importance)`), y cableado de `championId`/`runnerUpId` desde la final.
- **FU-A (config migrate test) y FU-C (narrow de `match.round`)** siguen abiertos, sin tocarse en este plan.
- El módulo es puro: cualquier `import` de React/Zustand/Supabase en `continental.ts` es un defecto bloqueante.
