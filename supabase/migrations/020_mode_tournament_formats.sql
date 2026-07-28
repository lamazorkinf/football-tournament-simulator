-- ============================================
-- 020: los tres formatos canónicos en mode_tournaments
-- ============================================
-- Un modo se describe ahora con tres formatos —liga, grupos + eliminación y
-- eliminación— y sus torneos guardan cuál de las competiciones del descriptor
-- (`modes.config`) están corriendo.
--
-- La migración es EXPANSIVA a propósito: el CHECK acepta los formatos nuevos Y
-- los viejos, y `competition_id` es nullable. Así se puede aplicar ANTES de
-- desplegar el código sin romper la versión que está corriendo, y la versión
-- nueva lee las filas viejas sin necesidad de backfill (traduce
-- 'league' → 'liga' y 'cup' → 'eliminacion' al leer, y deduce la competición
-- por formato + división). No hay que borrar los valores legacy: son datos
-- históricos válidos.

-- --------------------------------------------
-- format: los tres canónicos + los dos legacy
-- --------------------------------------------
ALTER TABLE mode_tournaments DROP CONSTRAINT IF EXISTS mode_tournaments_format_check;
ALTER TABLE mode_tournaments ADD CONSTRAINT mode_tournaments_format_check
  CHECK (format IN (
    -- Canónicos (los que escribe el código actual).
    'liga', 'grupos-eliminacion', 'eliminacion',
    -- Legacy, conservados para las filas ya guardadas.
    'league', 'cup'
  ));

-- --------------------------------------------
-- competition_id: a qué competición del descriptor pertenece el torneo
-- --------------------------------------------
-- Nullable: las filas anteriores a esta migración no lo tienen y se resuelven
-- al leer contra el descriptor del modo.
ALTER TABLE mode_tournaments
  ADD COLUMN IF NOT EXISTS competition_id TEXT;

COMMENT ON COLUMN mode_tournaments.competition_id IS
  'Id de la competición dentro de modes.config que corre este torneo. NULL en filas previas a la migración 020.';

-- Un modo no corre dos veces la misma competición en el mismo año.
CREATE UNIQUE INDEX IF NOT EXISTS idx_mode_tournaments_competition
  ON mode_tournaments(mode_id, year, competition_id)
  WHERE competition_id IS NOT NULL;

-- --------------------------------------------
-- schema_version
-- --------------------------------------------
-- La columna ya existe desde la 018 con DEFAULT 1. v2 = los tres formatos sobre
-- las primitivas unificadas (en particular, la copa a ida y vuelta pasó de su
-- estructura propia a un cuadro). Las filas v1 se migran en memoria al leer y
-- se re-escriben como v2 en la primera escritura del torneo; no hace falta
-- tocarlas acá.
COMMENT ON COLUMN mode_tournaments.schema_version IS
  'Versión del documento state. 1 = formatos previos a la unificación; 2 = primitivas unificadas (bracket/groupStage/league).';
