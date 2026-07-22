# Paginación backend del historial de partidos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paginar el historial de partidos con keyset (cursor) en el backend y mover las tres agregaciones que hoy descargan la tabla completa a RPCs SQL, para que ninguna pantalla baje `match_history` entera.

**Architecture:** Una migración agrega índices compuestos `(played_at DESC, id DESC)` y cuatro funciones SQL (`get_matches_page`, `get_match_statistics`, `get_team_stats`, `get_region_stats`). El servicio `matchHistoryService` gana un método de página keyset y wrappers de los RPCs de stats, y pierde los caminos full-table. `MatchHistory` pasa a "Cargar más" con cursor y antepone inserts en tiempo real; `HistoricalStats` consume los dos RPCs de stats en paralelo.

**Tech Stack:** React + TypeScript (strict), Zustand, Supabase (PostgREST + RPC), Vitest + @testing-library/react (jsdom).

## Global Constraints

- **`tsc -b` debe pasar** y la **suite Vitest debe quedar verde** (hoy 198 tests) al final de cada task.
- Los RPCs se invocan con el cast existente `(supabase as any).rpc(...)` — **no** se regeneran los tipos de `database.ts` (mismo patrón que `get_team_recent_matches`).
- **Las columnas `bigint` (COUNT/SUM) llegan como `string` en el JSON de PostgREST.** Todo mapeo de un agregado numérico debe envolverse en `Number(...)`.
- La migración es **puramente aditiva** (índices + funciones): no toca ni una fila de datos.
- RPCs `SECURITY INVOKER` (la RLS de `match_history` ya da read público a `anon`) + `GRANT EXECUTE ... TO anon, authenticated`.
- Toda función que persista/lea debe respetar el guard `isSupabaseConfigured()` ya usado en el servicio (devolver vacío/mock si es false).
- Commits: Conventional Commits, y cada mensaje termina con el trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## File Structure

- **Create** `supabase/migrations/012_match_history_pagination.sql` — índices + 4 RPCs.
- **Modify** `supabase/schema.sql` — misma definición (índices + funciones) para bootstrap de DB nueva.
- **Modify** `src/services/matchHistoryService.ts` — tipos `MatchCursor`/`MatchPage`/`TeamStatsRow`/`RegionStatsRow`, helpers puros `assembleMatchPage`/`computeWinRate`, métodos `getMatchesPage`/`getTeamStats`/`getRegionStats`, reescritura de `getMatchStatistics`, nueva firma de `subscribeToMatches`; borrado de `getAllMatches` y `getMatchesByStage`.
- **Create** `src/services/__tests__/matchHistoryService.test.ts` — tests de helpers puros y wrappers de RPC.
- **Modify** `src/components/tournament/MatchHistory.tsx` — UI "Cargar más" con cursor + prepend en tiempo real.
- **Create** `src/components/tournament/__tests__/MatchHistory.test.tsx` — test RTL de paginación.
- **Modify** `src/components/tournament/HistoricalStats.tsx` — consumir `getTeamStats` + `getRegionStats`.

---

## Task 1: Migración 012 — índices keyset + 4 RPCs

**Files:**
- Create: `supabase/migrations/012_match_history_pagination.sql`
- Modify: `supabase/schema.sql` (índices tras la línea 47; funciones tras `get_team_recent_matches`)

**Interfaces:**
- Produces (SQL, invocados vía `supabase.rpc`):
  - `get_matches_page(p_cursor_played_at timestamptz, p_cursor_id uuid, p_page_size int, p_stage text) → SETOF match_history`
  - `get_match_statistics() → (total_matches bigint, total_goals bigint, avg_goals double precision)`
  - `get_team_stats() → (team_id text, total_matches bigint, wins bigint, draws bigint, losses bigint, goals_for bigint, goals_against bigint)`
  - `get_region_stats() → (region text, total_goals bigint, matches_played bigint)`

- [ ] **Step 1: Crear el archivo de migración**

Create `supabase/migrations/012_match_history_pagination.sql`:

