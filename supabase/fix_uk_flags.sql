-- Update UK (home nations) flags with working URLs
-- Flagpedia supports GB-ENG, GB-SCT, GB-WLS, GB-NIR subdivisions

UPDATE teams SET flag = 'https://flagpedia.net/data/flags/w580/gb-eng.webp' WHERE id = 'eng';
UPDATE teams SET flag = 'https://flagpedia.net/data/flags/w580/gb-sct.webp' WHERE id = 'sco';
UPDATE teams SET flag = 'https://flagpedia.net/data/flags/w580/gb-wls.webp' WHERE id = 'wal';
UPDATE teams SET flag = 'https://flagpedia.net/data/flags/w580/gb-nir.webp' WHERE id = 'nir';

-- Verify updates
SELECT id, name, flag FROM teams WHERE id IN ('eng', 'sco', 'wal', 'nir');
