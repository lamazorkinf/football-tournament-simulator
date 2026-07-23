# Mejoras de la tabla de campeones — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la tabla plana de campeones por una vista con dos sub-pestañas —Palmarés agregado y Cronología filtrable— alimentadas por RPCs server-side que aplanan el JSONB del ciclo, sin descargar ~91 KB por ciclo en el cliente.

**Architecture:** Una migración SQL agrega dos funciones (`champions_history()` y `champions_palmares()`) que parsean `tournament_cycle_state.state` en Postgres y devuelven filas planas. Un service (`championsService.ts`) las envuelve y expone helpers puros de presentación/filtrado (testeados con Vitest). Tres componentes React —contenedor + dos vistas— consumen el service; el contenedor cablea la navegación al bracket vía `selectTournament` + `onNavigate`.

**Tech Stack:** React + TypeScript, Vite, Vitest, Supabase (Postgres RPC, `supabase.rpc`), Tailwind. Estética retro/arcade existente (clases `font-arcade`, `text-gold`, `border-grass`).

## Global Constraints

- **Español** en todo el texto de UI, comentarios y mensajes de commit; ortografía con acentos correcta.
- **Migración numerada `016`** (la última aplicada es `015_flagcdn_flat_urls.sql`). Aditiva: solo funciones nuevas, no toca datos.
- **RPCs:** `LANGUAGE sql STABLE`, `SECURITY INVOKER` (default), `GRANT EXECUTE ... TO anon, authenticated`. Anon ya lee `tournaments_new`, `tournament_cycle_state` y `teams` (el componente actual lo hace), así que INVOKER alcanza. Sigue el patrón de `012_match_history_pagination.sql`.
- **Acceso a datos:** vía `supabase.rpc(...)` con el cast `(supabase as any)` como en `matchHistoryService`. Guard `isSupabaseConfigured()` al inicio de cada método (retorna vacío si no).
- **Bigints del RPC llegan como string:** envolver conteos con `Number(...)` al mapear.
- **JSONB (verificado contra la DB):** cada `final`/`thirdPlace` tiene `winnerId`, `homeTeamId`, `awayTeamId`, `homeScore`, `awayScore`, `penalties:{homeScore,awayScore}` (opcional). Las continentales/Confed además traen `loserId`; **la final del Mundial NO trae `loserId`** → el subcampeón se deriva (`homeTeamId`/`awayTeamId` ≠ `winnerId`).
- **Rutas del JSONB:** Mundial `state->'worldCup'->'knockout'->{final,thirdPlace}`; continental `state->'continental'->'brackets'->{Europe|America|Africa|Asia}->{final,thirdPlace}`; Confed `state->'confederationsCup'->'knockout'->{final,thirdPlace}`.
- **Navegación:** `selectTournament(id)` (async, del store) cambia el torneo activo; luego `onNavigate(view)` donde `world-cup→'worldcup'`, `continental→'continental'`, `confederations→'confederations'`.
- **Verificación por tarea:** `npx tsc -b` sin errores y `npx vitest run` en verde antes de cada commit.

---

## File Structure

- `supabase/migrations/016_champions_rpcs.sql` — **crear.** Las dos RPCs + grants.
- `src/services/championsService.ts` — **crear.** Tipos `ChampionHistoryRow`/`PalmaresRow`, métodos `getChampionsHistory()`/`getPalmares()`, helpers puros `formatFinalScore`/`filterTimeline`/`summarizeChampions`.
- `src/services/__tests__/championsService.test.ts` — **crear.** Tests de helpers + mapeo de RPC.
- `src/components/tournament/ChampionsPalmares.tsx` — **crear.** Tabla de ranking.
- `src/components/tournament/ChampionsTimeline.tsx` — **crear.** Cronología filtrable + navegación.
- `src/components/tournament/ChampionsHistory.tsx` — **reescribir.** Contenedor: tabs, carga, error/reintento, wiring de navegación.
- `src/App.tsx:187-189` — **modificar.** Pasar `onNavigate={handleNavigate}` a `<ChampionsHistory>`.

---

## Task 1: Migración 016 — RPCs `champions_history()` y `champions_palmares()`

**Files:**
- Create: `supabase/migrations/016_champions_rpcs.sql`

**Interfaces:**
- Produces (columnas que el service leerá):
  - `champions_history()` → `tournament_id text, year int, kind text, region text, ord int, champion_id text, runner_up_id text, third_id text, fourth_id text, champion_score int, runner_up_score int, champion_pen int, runner_up_pen int, champion_name text, runner_up_name text, third_name text, fourth_name text, champion_region text`
  - `champions_palmares()` → `team_id text, team_name text, region text, titles bigint, runner_ups bigint, thirds bigint, wc_titles bigint, continental_titles bigint, confed_titles bigint`

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/016_champions_rpcs.sql` con este contenido exacto:

```sql
-- 016_champions_rpcs.sql
-- Aplana los campeones/podios/finales del JSONB de cada ciclo a filas planas.
-- Aditiva: solo funciones; no toca datos. Reemplaza la descarga de ~91 KB por
-- ciclo que hacía ChampionsHistory en el cliente.