```sql
-- 012_match_history_pagination.sql
-- Paginación keyset del historial + agregaciones server-side.
-- Aditiva: solo índices y funciones; no toca datos.

-- 1) Índices compuestos para keyset (played_at DESC, id DESC)
CREATE INDEX IF NOT EXISTS idx_match_history_keyset
  ON match_history (played_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_match_history_stage_keyset
  ON match_history (stage, played_at DESC, id DESC);
-- El índice suelto de played_at queda cubierto como prefijo del keyset.
DROP INDEX IF EXISTS idx_match_history_played_at;

-- 2) Página keyset del historial
CREATE OR REPLACE FUNCTION get_matches_page(
  p_cursor_played_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_page_size INTEGER DEFAULT 30,
  p_stage TEXT DEFAULT NULL
)
RETURNS SETOF match_history
LANGUAGE sql STABLE
AS $$
  SELECT *
  FROM match_history
  WHERE (p_stage IS NULL OR stage = p_stage)
    AND (
      p_cursor_played_at IS NULL
      OR (played_at, id) < (p_cursor_played_at, p_cursor_id)
    )
  ORDER BY played_at DESC, id DESC
  LIMIT LEAST(GREATEST(p_page_size, 1), 100);
$$;

-- 3) Estadísticas globales (una fila)
CREATE OR REPLACE FUNCTION get_match_statistics()
RETURNS TABLE (
  total_matches BIGINT,
  total_goals BIGINT,
  avg_goals DOUBLE PRECISION
)
LANGUAGE sql STABLE
AS $$
  SELECT
    COUNT(*)::bigint,
    COALESCE(SUM(home_score + away_score), 0)::bigint,
    COALESCE(AVG(home_score + away_score), 0)::double precision
  FROM match_history;
$$;

-- 4) Stats por equipo (~210 filas)
CREATE OR REPLACE FUNCTION get_team_stats()
RETURNS TABLE (
  team_id TEXT,
  total_matches BIGINT,
  wins BIGINT,
  draws BIGINT,
  losses BIGINT,
  goals_for BIGINT,
  goals_against BIGINT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    x.team_id,
    COUNT(*)::bigint,
    SUM((x.gf > x.ga)::int)::bigint,
    SUM((x.gf = x.ga)::int)::bigint,
    SUM((x.gf < x.ga)::int)::bigint,
    SUM(x.gf)::bigint,
    SUM(x.ga)::bigint
  FROM (
    SELECT home_team_id AS team_id, home_score AS gf, away_score AS ga FROM match_history
    UNION ALL
    SELECT away_team_id AS team_id, away_score AS gf, home_score AS ga FROM match_history
  ) x
  GROUP BY x.team_id;
$$;

-- 5) Stats regionales (solo qualifier, por región del equipo local, por partido)
CREATE OR REPLACE FUNCTION get_region_stats()
RETURNS TABLE (
  region TEXT,
  total_goals BIGINT,
  matches_played BIGINT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    ht.region,
    COALESCE(SUM(mh.home_score + mh.away_score), 0)::bigint,
    COUNT(*)::bigint
  FROM match_history mh
  JOIN teams ht ON ht.id = mh.home_team_id
  WHERE mh.stage = 'qualifier'
  GROUP BY ht.region;
$$;

GRANT EXECUTE ON FUNCTION get_matches_page(TIMESTAMPTZ, UUID, INTEGER, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_match_statistics() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_team_stats() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_region_stats() TO anon, authenticated;
```

- [ ] **Step 2: Reflejar índices y funciones en `schema.sql`**

En `supabase/schema.sql`, después de la línea 47 (`CREATE INDEX idx_match_history_tournament ...`), agregar:

```sql
CREATE INDEX idx_match_history_keyset ON match_history (played_at DESC, id DESC);
CREATE INDEX idx_match_history_stage_keyset ON match_history (stage, played_at DESC, id DESC);
```

Y después de la función `get_team_recent_matches(...)` (cerca de la línea 179), pegar **verbatim** los cuatro bloques `CREATE OR REPLACE FUNCTION` y los cuatro `GRANT EXECUTE` del Step 1 (get_matches_page, get_match_statistics, get_team_stats, get_region_stats). Es exactamente el mismo SQL.

- [ ] **Step 3: Aplicar la migración a Supabase**

⚠️ Acción con efecto sobre la base real. Es aditiva (solo índices + funciones, sin cambios de datos), pero confirmá con el usuario si no tenés autorización previa para escribir en la DB.

Aplicar vía MCP: `mcp__supabase__apply_migration` con `name: "012_match_history_pagination"` y el contenido SQL del Step 1.

Expected: sin error; la migración aparece en `mcp__supabase__list_migrations`.

- [ ] **Step 4: Smoke test de los cuatro RPCs**

Ejecutar con `mcp__supabase__execute_sql`, uno por uno:

```sql
SELECT * FROM get_matches_page(NULL, NULL, 5, NULL);
SELECT * FROM get_match_statistics();
SELECT * FROM get_team_stats() LIMIT 3;
SELECT * FROM get_region_stats();
```

Expected:
- `get_matches_page`: hasta 5 filas ordenadas por `played_at DESC` (0 si la tabla está vacía — igual válido).
- `get_match_statistics`: exactamente 1 fila con `total_matches`, `total_goals`, `avg_goals`.
- `get_team_stats`: hasta 3 filas con las 7 columnas.
- `get_region_stats`: 0..N filas (una por región con qualifiers).

- [ ] **Step 5: Verificar keyset con cursor (si hay datos)**

Si `get_matches_page(NULL,NULL,2,NULL)` devolvió ≥2 filas, tomar `played_at`/`id` de la última y verificar que la página siguiente no repite:

```sql
-- Reemplazar <PA> y <ID> por played_at e id de la última fila de la página 1.
SELECT * FROM get_matches_page('<PA>'::timestamptz, '<ID>'::uuid, 2, NULL);
```

