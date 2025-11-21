-- Clean All Tournament Data
-- This script completely wipes all tournament data while preserving team data
-- Use this to start fresh after major schema changes (like region unification)

-- Step 1: Delete all match history (no CASCADE, must be manual)
DELETE FROM match_history;

-- Step 2: Delete all tournaments
-- This CASCADE deletes:
--   - qualifier_groups
--   - qualifier_group_teams
--   - world_cup_groups
--   - world_cup_group_teams
--   - matches_new
--   - team_tournament_skills
DELETE FROM tournaments_new;

-- Verify cleanup
SELECT
  (SELECT COUNT(*) FROM match_history) as match_history_count,
  (SELECT COUNT(*) FROM tournaments_new) as tournaments_count,
  (SELECT COUNT(*) FROM qualifier_groups) as qualifier_groups_count,
  (SELECT COUNT(*) FROM world_cup_groups) as world_cup_groups_count,
  (SELECT COUNT(*) FROM matches_new) as matches_count;

-- All counts should be 0
-- Teams remain intact: SELECT COUNT(*) FROM teams; should show all teams
