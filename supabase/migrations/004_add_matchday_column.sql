-- Add matchday column to matches_new table for proper fixture ordering
-- Matchday represents the round/week when a match is scheduled to be played
-- For qualifiers: 1-20 (each team plays 8 home + 8 away matches in a 5-team group)
-- For World Cup groups: 1-3 (each team plays 3 matches)

ALTER TABLE matches_new
ADD COLUMN matchday INTEGER CHECK (matchday > 0);

COMMENT ON COLUMN matches_new.matchday IS 'Matchday/round number for fixture ordering (1-20 for qualifiers, 1-3 for World Cup)';