Expected: filas estrictamente "más viejas o iguales-con-id-menor" que el cursor; ningún id repetido respecto de la página 1.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/012_match_history_pagination.sql supabase/schema.sql
git commit -m "feat(db): migración 012 — índices keyset + RPCs de página y stats del historial

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Servicio — tipos de cursor + helpers puros (TDD)

**Files:**
- Modify: `src/services/matchHistoryService.ts`
- Create: `src/services/__tests__/matchHistoryService.test.ts`

**Interfaces:**
- Produces:
  - `interface MatchCursor { playedAt: string; id: string }`
  - `interface MatchPage { matches: MatchHistoryEntry[]; nextCursor: MatchCursor | null; hasMore: boolean }`
  - `assembleMatchPage(entries: MatchHistoryEntry[], pageSize: number): MatchPage`
  - `computeWinRate(wins: number, totalMatches: number): number`

- [ ] **Step 1: Escribir el test que falla**

Create `src/services/__tests__/matchHistoryService.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  assembleMatchPage,
  computeWinRate,
  type MatchHistoryEntry,
} from '../matchHistoryService';

const entry = (id: string, playedAt: string): MatchHistoryEntry => ({
  id,
  homeTeamId: 'A',
  awayTeamId: 'B',
  homeScore: 1,
  awayScore: 0,
  stage: 'qualifier',
  homeSkillBefore: 80,
  awaySkillBefore: 70,
  homeSkillAfter: 81,
  awaySkillAfter: 69,
  homeSkillChange: 1,
  awaySkillChange: -1,
  playedAt,
});

describe('assembleMatchPage', () => {
  it('página llena ⇒ hasMore + cursor del último', () => {
    const res = assembleMatchPage(
      [entry('a', '2026-01-02T00:00:00Z'), entry('b', '2026-01-01T00:00:00Z')],
      2,
    );
    expect(res.hasMore).toBe(true);
    expect(res.nextCursor).toEqual({ playedAt: '2026-01-01T00:00:00Z', id: 'b' });
    expect(res.matches).toHaveLength(2);
  });

  it('página parcial ⇒ sin cursor', () => {
    const res = assembleMatchPage([entry('a', '2026-01-02T00:00:00Z')], 2);
    expect(res.hasMore).toBe(false);
    expect(res.nextCursor).toBeNull();
  });

  it('página vacía ⇒ sin cursor', () => {
    const res = assembleMatchPage([], 2);
    expect(res.hasMore).toBe(false);
    expect(res.nextCursor).toBeNull();
    expect(res.matches).toEqual([]);
  });
});

describe('computeWinRate', () => {
  it('calcula porcentaje', () => {
    expect(computeWinRate(3, 6)).toBe(50);
  });
  it('0 partidos ⇒ 0 (sin división por cero)', () => {
    expect(computeWinRate(0, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/services/__tests__/matchHistoryService.test.ts`
Expected: FAIL — `assembleMatchPage`/`computeWinRate` no exportados.

- [ ] **Step 3: Implementar los tipos y helpers**

En `src/services/matchHistoryService.ts`, después del bloque `export interface CreateMatchHistoryParams { ... }` (línea ~43), agregar:

```ts
export interface MatchCursor {
  playedAt: string;
  id: string;
}

export interface MatchPage {
  matches: MatchHistoryEntry[];
  nextCursor: MatchCursor | null;
  hasMore: boolean;
}

// Ensambla una página keyset a partir de las filas ya convertidas.
// hasMore es true sólo si la página vino llena (== pageSize); en ese caso el
// cursor apunta al último partido para pedir la siguiente.
export const assembleMatchPage = (
  entries: MatchHistoryEntry[],
  pageSize: number,
): MatchPage => {
  const hasMore = entries.length === pageSize;
  const last = entries[entries.length - 1];
  return {
    matches: entries,
    hasMore,
    nextCursor: hasMore && last ? { playedAt: last.playedAt, id: last.id } : null,
  };
};

// Porcentaje de victorias, con guard de división por cero.
export const computeWinRate = (wins: number, totalMatches: number): number =>
  totalMatches > 0 ? (wins / totalMatches) * 100 : 0;
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/services/__tests__/matchHistoryService.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/matchHistoryService.ts src/services/__tests__/matchHistoryService.test.ts
git commit -m "feat(history): tipos de cursor + helpers puros assembleMatchPage/computeWinRate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Servicio — `getMatchesPage` (RPC keyset)

**Files:**
- Modify: `src/services/matchHistoryService.ts`
- Modify: `src/services/__tests__/matchHistoryService.test.ts`

**Interfaces:**
- Consumes: `assembleMatchPage`, `MatchCursor`, `MatchPage`, `dbMatchToMatch`, `MatchHistoryRow`.
- Produces:
  - `interface GetMatchesPageParams { cursor?: MatchCursor | null; pageSize?: number; stage?: MatchHistoryEntry['stage'] }`
  - `matchHistoryService.getMatchesPage(params?: GetMatchesPageParams): Promise<MatchPage>`

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `src/services/__tests__/matchHistoryService.test.ts`:

```ts
import { vi, afterEach } from 'vitest';
import * as supaLib from '../../lib/supabase';
import { matchHistoryService } from '../matchHistoryService';

