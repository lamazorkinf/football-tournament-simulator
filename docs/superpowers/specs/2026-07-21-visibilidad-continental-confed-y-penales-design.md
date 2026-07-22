# Visibilidad de partidos Continental/Confederaciones + Penales realistas

**Fecha:** 2026-07-21
**Rama:** `feat/ciclo-continental-confederaciones`
**Estado:** Diseño aprobado (alcance confirmado por el usuario)

## Contexto

Tras implementar el ciclo Continental/Confederaciones, el usuario reporta tres defectos y solicita analizar una feature nueva. Esta tanda cubre **solo los tres bugs**; la simulación en vivo (punto 4) se diseña aparte con su propio spec.

## Objetivos

1. **Bug 1 — Comparación de equipos (H2H):** que incluya los partidos de Copa Continental y Copa de Confederaciones, no solo Clasificatorias/Mundial.
2. **Bug 2 — Centro de partidos (Match Center):** que liste los partidos Continental/Confederaciones, con su filtro de etapa.
3. **Bug 3 — Penales realistas:** eliminar marcadores imposibles (5-0, 5-1, 5-2) implementando la "muerte matemática" de la tanda.

## No-objetivos (fuera de alcance)

- Simulación minuto a minuto en tiempo real (punto 4): proyecto aparte.
- Rediseño visual de Match Center o de la comparación.
- Refactor de cómo Match Center obtiene sus datos (sigue leyendo del estado en memoria del ciclo, ver más abajo).

## Causa raíz (evidencia)

**Bugs 1 y 2 — raíz compartida.** Los partidos Continental/Confed viven solo dentro del objeto `Cycle` (`cycle.continental.brackets[Region]` y `cycle.confederationsCup.groups[]/knockout`), persistidos como snapshot JSONB en `tournament_cycle_state`. **Nunca** se escriben en `match_history` ni figuran en `qualifiers`/`worldCup`.

- **Match Center** (`src/components/tournament/MatchCenter.tsx:46-99`): el `useMemo` de `allMatches` solo recorre `tournament.qualifiers` y `tournament.worldCup`. El tipo `MatchStage` (`:23`) y el dropdown de filtro (`:452-461`) tampoco contemplan continental/confed.
- **Comparación H2H** (`src/services/headToHeadService.ts`): fuente primaria `match_history` (`:56-132`), donde esos partidos nunca entran; fallback en memoria (`:137-186`) solo recorre `qualifiers`/`worldCup` y además solo corre sin Supabase (`:199`).
- Las acciones que los simulan (`src/store/useTournamentStore.ts:2090-2147` continental, `:2161-2218` confed) actualizan skills y mutan el JSONB del ciclo, pero **no llaman a `createMatch`** (a diferencia de qualifier/mundial: `:685`, `:942`, `:1855`).
- Refuerzo a nivel DB: `match_history.stage` tiene `CHECK (stage IN ('qualifier','world-cup-group','world-cup-knockout'))` — `supabase/schema.sql:28`.

La intención de diseño original ya contemplaba normalizar el detalle por-partido en `match_history` (comentario en `src/services/cycleStateService.ts:7-11`). Continental/confed simplemente nunca se conectaron.

**Bug 3 — penales.** `src/core/engine.ts:167-191` (`simulatePenalties`, llamada desde `simulateMatchWithPenalties:147-162`). El bucle `for (let i=0;i<5;i++)` ejecuta **siempre los 5 tiros completos para ambos equipos**, con dos sorteos independientes por ronda, **sin corte por muerte matemática**. Por eso salen 5-0/5-1/5-2 (imposibles: la tanda real se corta cuando el resultado es inalcanzable, p. ej. 3-0 tras el 4º par). La muerte súbita posterior (`while homeScore===awayScore`) es correcta en sí, pero opera sobre un marcador ya mal formado.

## Diseño

### Fix Bug 3 — Penales con muerte matemática (`src/core/engine.ts`)

Reescribir `simulatePenalties` para modelar una tanda alternada real:

- **Fase regular:** hasta 5 tiros por lado, alternados (home, luego away). Tras **cada** tiro, chequear si el resultado ya está decidido comparando el marcador contra los tiros restantes del rival; si es inalcanzable, cortar.
- **Muerte súbita:** solo si tras la fase regular hay empate. De a pares (home y away tiran); si al terminar el par uno supera al otro, gana. Se mantiene la lógica de conversión por skill actual (`0.75 + skill/100*0.15`).

Pseudocódigo:

```
homeRemaining = awayRemaining = 5
mientras (homeRemaining > 0 || awayRemaining > 0):
  si homeRemaining > 0: tirar home; homeRemaining--; si decidido → break
  si awayRemaining > 0: tirar away; awayRemaining--; si decidido → break
si homeScore == awayScore:  // muerte súbita
  repetir: tirar home; tirar away  hasta homeScore != awayScore
retornar { homeScore, awayScore }
```

"Decidido" = `mayor > menor + tirosRestantesDelQueVaAbajo`. No cambia firma, esquema ni UI. `simulateMatchWithPenalties` no se toca.

### Fix Bugs 1/2 — Persistir Continental/Confed y exponerlos

