# Database Migration Strategy: JSONB → Normalized Schema

## Situación Actual

Actualmente estamos usando un campo JSONB en la tabla `tournaments` que almacena toda la estructura de qualifiers y world cup:

```sql
CREATE TABLE tournaments (
  id UUID PRIMARY KEY,
  name TEXT,
  status TEXT,
  metadata JSONB  -- ⚠️ Aquí está TODO: qualifiers, worldCup, etc.
);
```

## Problemas con el Enfoque Actual

### 1. **Performance Issues**
- ❌ Queries lentas para filtrar/buscar dentro del JSONB
- ❌ No se pueden indexar campos específicos dentro del JSONB eficientemente
- ❌ Cada query requiere parsear y deserializar todo el JSONB

### 2. **Integridad de Datos**
- ❌ Sin foreign keys, puedes tener IDs de equipos inválidos
- ❌ Sin constraints, datos pueden estar en estados inconsistentes
- ❌ Difícil garantizar reglas de negocio a nivel de base de datos

### 3. **Escalabilidad**
- ❌ Tamaño del JSONB crece rápidamente (puede llegar a MB por torneo)
- ❌ Imposible hacer queries complejas eficientemente
- ❌ Difícil implementar features avanzados (estadísticas, análisis)

### 4. **Mantenimiento**
- ❌ Cambios de schema requieren migración manual de todos los JSONBs
- ❌ Difícil debuggear datos corruptos
- ❌ Queries complejas son ilegibles

## Solución Propuesta: Schema Normalizado

### Estructura de Tablas

```
tournaments (1) ─┬─→ (N) qualifier_groups ─┬─→ (N) qualifier_group_teams
                 │                          └─→ (N) matches
                 │
                 ├─→ (N) world_cup_groups ─┬─→ (N) world_cup_group_teams
                 │                         └─→ (N) matches
                 │
                 └─→ (N) team_tournament_skills

teams (1) ───→ (N) qualifier_group_teams
          ───→ (N) world_cup_group_teams
          ───→ (N) matches (home/away)
```

### Ventajas del Schema Normalizado

#### ✅ Performance
```sql
-- Query rápida con índices
SELECT * FROM qualifier_standings
WHERE tournament_id = 'xxx' AND region = 'Europe'
ORDER BY position;

-- vs JSONB (sin índices eficientes):
SELECT metadata->'qualifiers'->'Europe'
FROM tournaments WHERE id = 'xxx';
```

#### ✅ Integridad
```sql
-- Foreign keys garantizan integridad
team_id UUID REFERENCES teams(id) ON DELETE CASCADE

-- Constraints validan datos
CHECK (home_team_id != away_team_id)
CHECK (points >= 0)
```

#### ✅ Queries Complejas
```sql
-- H2H entre dos equipos (imposible eficientemente con JSONB)
SELECT * FROM match_history
WHERE (home_team_id = 'team1' AND away_team_id = 'team2')
   OR (home_team_id = 'team2' AND away_team_id = 'team1')
ORDER BY played_at DESC;

-- Top scorers en un torneo
SELECT t.name, SUM(CASE
  WHEN m.home_team_id = t.id THEN m.home_score
  WHEN m.away_team_id = t.id THEN m.away_score
END) as total_goals
FROM teams t
JOIN matches m ON t.id IN (m.home_team_id, m.away_team_id)
WHERE m.tournament_id = 'xxx' AND m.is_played = true
GROUP BY t.id, t.name
ORDER BY total_goals DESC;
```

#### ✅ Escalabilidad
- Cada tabla puede tener millones de registros
- Índices específicos para cada tipo de query
- Partitioning por torneo si es necesario
- Archiving de torneos antiguos

## Estrategia de Migración

### Fase 1: Preparación (No Breaking Changes)
1. ✅ Crear el nuevo schema en paralelo
2. ✅ Implementar servicios TypeScript para ambos schemas
3. ✅ Agregar feature flag para elegir qué schema usar

### Fase 2: Escritura Dual (Write to Both)
1. Al crear/actualizar torneos, escribir en AMBOS schemas
2. Leer desde el schema antiguo (JSONB)
3. Validar que ambos tengan los mismos datos

