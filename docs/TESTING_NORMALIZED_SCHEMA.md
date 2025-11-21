# Testing the Normalized Schema

Esta guía te ayudará a testear el schema normalizado antes de usarlo en producción.

## Pre-requisitos

1. ✅ Migración 002_normalized_schema aplicada exitosamente
2. ✅ Servicios TypeScript implementados
3. ✅ Store actualizado para usar adaptiveTournamentService
4. ✅ Feature flag configurado en .env

## Fase 1: Testing Manual Básico

### 1.1 Verificar que el Feature Flag Funciona

**Con JSONB (Schema Antiguo):**
```bash
# En .env
VITE_USE_NORMALIZED_SCHEMA=false
```

```bash
npm run dev
```

1. Abre la consola del navegador
2. Deberías ver: `"Using legacy JSONB service"`
3. Crea un torneo nuevo
4. Verifica que funciona normalmente

**Con Schema Normalizado:**
```bash
# En .env
VITE_USE_NORMALIZED_SCHEMA=true
```

```bash
npm run dev
```

1. Abre la consola del navegador
2. Deberías ver: `"Using normalized schema service"`
3. La aplicación debería funcionar igual

### 1.2 Crear Torneo Nuevo (Schema Normalizado)

Con `VITE_USE_NORMALIZED_SCHEMA=true`:

1. **Crear Torneo:**
   - Click en "New Tournament"
   - Ingresa año (ej: 2030)
   - Verifica que se crea correctamente

2. **Verificar en Supabase Dashboard:**
   - Ve a `tournaments_new` table
   - Deberías ver el nuevo torneo
   - Ve a `team_tournament_skills` table
   - Deberías ver 210 registros (uno por equipo)

### 1.3 Generar Draw y Fixtures

1. **Generar Draw:**
   - Click en "Generate Draw & Fixtures"
   - Espera a que termine

2. **Verificar en Supabase:**
   - `qualifier_groups`: Deberías ver ~84 grupos (42 por región x 5 regiones)
   - `qualifier_group_teams`: Deberías ver ~420 registros (5 equipos x 84 grupos)
   - `matches_new`: Deberías ver ~840 partidos (10 partidos x 84 grupos)

3. **Verificar en UI:**
   - Ve a "Qualifiers"
   - Selecciona una región
   - Deberías ver los grupos con fixtures generados

### 1.4 Simular Partidos

1. **Simular un partido:**
   - Ve a "Qualifiers"
   - Click en "Simulate" en un partido
   - Verifica que el resultado aparece

2. **Verificar Standings Automáticos:**
   - Ve a Supabase Dashboard
   - Abre `qualifier_group_teams` table
   - Los puntos, victorias, goles, etc. deberían actualizarse automáticamente
   - **Esto es gracias al trigger `trigger_update_group_standings_new`**

3. **Simular todos los partidos de un grupo:**
   - Click en "Simulate All" en un grupo
   - Verifica que todos los partidos se simulan
   - Verifica que la tabla de posiciones se actualiza correctamente

### 1.5 Avanzar al Mundial

1. **Completar todos los qualifiers:**
   - Simula todos los partidos de todas las regiones
   - Esto puede tomar unos minutos

2. **Avanzar al Mundial:**
   - Click en "Advance to World Cup"
   - Espera a que se genere el Mundial

3. **Verificar en Supabase:**
   - `world_cup_groups`: Deberías ver 16 grupos
   - `world_cup_group_teams`: Deberías ver 64 equipos (4 x 16 grupos)
   - `matches_new` (tipo `world-cup-group`): Deberías ver 96 partidos (6 x 16 grupos)

### 1.6 Fase de Grupos del Mundial

1. **Simular partidos del Mundial:**
   - Ve a "World Cup > Groups"
   - Simula partidos
   - Verifica que standings se actualizan automáticamente

2. **Verificar en Supabase:**
   - `world_cup_group_teams` debería mostrar puntos actualizados
   - Los `qualified` deberían ser true para los top 2

### 1.7 Fase Eliminatoria

1. **Avanzar a Knockout:**
   - Completa todos los partidos de grupos
   - Click en "Advance to Knockout"

2. **Verificar en Supabase:**
   - `matches_new` (tipo `world-cup-knockout`, round `round-of-32`): 32 partidos
   - Cada partido debería tener `knockout_position` correcto

3. **Simular knockout:**
   - Simula partidos de Round of 32
   - Verifica que Round of 16 se genera automáticamente
   - Continúa hasta la final