**Parte A — Migración DB (nueva `010`).** Ampliar el CHECK de `match_history.stage` para admitir `'continental'`, `'confed-group'`, `'confed-knockout'` (valores ya usados en `Match.stage`: `continental.ts:78`, `confederations.ts:64,129`). Actualizar también `supabase/schema.sql`.

**Parte B — Tipos.** Ampliar la unión de `stage` en `src/types/database.ts` y en `MatchHistoryEntry`/`CreateMatchHistoryParams` (`src/services/matchHistoryService.ts:13,32`) con los tres nuevos valores.

**Parte C — Persistencia hacia adelante (store).** En `simulateContinentalMatch` y `simulateConfederationsMatch`, tras calcular el resultado y los skills, llamar a `matchHistoryService.createMatch` (best-effort, sin bloquear el estado local, como el patrón de skills existente). Datos disponibles en esas acciones:

- `homeTeamId/awayTeamId`, `homeScore/awayScore`.
- `homeSkillBefore = home.skill`, `homeSkillAfter = newHome`, `homeSkillChange = result.homeSkillChange` (ídem away).
- `stage`: `'continental'` | `'confed-group'` | `'confed-knockout'` según corresponda.
- `region`: la región del bracket (continental); `undefined` en confed (intercontinental).
- `groupName`: nombre de grupo (confed-group) o la ronda (`match.round`) en knockout/continental.
- `metadata.cycleMatchId = matchId`: clave de idempotencia (ver Parte E).

**Parte D — Match Center (`MatchCenter.tsx`).** Ampliar el colector `allMatches` para recorrer:
- `tournament.continental.brackets[Region]`: `roundOf64, roundOf32, roundOf16, quarterFinals, semiFinals, final?, thirdPlace?`.
- `tournament.confederationsCup.groups[].matches` y `confederationsCup.knockout.{semiFinals, final?, thirdPlace?}`.

Ampliar `MatchStage` con `'continental'` y `'confederations'` (agrupando confed-group + confed-knockout bajo un filtro "Confederaciones"), añadir ambas opciones al dropdown de etapa (`:452-461`), y verificar que `availableMatchdays`/`totalPlayed` los incluyan. Match Center **sigue leyendo del estado en memoria del ciclo** (no de `match_history`), consistente con su patrón actual — así muestra lo ya jugado sin depender de la DB.

**Parte E — Backfill de lo ya jugado (para H2H).** El H2H con Supabase depende 100% de `match_history`; los partidos continental/confed jugados **antes** de este fix no están ahí. Añadir un backfill idempotente que:
- Recorra el ciclo actual en memoria (store) y reúna los partidos continental/confed con `isPlayed === true`.
- Consulte qué `metadata.cycleMatchId` ya existen en `match_history` y persista solo los faltantes.
- Se dispare una vez al cargar/hidratar el ciclo (mecanismo exacto — acción del store invocada en la carga — a definir en el plan). Sin Supabase, el backfill es no-op.

**Parte F — Fallback H2H en memoria.** Para robustez sin Supabase, ampliar `getMatchesBetweenTeams` (`headToHeadService.ts:137-186`) para que también recorra `continental` y `confederationsCup` del ciclo actual. Con Supabase configurado, el H2H toma todo de `match_history` (Partes C+E) sin cambios adicionales.

## Idempotencia y re-simulación

- La deduplicación se ancla en `metadata.cycleMatchId` (el id del partido dentro del ciclo). Backfill y persistencia hacia adelante lo respetan para no duplicar.
- Si existe un flujo de reset/re-simulación de partidos continental/confed, el plan debe verificar que no genere filas huérfanas o duplicadas (comparar con cómo lo maneja el mundial). Riesgo bajo en esta tanda; documentar si aparece.

## Testing (Vitest, suite existente ~143)

- **Penales:** N iteraciones (p. ej. 10.000) → nunca un marcador imposible (invariante: `max <= min + 5` en fase regular y el ganador nunca supera al rival por más de sus tiros restantes); empates van a muerte súbita y terminan con diferencia exacta de 1; ganador siempre bien definido.
- **Colector Match Center:** dado un `Cycle` con partidos continental/confed jugados, `allMatches` los incluye con el `stage` correcto y cuentan en los totales.
- **Persistencia:** `simulateContinentalMatch`/`simulateConfederationsMatch` producen un `createMatch` con los campos correctos (mock del service).
- **Backfill:** dado un ciclo con partidos jugados y un `match_history` parcialmente poblado, inserta solo los faltantes (idempotencia por `cycleMatchId`).

## Riesgos

- **Migración DB en entorno con datos:** el CHECK ampliado es aditivo (no rompe filas existentes). La DB está limpia según el estado del proyecto; aun así la migración es idempotente/segura.
- **Backfill dependiente del estado en memoria:** si el ciclo no está cargado, el backfill no tiene nada que migrar (no-op). Aceptable: el objetivo es exponer lo del ciclo activo del usuario.
- **Acoplamiento de tipos `stage`:** hay tres lugares con la unión literal (`database.ts`, `matchHistoryService.ts`, y el CHECK SQL). Deben quedar sincronizados; el plan los toca juntos.
