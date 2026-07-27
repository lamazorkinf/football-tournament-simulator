-- ============================================
-- Migration 018: Modos de juego (competiciones aisladas)
-- ============================================
-- Hasta acá el juego era una sola competición: el ciclo mundialista de
-- selecciones. Este cambio introduce el concepto de "modo": una competición
-- aislada, dueña de su propio pool de equipos y sus torneos. Ningún dato de un
-- modo se mezcla con otro.
--
-- El Mundial actual pasa a ser el modo 'selecciones' (intacto): todos los
-- equipos, torneos e historial existentes se backfillean a ese modo.
--
-- Aplicar DESPUÉS de 017. Es idempotente (IF NOT EXISTS / IF EXISTS) para poder
-- re-correrla sin romper.

-- --------------------------------------------
-- Tabla de modos
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS modes (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  -- 'national-cycle' = el ciclo mundialista clásico (fases encadenadas).
  -- 'league-system'  = ligas/copas por temporada (ej: Liga Villamariense).
  kind         TEXT NOT NULL CHECK (kind IN ('national-cycle', 'league-system')),
  -- Configuración libre del modo (divisiones, tamaños, reglas de copa, etc.).
  config       JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Año/temporada activa del modo (avanza al cerrar una temporada).
  current_year INTEGER,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Modo por defecto: las selecciones (el juego que ya existía).
INSERT INTO modes (id, name, kind, current_year)
VALUES ('selecciones', 'Selecciones', 'national-cycle', 2026)
ON CONFLICT (id) DO NOTHING;

-- Modo Liga Villamariense (sin equipos todavía; se siembran en 019).
INSERT INTO modes (id, name, kind, current_year)
VALUES ('villamariense', 'Liga Villamariense', 'league-system', 2026)
ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER update_modes_updated_at
BEFORE UPDATE ON modes
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE modes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON modes FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON modes FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON modes FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON modes FOR DELETE USING (true);

-- --------------------------------------------
-- teams: pertenencia a un modo + región opcional
-- --------------------------------------------
-- Los clubes de un modo nuevo no tienen región (Europe/America/...): esa
-- dimensión sólo aplica al modo selecciones. Se afloja NOT NULL; el CHECK
-- original de región tolera NULL sin cambios (un NULL satisface un CHECK).
ALTER TABLE teams ALTER COLUMN region DROP NOT NULL;

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS mode_id TEXT REFERENCES modes(id) ON DELETE CASCADE;

-- Backfill: todo lo que existe hoy es del modo selecciones.
UPDATE teams SET mode_id = 'selecciones' WHERE mode_id IS NULL;
ALTER TABLE teams ALTER COLUMN mode_id SET DEFAULT 'selecciones';
ALTER TABLE teams ALTER COLUMN mode_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teams_mode ON teams(mode_id);

-- --------------------------------------------
-- tournaments_new: a qué modo pertenece cada torneo del ciclo
-- --------------------------------------------
ALTER TABLE tournaments_new
  ADD COLUMN IF NOT EXISTS mode_id TEXT REFERENCES modes(id) ON DELETE CASCADE;
UPDATE tournaments_new SET mode_id = 'selecciones' WHERE mode_id IS NULL;
ALTER TABLE tournaments_new ALTER COLUMN mode_id SET DEFAULT 'selecciones';
ALTER TABLE tournaments_new ALTER COLUMN mode_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tournaments_new_mode ON tournaments_new(mode_id);

-- --------------------------------------------
-- match_history: scope por modo + stages nuevos
-- --------------------------------------------
ALTER TABLE match_history
  ADD COLUMN IF NOT EXISTS mode_id TEXT REFERENCES modes(id) ON DELETE CASCADE;
UPDATE match_history SET mode_id = 'selecciones' WHERE mode_id IS NULL;
ALTER TABLE match_history ALTER COLUMN mode_id SET DEFAULT 'selecciones';
ALTER TABLE match_history ALTER COLUMN mode_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_match_history_mode ON match_history(mode_id);

-- Ampliar los stages permitidos con los formatos genéricos.
ALTER TABLE match_history DROP CONSTRAINT IF EXISTS match_history_stage_check;
ALTER TABLE match_history ADD CONSTRAINT match_history_stage_check
  CHECK (stage IN (
    'qualifier', 'world-cup-group', 'world-cup-knockout',
    'continental', 'confed-group', 'confed-knockout',
    'league', 'cup'
  ));

-- --------------------------------------------
-- mode_tournaments: torneos genéricos (liga / copa) como documento JSONB
-- --------------------------------------------
-- Mismo patrón atómico que tournament_cycle_state: todo el estado del torneo
-- (fixtures, standings, llave) vive en un único JSONB por torneo. El modo
-- selecciones NO usa esta tabla (sigue en su esquema normalizado).
CREATE TABLE IF NOT EXISTS mode_tournaments (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  mode_id        TEXT NOT NULL REFERENCES modes(id) ON DELETE CASCADE,
  year           INTEGER NOT NULL,
  format         TEXT NOT NULL CHECK (format IN ('league', 'cup')),
  name           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'in-progress'
    CHECK (status IN ('in-progress', 'completed')),
  -- Sub-división opcional (ej: 'A' / 'B' para las dos ligas del año).
  division       TEXT,
  state          JSONB NOT NULL DEFAULT '{}'::jsonb,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mode_tournaments_mode ON mode_tournaments(mode_id);
CREATE INDEX IF NOT EXISTS idx_mode_tournaments_year ON mode_tournaments(mode_id, year);

CREATE TRIGGER update_mode_tournaments_updated_at
BEFORE UPDATE ON mode_tournaments
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE mode_tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON mode_tournaments FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON mode_tournaments FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON mode_tournaments FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON mode_tournaments FOR DELETE USING (true);

-- --------------------------------------------
-- mode_season_state: composición de divisiones por año (ascensos/descensos)
-- --------------------------------------------
-- Guarda qué clubes integran cada división en un año dado. Es la base del motor
-- de temporada (3 suben / 3 bajan) y del cruce A-vs-B del sorteo de Copa (que se
-- arma con la composición del año anterior).
CREATE TABLE IF NOT EXISTS mode_season_state (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  mode_id    TEXT NOT NULL REFERENCES modes(id) ON DELETE CASCADE,
  year       INTEGER NOT NULL,
  division   TEXT NOT NULL,
  -- Orden = orden de siembra inicial; después la tabla manda.
  team_ids   JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (mode_id, year, division)
);

CREATE INDEX IF NOT EXISTS idx_mode_season_state_mode ON mode_season_state(mode_id, year);

ALTER TABLE mode_season_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON mode_season_state FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON mode_season_state FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON mode_season_state FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON mode_season_state FOR DELETE USING (true);
