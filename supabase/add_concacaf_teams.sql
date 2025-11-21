-- Insert new CONCACAF teams
INSERT INTO teams (id, name, flag, region, skill) VALUES
  ('cuw', 'Curaçao', 'https://flagsapi.com/CW/flat/64.png', 'North America', 48),
  ('atg', 'Antigua and Barbuda', 'https://flagsapi.com/AG/flat/64.png', 'North America', 42),
  ('skn', 'Saint Kitts and Nevis', 'https://flagsapi.com/KN/flat/64.png', 'North America', 41),
  ('lca', 'Saint Lucia', 'https://flagsapi.com/LC/flat/64.png', 'North America', 40),
  ('vin', 'Saint Vincent and the Grenadines', 'https://flagsapi.com/VC/flat/64.png', 'North America', 39),
  ('grn', 'Grenada', 'https://flagsapi.com/GD/flat/64.png', 'North America', 39),
  ('msr', 'Montserrat', 'https://flagsapi.com/MS/flat/64.png', 'North America', 35),
  ('dma', 'Dominica', 'https://flagsapi.com/DM/flat/64.png', 'North America', 37),
  ('aru', 'Aruba', 'https://flagsapi.com/AW/flat/64.png', 'North America', 36),
  ('cay', 'Cayman Islands', 'https://flagsapi.com/KY/flat/64.png', 'North America', 35),
  ('bah', 'Bahamas', 'https://flagsapi.com/BS/flat/64.png', 'North America', 34),
  ('tca', 'Turks and Caicos Islands', 'https://flagsapi.com/TC/flat/64.png', 'North America', 32),
  ('vgb', 'British Virgin Islands', 'https://flagsapi.com/VG/flat/64.png', 'North America', 31),
  ('vir', 'US Virgin Islands', 'https://flagsapi.com/VI/flat/64.png', 'North America', 31),
  ('aia', 'Anguilla', 'https://flagsapi.com/AI/flat/64.png', 'North America', 30)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  flag = EXCLUDED.flag,
  region = EXCLUDED.region,
  skill = EXCLUDED.skill;
