# Tercer puesto en Torneos Continentales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans. Steps usan checkbox (`- [ ]`).

**Goal:** Agregar un partido por el 3er puesto a cada torneo continental, jugado en la misma jornada que la final (jornada 6), espejando la Copa Confederaciones.

**Architecture:** Aditivo. El 3er puesto empareja los dos perdedores de semifinales; se genera al completarse las semis (md5, junto con la final) y se juega en md6. No alimenta nada aguas abajo (los finalistas que van a Confederaciones siguen siendo campeón+subcampeón). Vive en el estado del ciclo, que ya se persiste vía el blob JSONB `cycle_state` (Plan 6) — sin migración.

**Tech Stack:** TypeScript + Vitest + React (Zustand). Spec: `docs/superpowers/specs/2026-07-21-ciclo-continental-tercer-puesto-design.md`.

## Global Constraints

- **Gate por tarea** = `npx vitest run` (suite completa verde) + `npx tsc -b --noEmit` (exit 0) + `npx eslint <archivos>` (0 errores nuevos). NUNCA `tsc --noEmit` sin `-b` (no-op).
- **Suite base = 140 tests.** Ningún test previo puede quedar rojo.
- NO introducir `any`/`as any` nuevos. eslint flaggea imports/vars/args sin usar aunque tengan prefijo `_`.
- El 3er puesto se juega en **jornada 6** (misma que la final), `round: 'third-place'`.
- **Invariante:** con el 3er puesto, la md6 continental pasa de 4 partidos (4 finales) a **8** (4 finales + 4 terceros puestos); `isCurrentMatchdayComplete` exige los 8 antes de coronar.
- Respuestas/comentarios en español con acentos.

---

## File Structure

- **`src/types/index.ts`** — `ContinentalBracket`: `+ thirdPlace: KnockoutMatch | null`, `+ thirdPlaceId?: string`.
- **`src/core/continental.ts`** — `generateContinentalThirdPlace()`; `generateContinentalBracket` agrega `thirdPlace: null`.
- **`src/core/engine.ts`** — `CONTINENTAL_LATE_ROUNDS += 'third-place'`.
- **`src/core/cycle.ts`** — `emptyBracket` `+thirdPlace:null`; `advanceContinental` (md5 genera 3º, md6 setea `thirdPlaceId`); `replaceContinentalMatch` aplica al 3º; import del generador.
- **`src/core/calendar.ts`** — `bracketMatches` incluye `thirdPlace`.
- **`src/test/fixtures/cycle.ts`** — `playContinentalMatchday`: el flatten incluye `thirdPlace`.
- **`src/store/useTournamentStore.ts`** — `simulateContinentalMatch`: el flatten incluye `thirdPlace`.
- **`src/components/tournament/ContinentalView.tsx`** — columna "3ER PUESTO" + línea "3º".
- **Tests:** `continental.test.ts`, `engine.test.ts`, `cycle.test.ts` (+ actualizar su `playContinentalMatchday` local).

**Tareas:** T1 = core + calendario + fixtures + tests (TDD). T2 = store + UI. Modelos: ambas sonnet; reviewer sonnet; review final opus.

**Nota sobre el acoplamiento del tipo:** `thirdPlace` es `KnockoutMatch | null` (requerido-nullable, como `final`), así que TODOS los literales de `ContinentalBracket` deben setearlo — hay dos: `generateContinentalBracket` (continental.ts) y `emptyBracket` (cycle.ts). Por eso T1 toca ambos (si no, `tsc -b` falla). Los demás sitios hacen spread (`{...b}`) y lo preservan.

---

## Task 1: Motor + orquestación + calendario + fixtures (core, TDD)

**Files:**
- Modify: `src/types/index.ts` (`ContinentalBracket`)
- Modify: `src/core/continental.ts`
- Modify: `src/core/engine.ts:5`
- Modify: `src/core/cycle.ts` (`emptyBracket`, `advanceContinental`, `replaceContinentalMatch`, import)
- Modify: `src/core/calendar.ts` (`bracketMatches`, ~línea 20-29)
- Modify: `src/test/fixtures/cycle.ts` (`playContinentalMatchday`)
- Test: `src/core/__tests__/continental.test.ts`, `src/core/__tests__/engine.test.ts`, `src/core/__tests__/cycle.test.ts`

**Interfaces:**
- Produces: `generateContinentalThirdPlace(semiFinals: KnockoutMatch[]): KnockoutMatch | null`; `ContinentalBracket.thirdPlace: KnockoutMatch | null`; `ContinentalBracket.thirdPlaceId?: string`. Consumidos por T2.

