-- Football Tournament Database Schema for Supabase

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Teams table
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  flag TEXT NOT NULL,
  region TEXT NOT NULL CHECK (region IN ('Europe', 'America', 'Africa', 'Asia')),
  skill NUMERIC(5,2) NOT NULL CHECK (skill >= 30 AND skill <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create index on region for faster queries
CREATE INDEX idx_teams_region ON teams(region);
CREATE INDEX idx_teams_skill ON teams(skill DESC);

-- Match history table
CREATE TABLE match_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  home_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  home_score INTEGER NOT NULL,
  away_score INTEGER NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('qualifier', 'world-cup-group', 'world-cup-knockout', 'continental', 'confed-group', 'confed-knockout')),
  group_name TEXT,
  region TEXT,
  tournament_id TEXT,
  home_skill_before NUMERIC(5,2) NOT NULL,
  away_skill_before NUMERIC(5,2) NOT NULL,
  home_skill_after NUMERIC(5,2) NOT NULL,
  away_skill_after NUMERIC(5,2) NOT NULL,
  home_skill_change NUMERIC(5,2) NOT NULL,
  away_skill_change NUMERIC(5,2) NOT NULL,
  played_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for match history
CREATE INDEX idx_match_history_home_team ON match_history(home_team_id);
CREATE INDEX idx_match_history_away_team ON match_history(away_team_id);
CREATE INDEX idx_match_history_played_at ON match_history(played_at DESC);
CREATE INDEX idx_match_history_stage ON match_history(stage);
CREATE INDEX idx_match_history_tournament ON match_history(tournament_id);
CREATE INDEX idx_match_history_keyset ON match_history (played_at DESC, id DESC);
CREATE INDEX idx_match_history_stage_keyset ON match_history (stage, played_at DESC, id DESC);

-- Tournaments table (stores complete tournament state)
CREATE TABLE tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('qualifiers', 'world-cup', 'completed')),
  qualifiers JSONB NOT NULL DEFAULT '{}'::jsonb, -- Complete qualifier groups state
  world_cup JSONB DEFAULT NULL, -- World cup state (groups + knockout)
  is_qualifiers_complete BOOLEAN DEFAULT FALSE,
  has_any_match_played BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for teams table
CREATE TRIGGER update_teams_updated_at
BEFORE UPDATE ON teams
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger for tournaments table
CREATE TRIGGER update_tournaments_updated_at
BEFORE UPDATE ON tournaments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust based on your auth requirements)
-- For development, we'll allow all operations. In production, add proper auth checks.

-- Teams policies
CREATE POLICY "Enable read access for all users" ON teams
  FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON teams
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access for all users" ON teams
  FOR UPDATE USING (true);

CREATE POLICY "Enable delete access for all users" ON teams
  FOR DELETE USING (true);

-- Match history policies
CREATE POLICY "Enable read access for all users" ON match_history
  FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON match_history
  FOR INSERT WITH CHECK (true);

-- Tournaments policies
CREATE POLICY "Enable read access for all users" ON tournaments
  FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON tournaments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access for all users" ON tournaments
  FOR UPDATE USING (true);

-- View for team statistics
CREATE OR REPLACE VIEW team_statistics AS
SELECT
  t.id,
  t.name,
  t.flag,
  t.region,
  t.skill,
  COUNT(DISTINCT mh.id) FILTER (WHERE mh.home_team_id = t.id OR mh.away_team_id = t.id) as total_matches,
  COUNT(DISTINCT mh.id) FILTER (
    WHERE (mh.home_team_id = t.id AND mh.home_score > mh.away_score)
       OR (mh.away_team_id = t.id AND mh.away_score > mh.home_score)
  ) as wins,
  COUNT(DISTINCT mh.id) FILTER (WHERE mh.home_team_id = t.id AND mh.home_score = mh.away_score) +
  COUNT(DISTINCT mh.id) FILTER (WHERE mh.away_team_id = t.id AND mh.home_score = mh.away_score) as draws,
  COUNT(DISTINCT mh.id) FILTER (
    WHERE (mh.home_team_id = t.id AND mh.home_score < mh.away_score)
       OR (mh.away_team_id = t.id AND mh.away_score < mh.home_score)
  ) as losses,
  COALESCE(SUM(CASE WHEN mh.home_team_id = t.id THEN mh.home_score ELSE mh.away_score END), 0) as goals_scored,
  COALESCE(SUM(CASE WHEN mh.home_team_id = t.id THEN mh.away_score ELSE mh.home_score END), 0) as goals_conceded
FROM teams t
LEFT JOIN match_history mh ON mh.home_team_id = t.id OR mh.away_team_id = t.id
GROUP BY t.id, t.name, t.flag, t.region, t.skill;

-- Function to get recent matches for a team
CREATE OR REPLACE FUNCTION get_team_recent_matches(team_id_param TEXT, limit_param INTEGER DEFAULT 10)
RETURNS TABLE (
  match_id UUID,
  opponent_id TEXT,
  opponent_name TEXT,
  opponent_flag TEXT,
  is_home BOOLEAN,
  team_score INTEGER,
  opponent_score INTEGER,
  result TEXT,
  played_at TIMESTAMP WITH TIME ZONE,
  stage TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mh.id as match_id,
    CASE WHEN mh.home_team_id = team_id_param THEN mh.away_team_id ELSE mh.home_team_id END as opponent_id,
    CASE WHEN mh.home_team_id = team_id_param THEN t_away.name ELSE t_home.name END as opponent_name,
    CASE WHEN mh.home_team_id = team_id_param THEN t_away.flag ELSE t_home.flag END as opponent_flag,
    mh.home_team_id = team_id_param as is_home,
    CASE WHEN mh.home_team_id = team_id_param THEN mh.home_score ELSE mh.away_score END as team_score,
    CASE WHEN mh.home_team_id = team_id_param THEN mh.away_score ELSE mh.home_score END as opponent_score,
    CASE
      WHEN (mh.home_team_id = team_id_param AND mh.home_score > mh.away_score) OR
           (mh.away_team_id = team_id_param AND mh.away_score > mh.home_score) THEN 'win'
      WHEN mh.home_score = mh.away_score THEN 'draw'
      ELSE 'loss'
    END as result,
    mh.played_at,
    mh.stage
  FROM match_history mh
  JOIN teams t_home ON mh.home_team_id = t_home.id
  JOIN teams t_away ON mh.away_team_id = t_away.id
  WHERE mh.home_team_id = team_id_param OR mh.away_team_id = team_id_param
  ORDER BY mh.played_at DESC
  LIMIT limit_param;
END;
$$ LANGUAGE plpgsql;

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

-- Comments for documentation
COMMENT ON TABLE teams IS 'Stores all football teams with their attributes';
COMMENT ON TABLE match_history IS 'Complete history of all matches played with skill changes';
COMMENT ON TABLE tournaments IS 'Tournament metadata and status tracking';
COMMENT ON COLUMN match_history.metadata IS 'Additional match data like penalties, yellow cards, etc.';
