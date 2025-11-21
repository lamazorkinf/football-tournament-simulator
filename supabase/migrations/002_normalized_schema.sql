-- ============================================
-- NORMALIZED DATABASE SCHEMA MIGRATION
-- Compatible with existing teams table
-- ============================================

-- Drop existing objects if they exist (for clean migration)
DROP VIEW IF EXISTS world_cup_standings CASCADE;
DROP VIEW IF EXISTS qualifier_standings CASCADE;
DROP TRIGGER IF EXISTS trigger_update_group_standings_new ON matches_new CASCADE;
DROP FUNCTION IF EXISTS update_group_standings_new() CASCADE;
DROP FUNCTION IF EXISTS get_qualifier_matches(TEXT) CASCADE;

DROP TABLE IF EXISTS team_tournament_skills CASCADE;
DROP TABLE IF EXISTS world_cup_group_teams CASCADE;
DROP TABLE IF EXISTS world_cup_groups CASCADE;
DROP TABLE IF EXISTS matches_new CASCADE;
DROP TABLE IF EXISTS qualifier_group_teams CASCADE;
DROP TABLE IF EXISTS qualifier_groups CASCADE;
DROP TABLE IF EXISTS tournaments_new CASCADE;

-- ============================================
-- TOURNAMENTS TABLE (new normalized version)
-- ============================================
CREATE TABLE tournaments_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'qualifiers'
    CHECK (status IN ('qualifiers', 'world-cup', 'completed')),
  is_qualifiers_complete BOOLEAN DEFAULT FALSE,
  has_any_match_played BOOLEAN DEFAULT FALSE,
  champion_team_id TEXT REFERENCES teams(id),
  runner_up_team_id TEXT REFERENCES teams(id),
  third_place_team_id TEXT REFERENCES teams(id),
  fourth_place_team_id TEXT REFERENCES teams(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tournaments_new_year ON tournaments_new(year);
CREATE INDEX idx_tournaments_new_status ON tournaments_new(status);

-- ============================================
-- QUALIFIER GROUPS
-- ============================================
CREATE TABLE qualifier_groups (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tournament_id TEXT NOT NULL REFERENCES tournaments_new(id) ON DELETE CASCADE,
  region TEXT NOT NULL CHECK (region IN ('Europe', 'America', 'Africa', 'Asia')),
  name TEXT NOT NULL,
  num_qualify INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tournament_id, region, name)
);

CREATE INDEX idx_qualifier_groups_tournament ON qualifier_groups(tournament_id);
CREATE INDEX idx_qualifier_groups_region ON qualifier_groups(region);

-- ============================================
-- QUALIFIER GROUP TEAMS (standings)
-- ============================================
CREATE TABLE qualifier_group_teams (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  group_id TEXT NOT NULL REFERENCES qualifier_groups(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  points INTEGER DEFAULT 0 CHECK (points >= 0),
  played INTEGER DEFAULT 0 CHECK (played >= 0),
  won INTEGER DEFAULT 0 CHECK (won >= 0),
  drawn INTEGER DEFAULT 0 CHECK (drawn >= 0),
  lost INTEGER DEFAULT 0 CHECK (lost >= 0),
  goals_for INTEGER DEFAULT 0 CHECK (goals_for >= 0),
  goals_against INTEGER DEFAULT 0 CHECK (goals_against >= 0),
  goal_difference INTEGER GENERATED ALWAYS AS (goals_for - goals_against) STORED,
  qualified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, team_id),
  CHECK (played = won + drawn + lost)
);

CREATE INDEX idx_qualifier_group_teams_group ON qualifier_group_teams(group_id);
CREATE INDEX idx_qualifier_group_teams_team ON qualifier_group_teams(team_id);
CREATE INDEX idx_qualifier_group_teams_qualified ON qualifier_group_teams(qualified);

-- ============================================
-- WORLD CUP GROUPS
-- ============================================
CREATE TABLE world_cup_groups (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tournament_id TEXT NOT NULL REFERENCES tournaments_new(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  num_qualify INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tournament_id, name)
);

CREATE INDEX idx_world_cup_groups_tournament ON world_cup_groups(tournament_id);

