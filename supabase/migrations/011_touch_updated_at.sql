-- ============================================
-- Migration 011: updated_at confiable (reconciliación multi-dispositivo)
-- ============================================
-- La reconciliación local↔DB (ver spec 2026-07-22-sync-multidispositivo-por-recencia)
-- necesita que updated_at refleje la última escritura. Los upserts de saveTournament
-- y saveCycleState no lo setean, y solo se llenaba en el INSERT (DEFAULT now()).
-- Un trigger BEFORE UPDATE lo bumpea en cada UPDATE. Postgres dispara el trigger
-- aunque los valores no cambien, así que también bumpea cuando saveTournament
-- reescribe el header al jugar un partido de grupo (que no toca campos del header).

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_tournaments_new_updated_at ON tournaments_new;
CREATE TRIGGER trigger_tournaments_new_updated_at
  BEFORE UPDATE ON tournaments_new
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trigger_cycle_state_updated_at ON tournament_cycle_state;
CREATE TRIGGER trigger_cycle_state_updated_at
  BEFORE UPDATE ON tournament_cycle_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
