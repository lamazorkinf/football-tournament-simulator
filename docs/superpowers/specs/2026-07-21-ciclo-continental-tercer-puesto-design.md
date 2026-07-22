# Tercer puesto en los Torneos Continentales — Diseño

**Fecha:** 2026-07-21 · **Branch:** `feat/ciclo-continental-confederaciones` · Extiende el spec `2026-07-21-ciclo-continental-confederaciones-calendario-design.md`.

## 1. Objetivo

Agregar un **partido por el 3er puesto** a cada torneo continental. Hoy los continentales son eliminación directa pura (R64 → Final) sin partido de consolación; la Copa Confederaciones y el Mundial sí lo tienen. Este cambio lo empareja.

## 2. Decisión de estructura (aprobada)

El 3er puesto se juega en la **misma jornada que la final (jornada 6)**, espejando la Copa Confederaciones (donde final + 3º comparten la md5).

- Se **genera** al completarse las semifinales (md5), junto con la final.
- Se **juega** en la md6 (final + 3er puesto simultáneos, en las 4 confederaciones).
- Al completar la md6 se corona campeón/subcampeón/**3º** y la fase continental queda completa (boundary: espera el sorteo de Confederaciones, sin cambio).

Alternativa descartada: una jornada 7 separada para el 3er puesto (alargaría la fase a 7 jornadas y desincronizaría del patrón de confed, sin beneficio).

## 3. Participantes y reglas

- Los **dos perdedores de semifinales** (`loserId` de cada semi), en sede neutral, con penales si empatan — idéntico a todos los cruces del ciclo.
- Es **aditivo**: el 3er puesto NO alimenta nada aguas abajo. Los finalistas que pasan a la Copa Confederaciones siguen siendo **campeón + subcampeón** (`assembleConfederationFinalists` no cambia).

## 4. Cambios por capa

- **Tipos** (`src/types/index.ts`, `ContinentalBracket`): `+ thirdPlace: KnockoutMatch | null` y `+ thirdPlaceId?: string` (ganador del 3er puesto, para display; espejo de `championId`/`runnerUpId`).
- **Motor** (`src/core/continental.ts`): `generateContinentalThirdPlace(semiFinals: KnockoutMatch[]): KnockoutMatch | null` — empareja los `loserId` de las 2 semifinales (ordenadas por `position`), `round: 'third-place'`, `matchday: 6`, `position: 0`. Devuelve `null` si faltan perdedores.
- **Elo** (`src/core/engine.ts`): agregar `'third-place'` a `CONTINENTAL_LATE_ROUNDS` para que el 3er puesto pese como semis/final (`continentalLate`) en vez de `continentalEarly`. (Solo afecta la etapa `'continental'`; confed/Mundial usan pesos planos por etapa.)
- **Orquestación** (`src/core/cycle.ts`):
  - `emptyBracket()`: `+ thirdPlace: null`.
  - `advanceContinental()` md5: generar final **y** `thirdPlace = generateContinentalThirdPlace(b.semiFinals)`.
  - `advanceContinental()` md6: `+ thirdPlaceId: b.thirdPlace?.winnerId`.
  - `replaceContinentalMatch()`: aplicar el resultado también a `b.thirdPlace` (por id).
- **Calendario** (`src/core/calendar.ts`): `bracketMatches()` incluye `...(b.thirdPlace ? [b.thirdPlace] : [])`, para que el 3er puesto entre en la md6, gatee `isCurrentMatchdayComplete` y sea `isMatchPlayable`.
- **Store** (`src/store/useTournamentStore.ts`, `simulateContinentalMatch`): el flatten de brackets que localiza el match incluye `thirdPlace`.
- **UI** (`src/components/tournament/ContinentalView.tsx`): columna "3ER PUESTO" (como la de "FINAL") + línea "3º: {equipo}" junto al "Campeón".

## 5. Persistencia

Cero migración nueva: el 3er puesto vive dentro del estado del ciclo que ya se serializa/persiste en el blob JSONB `cycle_state` (Plan 6).

## 6. Completitud de jornada (invariante clave)

Con este cambio, la md6 de la fase continental pasa de 4 partidos (4 finales) a **8** (4 finales + 4 terceros puestos). `isCurrentMatchdayComplete` exige que **todos** estén jugados antes de coronar; `advanceContinental` corona (campeón/subcampeón/3º de las 4 confederaciones) solo cuando la md6 global está completa. `getPhaseMatchdayCount('continental')` sigue siendo 6 (el 3er puesto es md6).

## 7. Testing

- **Motor** (`continental.test.ts`): `generateContinentalThirdPlace` empareja los 2 perdedores de semis, `round: 'third-place'`, `matchday: 6`; devuelve `null` si faltan perdedores.
- **Elo** (`engine.test.ts`): `getStageImportance('continental', 'third-place')` === `continentalLate`.
- **Cycle** (`cycle.test.ts`): al completar md5, cada bracket tiene `final` y `thirdPlace` (ambos md6); al completar md6 (final + 3º jugados), `thirdPlaceId` = ganador del 3er puesto y `continental.isComplete === true`; jugar solo la final (sin el 3º) NO corona (md6 incompleta).
- **Calendario** (`calendar.test.ts`, si aplica): `getMatchdayMatches(cycle, 'continental', 6)` incluye finales + terceros puestos.

## 8. Fuera de alcance

No se toca el flujo de Confederaciones/Mundial ni la selección de finalistas. No se agrega 4º puesto explícito (el perdedor del 3er puesto queda implícito).
