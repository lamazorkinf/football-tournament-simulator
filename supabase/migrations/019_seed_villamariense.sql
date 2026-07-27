-- ============================================
-- Migration 019: siembra de la Liga Villamariense
-- ============================================
-- Carga los 32 clubes del modo 'villamariense' (creado en 018), repartidos en
-- División A (16) y B (16), y siembra la composición de divisiones del año 2026
-- en mode_season_state (base de los ascensos/descensos y del cruce A-vs-B de la
-- Copa).
--
-- Skills DEFAULT por división, banda angosta y con overlap entre A y B: es una
-- liga muy pareja. A ≈ 61.0–64.0, B ≈ 58.0–61.0 (paso 0.2). Ajustables después.
--
-- Escudos: placeholder '⚽' por ahora. Para escudos reales, subirlos a un bucket
-- público de Supabase Storage y hacer UPDATE teams SET flag = '<url>' WHERE id =
-- '<id>' (ver docs/ESCUDOS_CLUBES.md).
--
-- Aplicar DESPUÉS de 018. Idempotente (ON CONFLICT DO NOTHING / upsert).

-- --------------------------------------------
-- Clubes (region NULL: los clubes no tienen confederación)
-- --------------------------------------------
INSERT INTO teams (id, name, flag, region, mode_id, skill) VALUES
  -- División A
  ('vm-alumni',          'Alumni',            '⚽', NULL, 'villamariense', 64.0),
  ('vm-ln-alem',         'L. N. Alem',        '⚽', NULL, 'villamariense', 63.8),
  ('vm-d-argentino',     'D. Argentino',      '⚽', NULL, 'villamariense', 63.6),
  ('vm-h-yrigoyen',      'H. Yrigoyen',       '⚽', NULL, 'villamariense', 63.4),
  ('vm-d-universitario', 'D. Universitario',  '⚽', NULL, 'villamariense', 63.2),
  ('vm-r-gutierrez',     'R. Gutierrez',      '⚽', NULL, 'villamariense', 63.0),
  ('vm-a-espanola',      'A. Española',       '⚽', NULL, 'villamariense', 62.8),
  ('vm-a-ticino',        'A. Ticino',         '⚽', NULL, 'villamariense', 62.6),
  ('vm-9-de-julio',      '9 de Julio',        '⚽', NULL, 'villamariense', 62.4),
  ('vm-san-lorenzo-lp',  'San Lorenzo (LP)',  '⚽', NULL, 'villamariense', 62.2),
  ('vm-colon',           'Colón',             '⚽', NULL, 'villamariense', 62.0),
  ('vm-rivadavia',       'Rivadavia',         '⚽', NULL, 'villamariense', 61.8),
  ('vm-velez-o',         'Vélez (O)',         '⚽', NULL, 'villamariense', 61.6),
  ('vm-independiente-o', 'Independiente (O)', '⚽', NULL, 'villamariense', 61.4),
  ('vm-independiente-h', 'Independiente (H)', '⚽', NULL, 'villamariense', 61.2),
  ('vm-estudiantes-h',   'Estudiantes (H)',   '⚽', NULL, 'villamariense', 61.0),
  -- División B
  ('vm-san-lorenzo-vm',    'San Lorenzo (VM)',    '⚽', NULL, 'villamariense', 61.0),
  ('vm-silvio-pellico',    'Silvio Pellico',      '⚽', NULL, 'villamariense', 60.8),
  ('vm-union-central',     'Unión Central',       '⚽', NULL, 'villamariense', 60.6),
  ('vm-los-zorros',        'Los Zorros',          '⚽', NULL, 'villamariense', 60.4),
  ('vm-sp-playosa',        'Sp. Playosa',         '⚽', NULL, 'villamariense', 60.2),
  ('vm-fn-gutierrez',      'F. N. Gutierrez',     '⚽', NULL, 'villamariense', 60.0),
  ('vm-c-argentino',       'C. Argentino',        '⚽', NULL, 'villamariense', 59.8),
  ('vm-union-aa',          'Unión (AA)',          '⚽', NULL, 'villamariense', 59.6),
  ('vm-union-social',      'Unión Social',        '⚽', NULL, 'villamariense', 59.4),
  ('vm-a-luca',            'A. Luca',             '⚽', NULL, 'villamariense', 59.2),
  ('vm-d-alianza',         'D. Alianza',          '⚽', NULL, 'villamariense', 59.0),
  ('vm-river-plate',       'River Plate',         '⚽', NULL, 'villamariense', 58.8),
  ('vm-juventud-rp',       'Juventud R. P.',      '⚽', NULL, 'villamariense', 58.6),
  ('vm-river-algarrobos',  'River (Algarrobos)',  '⚽', NULL, 'villamariense', 58.4),
  ('vm-juventud-unida-pa', 'Juventud Unida (PA)', '⚽', NULL, 'villamariense', 58.2),
  ('vm-defensores-jc',     'Defensores (JC)',     '⚽', NULL, 'villamariense', 58.0)
ON CONFLICT (id) DO NOTHING;

-- --------------------------------------------
-- Composición de divisiones 2026 (temporada inicial)
-- --------------------------------------------
INSERT INTO mode_season_state (mode_id, year, division, team_ids) VALUES
  ('villamariense', 2026, 'A', '[
    "vm-alumni","vm-ln-alem","vm-d-argentino","vm-h-yrigoyen","vm-d-universitario",
    "vm-r-gutierrez","vm-a-espanola","vm-a-ticino","vm-9-de-julio","vm-san-lorenzo-lp",
    "vm-colon","vm-rivadavia","vm-velez-o","vm-independiente-o","vm-independiente-h",
    "vm-estudiantes-h"
  ]'::jsonb),
  ('villamariense', 2026, 'B', '[
    "vm-san-lorenzo-vm","vm-silvio-pellico","vm-union-central","vm-los-zorros","vm-sp-playosa",
    "vm-fn-gutierrez","vm-c-argentino","vm-union-aa","vm-union-social","vm-a-luca",
    "vm-d-alianza","vm-river-plate","vm-juventud-rp","vm-river-algarrobos","vm-juventud-unida-pa",
    "vm-defensores-jc"
  ]'::jsonb)
ON CONFLICT (mode_id, year, division) DO NOTHING;

-- Asegurar el año en curso del modo (por si 018 se aplicó distinto).
UPDATE modes SET current_year = 2026 WHERE id = 'villamariense' AND current_year IS NULL;
