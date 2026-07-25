-- ============================================
-- Migration 017: marca de prórroga en el historial
-- ============================================
-- Sin esta columna, un 2-1 jugado en 90 minutos y un 2-1 definido en el alargue
-- son indistinguibles en el historial. Se guarda como columna y no dentro de
-- `metadata` para que sea consultable y para que el listado paginado la traiga
-- sin cambios: get_matches_page devuelve SETOF match_history con SELECT *.

ALTER TABLE match_history
ADD COLUMN IF NOT EXISTS went_to_extra_time BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN match_history.went_to_extra_time IS
  'El partido se jugó con prórroga. Los partidos previos a la feature quedan en FALSE, que es correcto: en ese motor no existía el alargue.';