### Fase 3: Migración de Datos Existentes
```typescript
// Script de migración
async function migrateExistingTournaments() {
  const oldTournaments = await supabase
    .from('tournaments')
    .select('*');

  for (const old of oldTournaments) {
    const metadata = old.metadata as any;

    // Migrar qualifier groups
    for (const [region, groups] of Object.entries(metadata.qualifiers)) {
      for (const group of groups) {
        // Insertar grupo
        const { data: newGroup } = await supabase
          .from('qualifier_groups')
          .insert({
            tournament_id: old.id,
            region,
            name: group.name,
            num_qualify: group.numQualify
          })
          .select()
          .single();

        // Insertar equipos del grupo
        for (const team of group.teams) {
          await supabase.from('qualifier_group_teams').insert({
            group_id: newGroup.id,
            team_id: team.id,
            points: team.points,
            // ... otras estadísticas
          });
        }

        // Insertar partidos
        for (const match of group.matches) {
          await supabase.from('matches').insert({
            tournament_id: old.id,
            match_type: 'qualifier',
            qualifier_group_id: newGroup.id,
            home_team_id: match.homeTeamId,
            away_team_id: match.awayTeamId,
            home_score: match.homeScore,
            away_score: match.awayScore,
            is_played: match.isPlayed
          });
        }
      }
    }

    // Similar para worldCup...
  }
}
```

### Fase 4: Cambio de Lectura
1. Cambiar feature flag para leer desde nuevo schema
2. Monitorear performance y errores
3. Rollback si es necesario

### Fase 5: Cleanup
1. Deprecar código que usa JSONB
2. Remover escritura dual
3. Eliminar campo metadata de tournaments
4. Celebrar 🎉

## Implementación por Pasos

### Paso 1: Aplicar el Schema (HOY)
```bash
# Aplicar el nuevo schema
psql -U postgres -d football -f docs/database-schema-normalized.sql
```

### Paso 2: Crear Servicios TypeScript (DÍA 1-2)
```typescript
// src/services/normalizedTournamentService.ts
export const normalizedTournamentService = {
  async createTournament(year: number): Promise<Tournament> { ... },
  async loadTournament(id: string): Promise<Tournament> { ... },
  async simulateMatch(matchId: string): Promise<void> { ... },
  // ...
};
```

### Paso 3: Feature Flag (DÍA 2)
```typescript
// src/config/features.ts
export const useNormalizedSchema =
  import.meta.env.VITE_USE_NORMALIZED_SCHEMA === 'true';

// En useTournamentStore
const service = useNormalizedSchema
  ? normalizedTournamentService
  : tournamentService;
```

### Paso 4: Testing Exhaustivo (DÍA 3-4)
- Unit tests para servicios
- Integration tests
- Performance testing con datos grandes
- Migración de datos de prueba

### Paso 5: Deploy Gradual (DÍA 5+)
- Deploy con feature flag OFF
- Migrar datos existentes
- Activar feature flag gradualmente
- Monitorear

## Estimación de Impacto

### Performance Esperado

| Operación | JSONB | Normalizado | Mejora |
|-----------|-------|-------------|--------|
| Cargar standings de 1 grupo | 50ms | 5ms | 10x |
| Buscar match por equipos | 200ms | 10ms | 20x |
| Actualizar resultado partido | 100ms | 15ms | 6.7x |
| Cargar historial completo | 500ms | 30ms | 16.7x |

### Tamaño de Base de Datos

| Modelo | 1 Torneo | 10 Torneos | 100 Torneos |
|--------|----------|------------|-------------|
| JSONB | 2-5 MB | 20-50 MB | 200-500 MB |
| Normalizado | 1-2 MB | 10-20 MB | 100-200 MB |

### Complejidad de Queries

| Query Type | JSONB | Normalizado |
|------------|-------|-------------|
| Simple select | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Filtered select | ⭐ | ⭐⭐⭐⭐⭐ |
| Aggregations | ⭐ | ⭐⭐⭐⭐⭐ |
| Joins | ❌ | ⭐⭐⭐⭐⭐ |

## Recomendación

**SÍ, definitivamente deberías migrar al schema normalizado.**

### Cuándo Hacer la Migración

**Opción A: Ahora (Recomendado)**
- Aún es temprano en el proyecto
- No hay muchos usuarios/datos
- Más fácil de implementar

**Opción B: Después**
- Si tienes deadlines urgentes
- Pero será más difícil después
- Acumulará deuda técnica

### Timeline Sugerido

```
Semana 1:
  - Aplicar nuevo schema
  - Implementar servicios básicos
  - Feature flag setup

Semana 2:
  - Completar todos los servicios
  - Testing exhaustivo
  - Script de migración

Semana 3:
  - Migrar datos existentes
  - Deploy con feature flag OFF
  - Testing en producción

Semana 4:
  - Activar feature flag gradualmente
  - Monitoreo intensivo
  - Cleanup código viejo
```

## Conclusión

El schema normalizado es la solución correcta para una aplicación de producción. Aunque requiere trabajo inicial, los beneficios a largo plazo son enormes:

✅ Mejor performance
✅ Mayor integridad de datos
✅ Más fácil de mantener
✅ Más fácil de escalar
✅ Mejor developer experience

La inversión de tiempo ahora te ahorrará muchísimo tiempo (y dolores de cabeza) en el futuro.
