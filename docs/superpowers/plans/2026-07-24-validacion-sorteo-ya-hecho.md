# Validación de sorteo ya hecho — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir que una acción de sorteo se ejecute cuando su producto ya existe, y hacer que la escritura del sorteo sea idempotente para que ni un doble disparo pueda duplicar partidos en la base.

**Architecture:** Tres capas independientes. (1) Helpers puros en `src/utils/cycleProgress.ts` que responden "¿esto ya está sorteado?" y "¿quedó a medias?". (2) Guards en las acciones del store, que es donde se escribe, más un candado global `isDrawing` contra el doble clic. (3) Borrado antes de escribir en la capa de persistencia, como red de seguridad. La UI consume los helpers y expone un "Rehacer sorteo" explícito con confirmación.

**Tech Stack:** React 19 + TypeScript, Zustand, Supabase (esquema normalizado), Vitest + Testing Library, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-24-validacion-sorteo-ya-hecho-design.md`

## Global Constraints

- Todo el texto visible al usuario va en español rioplatense (voseo: "Usá", "Generá"). Los identificadores de código, en inglés, como el resto del repo.
- **La tipografía arcade (`font-arcade`, Press Start 2P) no tiene mayúsculas acentuadas.** Ningún texto en `font-arcade` ni con `uppercase` puede contener vocales acentuadas o Ñ. Los títulos de `ConfirmDialog` son `font-arcade uppercase`: escribirlos sin acentos.
- El tab bar móvil topea en 6 caracteres por etiqueta.
- No se crean migraciones de base de datos: el esquema ya tiene los `ON DELETE CASCADE` necesarios.
- Verificar la suite **sin `tail`**: `npm test 2>&1 | tail -N` devuelve el exit code de `tail` y esconde el resumen. Usar el comando exacto que indica cada tarea.
- Los ids de los partidos siguen siendo `nanoid()`. No se convierten en determinísticos.
- Commits en español, en imperativo, con prefijo `feat:` / `fix:` / `test:` / `refactor:`.

---

## File Structure

| Archivo | Responsabilidad | Tarea |
|---|---|---|
| `src/utils/cycleProgress.ts` | Helpers puros: `isQualifiersDrawn`, `getQualifiersDrawStatus` | 1 |
| `src/utils/__tests__/cycleProgress.test.ts` | Tests de los helpers | 1 |
| `src/types/index.ts` | Firma de `generateDrawAndFixtures` y campo `isDrawing` | 2, 3 |
| `src/store/useTournamentStore.ts` | Guards, candado y borrado antes de escribir | 2, 3, 4 |
| `src/store/__tests__/useTournamentStore.drawGuards.test.ts` | Tests de guards, idempotencia y re-entrada | 2, 3, 4 |
| `src/components/tournament/TournamentWizard.tsx` | Botón "Rehacer sorteo", aviso de sorteo parcial, helper único | 5 |
| `src/components/tournament/__tests__/TournamentWizard.test.tsx` | Tests de la UI | 5 |

---

### Task 1: Helpers de estado del sorteo de clasificatorias

**Files:**
- Modify: `src/utils/cycleProgress.ts` (agregar al final del bloque de helpers, después de la línea 39)
- Test: `src/utils/__tests__/cycleProgress.test.ts`

**Interfaces:**
- Consumes: el tipo `Cycle` de `src/types` y `Group` (`{ id, name, region, teamIds, matches, standings, letterAssignments?, isDrawComplete? }`).
- Produces:
  - `isQualifiersDrawn(cycle: Cycle): boolean`
  - `type QualifiersDrawStatus = { state: 'not-drawn' } | { state: 'partial'; groupsMissing: number; totalGroups: number; regionsMissing: number } | { state: 'drawn' }`
  - `getQualifiersDrawStatus(cycle: Cycle): QualifiersDrawStatus`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `src/utils/__tests__/cycleProgress.test.ts`, dentro del archivo pero **fuera** del `describe('cycleProgress')` existente. También hay que ampliar el import de la línea 2-8 para incluir `isQualifiersDrawn` y `getQualifiersDrawStatus`, y agregar `import type { Group, Match, Region } from '../../types';`.

```ts
/** Grupo de clasificatorias armado a mano: `matches` en 0 = sorteado a medias. */
function makeGroup(
  id: string,
  region: Region,
  opts: { teams?: number; matches?: number } = {}
): Group {
  const teamCount = opts.teams ?? 5;
  const teamIds = Array.from({ length: teamCount }, (_, i) => `${id}-t${i}`);
  const matches: Match[] = Array.from({ length: opts.matches ?? 0 }, (_, i) => ({
    id: `${id}-m${i}`,
    homeTeamId: teamIds[0],
    awayTeamId: teamIds[1] ?? teamIds[0],
    homeScore: null,
    awayScore: null,
    isPlayed: false,
    stage: 'qualifier',
    matchday: i + 1,
  }));
  return {
    id,
    name: `Group ${id}`,
    region,
    teamIds,
    matches,
    standings: [],
    isDrawComplete: matches.length > 0,
  };
}

/** Ciclo con las cuatro regiones pobladas por la función que se le pase. */
function cycleWithQualifiers(build: (region: Region) => Group[]) {
  return {
    ...toCycle(baseTournament()),
    qualifiers: {
      Europe: build('Europe'),
      America: build('America'),
      Africa: build('Africa'),
      Asia: build('Asia'),
    },
  };
}