-- ============================================
-- WORLD CUP GROUP TEAMS (standings)
-- ============================================
CREATE TABLE world_cup_group_teams (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  group_id TEXT NOT NULL REFERENCES world_cup_groups(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  points INTEGER DEFAULT 0 CHECK (points >= 0),
  played INTEGER DEFAULT 0 CHECK (played >= 0),
  won INTEGER DEFAULT 0 CHECK (won >= 0),
  drawn INTEGER DEFAULT 0 CHECK (drawn >= 0),
  lost INTEGER DEFAULT 0 CHECK (lost >= 0),
  goals_for INTEGER DEFAULT 0 CHECK (goals_for >= 0),
  goals_against INTEGER DEFAULT 0 CHECK (goals_against >= 0),
  goal_difference INTEGER GENERATED ALWAYS AS (goals_for - goals_against) STORED,
  qualified BOOLEAN DEFAULT FALSE,
  final_position INTEGER CHECK (final_position BETWEEN 1 AND 4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, team_id),
  CHECK (played = won + drawn + lost)
);

CREATE INDEX idx_world_cup_group_teams_group ON world_cup_group_teams(group_id);
CREATE INDEX idx_world_cup_group_teams_team ON world_cup_group_teams(team_id);
CREATE INDEX idx_world_cup_group_teams_qualified ON world_cup_group_teams(qualified);

-- ============================================
-- MATCHES (qualifiers and world cup)
-- ============================================
CREATE TABLE matches_new (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tournament_id TEXT NOT NULL REFERENCES tournaments_new(id) ON DELETE CASCADE,
  match_type TEXT NOT NULL CHECK (match_type IN ('qualifier', 'world-cup-group', 'world-cup-knockout')),

  -- Group context (only one should be set)
  qualifier_group_id TEXT REFERENCES qualifier_groups(id) ON DELETE CASCADE,
  world_cup_group_id TEXT REFERENCES world_cup_groups(id) ON DELETE CASCADE,

  -- Knockout context
  knockout_round TEXT CHECK (knockout_round IN ('round-of-32', 'round-of-16', 'quarter', 'semi', 'third-place', 'final')),
  knockout_position INTEGER,

  -- Match data
  home_team_id TEXT NOT NULL REFERENCES teams(id),
  away_team_id TEXT NOT NULL REFERENCES teams(id),
  home_score INTEGER CHECK (home_score >= 0),
  away_score INTEGER CHECK (away_score >= 0),
  is_played BOOLEAN DEFAULT FALSE,
  played_at TIMESTAMPTZ,

  -- Knockout specific
  home_penalties INTEGER CHECK (home_penalties >= 0),
  away_penalties INTEGER CHECK (away_penalties >= 0),
  winner_team_id TEXT REFERENCES teams(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CHECK (home_team_id != away_team_id),
  CHECK (NOT is_played OR (home_score IS NOT NULL AND away_score IS NOT NULL)),
  CHECK (
    (match_type = 'qualifier' AND qualifier_group_id IS NOT NULL AND world_cup_group_id IS NULL) OR
    (match_type = 'world-cup-group' AND world_cup_group_id IS NOT NULL AND qualifier_group_id IS NULL) OR
    (match_type = 'world-cup-knockout' AND qualifier_group_id IS NULL AND world_cup_group_id IS NULL)
  )
);

CREATE INDEX idx_matches_new_tournament ON matches_new(tournament_id);
CREATE INDEX idx_matches_new_qualifier_group ON matches_new(qualifier_group_id) WHERE qualifier_group_id IS NOT NULL;
CREATE INDEX idx_matches_new_world_cup_group ON matches_new(world_cup_group_id) WHERE world_cup_group_id IS NOT NULL;
CREATE INDEX idx_matches_new_type ON matches_new(match_type);
CREATE INDEX idx_matches_new_played ON matches_new(is_played);
CREATE INDEX idx_matches_new_home_team ON matches_new(home_team_id);
CREATE INDEX idx_matches_new_away_team ON matches_new(away_team_id);
CREATE INDEX idx_matches_new_knockout ON matches_new(knockout_round, knockout_position) WHERE knockout_round IS NOT NULL;

-- ============================================
-- TEAM TOURNAMENT SKILLS (historical tracking)
-- ============================================
CREATE TABLE team_tournament_skills (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tournament_id TEXT NOT NULL REFERENCES tournaments_new(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  skill_snapshot INTEGER NOT NULL CHECK (skill_snapshot BETWEEN 30 AND 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tournament_id, team_id)
);

CREATE INDEX idx_team_tournament_skills_tournament ON team_tournament_skills(tournament_id);
CREATE INDEX idx_team_tournament_skills_team ON team_tournament_skills(team_id);

-- ============================================
-- VIEWS FOR EASY QUERYING
-- ============================================

-- Qualifier standings view
CREATE VIEW qualifier_standings AS
SELECT
  qgt.group_id,
  qg.tournament_id,
  qg.region,
  qg.name as group_name,
  qgt.team_id,
  t.name as team_name,
  t.flag,
  qgt.points,
  qgt.played,
  qgt.won,
  qgt.drawn,
  qgt.lost,
  qgt.goals_for,
  qgt.goals_against,
  qgt.goal_difference,
  qgt.qualified,
  ROW_NUMBER() OVER (
    PARTITION BY qgt.group_id
    ORDER BY qgt.points DESC, qgt.goal_difference DESC, qgt.goals_for DESC, t.name ASC
  ) as position
FROM qualifier_group_teams qgt
JOIN qualifier_groups qg ON qgt.group_id = qg.id
JOIN teams t ON qgt.team_id = t.id;

-- World cup standings view
CREATE VIEW world_cup_standings AS
SELECT
  wcgt.group_id,
  wcg.tournament_id,
  wcg.name as group_name,
  wcgt.team_id,
  t.name as team_name,
  t.flag,
  wcgt.points,
  wcgt.played,
  wcgt.won,
  wcgt.drawn,
  wcgt.lost,
  wcgt.goals_for,
  wcgt.goals_against,
  wcgt.goal_difference,
  wcgt.qualified,
  wcgt.final_position,
  ROW_NUMBER() OVER (
    PARTITION BY wcgt.group_id
    ORDER BY wcgt.points DESC, wcgt.goal_difference DESC, wcgt.goals_for DESC, t.name ASC
  ) as position
FROM world_cup_group_teams wcgt
JOIN world_cup_groups wcg ON wcgt.group_id = wcg.id
JOIN teams t ON wcgt.team_id = t.id;

-- ============================================
-- TRIGGER TO UPDATE STANDINGS AUTOMATICALLY
-- ============================================

CREATE OR REPLACE FUNCTION update_group_standings_new()
RETURNS TRIGGER AS $$
DECLARE
  home_points INTEGER;
  away_points INTEGER;
BEGIN
  -- Only process if match is marked as played
  IF NEW.is_played AND NEW.home_score IS NOT NULL AND NEW.away_score IS NOT NULL THEN

    -- Calculate points
    IF NEW.home_score > NEW.away_score THEN
      home_points := 3;
      away_points := 0;
    ELSIF NEW.home_score < NEW.away_score THEN
      home_points := 0;
      away_points := 3;
    ELSE
      home_points := 1;
      away_points := 1;
    END IF;

    -- Update for qualifier matches
    IF NEW.match_type = 'qualifier' AND NEW.qualifier_group_id IS NOT NULL THEN
      -- Update home team
      UPDATE qualifier_group_teams
      SET
        played = played + 1,
        won = won + CASE WHEN NEW.home_score > NEW.away_score THEN 1 ELSE 0 END,
        drawn = drawn + CASE WHEN NEW.home_score = NEW.away_score THEN 1 ELSE 0 END,
        lost = lost + CASE WHEN NEW.home_score < NEW.away_score THEN 1 ELSE 0 END,
        goals_for = goals_for + NEW.home_score,
        goals_against = goals_against + NEW.away_score,
        points = points + home_points
      WHERE group_id = NEW.qualifier_group_id AND team_id = NEW.home_team_id;

      -- Update away team
      UPDATE qualifier_group_teams
      SET
        played = played + 1,
        won = won + CASE WHEN NEW.away_score > NEW.home_score THEN 1 ELSE 0 END,
        drawn = drawn + CASE WHEN NEW.away_score = NEW.home_score THEN 1 ELSE 0 END,
        lost = lost + CASE WHEN NEW.away_score < NEW.home_score THEN 1 ELSE 0 END,
        goals_for = goals_for + NEW.away_score,
        goals_against = goals_against + NEW.home_score,
        points = points + away_points
      WHERE group_id = NEW.qualifier_group_id AND team_id = NEW.away_team_id;

    -- Update for world cup group matches
    ELSIF NEW.match_type = 'world-cup-group' AND NEW.world_cup_group_id IS NOT NULL THEN
      -- Update home team
      UPDATE world_cup_group_teams
      SET
        played = played + 1,
        won = won + CASE WHEN NEW.home_score > NEW.away_score THEN 1 ELSE 0 END,
        drawn = drawn + CASE WHEN NEW.home_score = NEW.away_score THEN 1 ELSE 0 END,
        lost = lost + CASE WHEN NEW.home_score < NEW.away_score THEN 1 ELSE 0 END,
        goals_for = goals_for + NEW.home_score,
        goals_against = goals_against + NEW.away_score,
        points = points + home_points
      WHERE group_id = NEW.world_cup_group_id AND team_id = NEW.home_team_id;

      -- Update away team
      UPDATE world_cup_group_teams
      SET
        played = played + 1,
        won = won + CASE WHEN NEW.away_score > NEW.home_score THEN 1 ELSE 0 END,
        drawn = drawn + CASE WHEN NEW.away_score = NEW.home_score THEN 1 ELSE 0 END,
        lost = lost + CASE WHEN NEW.away_score < NEW.home_score THEN 1 ELSE 0 END,
        goals_for = goals_for + NEW.away_score,
        goals_against = goals_against + NEW.home_score,
        points = points + away_points
      WHERE group_id = NEW.world_cup_group_id AND team_id = NEW.away_team_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trigger_update_group_standings_new
  AFTER INSERT OR UPDATE OF is_played, home_score, away_score ON matches_new
  FOR EACH ROW
  EXECUTE FUNCTION update_group_standings_new();

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get all qualifier matches for a tournament
CREATE OR REPLACE FUNCTION get_qualifier_matches(tournament_id_param TEXT)
RETURNS TABLE (
  match_id TEXT,
  region TEXT,
  group_name TEXT,
  home_team_id TEXT,
  home_team_name TEXT,
  home_team_flag TEXT,
  away_team_id TEXT,
  away_team_name TEXT,
  away_team_flag TEXT,
  home_score INTEGER,
  away_score INTEGER,
  is_played BOOLEAN,
  played_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    qg.region,
    qg.name,
    m.home_team_id,
    th.name,
    th.flag,
    m.away_team_id,
    ta.name,
    ta.flag,
    m.home_score,
    m.away_score,
    m.is_played,
    m.played_at
  FROM matches_new m
  JOIN qualifier_groups qg ON m.qualifier_group_id = qg.id
  JOIN teams th ON m.home_team_id = th.id
  JOIN teams ta ON m.away_team_id = ta.id
  WHERE m.tournament_id = tournament_id_param
    AND m.match_type = 'qualifier'
  ORDER BY qg.region, qg.name, m.created_at;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE tournaments_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE qualifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE qualifier_group_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_cup_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE world_cup_group_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_tournament_skills ENABLE ROW LEVEL SECURITY;

-- Public access policies (adjust for production with proper auth)
CREATE POLICY "Enable all for tournaments_new" ON tournaments_new FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for qualifier_groups" ON qualifier_groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for qualifier_group_teams" ON qualifier_group_teams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for matches_new" ON matches_new FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for world_cup_groups" ON world_cup_groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for world_cup_group_teams" ON world_cup_group_teams FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for team_tournament_skills" ON team_tournament_skills FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE tournaments_new IS 'Normalized tournament table (replaces JSONB approach)';
COMMENT ON TABLE qualifier_groups IS 'Qualifier groups for each region';
COMMENT ON TABLE qualifier_group_teams IS 'Team standings within qualifier groups';
COMMENT ON TABLE matches_new IS 'All matches (qualifiers, world cup groups, and knockout)';
COMMENT ON TABLE world_cup_groups IS 'World Cup final tournament groups';
COMMENT ON TABLE world_cup_group_teams IS 'Team standings within world cup groups';
COMMENT ON TABLE team_tournament_skills IS 'Snapshot of team skills at tournament start';

COMMENT ON COLUMN matches_new.match_type IS 'Type: qualifier, world-cup-group, or world-cup-knockout';
COMMENT ON COLUMN matches_new.knockout_round IS 'For knockout matches: round-of-32, round-of-16, quarter, semi, third-place, final';

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Migration completed successfully!';
  RAISE NOTICE 'Created tables: tournaments_new, qualifier_groups, qualifier_group_teams, world_cup_groups, world_cup_group_teams, matches_new, team_tournament_skills';
  RAISE NOTICE 'Created views: qualifier_standings, world_cup_standings';
  RAISE NOTICE 'Created triggers for automatic standings updates';
END $$;
