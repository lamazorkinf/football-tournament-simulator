-- ============================================
-- 021: historial, estadísticas y campeones por modo
-- ============================================
-- La pestaña Historial es alcanzable desde cualquier modo, pero los 6 RPCs que
-- la alimentan leen `match_history` y los ciclos SIN filtrar por `mode_id`. Hoy
-- eso ya mezcla la Liga Villamariense con el Mundial, y con un tercer modo el
-- problema deja de ser cosmético.
--
-- Cada función recibe `p_mode_id TEXT DEFAULT NULL`. NULL = sin filtrar, que es
-- el comportamiento actual: los llamadores viejos siguen funcionando y la
-- migración se puede aplicar antes de desplegar el código.
--
-- El DROP es OBLIGATORIO: CREATE OR REPLACE no puede agregarle un parámetro a
-- una función existente. Sin el DROP quedaría una SOBRECARGA y la versión vieja
-- —la que no filtra— seguiría siendo invocable.

-- --------------------------------------------
-- Índices: el filtro por modo va primero en la clave
-- --------------------------------------------
CREATE INDEX IF NOT EXISTS idx_match_history_mode_keyset
  ON match_history (mode_id, played_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_match_history_mode_stage_keyset
  ON match_history (mode_id, stage, played_at DESC, id DESC);

-- --------------------------------------------
-- match_history.stage: los formatos genéricos
-- --------------------------------------------
-- La 018 permitía 'league' y 'cup'. Los tres formatos canónicos usan las mismas
-- etapas (una liga estampa 'league', un cuadro 'cup'), así que no hace falta
-- ampliar nada — pero sí dejar el CHECK escrito junto a las funciones que lo
-- asumen, para que se lea de una.
ALTER TABLE match_history DROP CONSTRAINT IF EXISTS match_history_stage_check;
ALTER TABLE match_history ADD CONSTRAINT match_history_stage_check
  CHECK (stage IN (
    'qualifier', 'world-cup-group', 'world-cup-knockout',
    'continental', 'confed-group', 'confed-knockout',
    'league', 'cup'
  ));

-- --------------------------------------------
-- 1) Página keyset del historial
-- --------------------------------------------
DROP FUNCTION IF EXISTS get_matches_page(TIMESTAMPTZ, UUID, INTEGER, TEXT);

CREATE FUNCTION get_matches_page(
  p_cursor_played_at TIMESTAMPTZ DEFAULT NULL,
  p_cursor_id UUID DEFAULT NULL,
  p_page_size INTEGER DEFAULT 30,
  p_stage TEXT DEFAULT NULL,
  p_mode_id TEXT DEFAULT NULL
)
RETURNS SETOF match_history
LANGUAGE sql STABLE
AS $$
  SELECT *
  FROM match_history
  WHERE (p_mode_id IS NULL OR mode_id = p_mode_id)
    AND (p_stage IS NULL OR stage = p_stage)
    AND (
      p_cursor_played_at IS NULL
      OR (played_at, id) < (p_cursor_played_at, p_cursor_id)
    )
  ORDER BY played_at DESC, id DESC
  LIMIT LEAST(GREATEST(p_page_size, 1), 100);
$$;

-- --------------------------------------------
-- 2) Estadísticas globales
-- --------------------------------------------
DROP FUNCTION IF EXISTS get_match_statistics();

CREATE FUNCTION get_match_statistics(p_mode_id TEXT DEFAULT NULL)
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
  FROM match_history
  WHERE p_mode_id IS NULL OR mode_id = p_mode_id;
$$;

-- --------------------------------------------
-- 3) Stats por equipo
-- --------------------------------------------
DROP FUNCTION IF EXISTS get_team_stats();

CREATE FUNCTION get_team_stats(p_mode_id TEXT DEFAULT NULL)
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
    SELECT home_team_id AS team_id, home_score AS gf, away_score AS ga
    FROM match_history WHERE p_mode_id IS NULL OR mode_id = p_mode_id
    UNION ALL
    SELECT away_team_id AS team_id, away_score AS gf, home_score AS ga
    FROM match_history WHERE p_mode_id IS NULL OR mode_id = p_mode_id
  ) x
  GROUP BY x.team_id;
$$;

-- --------------------------------------------
-- 4) Stats regionales (solo qualifier, por región del equipo local)
-- --------------------------------------------
DROP FUNCTION IF EXISTS get_region_stats();