describe('isQualifiersDrawn / getQualifiersDrawStatus', () => {
  it('ciclo nuevo: sin sortear', () => {
    const cycle = toCycle(baseTournament());
    expect(isQualifiersDrawn(cycle)).toBe(false);
    expect(getQualifiersDrawStatus(cycle)).toEqual({ state: 'not-drawn' });
  });

  it('grupos creados pero sin partidos: sigue sin sortear', () => {
    const cycle = cycleWithQualifiers((r) => [makeGroup(`${r}-1`, r, { teams: 0 })]);
    expect(isQualifiersDrawn(cycle)).toBe(false);
    expect(getQualifiersDrawStatus(cycle)).toEqual({ state: 'not-drawn' });
  });

  it('todas las regiones con partidos: sorteado', () => {
    const cycle = cycleWithQualifiers((r) => [
      makeGroup(`${r}-1`, r, { matches: 20 }),
      makeGroup(`${r}-2`, r, { matches: 20 }),
    ]);
    expect(isQualifiersDrawn(cycle)).toBe(true);
    expect(getQualifiersDrawStatus(cycle)).toEqual({ state: 'drawn' });
  });

  it('un grupo sin partidos entre otros sorteados: parcial', () => {
    const cycle = cycleWithQualifiers((r) => [
      makeGroup(`${r}-1`, r, { matches: 20 }),
      makeGroup(`${r}-2`, r, { matches: r === 'Asia' ? 0 : 20 }),
    ]);
    expect(isQualifiersDrawn(cycle)).toBe(true);
    expect(getQualifiersDrawStatus(cycle)).toEqual({
      state: 'partial',
      groupsMissing: 1,
      totalGroups: 8,
      regionsMissing: 0,
    });
  });

  it('una región entera sin grupos: parcial', () => {
    const cycle = cycleWithQualifiers((r) =>
      r === 'Africa' ? [] : [makeGroup(`${r}-1`, r, { matches: 20 })]
    );
    expect(getQualifiersDrawStatus(cycle)).toEqual({
      state: 'partial',
      groupsMissing: 0,
      totalGroups: 3,
      regionsMissing: 1,
    });
  });

  it('un grupo sorteado sin equipos no cuenta como sano', () => {
    const cycle = cycleWithQualifiers((r) => [
      makeGroup(`${r}-1`, r, { matches: 20 }),
      makeGroup(`${r}-2`, r, { teams: 0, matches: 20 }),
    ]);
    expect(getQualifiersDrawStatus(cycle)).toMatchObject({
      state: 'partial',
      groupsMissing: 4,
    });
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/utils/__tests__/cycleProgress.test.ts`
Expected: FAIL — el módulo no exporta `isQualifiersDrawn` ni `getQualifiersDrawStatus`.

- [ ] **Step 3: Implementar los helpers**

En `src/utils/cycleProgress.ts`, cambiar el import de la línea 1 a `import type { Cycle, Region } from '../types';` y agregar después de la línea 39 (tras `isConfederationsDrawn`):

```ts
const QUALIFIER_REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

/** ¿Ya se sortearon las clasificatorias? (algún grupo con partidos generados). */
export function isQualifiersDrawn(cycle: Cycle): boolean {
  return QUALIFIER_REGIONS.some((region) =>
    (cycle.qualifiers[region] ?? []).some((group) => group.matches.length > 0)
  );
}

/**
 * Estado del sorteo de clasificatorias, distinguiendo el caso "quedó a medias".
 *
 * El guardado escribe las cuatro regiones en paralelo, así que un fallo de red
 * puede dejar unas persistidas y otras no. Al recargar, la base vuelve a ser la
 * fuente de verdad y ese residuo aparece como grupos sin partidos (o como una
 * región entera sin grupos).
 */
export type QualifiersDrawStatus =
  | { state: 'not-drawn' }
  | { state: 'partial'; groupsMissing: number; totalGroups: number; regionsMissing: number }
  | { state: 'drawn' };

export function getQualifiersDrawStatus(cycle: Cycle): QualifiersDrawStatus {
  const groups = QUALIFIER_REGIONS.flatMap((region) => cycle.qualifiers[region] ?? []);
  const totalGroups = groups.length;
  // Un grupo está sano cuando el sorteo le asignó equipos Y le generó partidos.
  const healthy = groups.filter(
    (group) => group.teamIds.length > 0 && group.matches.length > 0
  ).length;
  const regionsMissing = QUALIFIER_REGIONS.filter(
    (region) => (cycle.qualifiers[region] ?? []).length === 0
  ).length;

  if (healthy === 0) return { state: 'not-drawn' };
  if (healthy === totalGroups && regionsMissing === 0) return { state: 'drawn' };
  return { state: 'partial', groupsMissing: totalGroups - healthy, totalGroups, regionsMissing };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/utils/__tests__/cycleProgress.test.ts`
Expected: PASS, 12 tests (6 previos + 6 nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/utils/cycleProgress.ts src/utils/__tests__/cycleProgress.test.ts
git commit -m "feat: helpers para detectar sorteo de clasificatorias hecho o a medias"
```

---

### Task 2: Guard y borrado idempotente en el sorteo de clasificatorias

**Files:**
- Modify: `src/types/index.ts:148`
- Modify: `src/store/useTournamentStore.ts:1756-1923` (`generateDrawAndFixtures`)
- Test: `src/store/__tests__/useTournamentStore.drawGuards.test.ts` (crear)

**Interfaces:**
- Consumes: `isQualifiersDrawn(cycle)` de la Task 1; `normalizedQualifiersService.deleteQualifierData(tournamentId: string): Promise<void>` (ya existe, `src/services/normalizedQualifiersService.ts:220`).
- Produces: `generateDrawAndFixtures(options?: { force?: boolean }): Promise<void>` — sin `force` no hace nada si ya está sorteado; con `force` borra y regenera. La Task 5 llama a la variante con `force`.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/store/__tests__/useTournamentStore.drawGuards.test.ts`. Los mocks siguen el patrón de `useTournamentStore.init.test.ts`: `vi.hoisted` + `vi.mock` antes del `await import` del store.

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Cycle, Group, Match, Region, Team } from '../../types';

const {
  isSupabaseConfigured,
  saveTournament,
  saveCycleState,
  createQualifierGroups,
  deleteQualifierData,
} = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn(() => true),
  saveTournament: vi.fn(async () => {}),
  saveCycleState: vi.fn(async () => {}),
  createQualifierGroups: vi.fn(async () => {}),
  deleteQualifierData: vi.fn(async () => {}),
}));

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured,
  supabase: {},
  escapeOrValue: (v: string) => v,
}));

vi.mock('../../services/adaptiveTournamentService', () => ({
  adaptiveTournamentService: {
    getLatestTournament: vi.fn(),
    getTournamentsList: vi.fn(),
    loadTournament: vi.fn(),
    saveTournament,
    deleteTournament: vi.fn(),
  },
}));

vi.mock('../../services/cycleStateService', () => ({
  cycleStateService: { loadCycleState: vi.fn(), saveCycleState },
}));

vi.mock('../../services/cycleMatchHistory', () => ({
  buildMatchParams: vi.fn(),
  backfillCycleMatchHistory: vi.fn(async () => 0),
}));

vi.mock('../../services/normalizedQualifiersService', () => ({
  normalizedQualifiersService: { createQualifierGroups, deleteQualifierData },
}));

vi.mock('../../services/teamsService', () => ({
  teamsService: {
    getAllTeams: vi.fn(async () => []),
    batchUpdateTeams: vi.fn(),
    updateTeam: vi.fn(async () => {}),
  },
}));

const { useTournamentStore } = await import('../useTournamentStore');
const { toCycle } = await import('../../core/cycle');
const { baseTournament } = await import('../../test/fixtures/cycle');

const REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

function makeTeams(): Team[] {
  return REGIONS.flatMap((region) =>
    Array.from({ length: 5 }, (_, i) => ({
      id: `${region}-t${i}`,
      name: `${region} ${i}`,
      flag: '🏳️',
      region,
      skill: 90 - i,
    }))
  );
}

/** Un grupo por región; `matches` en 0 = grupo creado pero sin sortear. */
function makeQualifiers(matchesPerGroup: number): Record<Region, Group[]> {
  const build = (region: Region): Group[] => {
    const teamIds = Array.from({ length: 5 }, (_, i) => `${region}-t${i}`);
    const matches: Match[] = Array.from({ length: matchesPerGroup }, (_, i) => ({
      id: `${region}-m${i}`,
      homeTeamId: teamIds[0],
      awayTeamId: teamIds[1],
      homeScore: null,
      awayScore: null,
      isPlayed: false,
      stage: 'qualifier',
      matchday: i + 1,
    }));
    return [
      {
        id: `${region}-g1`,
        name: 'Group A',
        region,
        teamIds: matchesPerGroup > 0 ? teamIds : [],
        matches,
        standings: [],
        isDrawComplete: matchesPerGroup > 0,
      },
    ];
  };
  return { Europe: build('Europe'), America: build('America'), Africa: build('Africa'), Asia: build('Asia') };
}

function setUpTournament(matchesPerGroup: number): Cycle {
  const cycle: Cycle = {
    ...toCycle(baseTournament()),
    id: 't-guards',
    qualifiers: makeQualifiers(matchesPerGroup),
    calendar: { phase: 'wc-qualifiers', matchday: 1 },
  };
  useTournamentStore.setState({
    teams: makeTeams(),
    tournaments: [cycle],
    currentTournamentId: cycle.id,
    currentTournament: cycle,
    isBatchProcessing: false,
  });
  return cycle;
}

const store = () => useTournamentStore.getState();

describe('generateDrawAndFixtures — guard de sorteo ya hecho', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseConfigured.mockReturnValue(true);
  });

  it('no re-sortea si las clasificatorias ya tienen partidos', async () => {
    const before = setUpTournament(20);

    await store().generateDrawAndFixtures();

    expect(store().currentTournament).toBe(before);
    expect(createQualifierGroups).not.toHaveBeenCalled();
    expect(deleteQualifierData).not.toHaveBeenCalled();
  });

  it('sortea normalmente si todavía no hay partidos', async () => {
    setUpTournament(0);

    await store().generateDrawAndFixtures();

    const europe = store().currentTournament!.qualifiers.Europe;
    expect(europe[0].matches.length).toBe(20);
    expect(createQualifierGroups).toHaveBeenCalledTimes(4);
  });

  it('con force borra el sorteo anterior ANTES de escribir el nuevo', async () => {
    setUpTournament(20);

    await store().generateDrawAndFixtures({ force: true });

    expect(deleteQualifierData).toHaveBeenCalledWith('t-guards');
    expect(createQualifierGroups).toHaveBeenCalledTimes(4);
    // Sin este orden, los partidos viejos (con otros nanoid) sobreviven al
    // upsert y el torneo queda con el doble de partidos.
    expect(deleteQualifierData.mock.invocationCallOrder[0]).toBeLessThan(
      createQualifierGroups.mock.invocationCallOrder[0]
    );
  });

  it('force NO alcanza si ya se jugó algún partido', async () => {
    const cycle = setUpTournament(20);
    useTournamentStore.setState({
      currentTournament: { ...cycle, hasAnyMatchPlayed: true },
      tournaments: [{ ...cycle, hasAnyMatchPlayed: true }],
    });

    await store().generateDrawAndFixtures({ force: true });

    expect(deleteQualifierData).not.toHaveBeenCalled();
    expect(createQualifierGroups).not.toHaveBeenCalled();
  });

  it('el primer sorteo también borra: limpia el residuo de un intento anterior', async () => {
    setUpTournament(0);

    await store().generateDrawAndFixtures();

    expect(deleteQualifierData).toHaveBeenCalledWith('t-guards');
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/store/__tests__/useTournamentStore.drawGuards.test.ts`
Expected: FAIL — el primer test falla porque el sorteo se ejecuta igual, y los de `force` fallan porque `deleteQualifierData` nunca se llama.

- [ ] **Step 3: Cambiar la firma en los tipos**

En `src/types/index.ts`, reemplazar la línea 148:

```ts
  generateDrawAndFixtures: () => void;
```

por:

```ts
  // `force` rehace un sorteo ya existente (borrándolo antes). Sin él, la acción
  // se niega si las clasificatorias ya están sorteadas.
  generateDrawAndFixtures: (options?: { force?: boolean }) => Promise<void>;
```

- [ ] **Step 4: Implementar el guard y el borrado**

En `src/store/useTournamentStore.ts`:

a) Agregar `isQualifiersDrawn` al import de `../utils/cycleProgress`. Si el store todavía no importa de ese módulo, agregar el import junto a los demás (después de la línea 47):

```ts
import { isQualifiersDrawn } from '../utils/cycleProgress';
```

b) Reemplazar la cabecera de la acción (líneas 1756-1773):

```ts
      generateDrawAndFixtures: async (options?: { force?: boolean }) => {
        const force = options?.force ?? false;
        console.log('🎲 generateDrawAndFixtures called', { force });
        const state = get();
        const progress = useProgressStore.getState();

        if (!state.currentTournament) {
          console.error('❌ No current tournament');
          return;
        }

        console.log('✅ Current tournament:', state.currentTournament.id, state.currentTournament.name);

        // Check if any match has been played
        if (state.currentTournament.hasAnyMatchPlayed) {
          console.warn('⚠️ Cannot regenerate - matches already played');
          useToastStore.getState().warning('No se puede regenerar el sorteo: ya se jugaron partidos.');
          return;
        }

        // Guard de "ya sorteado": sin esto, un segundo sorteo genera partidos
        // con nanoid nuevos que se SUMAN a los viejos en la base, porque el
        // upsert por id nunca puede pisarlos.
        if (!force && isQualifiersDrawn(state.currentTournament)) {
          console.warn('⚠️ Cannot draw - qualifiers already drawn');
          useToastStore
            .getState()
            .warning('El sorteo de las clasificatorias ya está hecho. Usá "Rehacer sorteo" para generarlo de nuevo.');
          return;
        }
```

Desde `const regions: Region[] = [...]` (línea 1775) en adelante, la función queda igual.

c) Insertar el borrado en el bloque de persistencia, entre `saveTournament` y el `Promise.all` de regiones (después de la línea 1888, `await adaptiveTournamentService.saveTournament(updatedTournament);`):

```ts
              // Borrado SIEMPRE, no solo con force: los partidos se crean con
              // nanoid nuevo en cada sorteo, así que el upsert por id no puede
              // reemplazar a los del sorteo anterior — solo agregarlos. Borrar
              // primero también limpia el residuo de un intento que se cortó a
              // mitad. El CASCADE de matches_new.qualifier_group_id arrastra
              // planteles y partidos.
              await normalizedQualifiersService.deleteQualifierData(updatedTournament.id);
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npx vitest run src/store/__tests__/useTournamentStore.drawGuards.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Verificar tipos y suite completa**

Run: `npx tsc -b && npm test`
Expected: `tsc` sin salida; la suite termina con `Test Files  N passed` y `Tests  N passed`, sin `failed`. Si `TournamentWizard.tsx` da un error de tipos por el `await generateDrawAndFixtures()`, no es un fallo: ese `await` ya existía y ahora tipa correctamente.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/store/useTournamentStore.ts src/store/__tests__/useTournamentStore.drawGuards.test.ts
git commit -m "fix: no re-sortear clasificatorias ya sorteadas y borrar antes de escribir"
```

---

### Task 3: Candado global contra sorteos simultáneos

**Files:**
- Modify: `src/types/index.ts:126` (agregar `isDrawing` junto a `isBatchProcessing`)
- Modify: `src/store/useTournamentStore.ts:215` (estado inicial) y `generateDrawAndFixtures`
- Test: `src/store/__tests__/useTournamentStore.drawGuards.test.ts`

**Interfaces:**
- Produces: `isDrawing: boolean` en `TournamentState`. Lo **setean** las acciones de sorteo asíncronas (`generateDrawAndFixtures` en esta tarea; `advanceToWorldCup`, `advanceToKnockout` y `regenerateWorldCupDrawAndFixtures` en la Task 4). Lo **leen** todas las acciones de sorteo, incluidas las síncronas (`drawContinental`, `drawConfederations`), que no necesitan setearlo porque no ceden el control.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `src/store/__tests__/useTournamentStore.drawGuards.test.ts`:

```ts
describe('candado isDrawing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseConfigured.mockReturnValue(true);
  });

  it('dos sorteos disparados a la vez producen uno solo', async () => {
    setUpTournament(0);
    // El guardado se demora para que las dos llamadas se solapen de verdad,
    // que es lo que pasa con un doble clic sobre un botón que tarda segundos.
    createQualifierGroups.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 20))
    );

    await Promise.all([
      store().generateDrawAndFixtures(),
      store().generateDrawAndFixtures(),
    ]);

    expect(createQualifierGroups).toHaveBeenCalledTimes(4); // 4 regiones, no 8
  });

  it('libera el candado cuando el sorteo termina', async () => {
    setUpTournament(0);

    await store().generateDrawAndFixtures();

    expect(store().isDrawing).toBe(false);
  });

  it('libera el candado aunque la persistencia falle', async () => {
    setUpTournament(0);
    createQualifierGroups.mockRejectedValue(new Error('sin red'));

    await store().generateDrawAndFixtures();

    expect(store().isDrawing).toBe(false);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/store/__tests__/useTournamentStore.drawGuards.test.ts -t "candado"`
Expected: FAIL — `createQualifierGroups` se llama 8 veces y `store().isDrawing` es `undefined`.

- [ ] **Step 3: Implementar el candado**

a) En `src/types/index.ts`, después de la línea 126 (`isBatchProcessing`):

```ts
  isDrawing: boolean; // Un sorteo en curso: bloquea disparar otro (doble clic)
```

b) En `src/store/useTournamentStore.ts`, después de la línea 215 (`isBatchProcessing: false,`):

