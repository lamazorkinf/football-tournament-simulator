# Corrección de Auditoría de Bugs — Plan de Implementación

> **Para trabajadores agénticos:** Ejecutar por fases. Cada fase termina con tests + `tsc` + `build` en verde y un commit propio.

**Goal:** Corregir los ~70 defectos detectados en la auditoría del 2026-07-20, desde corrupción de datos y lógica deportiva hasta limpieza de código muerto.

**Architecture:** Se trabaja en la rama `fix/auditoria-bugs`. El trabajo previo sin commitear (recalibración del motor, `teams.json` curado) se preserva en un commit baseline separado antes de tocar nada. Se introduce Vitest como red de seguridad y se escriben tests sobre la lógica pura (bracket, sorteo, standings, batch) antes de corregirla. Los cambios de esquema van en migraciones nuevas, nunca editando migraciones ya aplicadas.

**Tech Stack:** React 19, TypeScript 5.9, Zustand 5, Vite 7, Supabase, Vitest (nuevo).

## Global Constraints

- **NO tocar la calibración Elo** (`engine.ts` divisor 75, K 1.5, regresión 3%). Decisión explícita del usuario.
- **NO editar migraciones ya aplicadas** (`002_normalized_schema.sql`). Todo cambio de esquema va en migraciones nuevas ≥007.
- **Preservar el trabajo sin commitear** en `engine.ts`, `teams.json`, `useConfigStore.ts`, `seed_teams.sql`, `EngineSettings.tsx` y demás.
- **Migraciones aditivas únicamente.** Prohibido `DROP TABLE`, `DELETE FROM` o cualquier SQL que destruya datos existentes en la base remota.
- **Rotar la anon key de Supabase y reescribir el historial de git son tareas del usuario.** El plan solo saca `.env` del índice y lo ignora.
- Cada fase debe dejar `npx vitest run`, `npx tsc --noEmit -p tsconfig.app.json` y `npm run build` en verde antes de commitear.

---

## Fase 0 — Preparación

**Files:** `package.json`, `vitest.config.ts` (crear), `.gitignore`

- [ ] Crear rama `fix/auditoria-bugs` desde `master`.
- [ ] Commitear el trabajo previo sin commitear como baseline separado, atribuido como trabajo previo del usuario.
- [ ] Instalar Vitest (`vitest` como devDependency) y añadir script `"test": "vitest run"`.
- [ ] Crear `vitest.config.ts` con entorno `node` (la lógica bajo test es pura, no necesita jsdom).
- [ ] Verificar: `npx vitest run` corre sin tests y sale 0.

## Fase 1 — Seguridad (secretos)

**Files:** `.gitignore`, `.env` (untrack)

- [ ] Añadir `.env`, `.env.local`, `.env.*.local` a `.gitignore` (conservar `.env.example`).
- [ ] `git rm --cached .env` para sacarlo del índice sin borrar el archivo local.
- [ ] Documentar en el informe final que **el usuario debe rotar la anon key** y decidir sobre el historial de git.

## Fase 2 — Base de datos (migración 007 + aplicación remota)

**Files:** `supabase/migrations/007_audit_fixes.sql` (crear), `src/types/database.ts`

- [ ] `CREATE TABLE IF NOT EXISTS team_tournament_performance` según la forma declarada en `database.ts:397-449`, con RLS y políticas.
- [ ] Políticas `DELETE` faltantes en `match_history` (hoy los borrados afectan 0 filas sin error).
- [ ] Reescribir el trigger de standings para que sea **idempotente**: restar el resultado anterior antes de sumar el nuevo, o recalcular desde cero. Corrige la doble suma de puntos al resimular.
- [ ] Añadir `matchday` a los tipos de `matches_new` en `database.ts:312-372` (existe en la BD desde 004, ausente en los tipos).
- [ ] Quitar `'Oceania'` de los tipos `Update` de `teams` y `qualifier_groups` (`database.ts:35,190`): el CHECK del SQL solo acepta Europe/America/Africa/Asia.
- [ ] Definir `ON DELETE` explícito en las FK de `teams` para que borrar un equipo no falle con 23503.
- [ ] Aplicar la migración a la base remota vía MCP de Supabase y verificar con `list_tables`.