CREATE FUNCTION get_region_stats(p_mode_id TEXT DEFAULT NULL)
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
    AND (p_mode_id IS NULL OR mh.mode_id = p_mode_id)
  GROUP BY ht.region;
$$;

-- --------------------------------------------
-- 5) Campeones: el ciclo mundialista Y los modos de temporada
-- --------------------------------------------
-- Cuarta rama UNION sobre `mode_tournaments`, para que la pestaña Campeones
-- deje de estar vacía en un modo de temporada. Sale de tres formas del
-- documento `state`, según el formato del torneo:
--   * eliminacion  -> el cuadro corona en la raíz (championId / runnerUpId)
--   * grupos+elim. -> el cuadro cuelga de `bracket`
--   * liga         -> campeón = primero de la tabla final
DROP FUNCTION IF EXISTS champions_palmares();   -- depende de champions_history
DROP FUNCTION IF EXISTS champions_history();

CREATE FUNCTION champions_history(p_mode_id TEXT DEFAULT NULL)
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
  champion_region TEXT,
  runner_up_region TEXT,
  third_region TEXT,
  fourth_region TEXT
)
LANGUAGE sql STABLE
AS $$
  WITH comps AS (
    -- Mundial. Fallback a tournaments_new cuando el JSONB no trae 'worldCup'
    -- (torneos legacy previos al snapshot del ciclo): se sintetiza la final y
    -- el 3er puesto desde las columnas planas, con campeón/subcampeón/podio
    -- pero SIN marcador (no está disponible fuera del JSONB).
    SELECT t.id AS tournament_id, t.year, 'world-cup'::text AS kind,
           NULL::text AS region, 0 AS ord,
           COALESCE(
             cs.state->'worldCup'->'knockout'->'final',
             CASE WHEN t.champion_team_id IS NOT NULL
                  THEN jsonb_build_object('winnerId', t.champion_team_id,
                                          'loserId', t.runner_up_team_id)
                  ELSE NULL END
           ) AS final,
           COALESCE(
             cs.state->'worldCup'->'knockout'->'thirdPlace',
             CASE WHEN t.third_place_team_id IS NOT NULL
                  THEN jsonb_build_object('winnerId', t.third_place_team_id,
                                          'loserId', t.fourth_place_team_id)
                  ELSE NULL END
           ) AS third
    FROM tournaments_new t
    JOIN tournament_cycle_state cs ON cs.tournament_id = t.id
    WHERE t.status = 'completed'
      AND (p_mode_id IS NULL OR t.mode_id = p_mode_id)
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
      AND (p_mode_id IS NULL OR t.mode_id = p_mode_id)
    UNION ALL
    -- Copa Confederaciones
    SELECT t.id, t.year, 'confederations', NULL, 5,
           cs.state->'confederationsCup'->'knockout'->'final',
           cs.state->'confederationsCup'->'knockout'->'thirdPlace'
    FROM tournaments_new t
    JOIN tournament_cycle_state cs ON cs.tournament_id = t.id
    WHERE t.status = 'completed'
      AND (p_mode_id IS NULL OR t.mode_id = p_mode_id)
    UNION ALL
    -- Modos de temporada: un torneo de mode_tournaments por competición.
    -- Se sintetiza la misma forma {winnerId, loserId} que usan las ramas del
    -- ciclo, así el resto de la función no distingue de dónde vino.
    SELECT mt.id, mt.year, 'season', mt.division, 6,
           CASE
             WHEN mt.format IN ('eliminacion', 'cup')
               THEN CASE WHEN mt.state->>'championId' IS NOT NULL
                    THEN jsonb_build_object('winnerId', mt.state->>'championId',
                                            'loserId',  mt.state->>'runnerUpId')
                    END
             WHEN mt.format = 'grupos-eliminacion'
               THEN CASE WHEN mt.state->'bracket'->>'championId' IS NOT NULL
                    THEN jsonb_build_object('winnerId', mt.state->'bracket'->>'championId',
                                            'loserId',  mt.state->'bracket'->>'runnerUpId')
                    END
             -- Liga: campeón y subcampeón son los dos primeros de la tabla final.
             ELSE CASE WHEN mt.state->'standings'->0->>'teamId' IS NOT NULL
                  THEN jsonb_build_object('winnerId', mt.state->'standings'->0->>'teamId',
                                          'loserId',  mt.state->'standings'->1->>'teamId')
                  END
           END,
           CASE
             WHEN mt.format IN ('eliminacion', 'cup')
               THEN CASE WHEN mt.state->>'thirdPlaceId' IS NOT NULL
                    THEN jsonb_build_object('winnerId', mt.state->>'thirdPlaceId') END
             WHEN mt.format = 'grupos-eliminacion'
               THEN CASE WHEN mt.state->'bracket'->>'thirdPlaceId' IS NOT NULL
                    THEN jsonb_build_object('winnerId', mt.state->'bracket'->>'thirdPlaceId') END
             ELSE CASE WHEN mt.state->'standings'->2->>'teamId' IS NOT NULL
                  THEN jsonb_build_object('winnerId', mt.state->'standings'->2->>'teamId',
                                          'loserId',  mt.state->'standings'->3->>'teamId')
                  END
           END
    FROM mode_tournaments mt
    WHERE mt.status = 'completed'
      AND (p_mode_id IS NULL OR mt.mode_id = p_mode_id)
  ),
  flat AS (
    SELECT
      c.tournament_id, c.year, c.kind, c.region, c.ord,
      (c.final->>'winnerId') AS champion_id,
      -- Subcampeón: loserId (continental/confed/temporada) o, para el Mundial
      -- que no lo trae, el finalista que no es el ganador.
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
    tc.region AS champion_region,
    tr.region AS runner_up_region,
    t3.region AS third_region,
    t4.region AS fourth_region
  FROM flat f
  LEFT JOIN teams tc ON tc.id = f.champion_id
  LEFT JOIN teams tr ON tr.id = f.runner_up_id
  LEFT JOIN teams t3 ON t3.id = f.third_id
  LEFT JOIN teams t4 ON t4.id = f.fourth_id
  ORDER BY f.year DESC, f.ord ASC;
$$;

-- --------------------------------------------
-- 6) Palmarés agregado por equipo. Reutiliza (5) y le reenvía el modo.
-- --------------------------------------------
CREATE FUNCTION champions_palmares(p_mode_id TEXT DEFAULT NULL)
RETURNS TABLE (
  team_id TEXT,
  team_name TEXT,
  region TEXT,
  titles BIGINT,
  runner_ups BIGINT,
  thirds BIGINT,
  wc_titles BIGINT,
  continental_titles BIGINT,
  confed_titles BIGINT,
  season_titles BIGINT
)
LANGUAGE sql STABLE
AS $$
  WITH h AS (SELECT * FROM champions_history(p_mode_id)),
  agg AS (
    SELECT champion_id AS team_id,
           COUNT(*) AS titles,
           COUNT(*) FILTER (WHERE kind = 'world-cup')      AS wc_titles,
           COUNT(*) FILTER (WHERE kind = 'continental')    AS continental_titles,
           COUNT(*) FILTER (WHERE kind = 'confederations') AS confed_titles,
           COUNT(*) FILTER (WHERE kind = 'season')         AS season_titles
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
    COALESCE(tm.name, i.team_id) AS team_name,  -- nunca vacío si el equipo fue removido
    tm.region,
    COALESCE(a.titles, 0)             AS titles,
    COALESCE(r.runner_ups, 0)         AS runner_ups,
    COALESCE(t.thirds, 0)             AS thirds,
    COALESCE(a.wc_titles, 0)          AS wc_titles,
    COALESCE(a.continental_titles, 0) AS continental_titles,
    COALESCE(a.confed_titles, 0)      AS confed_titles,
    COALESCE(a.season_titles, 0)      AS season_titles
  FROM ids i
  LEFT JOIN agg a ON a.team_id = i.team_id
  LEFT JOIN ru  r ON r.team_id = i.team_id
  LEFT JOIN th  t ON t.team_id = i.team_id
  -- LEFT (no INNER): un equipo del podio que ya no exista en teams (curación de
  -- teams.json) igual aparece con sus conteos, en vez de desaparecer en silencio.
  LEFT JOIN teams tm ON tm.id = i.team_id
  ORDER BY titles DESC, runner_ups DESC, thirds DESC, team_name ASC;
$$;

-- --------------------------------------------
-- GRANTs: hay que re-emitirlos, el DROP se los llevó
-- --------------------------------------------
GRANT EXECUTE ON FUNCTION get_matches_page(TIMESTAMPTZ, UUID, INTEGER, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_match_statistics(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_team_stats(TEXT)       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_region_stats(TEXT)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION champions_history(TEXT)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION champions_palmares(TEXT)   TO anon, authenticated;