```ts
        isDrawing: false,
```

c) En `generateDrawAndFixtures`, agregar la lectura del candado justo después del guard de `isQualifiersDrawn` de la Task 2:

```ts
        if (state.isDrawing) {
          console.warn('⛔ Ya hay un sorteo en curso');
          return;
        }
```

d) Tomar el candado al abrir el `try` y soltarlo en un `finally`. El bloque `try { ... } catch { ... }` que arranca en la línea 1779 pasa a:

```ts
        set({ isDrawing: true });
        try {
          progress.startProgress('Generando sorteo y fixtures', totalSteps);
          // ... cuerpo sin cambios ...
        } catch (error) {
          progress.resetProgress();
          console.error('❌ Error in generateDrawAndFixtures:', error);
          // No relanzar: handleGenerateDraw no captura, y propagar aquí
          // generaba un "Uncaught (in promise)".
          useToastStore.getState().error('No se pudo generar el sorteo.');
        } finally {
          // Sin el finally, un error dejaba el candado tomado para siempre y
          // ningún sorteo posterior volvía a correr en esa sesión.
          set({ isDrawing: false });
        }
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/store/__tests__/useTournamentStore.drawGuards.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/store/useTournamentStore.ts src/store/__tests__/useTournamentStore.drawGuards.test.ts
git commit -m "fix: candado isDrawing para que el doble clic no duplique el sorteo"
```