## Fase 3 — Lógica de núcleo (TDD)

**Files:** `src/core/knockout.ts`, `src/core/seeding.ts`, `src/core/scheduler.ts`, `src/utils/drawSystem.ts`, `src/utils/tournamentProgress.ts` + tests en `src/core/__tests__/`

- [ ] **Test + fix `knockout.ts:136-145`**: el emparejamiento de Octavos debe ser `(0,1),(2,3),…,(14,15)`, no `(p,p+8)`. Test: ningún cruce de Octavos puede alimentarse de los mismos dos grupos.
- [ ] **Test + fix `seeding.ts:114-117`**: `regionConflict` debe consultar los equipos ya asignados al grupo (buscando en el pool completo), no en `shuffledPot`. Test: 64 equipos de la misma región deben producir conflictos detectados.
- [ ] **Fix `seeding.ts:167-171`**: implementar `hasConflict` de verdad (hoy `return false` hardcodeado). **Debe hacerse junto con el anterior**: arreglar uno sin el otro mete dos equipos del mismo bombo en un grupo.
- [ ] **Test + fix `scheduler.ts:154-177` y `206-227`**: insertar desempate por enfrentamiento directo antes de la diferencia de gol. El `localeCompare` alfabético queda como último recurso.
- [ ] **Test + fix `scheduler.ts:119-146`**: `updateStandings` debe copiar los objetos en vez de mutar los del estado de Zustand.
- [ ] **Test + fix `drawSystem.ts:66-80`**: guarda para regiones que no son múltiplo de 5 (hoy `TypeError` que mata el sorteo).
- [ ] **Fix `tournamentProgress.ts:163`**: `isComplete` no debe exigir el tercer puesto cuando `thirdPlace` es `null`.
- [ ] **Fix `engine.ts:104-106`**: el recorte a `[skillMin, skillMax]` rompe la suma cero del Elo. Ajuste mínimo, **sin tocar la calibración**.
- [ ] **Fix `knockout.ts:30-45`**: guarda para `groupResults` con menos de 16 grupos.
- [ ] **Fix `types/index.ts:141-146`**: `EngineConfig` no declara `eloDivisor`, que `engine.ts:83` sí lee.

## Fase 4 — Store y estado

**Files:** `src/store/useTournamentStore.ts`, `src/store/useConfigStore.ts`, `src/store/useProgressStore.ts`, `src/store/useToastStore.ts`, `src/App.tsx`

- [ ] **CRÍTICO `useTournamentStore.ts:697-718` vs `:807`**: eliminar la desalineación de índices. Asociar cada entrada de historial a su `matchId` explícitamente en vez de confiar en el orden posicional.
- [ ] **CRÍTICO `useConfigStore.ts:55-62`**: validar `skillMin < skillMax` en `updateSkillLimits` y descartar `NaN`/vacío.
- [ ] **`useTournamentStore.ts:1878-1887`**: persistir `currentTournamentId` y derivar `currentTournament` en `onRehydrateStorage`; añadir `migrate` para la `version`.
- [ ] **`useTournamentStore.ts:117-121`**: `initializeTournament` debe fusionar con los torneos rehidratados, no reemplazarlos.
- [ ] **`useTournamentStore.ts:512-518` y `:1644`**: resetear `isSavingMatch` en los early return.
- [ ] **`useTournamentStore.ts:908-912`**: llamar `resetProgress()` en el `catch` del batch.
- [ ] **`useTournamentStore.ts:1810-1860`**: rellenar 3.º y 4.º puesto cuando el partido se juega después de la final.
- [ ] **`useTournamentStore.ts:1339,1383`**: eliminar la mutación directa de `qualifiers` en `generateDrawAndFixtures`.
- [ ] **`useTournamentStore.ts:460-467`**: `updateTeam` debe sincronizar también la entrada en `tournaments`.
- [ ] **`useTournamentStore.ts:375-428`**: `resetCurrentTournamentMatches` debe restaurar los skills desde `originalSkills`.
- [ ] **`useTournamentStore.ts:208-211`**: no aplicar la regresión de skills si el usuario cancela el cambio de torneo.
- [ ] **`useTournamentStore.ts:354,1835`**: los toasts con `duration: 0` deben cerrarse al completar la operación.
- [ ] **`useProgressStore.ts:58-67`**: cancelar el `setTimeout` pendiente al iniciar un progreso nuevo.
- [ ] **`useToastStore.ts:26`**: IDs de toast sin colisiones (contador o `nanoid`, ya es dependencia).
- [ ] **`App.tsx:63-67`**: guarda contra la doble ejecución de `initializeTournament`.