-- 1) Una fila por competición con campeón definido (para la Cronología).
CREATE OR REPLACE FUNCTION champions_history()
RETURNS TABLE (
  tournament_id TEXT,
  year INTEGER,
  kind TEXT,
  region TEXT,
  ord INTEGER,
  champion_id TEXT,
  runner_up_id TEXT,
  third_id TEXT,
  fourth_id TEXT,
  champion_score INTEGER,
  runner_up_score INTEGER,
  champion_pen INTEGER,
  runner_up_pen INTEGER,
  champion_name TEXT,
  runner_up_name TEXT,
  third_name TEXT,
  fourth_name TEXT,
  champion_region TEXT
)
LANGUAGE sql STABLE
AS $$
  WITH comps AS (
    -- Mundial
    SELECT t.id AS tournament_id, t.year, 'world-cup'::text AS kind,
           NULL::text AS region, 0 AS ord,
           cs.state->'worldCup'->'knockout'->'final'      AS final,
           cs.state->'worldCup'->'knockout'->'thirdPlace' AS third
    FROM tournaments_new t
    JOIN tournament_cycle_state cs ON cs.tournament_id = t.id
    WHERE t.status = 'completed'
    UNION ALL
    -- Continentales (una por región)
    SELECT t.id, t.year, 'continental', reg.region, 1 + reg.ord,
           cs.state->'continental'->'brackets'->reg.region->'final',
           cs.state->'continental'->'brackets'->reg.region->'thirdPlace'
    FROM tournaments_new t
    JOIN tournament_cycle_state cs ON cs.tournament_id = t.id
    CROSS JOIN (VALUES ('Europe',0),('America',1),('Africa',2),('Asia',3))
               AS reg(region, ord)
    WHERE t.status = 'completed'
    UNION ALL
    -- Copa Confederaciones
    SELECT t.id, t.year, 'confederations', NULL, 5,
           cs.state->'confederationsCup'->'knockout'->'final',
           cs.state->'confederationsCup'->'knockout'->'thirdPlace'
    FROM tournaments_new t
    JOIN tournament_cycle_state cs ON cs.tournament_id = t.id
    WHERE t.status = 'completed'
  ),
  flat AS (
    SELECT
      c.tournament_id, c.year, c.kind, c.region, c.ord,
      (c.final->>'winnerId') AS champion_id,
      -- Subcampeón: loserId (continental/confed) o, para el Mundial que no lo
      -- trae, el finalista que no es el ganador.
      COALESCE(
        c.final->>'loserId',
        CASE WHEN c.final->>'homeTeamId' = c.final->>'winnerId'
             THEN c.final->>'awayTeamId' ELSE c.final->>'homeTeamId' END
      ) AS runner_up_id,
      (c.third->>'winnerId') AS third_id,
      (c.third->>'loserId')  AS fourth_id,
      -- Marcador orientado al campeón (no home/away).
      CASE WHEN c.final->>'homeTeamId' = c.final->>'winnerId'
           THEN (c.final->>'homeScore')::int ELSE (c.final->>'awayScore')::int END
        AS champion_score,
      CASE WHEN c.final->>'homeTeamId' = c.final->>'winnerId'
           THEN (c.final->>'awayScore')::int ELSE (c.final->>'homeScore')::int END
        AS runner_up_score,
      CASE WHEN c.final->>'homeTeamId' = c.final->>'winnerId'
           THEN (c.final->'penalties'->>'homeScore')::int
           ELSE (c.final->'penalties'->>'awayScore')::int END
        AS champion_pen,
      CASE WHEN c.final->>'homeTeamId' = c.final->>'winnerId'
           THEN (c.final->'penalties'->>'awayScore')::int
           ELSE (c.final->'penalties'->>'homeScore')::int END
        AS runner_up_pen
    FROM comps c
    WHERE c.final->>'winnerId' IS NOT NULL   -- solo competiciones con campeón
  )
  SELECT
    f.tournament_id, f.year, f.kind, f.region, f.ord,
    f.champion_id, f.runner_up_id, f.third_id, f.fourth_id,
    f.champion_score, f.runner_up_score, f.champion_pen, f.runner_up_pen,
    tc.name AS champion_name,
    tr.name AS runner_up_name,
    t3.name AS third_name,
    t4.name AS fourth_name,
    tc.region AS champion_region
  FROM flat f
  LEFT JOIN teams tc ON tc.id = f.champion_id
  LEFT JOIN teams tr ON tr.id = f.runner_up_id
  LEFT JOIN teams t3 ON t3.id = f.third_id
  LEFT JOIN teams t4 ON t4.id = f.fourth_id
  ORDER BY f.year DESC, f.ord ASC;
$$;

-- 2) Palmarés agregado por equipo (para la pestaña Palmarés). Reutiliza (1).
CREATE OR REPLACE FUNCTION champions_palmares()
RETURNS TABLE (
  team_id TEXT,
  team_name TEXT,
  region TEXT,
  titles BIGINT,
  runner_ups BIGINT,
  thirds BIGINT,
  wc_titles BIGINT,
  continental_titles BIGINT,
  confed_titles BIGINT
)
LANGUAGE sql STABLE
AS $$
  WITH h AS (SELECT * FROM champions_history()),
  agg AS (
    SELECT champion_id AS team_id,
           COUNT(*) AS titles,
           COUNT(*) FILTER (WHERE kind = 'world-cup')      AS wc_titles,
           COUNT(*) FILTER (WHERE kind = 'continental')    AS continental_titles,
           COUNT(*) FILTER (WHERE kind = 'confederations') AS confed_titles
    FROM h GROUP BY champion_id
  ),
  ru AS (
    SELECT runner_up_id AS team_id, COUNT(*) AS runner_ups
    FROM h WHERE runner_up_id IS NOT NULL GROUP BY runner_up_id
  ),
  th AS (
    SELECT third_id AS team_id, COUNT(*) AS thirds
    FROM h WHERE third_id IS NOT NULL GROUP BY third_id
  ),
  ids AS (
    SELECT team_id FROM agg
    UNION SELECT team_id FROM ru
    UNION SELECT team_id FROM th
  )
  SELECT
    i.team_id,
    tm.name AS team_name,
    tm.region,
    COALESCE(a.titles, 0)             AS titles,
    COALESCE(r.runner_ups, 0)         AS runner_ups,
    COALESCE(t.thirds, 0)             AS thirds,
    COALESCE(a.wc_titles, 0)          AS wc_titles,
    COALESCE(a.continental_titles, 0) AS continental_titles,
    COALESCE(a.confed_titles, 0)      AS confed_titles
  FROM ids i
  LEFT JOIN agg a ON a.team_id = i.team_id
  LEFT JOIN ru  r ON r.team_id = i.team_id
  LEFT JOIN th  t ON t.team_id = i.team_id
  JOIN teams tm ON tm.id = i.team_id
  ORDER BY titles DESC, runner_ups DESC, thirds DESC, team_name ASC;
$$;