---

### Task 4: Guards en las demás acciones de sorteo

**Files:**
- Modify: `src/store/useTournamentStore.ts` — `advanceToWorldCup` (1406), `advanceToWorldCupWithManualDraw` (1356), `advanceToKnockout` (1549), `regenerateWorldCupDrawAndFixtures` (1616), `drawContinental` (2373), `drawConfederations` (2456)
- Test: `src/store/__tests__/useTournamentStore.drawGuards.test.ts`

**Interfaces:**
- Consumes: `isContinentalDrawn(cycle)` e `isConfederationsDrawn(cycle)` de `src/utils/cycleProgress.ts:32-38`; `normalizedWorldCupService.deleteWorldCupData(id)` y `.deleteKnockoutData(id)` (`src/services/normalizedWorldCupService.ts:338,396`).

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `src/store/__tests__/useTournamentStore.drawGuards.test.ts`. Requiere dos mocks más — agregarlos al bloque `vi.hoisted` del principio del archivo (`createWorldCupGroups`, `deleteWorldCupData`, `createKnockoutMatch`, `deleteKnockoutData`, `deleteWorldCupMatchHistory`) y el `vi.mock` correspondiente junto a los otros:

```ts
vi.mock('../../services/normalizedWorldCupService', () => ({
  normalizedWorldCupService: {
    createWorldCupGroups,
    deleteWorldCupData,
    createKnockoutMatch,
    deleteKnockoutData,
    deleteWorldCupMatchHistory,
  },
}));
```

