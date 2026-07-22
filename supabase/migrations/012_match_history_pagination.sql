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
