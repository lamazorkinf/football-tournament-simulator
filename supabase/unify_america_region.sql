-- Unify South America and North America into single America region
-- This creates a single Americas qualifying tournament

-- Step 1: Drop old constraint FIRST (before updating teams)
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_region_check;

-- Step 2: Update all South America and North America teams to America
UPDATE teams
SET region = 'America'
WHERE region IN ('South America', 'North America');

-- Step 3: Add new constraint with updated regions
ALTER TABLE teams ADD CONSTRAINT teams_region_check
  CHECK (region IN ('Europe', 'America', 'Africa', 'Asia', 'Oceania'));

-- Verify changes
SELECT region, COUNT(*) as team_count
FROM teams
GROUP BY region
ORDER BY team_count DESC;