// Fila cruda como la devuelve el RPC (snake_case, mismo shape que match_history).
const dbRow = (id: string, playedAt: string) => ({
  id,
  home_team_id: 'A',
  away_team_id: 'B',
  home_score: 1,
  away_score: 0,
  stage: 'qualifier',
  group_name: null,
  region: null,
  tournament_id: null,
  home_skill_before: 80,
  away_skill_before: 70,
  home_skill_after: 81,
  away_skill_after: 69,
  home_skill_change: 1,
  away_skill_change: -1,
  played_at: playedAt,
  metadata: {},
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getMatchesPage', () => {
  it('mapea filas del RPC y arma el cursor del último', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    const rpc = vi.spyOn(supaLib.supabase as unknown as { rpc: (...a: unknown[]) => unknown }, 'rpc')
      .mockResolvedValue({
        data: [dbRow('a', '2026-01-02T00:00:00Z'), dbRow('b', '2026-01-01T00:00:00Z')],
        error: null,
      } as never);

    const res = await matchHistoryService.getMatchesPage({ pageSize: 2, stage: 'qualifier' });

    expect(rpc).toHaveBeenCalledWith('get_matches_page', {
      p_cursor_played_at: null,
      p_cursor_id: null,
      p_page_size: 2,
      p_stage: 'qualifier',
    });
    expect(res.matches.map((m) => m.id)).toEqual(['a', 'b']);
    expect(res.nextCursor).toEqual({ playedAt: '2026-01-01T00:00:00Z', id: 'b' });
    expect(res.hasMore).toBe(true);
  });

  it('sin Supabase ⇒ página vacía', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(false);
    const res = await matchHistoryService.getMatchesPage({ pageSize: 30 });
    expect(res).toEqual({ matches: [], nextCursor: null, hasMore: false });
  });

  it('pasa el cursor al RPC', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    const rpc = vi.spyOn(supaLib.supabase as unknown as { rpc: (...a: unknown[]) => unknown }, 'rpc')
      .mockResolvedValue({ data: [], error: null } as never);

    await matchHistoryService.getMatchesPage({
      cursor: { playedAt: '2026-01-01T00:00:00Z', id: 'b' },
      pageSize: 10,
    });

    expect(rpc).toHaveBeenCalledWith('get_matches_page', {
      p_cursor_played_at: '2026-01-01T00:00:00Z',
      p_cursor_id: 'b',
      p_page_size: 10,
      p_stage: null,
    });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/services/__tests__/matchHistoryService.test.ts`
Expected: FAIL — `getMatchesPage` no existe.

- [ ] **Step 3: Implementar `getMatchesPage` (aditivo, sin borrar nada)**

En `src/services/matchHistoryService.ts`, dentro del objeto `matchHistoryService`, **agregar** el método `getMatchesPage` justo después del método `getAllMatches` existente (dejá `getAllMatches` y `getMatchesByStage` en su lugar; se borran en la Task 7, cuando ya nadie los use — así `tsc` queda verde entre tasks):

```ts
  // Página keyset del historial (cursor sobre played_at DESC, id DESC).
  async getMatchesPage(
    { cursor, pageSize = 30, stage }: GetMatchesPageParams = {},
  ): Promise<MatchPage> {
    if (!isSupabaseConfigured()) {
      return { matches: [], nextCursor: null, hasMore: false };
    }

    const { data, error } = await (supabase as any).rpc('get_matches_page', {
      p_cursor_played_at: cursor?.playedAt ?? null,
      p_cursor_id: cursor?.id ?? null,
      p_page_size: pageSize,
      p_stage: stage ?? null,
    });

    if (error) throw error;

    const entries = ((data ?? []) as MatchHistoryRow[]).map(dbMatchToMatch);
    return assembleMatchPage(entries, pageSize);
  },
```

Y agregar el tipo de parámetros junto a los otros `export interface` (después de `MatchPage`):

```ts
export interface GetMatchesPageParams {
  cursor?: MatchCursor | null;
  pageSize?: number;
  stage?: MatchHistoryEntry['stage'];
}
```

> Nota: `getMatchesPage` es el reemplazo de `getAllMatches`/`getMatchesByStage`, pero no se borran acá para no dejar referencias colgantes (`subscribeToMatches` aún llama `getAllMatches` hasta la Task 5). La limpieza es la Task 7.

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/services/__tests__/matchHistoryService.test.ts`
Expected: PASS.

Opcional: `npx tsc -b` debería seguir **verde** (esta task es aditiva; no se borró nada).

- [ ] **Step 5: Commit**

```bash
git add src/services/matchHistoryService.ts src/services/__tests__/matchHistoryService.test.ts
git commit -m "feat(history): getMatchesPage keyset vía RPC (reemplaza getAllMatches)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Servicio — `getMatchStatistics` (reescritura) + `getTeamStats` + `getRegionStats`

**Files:**
- Modify: `src/services/matchHistoryService.ts`
- Modify: `src/services/__tests__/matchHistoryService.test.ts`

**Interfaces:**
- Produces:
  - `getMatchStatistics(): Promise<{ totalMatches: number; totalGoals: number; averageGoalsPerMatch: number }>`
  - `interface TeamStatsRow { teamId: string; totalMatches: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number }`
  - `getTeamStats(): Promise<TeamStatsRow[]>`
  - `interface RegionStatsRow { region: string; totalGoals: number; matchesPlayed: number }`
  - `getRegionStats(): Promise<RegionStatsRow[]>`

- [ ] **Step 1: Escribir el test que falla**

Añadir a `src/services/__tests__/matchHistoryService.test.ts`:

```ts
describe('getMatchStatistics', () => {
  it('mapea bigint-como-string a number', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supaLib.supabase as unknown as { rpc: (...a: unknown[]) => unknown }, 'rpc')
      .mockResolvedValue({
        data: [{ total_matches: '1234', total_goals: '3456', avg_goals: 2.8 }],
        error: null,
      } as never);

    const s = await matchHistoryService.getMatchStatistics();
    expect(s).toEqual({ totalMatches: 1234, totalGoals: 3456, averageGoalsPerMatch: 2.8 });
  });

  it('sin Supabase ⇒ ceros', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(false);
    const s = await matchHistoryService.getMatchStatistics();
    expect(s).toEqual({ totalMatches: 0, totalGoals: 0, averageGoalsPerMatch: 0 });
  });
});

