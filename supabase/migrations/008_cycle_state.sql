-- ============================================
-- Migration 008: Estado del ciclo (continental + confederaciones + calendario)
-- ============================================
-- El estado del ciclo es un value-object propiedad 1:1 de un torneo: se lee y
-- escribe como una unidad, no se consulta relacionalmente, y no comparte
-- integridad referencial con otras filas. Se guarda como documento JSONB en una
-- tabla lateral, dejando `tournaments_new` liviano para las queries de lista.
-- Los resultados de cada partido continental/confed siguen auditándose
-- normalizados en `match_history`.

CREATE TABLE IF NOT EXISTS tournament_cycle_state (
  tournament_id  TEXT PRIMARY KEY REFERENCES tournaments_new(id) ON DELETE CASCADE,
  state          JSONB NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS abierto, consistente con el resto del esquema (la app no tiene auth).
ALTER TABLE tournament_cycle_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for tournament_cycle_state" ON tournament_cycle_state
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE tournament_cycle_state IS
  'Snapshot JSONB del estado del ciclo (continental/confederaciones/calendario) por torneo. Propiedad 1:1 de tournaments_new (ON DELETE CASCADE). El detalle por-partido queryable vive en match_history.';