## Fase 5 — Servicios y datos

**Files:** `src/services/*.ts`, `src/components/tournament/ExportImport.tsx`

- [ ] **CRÍTICO `headToHeadService.ts:66,73`**: quitar `knockout_round` del select (columna inexistente en `match_history`). Desbloquea todo el head-to-head.
- [ ] **`matchHistoryService.ts:113-127` y `235-237`**: paginación con `.range()` en vez de `.limit(100000)`; el tope de 1000 filas de PostgREST trunca las estadísticas desde el segundo torneo.
- [ ] **`normalizedWorldCupService.ts:25-32`**: `upsert` con `onConflict` en vez de `insert` (hoy regenerar el sorteo lanza 23505).
- [ ] **`normalizedTournamentService.ts:398-402`**: desestructurar y comprobar `error` antes de decidir INSERT vs UPDATE.
- [ ] **`ExportImport.tsx:47-61`**: validar forma y tipos del JSON importado antes de escribir en `localStorage`.
- [ ] Comprobar `error` en los call sites que hoy lo descartan; escapar los `teamId` interpolados en los filtros `.or()`.
- [ ] **`lib/supabase.ts:6-7`**: avisar de forma visible cuando faltan las env vars en vez del fallback mudo.

## Fase 6 — Componentes de torneo

**Files:** `src/components/tournament/*.tsx`

- [ ] **`MatchCenter.tsx:73-79`, `TournamentOverview.tsx:323-329`, `:344-352`**: incluir `roundOf32` en la recolección de partidos, en las stats y en `determineCurrentStage`.
- [ ] **`TournamentOverview.tsx:338`**: `isComplete` no puede ser `true` con `totalMatches === 0`.
- [ ] **`WorldCupViewEnhanced.tsx:296-297`, `KnockoutView.tsx:240`**: cablear `onNewTournament` y `onBack` para que `ChampionCelebration` sea alcanzable.
- [ ] **`ChampionCelebration.tsx:55,77,93,110,131,152,158`**: usar `<TeamFlag>` en vez de renderizar la URL como texto.
- [ ] **`MatchCenter.tsx:274-279`**: abrir el preview del partido tocado, no de `unplayedMatches[0]`; cablear `selectedMatch` y desestructurar `onNavigate`.
- [ ] **`MatchCenter.tsx:130,183,191`**: avisar que "Simular Jornada" opera sobre la lista filtrada.
- [ ] **`MatchPreview.tsx:27-76`**: guarda de desmontaje y de carrera en el efecto async, con reset de estado al cambiar de partido.
- [ ] **`TeamProfileModal.tsx:540,551,562`**: evitar `NaN%` con `totalMatches === 0`.
- [ ] **`TeamProfileModal.tsx:94-100`, `TeamTournamentHistory.tsx:20-22`**: resetear estado al cambiar de equipo + guarda de carrera.
- [ ] **`MatchDetailModal.tsx:189`, `ChampionCelebration.tsx:37-47`**: sacar `Math.random()` del render; ordenar los minutos de gol.
- [ ] **`TournamentWizard.tsx:61-85`**: mover los tres `useMemo` antes del `return null` (violación de Rules of Hooks, hoy latente).
- [ ] **`DrawSimulator.tsx:137-171`**: cleanup del `setTimeout`, deshabilitar reset/cancelar durante la animación, eliminar la mutación en sitio y la closure obsoleta de `finalizeDraw`.
- [ ] **`GroupView.tsx:33-42`**: `await simulateMatch` para que el toast muestre el resultado.
- [ ] **`HistoricalStats.tsx:32-78`**: guarda de desmontaje y eliminar el doble fetch.
- [ ] **`QualifiersView.tsx:41-49`**: quitar `currentTournament` de las deps del efecto de auto-selección.
- [ ] **`KnockoutView.tsx:177-186`**: eliminar el estado de viewport que nadie lee.
- [ ] **`TeamEditor.tsx:233,75`**: validar rango de skill 30-100 y no convertir `0`/vacío en 30; evitar `window.location.reload()`.

