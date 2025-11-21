-- Migration: Copy missing quarterfinal and semifinal matches from match_history to matches_new
-- These matches exist in match_history but are missing in matches_new

-- Insert quarterfinal matches (4 matches)
INSERT INTO matches_new (
  id,
  tournament_id,
  match_type,
  knockout_round,
  home_team_id,
  away_team_id,
  home_score,
  away_score,
  is_played,
  played_at,
  home_penalties,
  away_penalties,
  winner_team_id,
  created_at,
  updated_at
)
SELECT
  mh.id::text,
  mh.tournament_id,
  'world-cup-knockout'::text,
  'quarter'::text,
  mh.home_team_id,
  mh.away_team_id,
  mh.home_score,
  mh.away_score,
  true, -- is_played
  mh.played_at,
  CASE
    WHEN mh.metadata ? 'penalties' THEN (mh.metadata->'penalties'->>'homeScore')::integer
    ELSE NULL
  END,
  CASE
    WHEN mh.metadata ? 'penalties' THEN (mh.metadata->'penalties'->>'awayScore')::integer
    ELSE NULL
  END,
  CASE
    WHEN mh.metadata ? 'penalties' THEN
      CASE
        WHEN (mh.metadata->'penalties'->>'homeScore')::integer > (mh.metadata->'penalties'->>'awayScore')::integer THEN mh.home_team_id
        ELSE mh.away_team_id
      END
    WHEN mh.home_score > mh.away_score THEN mh.home_team_id
    ELSE mh.away_team_id
  END,
  NOW(),
  NOW()
FROM match_history mh
WHERE mh.stage = 'world-cup-knockout'
  AND mh.group_name = 'quarter-final'
  AND mh.tournament_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Insert semifinal matches (2 matches)
INSERT INTO matches_new (
  id,
  tournament_id,
  match_type,
  knockout_round,
  home_team_id,
  away_team_id,
  home_score,
  away_score,
  is_played,
  played_at,
  home_penalties,
  away_penalties,
  winner_team_id,
  created_at,
  updated_at
)
SELECT
  mh.id::text,
  mh.tournament_id,
  'world-cup-knockout'::text,
  'semi'::text,
  mh.home_team_id,
  mh.away_team_id,
  mh.home_score,
  mh.away_score,
  true, -- is_played
  mh.played_at,
  CASE
    WHEN mh.metadata ? 'penalties' THEN (mh.metadata->'penalties'->>'homeScore')::integer
    ELSE NULL
  END,
  CASE
    WHEN mh.metadata ? 'penalties' THEN (mh.metadata->'penalties'->>'awayScore')::integer
    ELSE NULL
  END,
  CASE
    WHEN mh.metadata ? 'penalties' THEN
      CASE
        WHEN (mh.metadata->'penalties'->>'homeScore')::integer > (mh.metadata->'penalties'->>'awayScore')::integer THEN mh.home_team_id
        ELSE mh.away_team_id
      END
    WHEN mh.home_score > mh.away_score THEN mh.home_team_id
    ELSE mh.away_team_id
  END,
  NOW(),
  NOW()
FROM match_history mh
WHERE mh.stage = 'world-cup-knockout'
  AND mh.group_name = 'semi-final'
  AND mh.tournament_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;
