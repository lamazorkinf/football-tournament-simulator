-- ============================================================================
-- 007 — Correcciones de la auditoría de bugs (2026-07-20)
--
-- Aditiva e idempotente. No borra datos existentes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabla team_tournament_performance
--
-- Estaba tipada en src/types/database.ts y tenía un servicio entero encima
-- (teamTournamentPerformanceService + edge function), pero ninguna migración
-- la creaba: al terminar un torneo, el upsert reventaba con 42P01.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_tournament_performance (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id         TEXT NOT NULL,
  team_id               TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  final_stage           TEXT NOT NULL,
  qualifier_group_name  TEXT,
  qualifier_region      TEXT,
  world_cup_group_name  TEXT,
  total_matches_played  INTEGER NOT NULL DEFAULT 0,
  total_wins            INTEGER NOT NULL DEFAULT 0,
  total_draws           INTEGER NOT NULL DEFAULT 0,
  total_losses          INTEGER NOT NULL DEFAULT 0,
  total_goals_for       INTEGER NOT NULL DEFAULT 0,
  total_goals_against   INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- El servicio hace upsert con onConflict: 'tournament_id,team_id'.
  UNIQUE (tournament_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_ttp_tournament ON team_tournament_performance(tournament_id);
CREATE INDEX IF NOT EXISTS idx_ttp_team ON team_tournament_performance(team_id);

ALTER TABLE team_tournament_performance ENABLE ROW LEVEL SECURITY;

-- Políticas abiertas, consistentes con el resto del esquema (la app no tiene
-- autenticación). Endurecer el RLS es una decisión de producto pendiente,
-- documentada en el informe de la auditoría.
DROP POLICY IF EXISTS "Enable read access for all users" ON team_tournament_performance;
DROP POLICY IF EXISTS "Enable insert access for all users" ON team_tournament_performance;
DROP POLICY IF EXISTS "Enable update access for all users" ON team_tournament_performance;
DROP POLICY IF EXISTS "Enable delete access for all users" ON team_tournament_performance;
CREATE POLICY "Enable read access for all users"   ON team_tournament_performance FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON team_tournament_performance FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON team_tournament_performance FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete access for all users" ON team_tournament_performance FOR DELETE USING (true);

-- ----------------------------------------------------------------------------
-- 2. Política DELETE que faltaba en match_history
--
-- Con RLS activa y sin política DELETE, los borrados afectaban 0 filas Y NO
-- devolvían error: resetear la fase final dejaba el historial intacto, y al
-- resimular el head-to-head contaba los partidos viejos y los nuevos.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Enable delete access for all users" ON match_history;
CREATE POLICY "Enable delete access for all users" ON match_history FOR DELETE USING (true);

-- ----------------------------------------------------------------------------
-- 3. Trigger de standings idempotente
--
-- El trigger sumaba deltas (points = points + ...) sin restar el resultado
-- anterior. Resimular un partido ya jugado duplicaba puntos y partidos hasta
-- violar el CHECK (played = won + drawn + lost). Se reescribe para RECALCULAR
-- desde cero el standing de los equipos involucrados: idempotente por
-- construcción, y correcto también cuando un partido pasa de jugado a no jugado.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalc_group_team_standing(
  p_group_id TEXT,
  p_team_id TEXT,
  p_match_type TEXT
) RETURNS void AS $$
BEGIN
  IF p_match_type = 'qualifier' THEN
    UPDATE qualifier_group_teams t SET
      played        = s.played,
      won           = s.won,
      drawn         = s.drawn,
      lost          = s.lost,
      goals_for     = s.gf,
      goals_against = s.ga,
      points        = s.points
    FROM (
      SELECT
        COUNT(*)::int AS played,
        COALESCE(SUM(CASE WHEN gf > ga THEN 1 ELSE 0 END), 0)::int AS won,
        COALESCE(SUM(CASE WHEN gf = ga THEN 1 ELSE 0 END), 0)::int AS drawn,
        COALESCE(SUM(CASE WHEN gf < ga THEN 1 ELSE 0 END), 0)::int AS lost,
        COALESCE(SUM(gf), 0)::int AS gf,
        COALESCE(SUM(ga), 0)::int AS ga,
        COALESCE(SUM(CASE WHEN gf > ga THEN 3 WHEN gf = ga THEN 1 ELSE 0 END), 0)::int AS points
      FROM (
        SELECT
          CASE WHEN home_team_id = p_team_id THEN home_score ELSE away_score END AS gf,
          CASE WHEN home_team_id = p_team_id THEN away_score ELSE home_score END AS ga
        FROM matches_new
        WHERE qualifier_group_id = p_group_id
          AND is_played AND home_score IS NOT NULL AND away_score IS NOT NULL
          AND (home_team_id = p_team_id OR away_team_id = p_team_id)
      ) m
    ) s
    WHERE t.group_id = p_group_id AND t.team_id = p_team_id;

  ELSIF p_match_type = 'world-cup-group' THEN
    UPDATE world_cup_group_teams t SET
      played        = s.played,
      won           = s.won,
      drawn         = s.drawn,
      lost          = s.lost,
      goals_for     = s.gf,
      goals_against = s.ga,
      points        = s.points
    FROM (
      SELECT
        COUNT(*)::int AS played,
        COALESCE(SUM(CASE WHEN gf > ga THEN 1 ELSE 0 END), 0)::int AS won,
        COALESCE(SUM(CASE WHEN gf = ga THEN 1 ELSE 0 END), 0)::int AS drawn,
        COALESCE(SUM(CASE WHEN gf < ga THEN 1 ELSE 0 END), 0)::int AS lost,
        COALESCE(SUM(gf), 0)::int AS gf,
        COALESCE(SUM(ga), 0)::int AS ga,
        COALESCE(SUM(CASE WHEN gf > ga THEN 3 WHEN gf = ga THEN 1 ELSE 0 END), 0)::int AS points
      FROM (
        SELECT
          CASE WHEN home_team_id = p_team_id THEN home_score ELSE away_score END AS gf,
          CASE WHEN home_team_id = p_team_id THEN away_score ELSE home_score END AS ga
        FROM matches_new
        WHERE world_cup_group_id = p_group_id
          AND is_played AND home_score IS NOT NULL AND away_score IS NOT NULL
          AND (home_team_id = p_team_id OR away_team_id = p_team_id)
      ) m
    ) s
    WHERE t.group_id = p_group_id AND t.team_id = p_team_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.update_group_standings_new()
RETURNS trigger AS $$
BEGIN
  -- Recalcular ambos equipos involucrados, tanto en INSERT/UPDATE de un
  -- partido jugado como cuando deja de estarlo (el conteo parte de cero).
  IF NEW.match_type = 'qualifier' AND NEW.qualifier_group_id IS NOT NULL THEN
    PERFORM recalc_group_team_standing(NEW.qualifier_group_id, NEW.home_team_id, 'qualifier');
    PERFORM recalc_group_team_standing(NEW.qualifier_group_id, NEW.away_team_id, 'qualifier');
  ELSIF NEW.match_type = 'world-cup-group' AND NEW.world_cup_group_id IS NOT NULL THEN
    PERFORM recalc_group_team_standing(NEW.world_cup_group_id, NEW.home_team_id, 'world-cup-group');
    PERFORM recalc_group_team_standing(NEW.world_cup_group_id, NEW.away_team_id, 'world-cup-group');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 4. ON DELETE explícito en las FK que apuntan a teams
--
-- matches_new y tournaments_new referenciaban teams sin ON DELETE (NO ACTION),
-- mientras match_history usa CASCADE: borrar un equipo que había jugado fallaba
-- con 23503, de forma incoherente. Se unifican:
--   - matches_new home/away (NOT NULL) -> CASCADE, como match_history
--   - matches_new winner (nullable)    -> SET NULL
--   - podio de tournaments_new (nullable) -> SET NULL
-- ----------------------------------------------------------------------------
ALTER TABLE matches_new DROP CONSTRAINT IF EXISTS matches_new_home_team_id_fkey;
ALTER TABLE matches_new ADD CONSTRAINT matches_new_home_team_id_fkey
  FOREIGN KEY (home_team_id) REFERENCES teams(id) ON DELETE CASCADE;

ALTER TABLE matches_new DROP CONSTRAINT IF EXISTS matches_new_away_team_id_fkey;
ALTER TABLE matches_new ADD CONSTRAINT matches_new_away_team_id_fkey
  FOREIGN KEY (away_team_id) REFERENCES teams(id) ON DELETE CASCADE;

ALTER TABLE matches_new DROP CONSTRAINT IF EXISTS matches_new_winner_team_id_fkey;
ALTER TABLE matches_new ADD CONSTRAINT matches_new_winner_team_id_fkey
  FOREIGN KEY (winner_team_id) REFERENCES teams(id) ON DELETE SET NULL;

ALTER TABLE tournaments_new DROP CONSTRAINT IF EXISTS tournaments_new_champion_team_id_fkey;
ALTER TABLE tournaments_new ADD CONSTRAINT tournaments_new_champion_team_id_fkey
  FOREIGN KEY (champion_team_id) REFERENCES teams(id) ON DELETE SET NULL;

ALTER TABLE tournaments_new DROP CONSTRAINT IF EXISTS tournaments_new_runner_up_team_id_fkey;
ALTER TABLE tournaments_new ADD CONSTRAINT tournaments_new_runner_up_team_id_fkey
  FOREIGN KEY (runner_up_team_id) REFERENCES teams(id) ON DELETE SET NULL;

ALTER TABLE tournaments_new DROP CONSTRAINT IF EXISTS tournaments_new_third_place_team_id_fkey;
ALTER TABLE tournaments_new ADD CONSTRAINT tournaments_new_third_place_team_id_fkey
  FOREIGN KEY (third_place_team_id) REFERENCES teams(id) ON DELETE SET NULL;

ALTER TABLE tournaments_new DROP CONSTRAINT IF EXISTS tournaments_new_fourth_place_team_id_fkey;
ALTER TABLE tournaments_new ADD CONSTRAINT tournaments_new_fourth_place_team_id_fkey
  FOREIGN KEY (fourth_place_team_id) REFERENCES teams(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 5. search_path fijo en las funciones nuevas/modificadas (advisor
--    function_search_path_mutable). Evita que un search_path manipulado
--    cambie a qué tablas resuelven las referencias sin esquema.
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.recalc_group_team_standing(TEXT, TEXT, TEXT) SET search_path = public;
ALTER FUNCTION public.update_group_standings_new() SET search_path = public;