GRANT EXECUTE ON FUNCTION champions_history()  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION champions_palmares() TO anon, authenticated;
```

- [ ] **Step 2: Aplicar la migración a Supabase**

Aplicar vía el MCP de Supabase (herramienta `apply_migration`) con `name: "champions_rpcs"` y el SQL del Step 1. (Si se ejecuta manualmente, correr el archivo contra la base.)

- [ ] **Step 3: Validar `champions_history()` contra los datos reales**

Ejecutar vía MCP `execute_sql`:

```sql
SELECT year, kind, region, champion_id, runner_up_id, third_id, fourth_id,
       champion_score, runner_up_score, champion_pen, runner_up_pen
FROM champions_history()
ORDER BY year DESC, ord ASC;
```

Verificar (contra los ~4 torneos completados):
- Hay una fila Mundial + hasta 4 continentales + 1 Confed por año con final jugada.
- **Mundial:** `runner_up_id` no es null y es distinto de `champion_id` (derivación correcta pese a no haber `loserId`).
- `champion_score`/`runner_up_score` reflejan el marcador orientado al campeón.
- Alguna fila con penales tiene `champion_pen`/`runner_up_pen` no nulos; las demás, null.

- [ ] **Step 4: Validar `champions_palmares()` y su consistencia con la cronología**

Ejecutar:

```sql
SELECT * FROM champions_palmares();
-- Chequeo cruzado: el total de títulos del palmarés = filas de la cronología.
SELECT
  (SELECT SUM(titles) FROM champions_palmares())   AS palmares_titulos,
  (SELECT COUNT(*)    FROM champions_history())     AS cronologia_filas;
```

Esperado: `palmares_titulos = cronologia_filas` (cada competición tiene exactamente un campeón). Orden por `titles DESC, runner_ups DESC, thirds DESC, team_name`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/016_champions_rpcs.sql
git commit -m "feat(campeones): RPCs champions_history y champions_palmares (migración 016)"
```

---

## Task 2: Servicio `championsService.ts` + helpers puros (TDD)

**Files:**
- Create: `src/services/championsService.ts`
- Test: `src/services/__tests__/championsService.test.ts`

**Interfaces:**
- Consumes: `supabase`, `isSupabaseConfigured` de `../lib/supabase`; RPCs de Task 1.
- Produces:
  - `interface ChampionHistoryRow { tournamentId: string; year: number; kind: 'world-cup'|'continental'|'confederations'; region: string|null; championId: string|null; championName: string|null; championRegion: string|null; runnerUpId: string|null; runnerUpName: string|null; thirdId: string|null; thirdName: string|null; fourthId: string|null; fourthName: string|null; championScore: number|null; runnerUpScore: number|null; championPen: number|null; runnerUpPen: number|null }`
  - `interface PalmaresRow { teamId: string; teamName: string; region: string; titles: number; runnerUps: number; thirds: number; wcTitles: number; continentalTitles: number; confedTitles: number }`
  - `interface TimelineFilters { kind: ChampionHistoryRow['kind']|'all'; region: string|null; teamId: string|null; yearFrom: number|null; yearTo: number|null }`
  - `formatFinalScore(row: ChampionHistoryRow): string`
  - `filterTimeline(rows: ChampionHistoryRow[], f: TimelineFilters): ChampionHistoryRow[]`
  - `summarizeChampions(rows: ChampionHistoryRow[]): { totalTitles: number; years: number; teams: number }`
  - `championsService.getChampionsHistory(): Promise<ChampionHistoryRow[]>`
  - `championsService.getPalmares(): Promise<PalmaresRow[]>`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/services/__tests__/championsService.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatFinalScore,
  filterTimeline,
  summarizeChampions,
  championsService,
  type ChampionHistoryRow,
} from '../championsService';
import * as supaLib from '../../lib/supabase';

const row = (o: Partial<ChampionHistoryRow>): ChampionHistoryRow => ({
  tournamentId: 't1',
  year: 2026,
  kind: 'world-cup',
  region: null,
  championId: 'arg',
  championName: 'Argentina',
  championRegion: 'America',
  runnerUpId: 'fra',
  runnerUpName: 'Francia',
  thirdId: 'bra',
  thirdName: 'Brasil',
  fourthId: 'nld',
  fourthName: 'Holanda',
  championScore: 2,
  runnerUpScore: 1,
  championPen: null,
  runnerUpPen: null,
  ...o,
});

describe('formatFinalScore', () => {
  it('marcador simple sin penales', () => {
    expect(formatFinalScore(row({ championScore: 2, runnerUpScore: 1 }))).toBe('2 - 1');
  });
  it('agrega los penales cuando los hubo', () => {
    expect(
      formatFinalScore(row({ championScore: 1, runnerUpScore: 1, championPen: 4, runnerUpPen: 2 })),
    ).toBe('1 - 1 (4-2 pen)');
  });
  it('sin marcador ⇒ string vacío', () => {
    expect(formatFinalScore(row({ championScore: null, runnerUpScore: null }))).toBe('');
  });
});

describe('filterTimeline', () => {
  const rows = [
    row({ year: 2026, kind: 'world-cup', region: null, championId: 'arg', runnerUpId: 'fra' }),
    row({ year: 2026, kind: 'continental', region: 'Europe', championId: 'esp', runnerUpId: 'ita', thirdId: 'deu', fourthId: 'prt' }),
    row({ year: 2025, kind: 'confederations', region: null, championId: 'fra', runnerUpId: 'bra', thirdId: 'esp', fourthId: 'mex' }),
  ];
  const base = { kind: 'all' as const, region: null, teamId: null, yearFrom: null, yearTo: null };

  it('sin filtros devuelve todo', () => {
    expect(filterTimeline(rows, base)).toHaveLength(3);
  });
  it('filtra por tipo de competición', () => {
    expect(filterTimeline(rows, { ...base, kind: 'continental' }).map((r) => r.championId)).toEqual(['esp']);
  });
  it('filtra continental por región', () => {
    expect(filterTimeline(rows, { ...base, kind: 'continental', region: 'Europe' })).toHaveLength(1);
    expect(filterTimeline(rows, { ...base, kind: 'continental', region: 'Asia' })).toHaveLength(0);
  });
  it('filtra por equipo en cualquier puesto del podio', () => {
    // esp: campeón en 2026 (continental) y tercero en 2025 (confed) ⇒ 2 filas
    expect(filterTimeline(rows, { ...base, teamId: 'esp' })).toHaveLength(2);
  });
  it('filtra por rango de años inclusivo', () => {
    expect(filterTimeline(rows, { ...base, yearFrom: 2026, yearTo: 2026 })).toHaveLength(2);
  });
});

