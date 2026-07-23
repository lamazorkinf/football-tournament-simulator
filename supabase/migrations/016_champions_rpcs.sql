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
    -- pero SIN marcador (no está disponible fuera del JSONB) — igual que
    -- mostraba el componente anterior, que leía el Mundial de tournaments_new.
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
    COALESCE(tm.name, i.team_id) AS team_name,  -- nunca vacío si el equipo fue removido
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
  -- LEFT (no INNER): un equipo del podio que ya no exista en teams (curación de
  -- teams.json) igual aparece con sus conteos, en vez de desaparecer en silencio.
  LEFT JOIN teams tm ON tm.id = i.team_id
  ORDER BY titles DESC, runner_ups DESC, thirds DESC, team_name ASC;
$$;

GRANT EXECUTE ON FUNCTION champions_history()  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION champions_palmares() TO anon, authenticated;