describe('getTeamStats', () => {
  it('mapea snake_case → camelCase con Number()', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supaLib.supabase as unknown as { rpc: (...a: unknown[]) => unknown }, 'rpc')
      .mockResolvedValue({
        data: [{
          team_id: 'A', total_matches: '10', wins: '6', draws: '2',
          losses: '2', goals_for: '18', goals_against: '9',
        }],
        error: null,
      } as never);

    const rows = await matchHistoryService.getTeamStats();
    expect(rows).toEqual([{
      teamId: 'A', totalMatches: 10, wins: 6, draws: 2,
      losses: 2, goalsFor: 18, goalsAgainst: 9,
    }]);
  });
});

describe('getRegionStats', () => {
  it('mapea snake_case → camelCase con Number()', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supaLib.supabase as unknown as { rpc: (...a: unknown[]) => unknown }, 'rpc')
      .mockResolvedValue({
        data: [{ region: 'Europe', total_goals: '120', matches_played: '40' }],
        error: null,
      } as never);

    const rows = await matchHistoryService.getRegionStats();
    expect(rows).toEqual([{ region: 'Europe', totalGoals: 120, matchesPlayed: 40 }]);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/services/__tests__/matchHistoryService.test.ts`
Expected: FAIL — `getTeamStats`/`getRegionStats` no existen y `getMatchStatistics` viejo devuelve otro shape.

- [ ] **Step 3: Reescribir `getMatchStatistics` y agregar `getTeamStats`/`getRegionStats`**

En `src/services/matchHistoryService.ts`, reemplazar el método `getMatchStatistics` completo (el bloque con el bucle `for (let page...)`, líneas ~238-290) por:

```ts
  // Estadísticas globales (una sola llamada agregada en el servidor).
  async getMatchStatistics() {
    if (!isSupabaseConfigured()) {
      return { totalMatches: 0, totalGoals: 0, averageGoalsPerMatch: 0 };
    }

    const { data, error } = await (supabase as any).rpc('get_match_statistics');
    if (error) throw error;

    const row = (data?.[0] ?? {}) as {
      total_matches?: number | string;
      total_goals?: number | string;
      avg_goals?: number | string;
    };
    return {
      totalMatches: Number(row.total_matches ?? 0),
      totalGoals: Number(row.total_goals ?? 0),
      averageGoalsPerMatch: Number(row.avg_goals ?? 0),
    };
  },

  // Stats agregadas por equipo (una fila por equipo con partidos).
  async getTeamStats(): Promise<TeamStatsRow[]> {
    if (!isSupabaseConfigured()) return [];

    const { data, error } = await (supabase as any).rpc('get_team_stats');
    if (error) throw error;

    return ((data ?? []) as any[]).map((r) => ({
      teamId: r.team_id,
      totalMatches: Number(r.total_matches ?? 0),
      wins: Number(r.wins ?? 0),
      draws: Number(r.draws ?? 0),
      losses: Number(r.losses ?? 0),
      goalsFor: Number(r.goals_for ?? 0),
      goalsAgainst: Number(r.goals_against ?? 0),
    }));
  },

  // Stats regionales de eliminatorias (una fila por región).
  async getRegionStats(): Promise<RegionStatsRow[]> {
    if (!isSupabaseConfigured()) return [];

    const { data, error } = await (supabase as any).rpc('get_region_stats');
    if (error) throw error;

    return ((data ?? []) as any[]).map((r) => ({
      region: r.region,
      totalGoals: Number(r.total_goals ?? 0),
      matchesPlayed: Number(r.matches_played ?? 0),
    }));
  },
```

Y agregar los tipos junto a los otros `export interface` (después de `GetMatchesPageParams`):

```ts
export interface TeamStatsRow {
  teamId: string;
  totalMatches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface RegionStatsRow {
  region: string;
  totalGoals: number;
  matchesPlayed: number;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/services/__tests__/matchHistoryService.test.ts`
Expected: PASS (todos los describe verdes).

- [ ] **Step 5: Commit**

```bash
git add src/services/matchHistoryService.ts src/services/__tests__/matchHistoryService.test.ts
git commit -m "feat(history): stats globales/por-equipo/regionales vía RPC (sin full-table)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `MatchHistory.tsx` — "Cargar más" con cursor + prepend en tiempo real

**Files:**
- Modify: `src/services/matchHistoryService.ts` (nueva firma de `subscribeToMatches`)
- Modify: `src/components/tournament/MatchHistory.tsx`
- Create: `src/components/tournament/__tests__/MatchHistory.test.tsx`

**Interfaces:**
- Consumes: `getMatchesPage`, `getMatchStatistics`, `MatchCursor`, `MatchHistoryEntry`, `dbMatchToMatch`, `MatchHistoryRow`.
- Produces: `subscribeToMatches(callback: (newMatch: MatchHistoryEntry) => void): () => void`

- [ ] **Step 1: Cambiar la firma de `subscribeToMatches` en el servicio**

En `src/services/matchHistoryService.ts`, reemplazar el método `subscribeToMatches` completo por:

```ts
  // Suscripción a inserts en tiempo real. Entrega la fila nueva ya convertida;
  // el consumidor decide cómo integrarla (p.ej. anteponerla a su lista paginada)
  // en vez de re-descargar todo el historial.
  subscribeToMatches(callback: (newMatch: MatchHistoryEntry) => void) {
    if (!isSupabaseConfigured()) {
      console.warn('Supabase not configured, real-time updates disabled');
      return () => {};
    }

    const channel = supabase
      .channel('match-history-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'match_history' },
        (payload) => {
          callback(dbMatchToMatch(payload.new as MatchHistoryRow));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
```

- [ ] **Step 2: Escribir el test RTL que falla**

Create `src/components/tournament/__tests__/MatchHistory.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { Team } from '../../../types';
import { MatchHistory } from '../MatchHistory';
import { matchHistoryService, type MatchHistoryEntry } from '../../../services/matchHistoryService';
import * as supaLib from '../../../lib/supabase';

const teams: Team[] = [
  { id: 'A', name: 'Local', flag: '🏠', region: 'Europe', skill: 80 },
  { id: 'B', name: 'Visita', flag: '✈️', region: 'Asia', skill: 75 },
];

const q = (id: string, playedAt: string): MatchHistoryEntry => ({
  id, homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 0,
  stage: 'qualifier', homeSkillBefore: 80, awaySkillBefore: 70,
  homeSkillAfter: 81, awaySkillAfter: 69, homeSkillChange: 1, awaySkillChange: -1,
  playedAt,
});

afterEach(() => vi.restoreAllMocks());

describe('MatchHistory — paginación "Cargar más"', () => {
  it('carga la primera página y appendea al pedir más', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(matchHistoryService, 'subscribeToMatches').mockReturnValue(() => {});
    vi.spyOn(matchHistoryService, 'getMatchStatistics').mockResolvedValue({
      totalMatches: 3, totalGoals: 5, averageGoalsPerMatch: 1.67,
    });
    vi.spyOn(matchHistoryService, 'getMatchesPage')
      .mockResolvedValueOnce({
        matches: [q('a', '2026-01-03T00:00:00Z'), q('b', '2026-01-02T00:00:00Z')],
        nextCursor: { playedAt: '2026-01-02T00:00:00Z', id: 'b' },
        hasMore: true,
      })
      .mockResolvedValueOnce({
        matches: [q('c', '2026-01-01T00:00:00Z')],
        nextCursor: null,
        hasMore: false,
      });

    render(<MatchHistory teams={teams} />);

    // Página 1: 2 partidos qualifier + botón "Cargar más".
    const loadMore = await screen.findByRole('button', { name: /cargar más/i });
    expect(screen.getAllByText('Eliminatoria')).toHaveLength(2);

    loadMore.click();

    // Página 2 appendeada: 3 en total, botón desaparece (hasMore false).
    await waitFor(() => expect(screen.getAllByText('Eliminatoria')).toHaveLength(3));
    expect(screen.queryByRole('button', { name: /cargar más/i })).toBeNull();
  });
});
```

- [ ] **Step 3: Correr y verificar que falla**

Run: `npx vitest run src/components/tournament/__tests__/MatchHistory.test.tsx`
Expected: FAIL — `MatchHistory` todavía usa `getAllMatches`/`getMatchesByStage` y no hay botón "Cargar más".

- [ ] **Step 4: Reescribir el estado y la carga de `MatchHistory.tsx`**

En `src/components/tournament/MatchHistory.tsx`:

4a. Cambiar el import (línea 6) para traer el tipo del cursor:

```tsx
import { matchHistoryService, type MatchHistoryEntry, type MatchCursor } from '../../services/matchHistoryService';
```

4b. Reemplazar el bloque de estado (líneas ~14-21) por:

```tsx
  const [matches, setMatches] = useState<MatchHistoryEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<MatchCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<'all' | 'qualifier' | 'world-cup-group'>('all');
  const [statistics, setStatistics] = useState({
    totalMatches: 0,
    totalGoals: 0,
    averageGoalsPerMatch: 0,
  });

  const PAGE_SIZE = 30;
```

4c. Reemplazar los dos `useEffect` + `loadMatches` (líneas ~23-54) por:

```tsx
  useEffect(() => {
    loadFirstPage();
    loadStatistics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Suscripción a inserts: antepone el partido nuevo (si matchea el filtro) y
  // refresca las stats. No re-descarga la lista (rompería el estado paginado).
  useEffect(() => {
    const unsubscribe = matchHistoryService.subscribeToMatches((newMatch) => {
      setMatches((prev) => {
        if (filter !== 'all' && newMatch.stage !== filter) return prev;
        if (prev.some((m) => m.id === newMatch.id)) return prev;
        return [newMatch, ...prev];
      });
      loadStatistics();
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const loadFirstPage = async () => {
    try {
      setLoading(true);
      const page = await matchHistoryService.getMatchesPage({
        pageSize: PAGE_SIZE,
        stage: filter === 'all' ? undefined : filter,
      });
      setMatches(page.matches);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (error) {
      console.error('Error loading matches:', error);
      setMatches([]);
      setNextCursor(null);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const page = await matchHistoryService.getMatchesPage({
        cursor: nextCursor,
        pageSize: PAGE_SIZE,
        stage: filter === 'all' ? undefined : filter,
      });
      setMatches((prev) => [...prev, ...page.matches]);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (error) {
      console.error('Error loading more matches:', error);
    } finally {
      setLoadingMore(false);
    }
  };
```

> `loadStatistics` (líneas ~56-63) queda igual: sigue llamando a `matchHistoryService.getMatchStatistics()`.

- [ ] **Step 5: Agregar el botón "Cargar más" al render**

En `src/components/tournament/MatchHistory.tsx`, dentro del contenedor scrolleable (`<div className="space-y-3 max-h-[600px] overflow-y-auto">`), **después** del `{matches.map(...)}` y antes de cerrar ese `</div>` (línea ~258), insertar:

```tsx
              {hasMore && (
                <div className="pt-2 text-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="font-arcade text-[10px] uppercase bg-black/40 text-gold border-2 border-gold px-4 py-2 hover:bg-gold hover:text-night transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? 'Cargando…' : 'Cargar más'}
                  </button>
                </div>
              )}
```

- [ ] **Step 6: Correr y verificar que pasa**

Run: `npx vitest run src/components/tournament/__tests__/MatchHistory.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/matchHistoryService.ts src/components/tournament/MatchHistory.tsx src/components/tournament/__tests__/MatchHistory.test.tsx
git commit -m "feat(history): MatchHistory con 'Cargar más' keyset + prepend en tiempo real

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `HistoricalStats.tsx` — consumir `getTeamStats` + `getRegionStats`

**Files:**
- Modify: `src/components/tournament/HistoricalStats.tsx`

**Interfaces:**
- Consumes: `matchHistoryService.getTeamStats()`, `matchHistoryService.getRegionStats()`, `computeWinRate`.

- [ ] **Step 1: Cambiar el import del servicio**

En `src/components/tournament/HistoricalStats.tsx` (línea 6), reemplazar:

```tsx
import { matchHistoryService } from '../../services/matchHistoryService';
```

por:

```tsx
import { matchHistoryService, computeWinRate } from '../../services/matchHistoryService';
```

- [ ] **Step 2: Reemplazar el cuerpo de `loadStats`**

Reemplazar todo el cuerpo de `loadStats` (desde `try {` hasta el `catch` inclusive, líneas ~50-149) por:

```tsx
    try {
      const [teamRows, regionRows] = await Promise.all([
        matchHistoryService.getTeamStats(),
        matchHistoryService.getRegionStats(),
      ]);
      if (signal.cancelled) return;

      const finalTeamStats: TeamStats[] = teamRows.map((r) => ({
        teamId: r.teamId,
        totalMatches: r.totalMatches,
        wins: r.wins,
        draws: r.draws,
        losses: r.losses,
        goalsFor: r.goalsFor,
        goalsAgainst: r.goalsAgainst,
        winRate: computeWinRate(r.wins, r.totalMatches),
      }));

      const regionalData = regionRows.map((r) => ({
        region: r.region,
        totalGoals: r.totalGoals,
        matchesPlayed: r.matchesPlayed,
        avgGoals: r.matchesPlayed > 0 ? r.totalGoals / r.matchesPlayed : 0,
      }));

      setTeamStats(finalTeamStats);
      setRegionalStatsHistorical(regionalData);
      setLoading(false);
    } catch (error) {
      if (!signal.cancelled) {
        console.error('Error loading historical stats:', error);
        setLoading(false);
      }
    }
```

> Esto elimina el `getAllMatches(10000)` y toda la agregación en JS (mapas por equipo/región). El resto del componente (selector de vistas, `tierGroups = groupTeamsByTier(teams)`, `topScorersHistorical`, `topAverageHistorical`, `topTeams`) no cambia: siguen derivando de `teamStats` + `teams`.

- [ ] **Step 3: Verificar tipos y build del componente**

Run: `npx tsc -b`
Expected: PASS. `getAllMatches`/`getMatchesByStage` todavía existen en el servicio (se borran en la Task 7), así que no debería haber referencias colgantes. Si aparece un error de variable no usada por `teams`, recordá que `teams` **sigue** usándose fuera de `loadStats` (en `tierGroups = groupTeamsByTier(teams)` y en el render) — no lo quites.

- [ ] **Step 4: Correr la suite completa**

Run: `npx vitest run`
Expected: PASS (incluye los tests nuevos; sin regresiones).

- [ ] **Step 5: Commit**

```bash
git add src/components/tournament/HistoricalStats.tsx
git commit -m "feat(history): HistoricalStats consume getTeamStats/getRegionStats (sin full-table)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Limpieza de código muerto + verificación final

**Files:**
- Modify: `src/services/matchHistoryService.ts`

**Interfaces:**
- Elimina: `matchHistoryService.getAllMatches`, `matchHistoryService.getMatchesByStage`.

- [ ] **Step 1: Confirmar que no quedan consumidores**

Run:
```bash
grep -rn "getAllMatches\|getMatchesByStage" src --include="*.ts" --include="*.tsx" | grep -v "matchHistoryService.ts"
```
Expected: **sin resultados**. Si aparece algo, migralo antes de borrar (no debería: los únicos consumidores eran `MatchHistory` y `HistoricalStats`, ya migrados).

- [ ] **Step 2: Borrar los métodos muertos**

En `src/services/matchHistoryService.ts`, eliminar por completo **dos** métodos, ya sin consumidores tras las Tasks 5 y 6:
- `getAllMatches` (el bloque `async getAllMatches(limit = 100, offset = 0) { ... }`, incluye el camino `limit >= 10000`).
- `getMatchesByStage` (el bloque `async getMatchesByStage(stage: ...) { ... }`).

No tocar `getTeamMatches`, `getTeamRecentMatches`, `getTournamentMatches`, `getMatchesByRegion`, `getExistingCycleMatchIds`, `getMatchStatistics`, `getMatchesPage`, `getTeamStats`, `getRegionStats` ni `createMatch(es)` (siguen en uso o acotados).

- [ ] **Step 3: Gate de tipos**

Run: `npx tsc -b`
Expected: PASS, sin errores.

- [ ] **Step 4: Gate de la suite completa**

Run: `npx vitest run`
Expected: PASS. Confirmá que el número de tests subió respecto de la baseline (198) por los nuevos de servicio + `MatchHistory`.

- [ ] **Step 5: Lint del diff (best-effort)**

Run: `npx eslint src/services/matchHistoryService.ts src/components/tournament/MatchHistory.tsx src/components/tournament/HistoricalStats.tsx`
Expected: sin **nuevos** errores introducidos por estos cambios. (El repo tiene lint base roto; no arregles errores preexistentes ajenos a este diff — sólo asegurá no sumar nuevos.)

- [ ] **Step 6: Commit**

```bash
git add src/services/matchHistoryService.ts
git commit -m "refactor(history): eliminar getAllMatches/getMatchesByStage (full-table) ya sin uso

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Smoke test manual (post-implementación)

Con la app corriendo y Supabase configurado, tras una simulación que genere partidos:

1. **Historial de Partidos:** cargan 30, aparece "Cargar más", al clickear se appendean sin recargar los de arriba; cambiar el filtro (Todos / Eliminatorias / Copa del Mundo) resetea a la primera página.
2. **Tiempo real:** simular otra tanda → los partidos nuevos aparecen arriba y las tarjetas de stats (Total Partidos / Goles / Promedio) se actualizan.
3. **Estadísticas históricas (`HistoricalStats`):** las vistas Overview / Equipos / Tiers y las stats regionales muestran los mismos números que antes del cambio (verificar contra un torneo conocido).
4. **Red:** en DevTools, ninguna de estas pantallas debe descargar miles de filas (sólo llamadas `rpc/get_*`).

## Notas de diseño heredadas del spec

- **Ties de `played_at`:** desempate por `id` (UUID) → orden total estable pero arbitrario dentro de un batch; idéntico al comportamiento actual.
- **`pageSize` = 30** (constante `PAGE_SIZE` en `MatchHistory`).
- **Semántica regional:** solo `qualifier`, por región del equipo local, por partido — replicada exactamente por `get_region_stats()`.