4. **Ver Campeón:**
   - Después de simular la final
   - Ve a `tournaments_new`
   - `champion_team_id`, `runner_up_team_id`, etc. deberían estar llenos
   - `status` debería ser `completed`

## Fase 2: Testing de Integridad de Datos

### 2.1 Verificar Foreign Keys

Ejecuta estos queries en Supabase SQL Editor:

```sql
-- Verificar que no hay equipos huérfanos en qualifier_group_teams
SELECT qgt.id, qgt.team_id
FROM qualifier_group_teams qgt
LEFT JOIN teams t ON qgt.team_id = t.id
WHERE t.id IS NULL;
-- Resultado esperado: 0 filas

-- Verificar que no hay partidos con equipos inválidos
SELECT m.id, m.home_team_id, m.away_team_id
FROM matches_new m
LEFT JOIN teams th ON m.home_team_id = th.id
LEFT JOIN teams ta ON m.away_team_id = ta.id
WHERE th.id IS NULL OR ta.id IS NULL;
-- Resultado esperado: 0 filas
```

### 2.2 Verificar Standings Consistency

```sql
-- Verificar que points = (won * 3) + drawn
SELECT id, team_id, points, won, drawn, (won * 3 + drawn) as calculated_points
FROM qualifier_group_teams
WHERE points != (won * 3 + drawn);
-- Resultado esperado: 0 filas

-- Verificar que played = won + drawn + lost
SELECT id, team_id, played, won, drawn, lost, (won + drawn + lost) as calculated_played
FROM qualifier_group_teams
WHERE played != (won + drawn + lost);
-- Resultado esperado: 0 filas

-- Verificar que goal_difference = goals_for - goals_against
SELECT id, team_id, goal_difference, goals_for, goals_against,
       (goals_for - goals_against) as calculated_diff
FROM qualifier_group_teams
WHERE goal_difference != (goals_for - goals_against);
-- Resultado esperado: 0 filas
```

### 2.3 Verificar Triggers

```sql
-- Verificar que el trigger existe
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'trigger_update_group_standings_new';
-- Resultado esperado: 1 fila

-- Test manual del trigger
-- 1. Encuentra un partido no jugado
SELECT id, home_team_id, away_team_id, qualifier_group_id
FROM matches_new
WHERE is_played = false AND match_type = 'qualifier'
LIMIT 1;

-- 2. Guarda los puntos actuales de los equipos
SELECT team_id, points FROM qualifier_group_teams
WHERE group_id = '[group_id_from_above]';

-- 3. Simula el partido
UPDATE matches_new
SET home_score = 3,
    away_score = 1,
    is_played = true
WHERE id = '[match_id_from_above]';

-- 4. Verifica que los puntos se actualizaron
SELECT team_id, points, played, won, goals_for
FROM qualifier_group_teams
WHERE group_id = '[group_id_from_above]';
-- El equipo local debería tener +3 puntos, +1 played, +1 won, +3 goals_for
-- El equipo visitante debería tener +1 played, +1 lost, +1 goals_against
```

## Fase 3: Testing de Performance

### 3.1 Comparar Tiempos de Carga

**JSONB:**
```bash
# .env
VITE_USE_NORMALIZED_SCHEMA=false
```

1. Abre DevTools > Network tab
2. Recarga la página
3. Anota el tiempo de carga de `tournaments` query

**Normalizado:**
```bash
# .env
VITE_USE_NORMALIZED_SCHEMA=true
```

1. Abre DevTools > Network tab
2. Recarga la página
3. Anota el tiempo de carga de todas las queries

**Resultado Esperado:**
- Para torneos pequeños: Similar o ligeramente más lento (más queries)
- Para torneos grandes: Más rápido (queries específicas en lugar de JSONB completo)

### 3.2 Testing con Múltiples Torneos

1. Crea 5 torneos diferentes
2. Completa cada uno hasta diferentes fases:
   - Torneo 1: Solo qualifiers
   - Torneo 2: Qualifiers completos
   - Torneo 3: Mundial grupos
   - Torneo 4: Mundial knockout
   - Torneo 5: Completado con campeón

3. Verifica que puedes cambiar entre torneos sin problemas
4. Verifica que cada torneo mantiene su estado correctamente

## Fase 4: Testing de Migración

### 4.1 Migrar Datos JSONB → Normalizado

1. **Preparación:**
   ```bash
   # Asegúrate de tener torneos en JSONB
   # .env
   VITE_USE_NORMALIZED_SCHEMA=false
   ```

2. **Crear torneo de prueba:**
   - Crea un torneo
   - Simula algunos partidos
   - Avanza al mundial si quieres

3. **Ejecutar migración:**
   ```bash
   npx tsx scripts/migrateTournamentsToNormalized.ts
   ```

