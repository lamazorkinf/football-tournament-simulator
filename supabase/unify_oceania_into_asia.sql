-- Unify Oceania into Asia Confederation
-- This merges all Oceania teams into the Asia region
-- Similar to the America unification that merged North/South America

-- Step 1: Drop old constraint FIRST (to allow region update)
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_region_check;

-- Step 2: Update all Oceania teams to Asia
-- Affected teams: New Zealand, Papua New Guinea, Fiji, New Caledonia, Tahiti,
--                 Solomon Islands, Vanuatu, Cook Islands, Samoa, American Samoa, Tonga
UPDATE teams
SET region = 'Asia'
WHERE region = 'Oceania';

-- Step 3: Add new constraint with only 4 regions
ALTER TABLE teams ADD CONSTRAINT teams_region_check
  CHECK (region IN ('Europe', 'America', 'Africa', 'Asia'));

-- Verify changes
SELECT
  region,
  COUNT(*) as team_count
FROM teams
GROUP BY region
ORDER BY team_count DESC;

-- Expected result:
-- Europe: ~54 teams
-- Asia: ~57 teams (46 + 11 from Oceania)
-- Africa: ~54 teams
-- America: ~35 teams
-- Oceania: 0 teams (all moved to Asia)