```ts
import { makeDrawnContinentalCycle, makeDrawnConfedCycle } from '../../test/fixtures/cycle';

describe('guards del resto de los sorteos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isSupabaseConfigured.mockReturnValue(true);
  });

  it('advanceToWorldCup no re-sortea un Mundial ya existente', async () => {
    const cycle = setUpTournament(20);
    const withWorldCup: Cycle = {
      ...cycle,
      worldCup: {
        groups: [{ id: 'wc-g1', name: 'Grupo A', teamIds: ['a', 'b', 'c', 'd'], matches: [], standings: [] }],
        knockout: {
          roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [],
          thirdPlace: null, final: null,
        },
        qualifiedTeamIds: [],
      },
    };
    useTournamentStore.setState({ currentTournament: withWorldCup, tournaments: [withWorldCup] });

    await store().advanceToWorldCup();

    expect(createWorldCupGroups).not.toHaveBeenCalled();
  });

  it('advanceToKnockout no re-genera unos dieciseisavos existentes', async () => {
    const cycle = setUpTournament(20);
    const withKnockout: Cycle = {
      ...cycle,
      worldCup: {
        groups: [],
        knockout: {
          roundOf32: [
            { id: 'ko-1', homeTeamId: 'a', awayTeamId: 'b', homeScore: null, awayScore: null, isPlayed: false, round: 'round-of-32' },
          ],
          roundOf16: [], quarterFinals: [], semiFinals: [], thirdPlace: null, final: null,
        },
        qualifiedTeamIds: [],
      },
    };
    useTournamentStore.setState({ currentTournament: withKnockout, tournaments: [withKnockout] });

    await store().advanceToKnockout();

    expect(createKnockoutMatch).not.toHaveBeenCalled();
  });

  it('advanceToWorldCupWithManualDraw tampoco re-sortea un Mundial existente', () => {
    const cycle = setUpTournament(20);
    const withWorldCup: Cycle = {
      ...cycle,
      worldCup: {
        groups: [{ id: 'wc-g1', name: 'Grupo A', teamIds: ['a', 'b', 'c', 'd'], matches: [], standings: [] }],
        knockout: {
          roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [],
          thirdPlace: null, final: null,
        },
        qualifiedTeamIds: [],
      },
    };
    useTournamentStore.setState({ currentTournament: withWorldCup, tournaments: [withWorldCup] });

    // 16 grupos de 4 = los 64 que pide la acción, para que el guard sea lo
    // único que la frene.
    const manualGroups = Array.from({ length: 16 }, (_, g) => ({
      id: `manual-${g}`,
      name: `Grupo ${g}`,
      teamIds: Array.from({ length: 4 }, (_, t) => `m-${g}-${t}`),
      matches: [],
      standings: [],
    }));

    store().advanceToWorldCupWithManualDraw(manualGroups);

    expect(createWorldCupGroups).not.toHaveBeenCalled();
    expect(store().currentTournament).toBe(withWorldCup);
  });

  it('drawContinental no re-sortea un bracket ya sorteado', () => {
    const { cycle, teams } = makeDrawnContinentalCycle();
    useTournamentStore.setState({
      currentTournament: cycle, tournaments: [cycle], currentTournamentId: cycle.id, teams,
    });

    store().drawContinental();

    expect(store().currentTournament).toBe(cycle);
  });

  it('drawConfederations no re-sortea grupos ya sorteados', () => {
    const { cycle, teams } = makeDrawnConfedCycle();
    const done: Cycle = { ...cycle, continental: { ...cycle.continental, isComplete: true } };
    useTournamentStore.setState({
      currentTournament: done, tournaments: [done], currentTournamentId: done.id, teams,
    });

    store().drawConfederations();

    expect(store().currentTournament).toBe(done);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/store/__tests__/useTournamentStore.drawGuards.test.ts -t "guards del resto"`
Expected: FAIL en los cuatro: las acciones se ejecutan igual y modifican el estado.

- [ ] **Step 3: Agregar los guards**

a) `advanceToWorldCup` (después del check de `!state.currentTournament`, línea 1413):

