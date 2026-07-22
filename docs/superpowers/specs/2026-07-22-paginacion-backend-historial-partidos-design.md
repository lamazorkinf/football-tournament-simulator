# Paginación backend + agregación server-side del historial de partidos

**Fecha:** 2026-07-22
**Estado:** Aprobado (diseño) — pendiente plan de implementación

## Problema

Toda la data de partidos vive en la tabla `match_history` de Supabase (~900 partidos por
torneo, crece sin techo). Hoy hay tres consumidores y ninguno escala:

1. **La lista — `MatchHistory.tsx`.** Pide los primeros 100 con `getAllMatches(100)` y los
   muestra en un scroll con `max-h-[600px]`. No hay paginación real: el partido 101 es
   inalcanzable.
2. **Stats del header — `getMatchStatistics()`.** Baja la **tabla entera** al navegador en
   páginas de 1000 filas y agrega en JS (total partidos / goles / promedio / mayor goleada).
3. **`HistoricalStats.tsx`.** Baja los **~10.000 partidos enteros** (`getAllMatches(10000)`)
   y agrega por equipo y por región en el cliente.

El cuello de botella más grave no es la lista, sino (2) y (3): descargar decenas de miles de
filas al navegador para sumarlas. Este trabajo ataca los tres.

## Decisiones tomadas (brainstorming)

- **Alcance:** lista + agregaciones. Ninguna pantalla debe volver a bajar la tabla completa.
- **Estrategia de la lista:** keyset (cursor) sobre `(played_at, id)` + UX "Cargar más".
  Eficiente a cualquier profundidad (nunca escanea filas salteadas), estable ante inserts.
- **Agregaciones:** RPC / SQL on-demand (COUNT/SUM/AVG/GROUP BY en el servidor). Siempre
  fresco, cero almacenamiento extra. Postgres agrega esta escala en milisegundos.

## Esquema relevante (actual)

```sql
CREATE TABLE match_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  home_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  home_score INTEGER NOT NULL,
  away_score INTEGER NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN (...6 valores...)),
  group_name TEXT, region TEXT, tournament_id TEXT,
  home_skill_before/after/change NUMERIC(5,2) NOT NULL,
  away_skill_before/after/change NUMERIC(5,2) NOT NULL,
  played_at TIMESTAMPTZ DEFAULT TIMEZONE('utc', NOW()),
  metadata JSONB DEFAULT '{}'::jsonb
);
```

Índices actuales: `home_team`, `away_team`, `played_at DESC`, `stage`, `tournament_id`.

## Diseño

### 1. Base de datos — migración `012_match_history_pagination.sql`

**Índices compuestos** (los sueltos no cubren keyset con desempate):

```sql
CREATE INDEX idx_match_history_keyset       ON match_history (played_at DESC, id DESC);
CREATE INDEX idx_match_history_stage_keyset ON match_history (stage, played_at DESC, id DESC);
DROP INDEX IF EXISTS idx_match_history_played_at; -- cubierto como prefijo del keyset
```

**Cuatro RPCs.** SECURITY INVOKER (la RLS de `match_history` ya da read público a `anon`),
`GRANT EXECUTE` a `anon` y `authenticated`. Siguen el patrón del `get_team_recent_matches`
existente.

- `get_matches_page(p_cursor_played_at timestamptz, p_cursor_id uuid, p_page_size int, p_stage text)`
  - Keyset:
    ```sql
    WHERE (p_stage IS NULL OR stage = p_stage)
      AND (p_cursor_played_at IS NULL
           OR (played_at, id) < (p_cursor_played_at, p_cursor_id))
    ORDER BY played_at DESC, id DESC
    LIMIT p_page_size
    ```
  - Devuelve las filas completas de `match_history` (mismo shape que un `SELECT *`).
  - `p_cursor_*` NULL ⇒ primera página. `p_stage` NULL ⇒ sin filtro.

- `get_match_statistics()` → una fila:
  `total_matches` (COUNT), `total_goals` (SUM(home+away)), `avg_goals` (AVG).
  **No** incluye "mayor goleada": la UI actual (`MatchHistory`) no la consume (YAGNI).

- `get_team_stats()` → una fila por equipo (~210):
  ```sql
  SELECT team_id,
         COUNT(*)                         AS total_matches,
         SUM((gf > ga)::int)              AS wins,
         SUM((gf = ga)::int)              AS draws,
         SUM((gf < ga)::int)             AS losses,
         SUM(gf)                          AS goals_for,
         SUM(ga)                          AS goals_against
  FROM (
    SELECT home_team_id AS team_id, home_score AS gf, away_score AS ga FROM match_history
    UNION ALL
    SELECT away_team_id, away_score, home_score FROM match_history
  ) x
  GROUP BY team_id;
  ```

- `get_region_stats()` → una fila por región (~4). Replica **exactamente** el cálculo actual
  de `HistoricalStats` (solo `qualifier`, agrupado por la región del equipo **local**,
  contando por partido). El join a `teams` por `home_team_id` garantiza equivalencia con el
  código actual sin depender de que la columna `match_history.region` esté poblada:
  ```sql
  SELECT ht.region,
         SUM(mh.home_score + mh.away_score) AS total_goals,
         COUNT(*)                           AS matches_played
  FROM match_history mh
  JOIN teams ht ON ht.id = mh.home_team_id
  WHERE mh.stage = 'qualifier'
  GROUP BY ht.region;
  ```
  El `avgGoals` (= total_goals / matches_played) se calcula en el cliente, igual que hoy.

### 2. Capa de servicio — `matchHistoryService.ts`

