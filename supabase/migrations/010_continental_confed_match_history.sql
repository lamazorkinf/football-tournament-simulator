-- 010: admitir partidos de Copa Continental y Confederaciones en match_history.
-- El detalle por-partido queryable de estas fases faltaba: solo se guardaba el
-- snapshot JSONB del ciclo, invisibilizando esos partidos en H2H y Match Center.
ALTER TABLE match_history DROP CONSTRAINT IF EXISTS match_history_stage_check;
ALTER TABLE match_history ADD CONSTRAINT match_history_stage_check
  CHECK (stage IN (
    'qualifier',
    'world-cup-group',
    'world-cup-knockout',
    'continental',
    'confed-group',
    'confed-knockout'
  ));