```ts
        // El Mundial ya sorteado se rehace desde regenerateWorldCupDrawAndFixtures,
        // que borra antes de escribir. Volver a pasar por acá duplicaría grupos
        // y partidos en la base.
        if (state.currentTournament.worldCup && state.currentTournament.worldCup.groups.length > 0) {
          console.warn('⚠️ Cannot advance - World Cup already drawn');
          useToastStore
            .getState()
            .warning('El Mundial ya está sorteado. Usá "Regenerar sorteo del Mundial" si querés rehacerlo.');
          return;
        }

        if (state.isDrawing) {
          console.warn('⛔ Ya hay un sorteo en curso');
          return;
        }
```

Además, tomar y soltar el candado: `set({ isDrawing: true });` justo antes del `try` de la línea 1417, y agregar `finally { set({ isDrawing: false }); }` al `try/catch` que cierra en la línea 1544 (el `catch` existente relanza el error; el `finally` corre igual).

Y el borrado idempotente, reemplazando el bloque de persistencia (líneas 1526-1530):

```ts
          if (isSupabaseConfigured()) {
            // Red de seguridad: si quedó basura de un intento anterior, se va
            // antes de escribir. Sin esto, los grupos viejos (con otros ids)
            // conviven con los nuevos.
            await normalizedWorldCupService.deleteWorldCupData(state.currentTournament.id);
            await normalizedWorldCupService.createWorldCupGroups(state.currentTournament.id, worldCupGroups);
            console.log('✅ World Cup groups and matches saved to database');
          }
```

b) `advanceToWorldCupWithManualDraw` (después del check de `!state.currentTournament`, línea 1361), mismo guard sin candado (es síncrona):

```ts
        if (state.currentTournament.worldCup && state.currentTournament.worldCup.groups.length > 0) {
          console.warn('⚠️ Cannot advance - World Cup already drawn');
          useToastStore
            .getState()
            .warning('El Mundial ya está sorteado. Usá "Regenerar sorteo del Mundial" si querés rehacerlo.');
          return;
        }

        if (state.isDrawing) {
          console.warn('⛔ Ya hay un sorteo en curso');
          return;
        }
```

c) `advanceToKnockout` (después de `if (!state.currentTournament?.worldCup) return;`, línea 1553):

```ts
        // La UI ya esconde el botón cuando la ronda existe, pero el guard va
        // acá: es donde se escribe.
        if (state.currentTournament.worldCup.knockout.roundOf32.length > 0) {
          console.warn('⚠️ Cannot advance - knockout already generated');
          useToastStore.getState().warning('Los dieciseisavos ya están generados.');
          return;
        }

        if (state.isDrawing) {
          console.warn('⛔ Ya hay un sorteo en curso');
          return;
        }
```

Tomar el candado con `set({ isDrawing: true });` antes del `try` de la línea 1555 y soltarlo en un `finally { set({ isDrawing: false }); }`. Y el borrado idempotente antes del `Promise.all` de `createKnockoutMatch` (línea 1578):

```ts
              await normalizedWorldCupService.deleteKnockoutData(state.currentTournament.id);
```

d) `regenerateWorldCupDrawAndFixtures` (después del check de `!state.currentTournament?.worldCup`, línea 1621):

```ts
        if (state.isDrawing) {
          console.warn('⛔ Ya hay un sorteo en curso');
          return;
        }
```

Esta acción ya borra antes de escribir; solo le falta el candado. El cuerpo no tiene un `try` que lo envuelva entero, así que hay que agregarlo. Concretamente: después del guard de `hasWorldCupMatchPlayed || hasKnockoutMatchPlayed` (que termina en la línea 1648 con su `return`), el resto de la función —desde `console.log('🗑️ Deleting existing World Cup data from database...')` hasta `console.log('✅ regenerateWorldCupDrawAndFixtures completed');`, la última línea antes del `}` que cierra la acción— queda envuelto así:

```ts
        set({ isDrawing: true });
        try {
          console.log('🗑️ Deleting existing World Cup data from database...');
          // ... todo el cuerpo actual, sin cambios, hasta:
          console.log('✅ regenerateWorldCupDrawAndFixtures completed');
        } finally {
          set({ isDrawing: false });
        }
```

**No agregar un `catch`**: los `throw` actuales tienen que seguir propagando para que el `ConfirmDialog` no se cierre como si la regeneración hubiera funcionado (ver el contrato de errores en `src/components/ui/ConfirmDialog.tsx:29-35`). El `finally` corre igual cuando el error se propaga, que es justamente lo que se necesita: sin él, un fallo de red dejaría el candado tomado para el resto de la sesión.

Los `return` tempranos que ya existen dentro de ese tramo (el de "se esperaban 64 equipos") quedan dentro del `try`, así que el `finally` también los cubre.

e) `drawContinental` (después de `if (!cycle) return;`, línea 2376):

```ts
        if (isContinentalDrawn(cycle)) {
          console.warn('⚠️ Cannot draw - continental already drawn');
          useToastStore.getState().warning('Los torneos continentales ya están sorteados.');
          return;
        }

        if (state.isDrawing) {
          console.warn('⛔ Ya hay un sorteo en curso');
          return;
        }
```

f) `drawConfederations` (después del check de `!cycle.continental.isComplete`, línea 2464):

```ts
        if (isConfederationsDrawn(cycle)) {
          console.warn('⚠️ Cannot draw - confederations already drawn');
          useToastStore.getState().warning('La Copa Confederaciones ya está sorteada.');
          return;
        }

        if (state.isDrawing) {
          console.warn('⛔ Ya hay un sorteo en curso');
          return;
        }
```

g) Ampliar el import de `../utils/cycleProgress` en el store para incluir `isContinentalDrawn` e `isConfederationsDrawn`:

```ts
import { isQualifiersDrawn, isContinentalDrawn, isConfederationsDrawn } from '../utils/cycleProgress';
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/store/__tests__/useTournamentStore.drawGuards.test.ts`
Expected: PASS, 13 tests (5 de la Task 2 + 3 de la Task 3 + 5 de esta).

- [ ] **Step 5: Verificar tipos y suite completa**

Run: `npx tsc -b && npm test`
Expected: `tsc` sin salida; la suite sin `failed`. Prestar atención a `PhaseLocked.test.tsx` y `ContinentalView.test.tsx`, que ejercitan estas acciones: si alguno sortea dos veces a propósito, hay que ajustar el test, no el guard.