- [ ] **Step 1: Escribir los tests que fallan**

**1a. `src/core/__tests__/continental.test.ts`** — agregar `generateContinentalThirdPlace` al import desde `'../continental'` (junto a `generateContinentalFinal`), y agregar estos tests dentro del `describe('avance de rondas continentales', ...)`, después del test de "Final":

```ts
  it('3er puesto: 1 partido, matchday 6, empareja los perdedores de las 2 semis', () => {
    const third = generateContinentalThirdPlace(playedRound('semi', 5, 2));
    expect(third).not.toBeNull();
    expect(third!.matchday).toBe(6);
    expect(third!.round).toBe('third-place');
    expect(third!.stage).toBe('continental');
    expect(third!.homeTeamId).toBe('l0');
    expect(third!.awayTeamId).toBe('l1');
  });

  it('3er puesto: null si faltan semis', () => {
    expect(generateContinentalThirdPlace([])).toBeNull();
  });
```

**1b. `src/core/__tests__/engine.test.ts`** — en el test que chequea rondas late/early de continental (donde están las aserciones `getStageImportance('continental', 'quarter', cfg())` etc.), agregar:

```ts
    expect(getStageImportance('continental', 'third-place', cfg())).toBe(1.2);
```

**1c. `src/core/__tests__/cycle.test.ts`** — (i) actualizar el helper local `playContinentalMatchday` (el flatten de la línea ~119-122) para incluir `thirdPlace`; (ii) en el test `'corre las 6 jornadas y corona campeón/subcampeón por confederación'`, dentro del `for (const r of ...)`, agregar dos aserciones; (iii) agregar un test nuevo que pruebe la invariante "final sin 3er puesto no corona".

(i) Reemplazar el flatten del helper local:
```ts
    .flatMap((b): KnockoutMatch[] => [
      ...b.roundOf64, ...b.roundOf32, ...b.roundOf16,
      ...b.quarterFinals, ...b.semiFinals,
      ...(b.final ? [b.final] : []),
      ...(b.thirdPlace ? [b.thirdPlace] : []),
    ])
```

(ii) Dentro del `for (const r of ['Europe', 'America', 'Africa', 'Asia'] as Region[])` del test de las 6 jornadas, agregar tras las aserciones existentes:
```ts
      expect(b.thirdPlace?.isPlayed).toBe(true);
      expect(b.thirdPlaceId).toBeTruthy();
      expect(b.thirdPlaceId).not.toBe(b.championId);
```

(iii) Agregar un test nuevo al final del `describe('cycle: continental', ...)`:
```ts
  it('en md6, jugar solo la final (sin 3er puesto) NO corona: jornada incompleta', () => {
    let cycle = drawContinentalStage(toCycle({
      id: 't', name: 'c', year: 2026,
      qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
      worldCup: null, isQualifiersComplete: false, hasAnyMatchPlayed: false,
    }), fullTeamsByRegion());

    // 5 jornadas → md6 generada (final + 3er puesto), nada jugado en md6.
    for (let i = 0; i < 5; i++) cycle = playContinentalMatchday(cycle);
    expect(cycle.calendar).toEqual({ phase: 'continental', matchday: 6 });

    // Jugar SOLO las finales (no los 3er puestos):
    let c = cycle;
    for (const r of ['Europe', 'America', 'Africa', 'Asia'] as Region[]) {
      const f = c.continental.brackets[r].final!;
      c = recordContinentalMatch(c, f.id, {
        homeScore: 1, awayScore: 0, winnerId: f.homeTeamId, loserId: f.awayTeamId,
      });
    }

    expect(c.continental.isComplete).toBe(false); // faltan los 3er puestos
    for (const r of ['Europe', 'America', 'Africa', 'Asia'] as Region[]) {
      expect(c.continental.brackets[r].championId).toBeFalsy();
    }
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/core/__tests__/continental.test.ts src/core/__tests__/engine.test.ts src/core/__tests__/cycle.test.ts`
Expected: FAIL — `generateContinentalThirdPlace` no existe; `third-place` no es late; `thirdPlace`/`thirdPlaceId` no existen.

- [ ] **Step 3: Implementar**

**3a. `src/types/index.ts`** — en `interface ContinentalBracket`, agregar `thirdPlace: KnockoutMatch | null;` inmediatamente después de `final: KnockoutMatch | null;`, y `thirdPlaceId?: string;` inmediatamente después de `runnerUpId?: string;`.