describe('summarizeChampions', () => {
  it('cuenta títulos, años distintos y selecciones campeonas distintas', () => {
    const rows = [
      row({ year: 2026, championId: 'arg' }),
      row({ year: 2026, championId: 'esp' }),
      row({ year: 2025, championId: 'arg' }),
    ];
    expect(summarizeChampions(rows)).toEqual({ totalTitles: 3, years: 2, teams: 2 });
  });
});

const histDbRow = () => ({
  tournament_id: 't1', year: 2026, kind: 'world-cup', region: null, ord: 0,
  champion_id: 'arg', runner_up_id: 'fra', third_id: 'bra', fourth_id: 'nld',
  champion_score: 2, runner_up_score: 1, champion_pen: null, runner_up_pen: null,
  champion_name: 'Argentina', runner_up_name: 'Francia', third_name: 'Brasil',
  fourth_name: 'Holanda', champion_region: 'America',
});

afterEach(() => vi.restoreAllMocks());

describe('championsService.getChampionsHistory', () => {
  it('mapea snake_case → camelCase', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supaLib.supabase as unknown as { rpc: (...a: unknown[]) => unknown }, 'rpc')
      .mockResolvedValue({ data: [histDbRow()], error: null } as never);

    const res = await championsService.getChampionsHistory();
    expect(res[0]).toMatchObject({
      tournamentId: 't1', year: 2026, kind: 'world-cup',
      championId: 'arg', championName: 'Argentina', runnerUpId: 'fra',
      championScore: 2, runnerUpScore: 1, championPen: null,
    });
  });
  it('sin Supabase ⇒ []', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(false);
    expect(await championsService.getChampionsHistory()).toEqual([]);
  });
});

