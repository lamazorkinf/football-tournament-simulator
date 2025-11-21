-- Update UK (home nations) flags with Wikipedia Commons URLs (100% reliable)
-- These are the official flag images, always available

UPDATE teams SET flag = 'https://upload.wikimedia.org/wikipedia/en/thumb/b/be/Flag_of_England.svg/320px-Flag_of_England.svg.png' WHERE id = 'eng';
UPDATE teams SET flag = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Flag_of_Scotland.svg/320px-Flag_of_Scotland.svg.png' WHERE id = 'sco';
UPDATE teams SET flag = 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/Flag_of_Wales.svg/320px-Flag_of_Wales.svg.png' WHERE id = 'wal';
UPDATE teams SET flag = 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Flag_of_Northern_Ireland_%281953%E2%80%931972%29.svg/320px-Flag_of_Northern_Ireland_%281953%E2%80%931972%29.svg.png' WHERE id = 'nir';

-- Verify updates
SELECT id, name, flag FROM teams WHERE id IN ('eng', 'sco', 'wal', 'nir');