## Fase 7 — UI compartida y hooks

**Files:** `src/components/ui/*.tsx`, `src/components/comparison/*.tsx`, `src/components/settings/*.tsx`, `src/hooks/*`

- [ ] **`ProgressModal.tsx:5-11`**: vía de escape para el usuario (cerrar tras error / Escape).
- [ ] **`TeamNameTooltip.tsx:83-84`**: eliminar el doble disparo `touchstart` + `click` que apaga el tooltip en móvil.
- [ ] **`useSwipeNavigation.ts:16-24`**: ignorar gestos originados dentro de contenedores con scroll horizontal; guarda para `e.touches[0]` vacío.
- [ ] **`TeamComparison.tsx:29-32,110`**: estado de error real en vez de spinner infinito.
- [ ] **`TeamFlag.tsx:45-53`**: fallback vía estado de React, no `document.createElement` + `insertBefore`.
- [ ] **`useMobileAction.tsx:18`, `useTeamProfile.tsx:16-25`**: memoizar el `value` de los Providers.
- [ ] **`TeamSelector.tsx:26`**: normalizar diacríticos en la búsqueda (Curaçao, São Tomé hoy inalcanzables).
- [ ] **`PauseMenu.tsx:26-31`, `MatchResultsModal.tsx:11`**: cierre con Escape, bloqueo de scroll del body y gestión de foco.
- [ ] **`TournamentSelector.tsx:21-38`**: `try/catch` con feedback al usuario.
- [ ] **`EngineSettings.tsx:26`**: limpiar el `setTimeout` al desmontar.
- [ ] **`StandingsTable.tsx:74-85`**: la fila expandible no debe togglear en desktop, donde el detalle es `sm:hidden`.
- [ ] **`TournamentSelector.tsx:92` vs `App.tsx:147`**: corregir el contexto de apilamiento del dropdown.
- [ ] **`useMobileAction.tsx:32-42`**: error descriptivo al usarse fuera del Provider.
- [ ] **`App.tsx:99`**: la navegación por sidebar debe resetear `viewOptions`.

## Fase 8 — Limpieza (severidad baja)

- [ ] Eliminar código muerto: `progressUpdates.ts`, `scheduler.ts:9` `generateRoundRobinMatches`, `scheduler.ts:36` `generateWorldCupGroupMatches`, `knockout.ts:313` `determineKnockoutWinner`, la sobrecarga muerta de `generateRoundOf16` (`knockout.ts:82-126`), el botón muerto de `TeamComparison.tsx:87-101`.
- [ ] `scheduler.ts:73`: nombres de grupo más allá de 26 (`String.fromCharCode` produce `[`, `\`, `]`).
- [ ] `key={idx}` en `MatchPreview.tsx:200,241`.
- [ ] Manejo de cuota excedida de `localStorage` en la persistencia.
- [ ] `index.html:6`: reactivar el zoom (`maximum-scale`, `user-scalable=no` bloquean el pinch-zoom).
- [ ] Suscripciones realtime que recargan la colección completa en cada evento (`teamsService.ts:218`, `matchHistoryService.ts:334`).

## Fase 9 — Verificación final

- [ ] `npx vitest run` — todos los tests en verde.
- [ ] `npx tsc --noEmit -p tsconfig.app.json` — sin errores.
- [ ] `npm run build` — build correcto.
- [ ] `npx eslint .` — sin errores nuevos respecto al baseline (110 errores preexistentes, casi todos `no-explicit-any`); los 3 `rules-of-hooks` deben desaparecer.
- [ ] Informe final: qué se arregló, qué quedó pendiente y qué requiere acción del usuario.