**3b. `src/core/engine.ts:5`** — reemplazar:
```ts
const CONTINENTAL_LATE_ROUNDS: ReadonlyArray<KnockoutMatch['round']> = ['quarter', 'semi', 'final'];
```
por:
```ts
const CONTINENTAL_LATE_ROUNDS: ReadonlyArray<KnockoutMatch['round']> = ['quarter', 'semi', 'third-place', 'final'];
```

**3c. `src/core/continental.ts`** — (i) en el objeto que devuelve `generateContinentalBracket`, agregar `thirdPlace: null,` justo después de `final: null,`. (ii) Agregar, después de `generateContinentalFinal`:
```ts

/**
 * Partido por el 3er puesto: empareja los perdedores de las 2 semifinales
 * (ordenadas por `position`). Jornada 6 (misma que la final). Devuelve null si
 * falta algún perdedor (semis no jugadas).
 */
export function generateContinentalThirdPlace(semiFinals: KnockoutMatch[]): KnockoutMatch | null {
  const sorted = [...semiFinals].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  if (sorted.length < 2) return null;
  const [a, b] = sorted;
  if (!a?.loserId || !b?.loserId) return null;
  return newKnockoutMatch(a.loserId, b.loserId, 'third-place', 6, 0);
}
```

**3d. `src/core/cycle.ts`** — (i) agregar `generateContinentalThirdPlace` al import desde `'./continental'`. (ii) En `emptyBracket`, agregar `thirdPlace: null,` después de `final: null,`. (iii) En `advanceContinental`, reemplazar las ramas md5 y md6:
```ts
    else if (md === 5) brackets[r] = { ...b, final: generateContinentalFinal(b.semiFinals) };
    else if (md === 6) brackets[r] = { ...b, championId: b.final?.winnerId, runnerUpId: b.final?.loserId };
```
por:
```ts
    else if (md === 5) brackets[r] = { ...b, final: generateContinentalFinal(b.semiFinals), thirdPlace: generateContinentalThirdPlace(b.semiFinals) };
    else if (md === 6) brackets[r] = { ...b, championId: b.final?.winnerId, runnerUpId: b.final?.loserId, thirdPlaceId: b.thirdPlace?.winnerId };
```
(iv) En `replaceContinentalMatch`, dentro del objeto `brackets[r] = { ...b, ... }`, agregar la línea de `thirdPlace` justo después de la de `final`:
```ts
      final:
        b.final && b.final.id === matchId
          ? applyResultTo([b.final], matchId, result)[0]
          : b.final,
      thirdPlace:
        b.thirdPlace && b.thirdPlace.id === matchId
          ? applyResultTo([b.thirdPlace], matchId, result)[0]
          : b.thirdPlace,
```

**3e. `src/core/calendar.ts`** — en `bracketMatches`, agregar `thirdPlace` tras `final`:
```ts
function bracketMatches(b: ContinentalBracket): Match[] {
  return [
    ...b.roundOf64,
    ...b.roundOf32,
    ...b.roundOf16,
    ...b.quarterFinals,
    ...b.semiFinals,
    ...(b.final ? [b.final] : []),
    ...(b.thirdPlace ? [b.thirdPlace] : []),
  ];
}
```

**3f. `src/test/fixtures/cycle.ts`** — en `playContinentalMatchday`, actualizar el flatten para incluir `thirdPlace` (si no, la md6 del fixture solo jugaría las finales y `makeContinentalDoneCycle` nunca coronaría):
```ts
    .flatMap((b): KnockoutMatch[] => [
      ...b.roundOf64, ...b.roundOf32, ...b.roundOf16,
      ...b.quarterFinals, ...b.semiFinals,
      ...(b.final ? [b.final] : []),
      ...(b.thirdPlace ? [b.thirdPlace] : []),
    ])
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/core/__tests__/continental.test.ts src/core/__tests__/engine.test.ts src/core/__tests__/cycle.test.ts`
Expected: PASS (los tests nuevos verdes; el test de 6 jornadas ahora juega final+3º y corona).

- [ ] **Step 5: Gate completo**