- [ ] **Step 6: Commit**

```bash
git add src/store/useTournamentStore.ts src/store/__tests__/useTournamentStore.drawGuards.test.ts
git commit -m "fix: guards de sorteo ya hecho en Mundial, playoffs, continental y confed"
```

---

### Task 5: Rehacer el sorteo y aviso de sorteo incompleto en el wizard

**Files:**
- Modify: `src/components/tournament/TournamentWizard.tsx` — imports (1-40), `handleGenerateDraw` (60-74), `mobileAction` (94-113), StepCard de Clasificatorias (333-379), `ConfirmDialog` (553-569), `StepCardProps` (575-584), render de `StepCard` (622-691)
- Test: `src/components/tournament/__tests__/TournamentWizard.test.tsx`

**Interfaces:**
- Consumes: `getQualifiersDrawStatus`, `isQualifiersDrawn` (Task 1); `generateDrawAndFixtures({ force: true })` (Task 2).
- Produces: prop opcional `notice?: React.ReactNode` en `StepCard`, renderizada entre las stats y las actions.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `src/components/tournament/__tests__/TournamentWizard.test.tsx`. Necesita un ciclo con clasificatorias sorteadas; se arma en el archivo:

```ts
import type { Cycle, Group, Match, Region } from '../../../types';

const QUALIFIER_REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

function qualifierGroup(region: Region, index: number, matchCount: number): Group {
  const teamIds = Array.from({ length: 5 }, (_, i) => `${region}-t${i}`);
  const matches: Match[] = Array.from({ length: matchCount }, (_, i) => ({
    id: `${region}-${index}-m${i}`,
    homeTeamId: teamIds[0],
    awayTeamId: teamIds[1],
    homeScore: null,
    awayScore: null,
    isPlayed: false,
    stage: 'qualifier',
    matchday: i + 1,
  }));
  return {
    id: `${region}-g${index}`,
    name: `Group ${index}`,
    region,
    teamIds,
    matches,
    standings: [],
    isDrawComplete: matchCount > 0,
  };
}

/** Ciclo en fase de clasificatorias; `brokenRegion` queda sin partidos. */
function qualifiersCycle(brokenRegion?: Region): Cycle {
  const base = toCycle(baseTournament());
  const qualifiers = Object.fromEntries(
    QUALIFIER_REGIONS.map((r) => [r, [qualifierGroup(r, 1, r === brokenRegion ? 0 : 20)]])
  ) as Cycle['qualifiers'];
  return {
    ...base,
    qualifiers,
    continental: { ...base.continental, isComplete: true },
    confederationsCup: { ...base.confederationsCup, isComplete: true },
    calendar: { phase: 'wc-qualifiers', matchday: 1 },
  };
}

describe('TournamentWizard — sorteo de clasificatorias', () => {
  it('con el sorteo hecho ofrece rehacerlo y no ofrece empezar', () => {
    useTournamentStore.setState({ currentTournament: qualifiersCycle(), teams: [] });
    renderWizard();

    expect(screen.getByRole('button', { name: /rehacer sorteo/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /empezar/i })).not.toBeInTheDocument();
  });

  it('sin sorteo ofrece empezar y no ofrece rehacer', () => {
    const cycle = qualifiersCycle();
    const empty = {
      ...cycle,
      qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
    } as Cycle;
    useTournamentStore.setState({ currentTournament: empty, teams: [] });
    renderWizard();

    expect(screen.getByRole('button', { name: /empezar/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rehacer sorteo/i })).not.toBeInTheDocument();
  });

  it('sorteo incompleto: lo avisa en la tarjeta', () => {
    useTournamentStore.setState({ currentTournament: qualifiersCycle('Asia'), teams: [] });
    renderWizard();

    expect(screen.getByText(/sorteo incompleto/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rehacer sorteo/i })).toBeInTheDocument();
  });

  it('con partidos jugados no se puede rehacer', () => {
    const cycle = qualifiersCycle();
    const played: Cycle = {
      ...cycle,
      hasAnyMatchPlayed: true,
      qualifiers: {
        ...cycle.qualifiers,
        Europe: cycle.qualifiers.Europe.map((g) => ({
          ...g,
          matches: g.matches.map((m, i) => (i === 0 ? { ...m, isPlayed: true, homeScore: 1, awayScore: 0 } : m)),
        })),
      },
    };
    useTournamentStore.setState({ currentTournament: played, teams: [] });
    renderWizard();

    expect(screen.queryByRole('button', { name: /rehacer sorteo/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/components/tournament/__tests__/TournamentWizard.test.tsx`
Expected: FAIL — no existe ningún botón "Rehacer sorteo" ni el texto "Sorteo incompleto".

- [ ] **Step 3: Agregar la prop `notice` a StepCard**

En `src/components/tournament/TournamentWizard.tsx`, en `StepCardProps` (línea 575-584) agregar:

```ts
  notice?: React.ReactNode;
```

Agregar `notice` a la desestructuración de `StepCard` (línea 586-595) y renderizarlo entre las stats y las actions (después del bloque `{stats.length > 0 && ...}` que cierra en la línea 683):

```tsx
          {notice && (
            <div className="mb-4 border-2 border-gold bg-night/60 p-3 text-sm text-gold">
              {notice}
            </div>
          )}
```

- [ ] **Step 4: Calcular el estado del sorteo una sola vez**

Ampliar el import de `../../utils/cycleProgress` (líneas 11-22) con `getQualifiersDrawStatus` e `isQualifiersDrawn`.

Agregar, junto a los otros `useMemo` (después del de `qualifierProgress`, línea 120-123):

```tsx
  // Una sola fuente para "¿ya hay fixtures?": antes la condición estaba escrita
  // dos veces (botón móvil y botón de escritorio) con formas distintas, que es
  // justamente cómo se cuela un re-sorteo.
  const qualifiersDrawStatus = useMemo(
    () => (currentTournament ? getQualifiersDrawStatus(currentTournament) : null),
    [currentTournament]
  );
```

Y después de los `const canDraw...` (línea 146):