describe('championsService.getPalmares', () => {
  it('mapea filas y convierte bigints-string a number', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supaLib.supabase as unknown as { rpc: (...a: unknown[]) => unknown }, 'rpc')
      .mockResolvedValue({
        data: [{
          team_id: 'bra', team_name: 'Brasil', region: 'America',
          titles: '4', runner_ups: '1', thirds: '0',
          wc_titles: '2', continental_titles: '2', confed_titles: '0',
        }],
        error: null,
      } as never);

    const res = await championsService.getPalmares();
    expect(res[0]).toEqual({
      teamId: 'bra', teamName: 'Brasil', region: 'America',
      titles: 4, runnerUps: 1, thirds: 0,
      wcTitles: 2, continentalTitles: 2, confedTitles: 0,
    });
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/services/__tests__/championsService.test.ts`
Expected: FAIL — `Cannot find module '../championsService'`.

- [ ] **Step 3: Implementar el service**

Crear `src/services/championsService.ts`:

```ts
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export type CompetitionKind = 'world-cup' | 'continental' | 'confederations';

export interface ChampionHistoryRow {
  tournamentId: string;
  year: number;
  kind: CompetitionKind;
  region: string | null;
  championId: string | null;
  championName: string | null;
  championRegion: string | null;
  runnerUpId: string | null;
  runnerUpName: string | null;
  thirdId: string | null;
  thirdName: string | null;
  fourthId: string | null;
  fourthName: string | null;
  championScore: number | null;
  runnerUpScore: number | null;
  championPen: number | null;
  runnerUpPen: number | null;
}

export interface PalmaresRow {
  teamId: string;
  teamName: string;
  region: string;
  titles: number;
  runnerUps: number;
  thirds: number;
  wcTitles: number;
  continentalTitles: number;
  confedTitles: number;
}

export interface TimelineFilters {
  kind: CompetitionKind | 'all';
  region: string | null;
  teamId: string | null;
  yearFrom: number | null;
  yearTo: number | null;
}

// "2 - 1" o "1 - 1 (4-2 pen)". Vacío si no hay marcador (final no jugada).
export const formatFinalScore = (row: ChampionHistoryRow): string => {
  if (row.championScore === null || row.runnerUpScore === null) return '';
  const base = `${row.championScore} - ${row.runnerUpScore}`;
  if (row.championPen !== null && row.runnerUpPen !== null) {
    return `${base} (${row.championPen}-${row.runnerUpPen} pen)`;
  }
  return base;
};

// Filtra la cronología en el cliente sobre las filas ya traídas.
export const filterTimeline = (
  rows: ChampionHistoryRow[],
  f: TimelineFilters,
): ChampionHistoryRow[] =>
  rows.filter((r) => {
    if (f.kind !== 'all' && r.kind !== f.kind) return false;
    if (f.region && r.region !== f.region) return false;
    if (f.teamId) {
      const inPodium =
        r.championId === f.teamId ||
        r.runnerUpId === f.teamId ||
        r.thirdId === f.teamId ||
        r.fourthId === f.teamId;
      if (!inPodium) return false;
    }
    if (f.yearFrom !== null && r.year < f.yearFrom) return false;
    if (f.yearTo !== null && r.year > f.yearTo) return false;
    return true;
  });

// Resumen del header: títulos totales, años distintos, selecciones campeonas distintas.
export const summarizeChampions = (
  rows: ChampionHistoryRow[],
): { totalTitles: number; years: number; teams: number } => ({
  totalTitles: rows.length,
  years: new Set(rows.map((r) => r.year)).size,
  teams: new Set(rows.map((r) => r.championId).filter(Boolean)).size,
});

const num = (v: unknown): number => Number(v ?? 0);
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

export const championsService = {
  async getChampionsHistory(): Promise<ChampionHistoryRow[]> {
    if (!isSupabaseConfigured()) return [];

    const { data, error } = await (supabase as any).rpc('champions_history');
    if (error) throw error;

    return ((data ?? []) as any[]).map((r) => ({
      tournamentId: r.tournament_id,
      year: num(r.year),
      kind: r.kind as CompetitionKind,
      region: r.region ?? null,
      championId: r.champion_id ?? null,
      championName: r.champion_name ?? null,
      championRegion: r.champion_region ?? null,
      runnerUpId: r.runner_up_id ?? null,
      runnerUpName: r.runner_up_name ?? null,
      thirdId: r.third_id ?? null,
      thirdName: r.third_name ?? null,
      fourthId: r.fourth_id ?? null,
      fourthName: r.fourth_name ?? null,
      championScore: numOrNull(r.champion_score),
      runnerUpScore: numOrNull(r.runner_up_score),
      championPen: numOrNull(r.champion_pen),
      runnerUpPen: numOrNull(r.runner_up_pen),
    }));
  },

  async getPalmares(): Promise<PalmaresRow[]> {
    if (!isSupabaseConfigured()) return [];

    const { data, error } = await (supabase as any).rpc('champions_palmares');
    if (error) throw error;

    return ((data ?? []) as any[]).map((r) => ({
      teamId: r.team_id,
      teamName: r.team_name,
      region: r.region,
      titles: num(r.titles),
      runnerUps: num(r.runner_ups),
      thirds: num(r.thirds),
      wcTitles: num(r.wc_titles),
      continentalTitles: num(r.continental_titles),
      confedTitles: num(r.confed_titles),
    }));
  },
};
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/services/__tests__/championsService.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/services/championsService.ts src/services/__tests__/championsService.test.ts
git commit -m "feat(campeones): championsService con RPCs y helpers de cronología"
```

---

## Task 3: Componente `ChampionsPalmares.tsx`

**Files:**
- Create: `src/components/tournament/ChampionsPalmares.tsx`

**Interfaces:**
- Consumes: `PalmaresRow` (Task 2); `useTeamProfile` de `../../hooks/useTeamProfile`; `TeamFlag` de `../ui/TeamFlag`; `Team` de `../../types`.
- Produces: `export function ChampionsPalmares(props: { rows: PalmaresRow[]; onSelectTeam: (teamId: string) => void }): JSX.Element`

Nota: es presentacional. Toda la lógica testeable ya vive en `championsService` (Task 2); aquí la verificación es `tsc -b` + revisión visual en la app.

- [ ] **Step 1: Escribir el componente**

Crear `src/components/tournament/ChampionsPalmares.tsx`:

```tsx
import { useState } from 'react';
import type { PalmaresRow } from '../../services/championsService';
import type { Region, Team } from '../../types';
import { TeamFlag } from '../ui/TeamFlag';
import { useTeamProfile } from '../../hooks/useTeamProfile';
import { Trophy, Medal, Award } from 'lucide-react';

const REGION_LABELS: Record<Region, string> = {
  Europe: 'Europa',
  America: 'América',
  Africa: 'África',
  Asia: 'Asia',
};

interface ChampionsPalmaresProps {
  rows: PalmaresRow[];
  onSelectTeam: (teamId: string) => void;
}

export function ChampionsPalmares({ rows, onSelectTeam }: ChampionsPalmaresProps) {
  const [regionFilter, setRegionFilter] = useState<Region | 'all'>('all');
  const { openTeamProfile } = useTeamProfile();

  const visible = regionFilter === 'all'
    ? rows
    : rows.filter((r) => r.region === regionFilter);

  return (
    <div className="space-y-4">
      {/* Filtro por región */}
      <div className="flex flex-wrap gap-2">
        <FilterChip active={regionFilter === 'all'} onClick={() => setRegionFilter('all')}>
          Todas
        </FilterChip>
        {(Object.keys(REGION_LABELS) as Region[]).map((region) => (
          <FilterChip
            key={region}
            active={regionFilter === region}
            onClick={() => setRegionFilter(region)}
          >
            {REGION_LABELS[region]}
          </FilterChip>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-center py-8 text-grass-soft text-sm">
          Sin campeones para esta región.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-grass-dark">
              <tr className="border-b-2 border-grass">
                <th className="text-left py-3 px-2 sm:px-4 font-arcade text-[10px] text-gold uppercase">#</th>
                <th className="text-left py-3 px-2 sm:px-4 font-arcade text-[10px] text-gold uppercase">Equipo</th>
                <th className="py-3 px-2 font-arcade text-[10px] text-gold uppercase" title="Títulos">
                  <Trophy className="w-4 h-4 text-gold inline" />
                </th>
                <th className="py-3 px-2 font-arcade text-[10px] text-gold uppercase" title="Subcampeonatos">
                  <Medal className="w-4 h-4 text-grass-soft inline" />
                </th>
                <th className="py-3 px-2 font-arcade text-[10px] text-gold uppercase" title="Terceros puestos">
                  <Award className="w-4 h-4 text-grass-soft inline" />
                </th>
                <th className="py-3 px-2 font-arcade text-[9px] text-grass-soft uppercase">MUN</th>
                <th className="py-3 px-2 font-arcade text-[9px] text-grass-soft uppercase">CON</th>
                <th className="py-3 px-2 font-arcade text-[9px] text-grass-soft uppercase">CCF</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-grass">
              {visible.map((row, idx) => {
                const team: Team = {
                  id: row.teamId,
                  name: row.teamName,
                  flag: '',
                  region: row.region as Region,
                  skill: 0,
                };
                return (
                  <tr
                    key={row.teamId}
                    className="hover:bg-grass/40 transition-colors cursor-pointer"
                    onClick={() => onSelectTeam(row.teamId)}
                  >
                    <td className="py-3 px-2 sm:px-4 font-terminal text-led tabular-nums text-lg">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-2 sm:px-4">
                      <div className="flex items-center gap-2">
                        {/* La bandera abre el perfil; el span frena la propagación
                            para que el clic no dispare también onSelectTeam de la fila.
                            (TeamFlag.onClick es () => void, no recibe el evento.) */}
                        <span onClick={(e) => e.stopPropagation()}>
                          <TeamFlag
                            teamId={row.teamId}
                            teamName={row.teamName}
                            size={24}
                            onClick={() => openTeamProfile(team)}
                            clickable
                          />
                        </span>
                        <span className="font-arcade text-[10px] uppercase whitespace-nowrap">
                          {row.teamName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center font-terminal text-led tabular-nums text-lg">{row.titles}</td>
                    <td className="py-3 px-2 text-center font-terminal text-grass-soft tabular-nums">{row.runnerUps}</td>
                    <td className="py-3 px-2 text-center font-terminal text-grass-soft tabular-nums">{row.thirds}</td>
                    <td className="py-3 px-2 text-center font-terminal text-grass-soft tabular-nums">{row.wcTitles}</td>
                    <td className="py-3 px-2 text-center font-terminal text-grass-soft tabular-nums">{row.continentalTitles}</td>
                    <td className="py-3 px-2 text-center font-terminal text-grass-soft tabular-nums">{row.confedTitles}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 font-arcade text-[9px] uppercase border-2 transition-colors ${
        active
          ? 'border-gold text-gold bg-grass/30'
          : 'border-grass text-grass-soft hover:text-white hover:bg-grass/40'
      }`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: sin errores. (`TeamFlag.onClick` es `() => void` —confirmado en `src/components/ui/TeamFlag.tsx`—, por eso el `stopPropagation` va en el `<span>` que envuelve la bandera, no en su `onClick`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/tournament/ChampionsPalmares.tsx
git commit -m "feat(campeones): pestaña Palmarés (ranking por títulos)"
```

---

## Task 4: Componente `ChampionsTimeline.tsx`

**Files:**
- Create: `src/components/tournament/ChampionsTimeline.tsx`

**Interfaces:**
- Consumes: `ChampionHistoryRow`, `TimelineFilters`, `filterTimeline`, `formatFinalScore`, `CompetitionKind` (Task 2); `TeamFlag`; `useTeamProfile`; `Region`, `Team`.
- Produces: `export function ChampionsTimeline(props: { rows: ChampionHistoryRow[]; teamFilter: string | null; onClearTeamFilter: () => void; onOpenTournament: (tournamentId: string, kind: CompetitionKind) => void }): JSX.Element`

Nota: presentacional; lógica de filtrado/formato ya testeada en Task 2. Verificación: `tsc -b` + revisión visual.

- [ ] **Step 1: Escribir el componente**

Crear `src/components/tournament/ChampionsTimeline.tsx`:

```tsx
import { useMemo, useState } from 'react';
import {
  filterTimeline,
  formatFinalScore,
  type ChampionHistoryRow,
  type CompetitionKind,
  type TimelineFilters,
} from '../../services/championsService';
import type { Region, Team } from '../../types';
import { TeamFlag } from '../ui/TeamFlag';
import { useTeamProfile } from '../../hooks/useTeamProfile';
import { ChevronRight, X } from 'lucide-react';

const REGION_LABELS: Record<Region, string> = {
  Europe: 'Europa',
  America: 'América',
  Africa: 'África',
  Asia: 'Asia',
};

const KIND_LABELS: Record<CompetitionKind, string> = {
  'world-cup': 'Mundial',
  continental: 'Continental',
  confederations: 'Copa Confederaciones',
};

function competitionLabel(row: ChampionHistoryRow): string {
  if (row.kind === 'continental' && row.region) {
    return `Continental · ${REGION_LABELS[row.region as Region] ?? row.region}`;
  }
  return KIND_LABELS[row.kind];
}

interface ChampionsTimelineProps {
  rows: ChampionHistoryRow[];
  teamFilter: string | null;
  onClearTeamFilter: () => void;
  onOpenTournament: (tournamentId: string, kind: CompetitionKind) => void;
}

export function ChampionsTimeline({
  rows,
  teamFilter,
  onClearTeamFilter,
  onOpenTournament,
}: ChampionsTimelineProps) {
  const [kind, setKind] = useState<CompetitionKind | 'all'>('all');
  const [region, setRegion] = useState<Region | null>(null);
  const { openTeamProfile } = useTeamProfile();

  const years = useMemo(() => rows.map((r) => r.year), [rows]);
  const minYear = years.length ? Math.min(...years) : null;
  const maxYear = years.length ? Math.max(...years) : null;

  const filters: TimelineFilters = {
    kind,
    region: kind === 'continental' ? region : null,
    teamId: teamFilter,
    yearFrom: null,
    yearTo: null,
  };
  const visible = filterTimeline(rows, filters);

  const teamName = teamFilter
    ? rows.find((r) =>
        [r.championId, r.runnerUpId, r.thirdId, r.fourthId].includes(teamFilter),
      )
    : null;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <FilterChip active={kind === 'all'} onClick={() => setKind('all')}>Todas</FilterChip>
        <FilterChip active={kind === 'world-cup'} onClick={() => setKind('world-cup')}>Mundial</FilterChip>
        <FilterChip active={kind === 'continental'} onClick={() => setKind('continental')}>Continental</FilterChip>
        <FilterChip active={kind === 'confederations'} onClick={() => setKind('confederations')}>Confed.</FilterChip>
        {kind === 'continental' && (
          <>
            <span className="text-grass-soft text-xs px-1">·</span>
            <FilterChip active={region === null} onClick={() => setRegion(null)}>Todas</FilterChip>
            {(Object.keys(REGION_LABELS) as Region[]).map((r) => (
              <FilterChip key={r} active={region === r} onClick={() => setRegion(r)}>
                {REGION_LABELS[r]}
              </FilterChip>
            ))}
          </>
        )}
      </div>

      {/* Chip de filtro por equipo (cross-tab desde Palmarés) */}
      {teamFilter && (
        <button
          onClick={onClearTeamFilter}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border-2 border-gold text-gold font-arcade text-[9px] uppercase"
        >
          Equipo: {teamName?.championName ?? teamName?.runnerUpName ?? teamFilter.toUpperCase()}
          <X className="w-3 h-3" />
        </button>
      )}

      {minYear !== null && maxYear !== null && (
        <p className="text-xs text-grass-soft">
          {visible.length} de {rows.length} títulos · {minYear}–{maxYear}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="text-center py-8 text-grass-soft text-sm">
          Sin resultados para estos filtros.
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((row) => (
            <TimelineRow
              key={`${row.tournamentId}-${row.kind}-${row.region ?? ''}`}
              row={row}
              onOpenProfile={openTeamProfile}
              onOpenTournament={() => onOpenTournament(row.tournamentId, row.kind)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineRow({
  row,
  onOpenProfile,
  onOpenTournament,
}: {
  row: ChampionHistoryRow;
  onOpenProfile: (team: Team) => void;
  onOpenTournament: () => void;
}) {
  const score = formatFinalScore(row);
  const teamOf = (id: string | null, name: string | null): Team | null =>
    id ? { id, name: name ?? id, flag: '', region: 'Europe', skill: 0 } : null;

  const champion = teamOf(row.championId, row.championName);
  const runnerUp = teamOf(row.runnerUpId, row.runnerUpName);
  const third = teamOf(row.thirdId, row.thirdName);
  const fourth = teamOf(row.fourthId, row.fourthName);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-grass-dark/40 border-2 border-grass hover:bg-grass/30 transition-colors">
      {/* Año + competición */}
      <div className="flex items-center gap-3 sm:w-56 shrink-0">
        <span className="font-terminal text-led tabular-nums text-lg">{row.year}</span>
        <span className="font-arcade text-[9px] text-white uppercase leading-tight">
          {competitionLabel(row)}
        </span>
      </div>

      {/* Final */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <MiniTeam team={champion} onOpenProfile={onOpenProfile} bold />
        <span className="font-terminal text-led tabular-nums whitespace-nowrap px-1">
          {score || 'vs'}
        </span>
        <MiniTeam team={runnerUp} onOpenProfile={onOpenProfile} />
      </div>

      {/* 3° / 4° */}
      <div className="flex items-center gap-2 sm:w-28 shrink-0">
        {third && <MiniFlag team={third} onOpenProfile={onOpenProfile} />}
        {fourth && <MiniFlag team={fourth} onOpenProfile={onOpenProfile} />}
      </div>

      {/* Ir al bracket */}
      <button
        onClick={onOpenTournament}
        className="shrink-0 flex items-center justify-center w-9 h-9 border-2 border-grass text-gold hover:bg-grass/40 transition-colors"
        title="Ver este torneo"
        aria-label="Ver este torneo"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function MiniTeam({
  team,
  onOpenProfile,
  bold = false,
}: {
  team: Team | null;
  onOpenProfile: (team: Team) => void;
  bold?: boolean;
}) {
  if (!team) return <span className="text-grass-soft italic text-sm">-</span>;
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <TeamFlag teamId={team.id} teamName={team.name} size={24} onClick={() => onOpenProfile(team)} clickable />
      <span className={`font-arcade text-[9px] uppercase truncate ${bold ? 'text-gold' : 'text-white'}`}>
        {team.name}
      </span>
    </div>
  );
}

function MiniFlag({ team, onOpenProfile }: { team: Team; onOpenProfile: (team: Team) => void }) {
  return (
    <TeamFlag teamId={team.id} teamName={team.name} size={20} onClick={() => onOpenProfile(team)} clickable />
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 font-arcade text-[9px] uppercase border-2 transition-colors ${
        active
          ? 'border-gold text-gold bg-grass/30'
          : 'border-grass text-grass-soft hover:text-white hover:bg-grass/40'
      }`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: sin errores. (En este componente las banderas no están dentro de una fila clickeable —solo el botón `→` y las propias banderas tienen `onClick`—, así que no hace falta `stopPropagation`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/tournament/ChampionsTimeline.tsx
git commit -m "feat(campeones): pestaña Cronología con marcador, penales y navegación al bracket"
```

---

## Task 5: Contenedor `ChampionsHistory.tsx` (reescrito) + wiring en `App.tsx`

**Files:**
- Rewrite: `src/components/tournament/ChampionsHistory.tsx`
- Modify: `src/App.tsx` (línea del render de `champions`)

**Interfaces:**
- Consumes: `championsService.getChampionsHistory()`, `championsService.getPalmares()`, `summarizeChampions` (Task 2); `ChampionsPalmares` (Task 3); `ChampionsTimeline` (Task 4); `useTournamentStore().selectTournament`; `CompetitionKind`.
- Produces: `export function ChampionsHistory(props: { onNavigate: (view: string) => void }): JSX.Element`

- [ ] **Step 1: Reescribir el contenedor**

Reemplazar TODO el contenido de `src/components/tournament/ChampionsHistory.tsx` por:

```tsx
import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useTournamentStore } from '../../store/useTournamentStore';
import {
  championsService,
  summarizeChampions,
  type ChampionHistoryRow,
  type PalmaresRow,
  type CompetitionKind,
} from '../../services/championsService';
import { ChampionsPalmares } from './ChampionsPalmares';
import { ChampionsTimeline } from './ChampionsTimeline';
import { Trophy, ListOrdered, Loader, AlertTriangle } from 'lucide-react';

type Tab = 'palmares' | 'timeline';

// Mapea el tipo de competición a la vista/bracket correspondiente.
const VIEW_FOR_KIND: Record<CompetitionKind, string> = {
  'world-cup': 'worldcup',
  continental: 'continental',
  confederations: 'confederations',
};

interface ChampionsHistoryProps {
  onNavigate: (view: string) => void;
}

export function ChampionsHistory({ onNavigate }: ChampionsHistoryProps) {
  const [tab, setTab] = useState<Tab>('palmares');
  const [history, setHistory] = useState<ChampionHistoryRow[]>([]);
  const [palmares, setPalmares] = useState<PalmaresRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const { selectTournament } = useTournamentStore();

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, []);

  const load = async (signal: { cancelled: boolean }) => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const [hist, palm] = await Promise.all([
        championsService.getChampionsHistory(),
        championsService.getPalmares(),
      ]);
      if (signal.cancelled) return;
      setHistory(hist);
      setPalmares(palm);
      setLoading(false);
    } catch (err) {
      console.error('Error loading champions history:', err);
      if (!signal.cancelled) {
        setError(true);
        setLoading(false);
      }
    }
  };

  const handleSelectTeam = (teamId: string) => {
    setTeamFilter(teamId);
    setTab('timeline');
  };

  const handleOpenTournament = async (tournamentId: string, kind: CompetitionKind) => {
    await selectTournament(tournamentId);
    onNavigate(VIEW_FOR_KIND[kind]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="w-8 h-8 animate-spin text-gold" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <div className="text-center py-12">
            <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-gold" />
            <p className="font-arcade text-xs text-white text-shadow-retro uppercase mb-2">
              Error al cargar los campeones
            </p>
            <p className="text-sm text-grass-soft mb-4">
              No se pudo leer el historial. Reintentá.
            </p>
            <button
              onClick={() => load({ cancelled: false })}
              className="px-4 py-2 font-arcade text-[10px] uppercase border-2 border-gold text-gold hover:bg-grass/40 transition-colors"
            >
              Reintentar
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-shadow-retro">
            <Trophy className="w-5 h-5 text-gold" />
            HIGH SCORES
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Trophy className="w-16 h-16 mx-auto mb-4 text-grass-soft" />
            <p className="font-arcade text-xs text-white text-shadow-retro uppercase mb-2">
              No hay torneos completados
            </p>
            <p className="text-sm text-grass-soft mt-2">
              Los campeones aparecerán aquí cuando completes un torneo
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const summary = summarizeChampions(history);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-shadow-retro">
            <Trophy className="w-5 h-5 text-gold" />
            HIGH SCORES
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-grass-soft">
            {summary.totalTitles} {summary.totalTitles === 1 ? 'título' : 'títulos'} ·{' '}
            {summary.years} {summary.years === 1 ? 'año' : 'años'} · {summary.teams}{' '}
            {summary.teams === 1 ? 'selección' : 'selecciones'}
          </p>
        </CardContent>
      </Card>

      {/* Selector de pestaña */}
      <div className="flex border-b-4 border-grass">
        <button
          onClick={() => setTab('palmares')}
          className={`flex items-center gap-2 px-4 py-3 font-arcade text-[10px] uppercase border-b-4 transition-colors ${
            tab === 'palmares'
              ? 'border-gold text-gold bg-grass/30'
              : 'border-transparent text-grass-soft hover:text-white hover:bg-grass/40'
          }`}
        >
          <Trophy className="w-4 h-4" />
          Palmarés
        </button>
        <button
          onClick={() => setTab('timeline')}
          className={`flex items-center gap-2 px-4 py-3 font-arcade text-[10px] uppercase border-b-4 transition-colors ${
            tab === 'timeline'
              ? 'border-gold text-gold bg-grass/30'
              : 'border-transparent text-grass-soft hover:text-white hover:bg-grass/40'
          }`}
        >
          <ListOrdered className="w-4 h-4" />
          Cronología
        </button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {tab === 'palmares' ? (
            <ChampionsPalmares rows={palmares} onSelectTeam={handleSelectTeam} />
          ) : (
            <ChampionsTimeline
              rows={history}
              teamFilter={teamFilter}
              onClearTeamFilter={() => setTeamFilter(null)}
              onOpenTournament={handleOpenTournament}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Cablear `onNavigate` en `App.tsx`**

En `src/App.tsx`, cambiar el render de la vista `champions` de:

```tsx
        ) : currentView === 'champions' ? (
          <ChampionsHistory />
```

a:

```tsx
        ) : currentView === 'champions' ? (
          <ChampionsHistory onNavigate={handleNavigate} />
```

(`handleNavigate` ya existe en `App.tsx` y acepta `(view: string, options?) => void`.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: sin errores.

- [ ] **Step 4: Correr toda la suite**

Run: `npx vitest run`
Expected: verde (incluye los tests nuevos de Task 2; ningún test previo roto).

- [ ] **Step 5: Verificar en la app**

Run: `npm run dev` y abrir la pestaña de campeones. Confirmar:
- Pestaña **Palmarés** muestra el ranking ordenado por títulos; el filtro por región funciona; clic en una fila salta a **Cronología** con el chip "Equipo: …".
- Pestaña **Cronología** muestra el marcador de cada final, `(x-y pen)` donde hubo penales, 3°/4°, y el botón `→` cambia el torneo activo y abre el bracket correcto (Mundial/continental/Confed).
- El clic en una bandera abre el perfil del equipo (no dispara la navegación de fila).
- En móvil las filas de la cronología se apilan sin scroll horizontal.

- [ ] **Step 6: Commit**

```bash
git add src/components/tournament/ChampionsHistory.tsx src/App.tsx
git commit -m "feat(campeones): contenedor con pestañas Palmarés/Cronología, error con reintento y navegación"
```

---

## Self-Review (completado)

**1. Spec coverage:**
- Palmarés por equipo → Task 1 (`champions_palmares`) + Task 3. ✓
- Filtros (competición/región/equipo) → Task 2 (`filterTimeline`) + Tasks 3/4. ✓ (rango de años quedó reducido a mostrar min–max; el filtro por equipo cross-tab sí se implementa. Ver nota.)
- Contexto por fila (marcador, penales, navegación) → Task 1 (`champion_score`/pen) + Task 4. ✓
- Móvil (cards apiladas) → Task 4 (`flex-col sm:flex-row`). ✓
- Rendimiento (RPC server-side, no bajar JSONB) → Task 1 + Task 2. ✓
- Errores con reintento → Task 5. ✓
- Sede/anfitrión → fuera de alcance (no existe en el modelo). ✓

**Nota de alcance:** el spec listaba "rango de años" como filtro de la cronología. El helper `filterTimeline` ya soporta `yearFrom`/`yearTo` (y está testeado), pero la UI de Task 4 solo muestra el rango min–max como texto y no expone un control de rango, para no sobrecargar la barra de filtros en el volumen actual (~6 filas/año, 4 años). El control de rango se puede añadir después sin tocar el service. Documentado como decisión, no como omisión.

**2. Placeholder scan:** sin TBD/TODO; todo el código está completo.

**3. Type consistency:** `ChampionHistoryRow`/`PalmaresRow`/`TimelineFilters`/`CompetitionKind` definidos en Task 2 y usados con los mismos nombres en Tasks 3/4/5. Columnas del RPC (Task 1) ↔ mapeo del service (Task 2) verificadas campo a campo. `formatFinalScore`/`filterTimeline`/`summarizeChampions` con firmas idénticas donde se consumen.

**4. Dependencia entre tasks:** 1→2→(3,4)→5. Task 5 integra 3 y 4. `TeamFlag.onClick` es `() => void` (confirmado en el codebase): en Task 3 el clic en la bandera se aísla con un `<span onClick={stopPropagation}>`; en Task 4 no hay conflicto de propagación. Sin puntos abiertos.