Run: `npx vitest run && npx tsc -b --noEmit && npx eslint src/types/index.ts src/core/continental.ts src/core/engine.ts src/core/cycle.ts src/core/calendar.ts src/test/fixtures/cycle.ts src/core/__tests__/continental.test.ts src/core/__tests__/engine.test.ts src/core/__tests__/cycle.test.ts`
Expected: suite ≥ 143 verde (140 + ~3 nuevos), tsc exit 0, eslint sin errores nuevos. Verificá que NINGÚN test de confed/5B se rompió (los fixtures `cycleWithContinentalDone`/`makeDrawnConfedCycle` usan finalistas sintéticos y no dependen del 3er puesto).

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/core/continental.ts src/core/engine.ts src/core/cycle.ts src/core/calendar.ts src/test/fixtures/cycle.ts src/core/__tests__/continental.test.ts src/core/__tests__/engine.test.ts src/core/__tests__/cycle.test.ts
git commit -m "feat(core): 3er puesto en torneos continentales (md6, perdedores de semis)"
```

---

## Task 2: Store + UI

**Files:**
- Modify: `src/store/useTournamentStore.ts` (`simulateContinentalMatch`, el flatten que localiza el match, ~línea 2085-2088)
- Modify: `src/components/tournament/ContinentalView.tsx`

**Interfaces:**
- Consumes: `ContinentalBracket.thirdPlace` / `.thirdPlaceId` (T1).

- [ ] **Step 1: Store — incluir `thirdPlace` en el flatten**

En `src/store/useTournamentStore.ts`, dentro de `simulateContinentalMatch`, el array `all` que aplana los brackets para localizar el match debe incluir `thirdPlace`:
```ts
        const all = Object.values(cycle.continental.brackets).flatMap((b): KnockoutMatch[] => [
          ...b.roundOf64, ...b.roundOf32, ...b.roundOf16, ...b.quarterFinals, ...b.semiFinals,
          ...(b.final ? [b.final] : []),
          ...(b.thirdPlace ? [b.thirdPlace] : []),
        ]);
```

- [ ] **Step 2: UI — columna "3ER PUESTO" + línea "3º"**

En `src/components/tournament/ContinentalView.tsx`:

(a) Agregar una columna "3ER PUESTO" inmediatamente **después** de la columna `label="FINAL"` (mismo patrón que la columna FINAL):
```tsx
              <RoundColumn
                label="3ER PUESTO"
                matches={bracket.thirdPlace ? [bracket.thirdPlace] : []}
                cycle={cycle}
                getTeam={getTeam}
                onPlay={handlePlay}
                isSaving={isSavingMatch}
              />
```

(b) Agregar una línea de 3er puesto inmediatamente **después** del bloque `{bracket.championId && (...)}` (mismo patrón que la línea "Campeón", reusando el ícono `Trophy` ya importado y la clase de color `text-grass-soft` ya usada en el archivo para los byes):
```tsx
          {bracket.thirdPlaceId && (
            <div className="mb-4 flex items-center gap-2 text-grass-soft font-arcade text-xs">
              <Trophy className="w-4 h-4" />
              3º: {getTeam(bracket.thirdPlaceId)?.name ?? bracket.thirdPlaceId}
            </div>
          )}
```

- [ ] **Step 3: Gate**

Run: `npx vitest run && npx tsc -b --noEmit && npx eslint src/store/useTournamentStore.ts src/components/tournament/ContinentalView.tsx`
Expected: suite verde (el test existente de `ContinentalView` de 5B sigue pasando — agregar una columna no rompe la aserción de los botones de R64), tsc exit 0, eslint sin errores nuevos (los `no-explicit-any` del store son preexistentes; no agregar nuevos).

- [ ] **Step 4: Commit**

```bash
git add src/store/useTournamentStore.ts src/components/tournament/ContinentalView.tsx
git commit -m "feat(ui): 3er puesto continental jugable en el store + columna en ContinentalView"
```

---

## Self-Review (checklist del autor)

**1. Cobertura del spec:** generador (T1 3c) ✅; Elo late (T1 3b) ✅; orquestación md5/md6 (T1 3d) ✅; calendario (T1 3e) ✅; store (T2 1) ✅; UI (T2 2) ✅; persistencia (sin migración, ya cubierta por Plan 6) ✅.

**2. Placeholder scan:** cada step trae código completo ✅.

**3. Consistencia de tipos:** `generateContinentalThirdPlace(semiFinals): KnockoutMatch | null` usado igual en cycle.ts y el test; `thirdPlace: KnockoutMatch | null` / `thirdPlaceId?: string` consistentes en tipo, constructores, spreads y UI ✅.

**4. Riesgos cubiertos:**
- Los DOS flattens de test que omitían `thirdPlace` (fixture `playContinentalMatchday` + el local de `cycle.test.ts`) se actualizan → la md6 se completa y `makeContinentalDoneCycle` corona ✅.
- El tipo requerido-nullable fuerza actualizar `generateContinentalBracket` + `emptyBracket` (ambos en T1) → `tsc -b` compila ✅.
- `cycleWithContinentalDone`/`makeDrawnConfedCycle` (finalistas sintéticos) no dependen del 3er puesto → confed/5B no se rompen ✅.
