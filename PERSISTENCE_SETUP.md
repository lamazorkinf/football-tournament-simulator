# Tournament Persistence Setup

Este documento explica cómo configurar la persistencia completa de torneos en Supabase.

## ¿Qué se persiste?

### Antes (Solo en localStorage):
- ❌ Torneo actual (se pierde al limpiar navegador)
- ✅ Partidos históricos
- ✅ Estadísticas de equipos

### Ahora (Completo en Supabase):
- ✅ **Estado completo del torneo**:
  - Grupos de clasificatorias con equipos asignados
  - Sorteos y asignaciones de letras (A-E)
  - Partidos generados (fixture de 20 jornadas)
  - Tablas de posiciones actualizadas
  - Estado del Mundial (grupos + knockout)
  - Campeones y posiciones finales
- ✅ **Partidos históricos** (ya estaba)
- ✅ **Estadísticas de equipos** (ya estaba)

## Pasos para migrar tu base de datos

### 1. Ejecuta la migración de la tabla tournaments

En el SQL Editor de Supabase, ejecuta:

```sql
-- Este archivo: supabase/migrate_tournaments_table.sql
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS qualifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS world_cup JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_qualifiers_complete BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_any_match_played BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN tournaments.qualifiers IS 'Complete state of qualifier groups';
COMMENT ON COLUMN tournaments.world_cup IS 'Complete state of World Cup';
```

### 2. (Opcional) Actualiza el constraint de regiones

Si todavía no ejecutaste el script para unificar América:

```sql
-- Este archivo ya fue ejecutado: supabase/unify_america_region.sql
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_region_check;

UPDATE teams
SET region = 'America'
WHERE region IN ('South America', 'North America');

ALTER TABLE teams ADD CONSTRAINT teams_region_check
  CHECK (region IN ('Europe', 'America', 'Africa', 'Asia', 'Oceania'));
```

## ¿Cómo funciona?

### Auto-guardado automático

El sistema guarda automáticamente el torneo en Supabase después de:

1. **Crear nuevo torneo** → Se guarda en DB
2. **Generar sorteo y fixtures** → Se guarda en DB
3. **Simular cualquier partido** (clasificatorias o mundial) → Se guarda en DB
4. **Avanzar al Mundial** → Se guarda en DB
5. **Avanzar a fase eliminatoria** → Se guarda en DB
6. **Completar el torneo** → Se guarda en DB con campeón

### Carga automática

Al iniciar la aplicación:

1. Se carga el **último torneo** desde Supabase
2. Si no hay torneos, se crea uno nuevo
3. LocalStorage se usa solo como cache rápido

## Beneficios

✅ **Nunca pierdes progreso**: Aunque borres localStorage, el torneo sigue en la DB

✅ **Sincronización perfecta**: Cada cambio se guarda automáticamente

✅ **Historial completo**: Puedes ver torneos anteriores en la tabla `tournaments`

✅ **Estadísticas precisas**: Todo basado en datos reales de la DB

## Verificación

Para verificar que todo funciona:

1. Genera un sorteo y simula algunos partidos
2. Abre la consola del navegador
3. Busca mensajes como:
   ```
   Loaded tournament from database: <tournament-id>
   Tournament <id> updated in database
   ```

4. En Supabase, verifica la tabla `tournaments`:
   ```sql
   SELECT id, name, status, is_qualifiers_complete, has_any_match_played, created_at
   FROM tournaments
   ORDER BY created_at DESC;
   ```

5. Para ver el estado completo del torneo:
   ```sql
   SELECT qualifiers, world_cup
   FROM tournaments
   WHERE id = '<tournament-id>';
   ```

## Solución de problemas

### El torneo no se guarda
- Verifica que Supabase esté configurado (archivo `.env`)
- Revisa la consola para errores de guardado
- Asegúrate de que las políticas RLS permiten INSERT/UPDATE

### El torneo no se carga
- Verifica que ejecutaste la migración `migrate_tournaments_table.sql`
- Revisa si hay torneos en la tabla: `SELECT * FROM tournaments;`
- Limpia localStorage y recarga la página

### Errores de constraint
- Ejecuta primero `unify_america_region.sql` para actualizar las regiones
- Verifica que todos los equipos tengan región válida