4. **Verificar resultado:**
   - Revisa la consola para ver el resumen
   - Debería mostrar grupos, partidos migrados, etc.

5. **Activar schema normalizado:**
   ```bash
   # .env
   VITE_USE_NORMALIZED_SCHEMA=true
   ```

6. **Verificar en UI:**
   - Recarga la aplicación
   - El torneo migrado debería aparecer
   - Todos los partidos y resultados deberían estar presentes

### 4.2 Comparar Datos Pre y Post Migración

```sql
-- Cuenta de partidos en JSONB (manual, basado en metadata)
SELECT id, name,
       (metadata->'qualifiers')::text as qualifiers
FROM tournaments;

-- Cuenta de partidos en normalizado
SELECT t.id, t.name,
       COUNT(m.id) as match_count,
       COUNT(CASE WHEN m.is_played THEN 1 END) as played_count
FROM tournaments_new t
LEFT JOIN matches_new m ON m.tournament_id = t.id
GROUP BY t.id, t.name;
```

## Fase 5: Testing de Edge Cases

### 5.1 Eliminar Torneo

1. Crea un torneo
2. Genera draw y fixtures
3. Elimina el torneo
4. Verifica en Supabase:
   - `tournaments_new`: Torneo eliminado
   - `qualifier_groups`: Grupos eliminados (CASCADE)
   - `qualifier_group_teams`: Equipos eliminados (CASCADE)
   - `matches_new`: Partidos eliminados (CASCADE)

### 5.2 Reset Tournament Matches

1. Crea un torneo
2. Genera draw y simula algunos partidos
3. Click en "Reset Matches"
4. Verifica:
   - Partidos se resetean
   - Standings vuelven a 0
   - Draw se puede volver a generar

### 5.3 Cambiar Región de Equipo

1. Ve a TeamEditor
2. Cambia la región de un equipo
3. Verifica que:
   - El equipo desaparece de los grupos de la región anterior
   - Los grupos se reorganizan correctamente

## Checklist Final

Antes de usar en producción, verifica:

- [ ] ✅ Todos los partidos se simulan correctamente
- [ ] ✅ Standings se actualizan automáticamente
- [ ] ✅ Equipos clasifican correctamente al Mundial
- [ ] ✅ Fase de grupos del Mundial funciona
- [ ] ✅ Fase eliminatoria funciona hasta el campeón
- [ ] ✅ Migración de datos JSONB funciona
- [ ] ✅ Feature flag permite cambiar entre schemas
- [ ] ✅ No hay errores en la consola
- [ ] ✅ Performance es aceptable
- [ ] ✅ Foreign keys previenen datos inválidos
- [ ] ✅ Triggers actualizan standings correctamente
- [ ] ✅ Múltiples torneos funcionan simultáneamente
- [ ] ✅ Eliminar torneo limpia todo (CASCADE)

## Troubleshooting

### Los standings no se actualizan

**Problema:** Simulas un partido pero los standings no cambian.

**Solución:**
1. Verifica que el trigger existe:
   ```sql
   SELECT * FROM information_schema.triggers
   WHERE trigger_name = 'trigger_update_group_standings_new';
   ```

2. Si no existe, re-aplica la migración 002_normalized_schema.sql

### Foreign key constraint errors

**Problema:** Error al crear partidos o equipos en grupos.

**Solución:**
1. Verifica que el equipo existe en `teams` table
2. Verifica que el grupo existe en `qualifier_groups` o `world_cup_groups`
3. Verifica que el torneo existe en `tournaments_new`

### Performance Issues

**Problema:** La aplicación se siente lenta.

**Solución:**
1. Verifica que los índices existen:
   ```sql
   SELECT tablename, indexname FROM pg_indexes
   WHERE schemaname = 'public'
   AND tablename IN ('qualifier_groups', 'matches_new', 'qualifier_group_teams');
   ```

2. Si faltan índices, re-aplica la migración

### Data inconsistencies after migration

**Problema:** Los datos migrados no coinciden con los originales.

**Solución:**
1. Ejecuta los queries de integridad (Fase 2.2)
2. Compara conteos:
   ```sql
   -- Partidos en JSONB vs Normalizado
   -- Deberían ser iguales
   ```

3. Si hay discrepancias, elimina datos normalizados y re-ejecuta migración

## Soporte

Si encuentras problemas:

1. Revisa los logs de la consola
2. Revisa los logs de Supabase (Database > Logs)
3. Verifica que la migración se aplicó correctamente
4. Asegúrate de que el feature flag está configurado correctamente
