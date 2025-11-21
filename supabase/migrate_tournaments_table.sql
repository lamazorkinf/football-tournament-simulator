-- Migration: Add tournament persistence fields
-- This adds columns to store complete tournament state in the database

-- Add new columns if they don't exist
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS qualifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS world_cup JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_qualifiers_complete BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_any_match_played BOOLEAN DEFAULT FALSE;

-- Add comment
COMMENT ON COLUMN tournaments.qualifiers IS 'Complete state of qualifier groups including teams, matches, standings, and letter assignments';
COMMENT ON COLUMN tournaments.world_cup IS 'Complete state of World Cup including groups and knockout bracket';
