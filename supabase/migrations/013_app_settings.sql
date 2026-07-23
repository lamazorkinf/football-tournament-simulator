-- ============================================
-- Migration 013: Preferencias de la app en la DB (fin del localStorage)
-- ============================================
-- La app dejó de persistir estado en localStorage: Supabase es la única fuente
-- de verdad. Los torneos ya vivían en `tournaments_new` + `tournament_cycle_state`,
-- pero la config del motor Elo, los equipos favoritos y el efecto CRT seguían
-- guardados localmente por el middleware `persist` de zustand.
--
-- Como la app no tiene auth, las preferencias son globales: una única fila
-- singleton forzada por el CHECK sobre la PK. Así el upsert nunca puede crear
-- una segunda fila por error y `loadSettings` no necesita ordenar ni filtrar.

CREATE TABLE IF NOT EXISTS app_settings (
  id                TEXT PRIMARY KEY DEFAULT 'global' CHECK (id = 'global'),
  engine_config     JSONB NOT NULL,
  favorite_team_ids TEXT[] NOT NULL DEFAULT '{}',
  scanlines         BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS abierto, consistente con el resto del esquema (la app no tiene auth).
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for app_settings" ON app_settings;
CREATE POLICY "Enable all for app_settings" ON app_settings
  FOR ALL USING (true) WITH CHECK (true);

-- set_updated_at() ya existe (migración 011): reutilizamos la función.
DROP TRIGGER IF EXISTS trigger_app_settings_updated_at ON app_settings;
CREATE TRIGGER trigger_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE app_settings IS
  'Fila singleton (id = ''global'') con las preferencias de la app: config del motor Elo, equipos favoritos y efecto CRT. Globales porque la app no tiene auth: se comparten entre dispositivos.';
