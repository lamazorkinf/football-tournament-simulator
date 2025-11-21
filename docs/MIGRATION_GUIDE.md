# Guía de Migración al Schema Normalizado

## ✅ Archivo de Migración Listo

El archivo `supabase/migrations/002_normalized_schema.sql` está listo para aplicar.

**Correcciones aplicadas:**
- ✅ Orden correcto de creación de tablas
- ✅ Sin referencias a tablas que no existen
- ✅ Compatible con schema actual de `teams`
- ✅ IDs usando TEXT (no UUID)
- ✅ Constraints y validaciones completas
- ✅ Triggers para actualización automática de standings
- ✅ Views para queries comunes
- ✅ RLS policies configuradas

## 🚀 Cómo Aplicar la Migración

### Opción 1: Supabase Dashboard (Recomendado para Supabase Hosted)

1. **Ve al Dashboard de Supabase**
   ```
   https://supabase.com/dashboard/project/TU_PROJECT_ID
   ```

2. **Abre el SQL Editor**
   - Click en "SQL Editor" en el menú lateral
   - O ve a: `SQL Editor` → `New Query`

3. **Copia y Pega el SQL**
   - Abre el archivo: `supabase/migrations/002_normalized_schema.sql`
   - Copia TODO el contenido
   - Pégalo en el SQL Editor

4. **Ejecuta la Migración**
   - Click en el botón "Run" (o presiona Cmd/Ctrl + Enter)
   - Espera a que termine (puede tomar 10-30 segundos)

5. **Verifica el Resultado**
   - Deberías ver: "Success. No rows returned"
   - También verás un mensaje: "Migration completed successfully!"

### Opción 2: CLI de Supabase (Local)

Si estás usando Supabase local:

```bash
# Asegúrate de estar en el directorio del proyecto
cd C:\Desarrollo\football

# Aplica la migración
supabase db reset

# O aplica solo esta migración
supabase migration up
```

### Opción 3: Conexión Directa a PostgreSQL

Si tienes acceso directo a la base de datos:

```bash
psql "postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/postgres" -f supabase/migrations/002_normalized_schema.sql
```

## ✅ Verificación Post-Migración

Después de aplicar la migración, verifica que todo funcionó:

### 1. Verifica las Tablas Creadas

Ejecuta este query en el SQL Editor:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'tournaments_new',
    'qualifier_groups',
    'qualifier_group_teams',
    'world_cup_groups',
    'world_cup_group_teams',
    'matches_new',
    'team_tournament_skills'
  )
ORDER BY table_name;
```

**Resultado esperado:** 7 tablas

### 2. Verifica las Views

```sql
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('qualifier_standings', 'world_cup_standings')
ORDER BY table_name;
```

**Resultado esperado:** 2 views

### 3. Verifica los Triggers

```sql
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'trigger_update_group_standings_new';
```

**Resultado esperado:** 1 trigger en la tabla `matches_new`

### 4. Prueba las Views

```sql
-- Debería retornar vacío (no hay datos aún)
SELECT * FROM qualifier_standings LIMIT 5;
SELECT * FROM world_cup_standings LIMIT 5;
```

## 📊 Estructura de Tablas Creadas

```
tournaments_new
├── qualifier_groups (1:N)
│   ├── qualifier_group_teams (1:N)
│   └── matches_new (1:N) [qualifier]
│
└── world_cup_groups (1:N)
    ├── world_cup_group_teams (1:N)
    └── matches_new (1:N) [world-cup-group]

matches_new (knockout)
└── winner_team_id → teams

team_tournament_skills
├── tournament_id → tournaments_new
└── team_id → teams
```

## 🔄 Próximos Pasos

Después de aplicar la migración exitosamente:

### 1. Implementar Servicios TypeScript
- Crear `src/services/normalizedTournamentService.ts`
- Implementar CRUD para las nuevas tablas
- Mantener compatibilidad con el servicio actual

### 2. Feature Flag
- Agregar variable de entorno para elegir qué schema usar
- Permitir cambio gradual sin breaking changes

### 3. Migrar Datos Existentes
- Script para migrar torneos desde `tournaments` (JSONB) a `tournaments_new`
- Convertir qualifiers JSONB a tablas relacionales
- Verificar integridad de datos

### 4. Testing
- Unit tests para nuevos servicios
- Integration tests
- Performance testing

### 5. Switch Gradual
- Activar feature flag en desarrollo
- Monitorear en staging
- Deploy a producción gradualmente

## ⚠️ Troubleshooting

### Error: "permission denied for table"
**Solución:** Verifica que estés usando las credenciales correctas en Supabase

### Error: "relation already exists"
**Solución:** Está bien, significa que ya aplicaste la migración antes. El script tiene `DROP TABLE IF EXISTS` para limpiar.

### Error: "could not serialize access"
**Solución:** Intenta ejecutar el script de nuevo. Esto puede pasar si hay queries concurrentes.

### No veo las nuevas tablas
**Solución:**
1. Refresca el navegador
2. Ve a `Table Editor` en el dashboard
3. Las tablas deberían aparecer con el ícono 🔒 (RLS enabled)

## 📝 Notas Importantes

1. **Las tablas nuevas tienen sufijo `_new`**
   - `tournaments_new` (no reemplaza `tournaments`)
   - `matches_new` (no reemplaza `match_history`)
   - Esto permite coexistencia con el sistema actual

2. **RLS está habilitado**
   - Todas las tablas tienen Row Level Security
   - Policies permiten acceso público (ajustar en producción)

3. **Triggers automáticos**
   - Los standings se actualizan automáticamente al simular partidos
   - No necesitas calcular points, won, drawn, etc. manualmente

4. **Foreign keys garantizan integridad**
   - No puedes crear matches con equipos que no existen
   - Cascade deletes están configurados

5. **Generated columns**
   - `goal_difference` se calcula automáticamente
   - No necesitas mantenerlo sincronizado

## 🎉 ¡Listo!

Una vez que veas "Migration completed successfully!", tu base de datos está lista para usar el schema normalizado.

El siguiente paso es implementar los servicios TypeScript para interactuar con estas nuevas tablas.