```tsx
  const qualifiersDrawn = isQualifiersDrawn(currentTournament);
  const qualifiersPartial = qualifiersDrawStatus?.state === 'partial';
  // Rehacer solo mientras no se haya jugado nada: con partidos jugados, ni el
  // guard del store lo permite.
  const canRedrawQualifiers = qualifiersDrawn && !currentTournament.hasAnyMatchPlayed;
```

- [ ] **Step 5: Reemplazar la condición duplicada del botón móvil**

En el bloque `mobileAction`, reemplazar las líneas 106-111:

```tsx
    // Igual que en el StepCard: EMPEZAR solo si los fixtures aún no existen.
    const qualFixturesExist = Object.values(c.qualifiers).some((groups) => groups.some((g) => g.matches.length > 0));
    if (canDrawQualifiers(c) && !qualFixturesExist) return { label: '▶ EMPEZAR', onPress: handleGenerateDraw };
    if (qualFixturesExist && c.calendar.phase === 'wc-qualifiers' && !getQualifierProgress(c).isComplete) {
      return { label: '▶ JUGAR CLASIFICATORIAS', onPress: () => onNavigate?.('qualifiers') };
    }
```

por:

```tsx
    // EMPEZAR solo si los fixtures aún no existen; el helper es el mismo que
    // usa el StepCard y el guard del store.
    const qualFixturesExist = isQualifiersDrawn(c);
    if (canDrawQualifiers(c) && !qualFixturesExist) return { label: '▶ EMPEZAR', onPress: handleGenerateDraw };
    if (qualFixturesExist && c.calendar.phase === 'wc-qualifiers' && !getQualifierProgress(c).isComplete) {
      return { label: '▶ JUGAR CLASIFICATORIAS', onPress: () => onNavigate?.('qualifiers') };
    }
```

- [ ] **Step 6: Agregar el estado y el manejador de "rehacer"**

Junto a `confirmRegenWorldCup` (línea 58):

```tsx
  const [confirmRedrawQualifiers, setConfirmRedrawQualifiers] = useState(false);
```

Y después de `handleGenerateDraw` (línea 74):

```tsx
  const handleRedrawQualifiers = async () => {
    await generateDrawAndFixtures({ force: true });
    toast.success('Sorteo de clasificatorias rehecho');
  };
```

- [ ] **Step 7: Cablear la tarjeta de Clasificatorias**

Reemplazar el `actions` del StepCard de Clasificatorias (líneas 359-378) y agregarle el `notice`:

```tsx
            notice={
              qualifiersDrawStatus?.state === 'partial' ? (
                <>
                  Sorteo incompleto:{' '}
                  {qualifiersDrawStatus.regionsMissing > 0
                    ? qualifiersDrawStatus.regionsMissing === 1
                      ? 'falta una región entera'
                      : `faltan ${qualifiersDrawStatus.regionsMissing} regiones enteras`
                    : `faltan partidos en ${qualifiersDrawStatus.groupsMissing} de ${qualifiersDrawStatus.totalGroups} grupos`}
                  . Rehacé el sorteo para completarlo.
                </>
              ) : undefined
            }
            actions={
              canAdvanceQual ? (
                <Button variant="primary" size="lg" onClick={handleAdvanceToQualifiers} className="gap-2">
                  ⚽ Ir a Clasificatorias
                </Button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {canGenerateDraw && !qualifiersDrawn && (
                    // EMPEZAR solo para la GENERACIÓN inicial. Una vez sorteado,
                    // el store rechaza esta acción sin `force`.
                    <Button size="lg" onClick={handleGenerateDraw} className="hidden lg:inline-flex">
                      ▶ EMPEZAR
                    </Button>
                  )}
                  {qualifiersDrawn && !qualifierProgress.isComplete && (
                    <Button variant="secondary" size="sm" onClick={() => onNavigate?.('qualifiers')} className="gap-2">
                      <Globe2 className="w-4 h-4" />
                      Ver / Jugar
                    </Button>
                  )}
                  {canRedrawQualifiers && (
                    <Button
                      variant={qualifiersPartial ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => setConfirmRedrawQualifiers(true)}
                    >
                      Rehacer sorteo
                    </Button>
                  )}
                </div>
              )
            }
```

- [ ] **Step 8: Agregar el diálogo de confirmación**

Después del `ConfirmDialog` existente (línea 569), antes del `</div>` de cierre:

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

El título va sin acentos a propósito: `ConfirmDialog` lo renderiza en `font-arcade uppercase` y esa tipografía no tiene mayúsculas acentuadas.

- [ ] **Step 9: Correr el test para verificar que pasa**

Run: `npx vitest run src/components/tournament/__tests__/TournamentWizard.test.tsx`
Expected: PASS, 6 tests (2 previos + 4 nuevos).

- [ ] **Step 10: Verificar tipos, suite completa y build**

Run: `npx tsc -b && npm test && npm run build`
Expected: `tsc` sin salida; la suite sin `failed`; el build termina con `built in Xs`.

- [ ] **Step 11: Commit**

```bash
git add src/components/tournament/TournamentWizard.tsx src/components/tournament/__tests__/TournamentWizard.test.tsx
git commit -m "feat: rehacer sorteo de clasificatorias y aviso de sorteo incompleto"
```

---

## Verificación manual (después de la Task 5)

No reemplaza a los tests, pero cierra el ciclo: el bug original solo se veía en la app.

- [ ] `npm run dev` y abrir el Mundial 2042, que está en fase de clasificatorias con el sorteo hecho y sin jugar.
- [ ] Confirmar que el paso 3 muestra "Ver / Jugar" y "Rehacer sorteo", y que **no** muestra "EMPEZAR".
- [ ] Apretar "Rehacer sorteo", confirmar, y verificar en Supabase que siguen siendo 840 partidos y 42 grupos, no 1680 y 84:

```sql
select count(distinct g.id) as grupos, count(m.id) as partidos
from qualifier_groups g
left join matches_new m on m.qualifier_group_id = g.id
where g.tournament_id = 'X9_gm8_k6pQ6clyrfbyom';
```

- [ ] Jugar un partido de clasificatorias y verificar que el botón "Rehacer sorteo" desaparece.