Tipo de cursor:
```ts
export interface MatchCursor { playedAt: string; id: string; }
```

- `getMatchesPage({ cursor?, pageSize = 30, stage? }): Promise<{
    matches: MatchHistoryEntry[]; nextCursor: MatchCursor | null; hasMore: boolean }>`
  - Llama a `rpc('get_matches_page', ...)`.
  - `hasMore = matches.length === pageSize`.
  - `nextCursor = hasMore ? { playedAt: last.playedAt, id: last.id } : null`.
- `getMatchStatistics()` → una llamada a `rpc('get_match_statistics')`. Elimina el bucle
  full-table. Devuelve `{ totalMatches, totalGoals, averageGoalsPerMatch }` (mismo shape que
  consume `MatchHistory` hoy; se descarta `biggestWin`).
- `getTeamStats()` → **nueva**, `rpc('get_team_stats')`. Reemplaza el `getAllMatches(10000)`.
  Devuelve `TeamStatsRow[]` con `{ teamId, totalMatches, wins, draws, losses, goalsFor, goalsAgainst }`.
- `getRegionStats()` → **nueva**, `rpc('get_region_stats')`. Devuelve
  `{ region, totalGoals, matchesPlayed }[]`.
- **Se elimina** el camino `limit >= 10000` de `getAllMatches` y la función
  `getMatchesByStage` (el filtro por etapa se absorbe en `getMatchesPage`).
- `getTeamMatches` (consumido por `MatchPreview`, ya acotado a ≤100) **queda igual**.

### 3. UI — `MatchHistory.tsx`

- Estado: `matches`, `nextCursor`, `hasMore`, `loadingInitial`, `loadingMore`, `filter`,
  `statistics`.
- Carga inicial y cambio de filtro → `getMatchesPage` página 1 (`pageSize: 30`), reset del
  cursor y de la lista.
- Botón **"Cargar más"** al pie (visible sólo si `hasMore`) → `getMatchesPage({ cursor: nextCursor, stage })`, se **appendea** a `matches`, con estado `loadingMore` propio.
- **Real-time INSERT** (`subscribeToMatches`): en vez de re-descargar toda la lista (rompía
  el estado paginado), el callback **antepone** la fila nueva si matchea el filtro actual y
  **refresca** `getMatchStatistics()` (RPC barato). El shape del callback cambia de
  `(matches) => void` a recibir la(s) fila(s) nueva(s).
- Stats del header vía `getMatchStatistics()`.

### 4. UI — `HistoricalStats.tsx`

- Reemplaza `getAllMatches(10000)` + agregación en JS por **dos** llamadas RPC en paralelo:
  `getTeamStats()` (stats por equipo) y `getRegionStats()` (stats regionales).
- **Stats por equipo:** de `getTeamStats()`; el `winRate` se calcula en el cliente
  (`wins / totalMatches * 100`), igual que hoy.
- **Stats por tier / top-scorers / top-teams:** se derivan en cliente desde las filas
  por-equipo + `teams` (ya era client-side vía `calculateTier`, `groupTeamsByTier`, y los
  `sort/slice` sobre `teamStats`). Sin cambios de lógica.
- **Stats regionales:** de `getRegionStats()`; `avgGoals` se calcula en el cliente. Replica
  exactamente el cálculo actual (solo `qualifier`, por región del equipo local, por partido).

### 5. Tests (Vitest, TDD)

Se testea la lógica pura y la capa de servicio con `supabase.rpc` mockeado:

- `assembleMatchPage(entries, pageSize)` (helper puro): cálculo de `hasMore`/`nextCursor`
  (página llena ⇒ `hasMore true` + cursor `{playedAt,id}` del último; página parcial ⇒
  `hasMore false` + `nextCursor null`; página vacía ⇒ idem).
- Helper puro `computeWinRate(wins, totalMatches)` (`wins/totalMatches*100`, 0 si
  `totalMatches===0`) — usado por `HistoricalStats` al mapear las filas del RPC.
- Mock de `supabase.rpc` para `getMatchesPage`, `getMatchStatistics`, `getTeamStats`,
  `getRegionStats` (un happy-path por método verificando el mapeo snake_case → camelCase).

Las funciones SQL (RPCs) no se cubren con Vitest; se validan con un smoke query manual contra
la base tras aplicar la migración.

## Consideraciones / límites conocidos

- **Ties de `played_at`:** los batch inserts (`createMatchesBatch`) comparten timestamp; el
  desempate por `id` (UUID aleatorio) da un orden total **estable pero arbitrario** dentro de
  un mismo batch — exactamente igual que hoy, que ordena sólo por `played_at`. Aceptable; no
  se introduce regresión de orden.
- **`pageSize` de la lista:** 30 (configurable vía parámetro).
- **Permisos:** las RPC no necesitan `SECURITY DEFINER`; la RLS de lectura pública sobre
  `match_history` alcanza con `SECURITY INVOKER` + `GRANT EXECUTE`.
- **Migración de datos:** ninguna. Sólo índices y funciones nuevas; no se toca ni una fila.

## Fuera de alcance

- Vista materializada / tabla resumen / contadores por trigger (descartados: overkill a esta
  escala).
- Páginas numeradas / salto a página arbitraria (descartado: offset se degrada en profundidad
  y es frágil ante inserts).
- Cambios a `MatchPreview`, `getTeamMatches`, `getTournamentMatches`, `getMatchesByRegion`
  (ya acotados o fuera del flujo del historial).
- Orden por `matchday` en la lista (sigue ordenando por `played_at`, como hoy).
