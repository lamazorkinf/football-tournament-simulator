# Configuración de Supabase para Football Tournament Simulator

## 🎯 Características con Supabase

Con Supabase integrado, la aplicación ahora incluye:

- ✅ **CRUD Completo de Equipos**: Crear, leer, actualizar y eliminar equipos en la base de datos
- ✅ **Historial Persistente de Partidos**: Todos los partidos se guardan con detalles completos
- ✅ **Múltiples Torneos**: Soporte para torneos continuos (un mundial tras otro)
- ✅ **Estadísticas Avanzadas**: Consultas SQL optimizadas para análisis
- ✅ **Actualizaciones en Tiempo Real**: Cambios reflejados instantáneamente en todos los clientes
- ✅ **Backup en la Nube**: Datos seguros y accesibles desde cualquier lugar

## 📋 Requisitos Previos

- Cuenta en [Supabase](https://supabase.com) (gratis)
- Node.js instalado
- Proyecto de Football Tournament ya clonado

## 🚀 Guía de Configuración Paso a Paso

### Paso 1: Crear Proyecto en Supabase

1. Ve a https://supabase.com y crea una cuenta (si no tienes una)
2. Haz clic en "New Project"
3. Rellena los datos:
   - **Name**: football-tournament (o el nombre que prefieras)
   - **Database Password**: Genera una contraseña segura (guárdala en un lugar seguro)
   - **Region**: Selecciona la región más cercana a ti
4. Haz clic en "Create new project"
5. Espera 1-2 minutos mientras se crea el proyecto

### Paso 2: Ejecutar el Schema SQL

1. En el panel de Supabase, ve a **SQL Editor** (icono en el menú lateral)
2. Haz clic en "New query"
3. Copia TODO el contenido del archivo `supabase/schema.sql` de este proyecto
4. Pégalo en el editor SQL
5. Haz clic en "Run" (o presiona Ctrl+Enter)
6. Deberías ver un mensaje de éxito

**¿Qué crea este script?**
- Tabla `teams`: Almacena todos los equipos con sus atributos
- Tabla `match_history`: Historial completo de partidos jugados
- Tabla `tournaments`: Metadatos de torneos para soporte multi-torneo
- Vista `team_statistics`: Estadísticas pre-calculadas de equipos
- Función `get_team_recent_matches`: Consulta optimizada para historial
- Índices y triggers para performance

### Paso 3: Obtener Credenciales

1. En el panel de Supabase, ve a **Settings** → **API**
2. Busca la sección "Project API keys"
3. Copia los siguientes valores:
   - **Project URL**: Algo como `https://xxxxx.supabase.co`
   - **anon/public key**: Una clave larga que empieza con `eyJ...`

### Paso 4: Configurar Variables de Entorno

1. En la raíz del proyecto, copia el archivo de ejemplo:
   ```bash
   cp .env.example .env.local
   ```

2. Abre `.env.local` y reemplaza con tus credenciales:
   ```env
   VITE_SUPABASE_URL=https://tu-proyecto-id.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-clave-anon-aqui
   ```

3. **Importante**: Asegúrate de que `.env.local` esté en tu `.gitignore` (ya está por defecto)

### Paso 5: Insertar Datos Iniciales (Opcional pero Recomendado)

Para empezar con los 212 equipos pre-cargados:

1. En el SQL Editor de Supabase, ejecuta el siguiente script:

```sql
-- Este script inserta todos los equipos iniciales
-- Los datos están en src/data/teams.json

-- Ejemplo de cómo insertar un equipo:
INSERT INTO teams (id, name, flag, region, skill)
VALUES ('ger', 'Germany', '🇩🇪', 'Europe', 85);

-- NOTA: Para insertar todos los equipos, puedes:
-- 1. Usar la interfaz de Teams en la app y crear equipos manualmente
-- 2. O crear un script de migración desde teams.json
```

**Opción Automática**: La aplicación puede crear equipos automáticamente la primera vez que se ejecuta. Solo necesitas activar esta función en el código si lo deseas.

### Paso 6: Reiniciar el Servidor de Desarrollo

```bash
npm run dev
```

La aplicación detectará automáticamente las credenciales y se conectará a Supabase.

## 🔍 Verificar que Funciona

1. Abre la aplicación en http://localhost:5173
2. Ve a la pestaña "**History**"
3. Si ves un mensaje de "Supabase No Configurado", revisa tus credenciales
4. Si ves "No hay partidos registrados aún", ¡está funcionando correctamente!
5. Simula algunos partidos y verifica que aparezcan en el historial

## 📊 Estructura de Base de Datos

### Tabla: `teams`
```sql
- id (TEXT, PK): Código único del equipo (ej: "ger", "bra")
- name (TEXT): Nombre completo del equipo
- flag (TEXT): Emoji de la bandera
- region (TEXT): Continente (Europe, South America, etc.)
- skill (INTEGER): Rating del equipo (30-100)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### Tabla: `match_history`
```sql
- id (UUID, PK): ID único del partido
- home_team_id (TEXT, FK)
- away_team_id (TEXT, FK)
- home_score (INTEGER)
- away_score (INTEGER)
- stage (TEXT): qualifier, world-cup-group, world-cup-knockout
- group_name (TEXT): Nombre del grupo (ej: "Group A")
- region (TEXT): Región de la eliminatoria
- tournament_id (TEXT, FK): ID del torneo
- home_skill_before (INTEGER)
- away_skill_before (INTEGER)
- home_skill_after (INTEGER)
- away_skill_after (INTEGER)
- home_skill_change (INTEGER)
- away_skill_change (INTEGER)
- played_at (TIMESTAMP)
- metadata (JSONB): Datos adicionales (penales, etc.)
```

### Tabla: `tournaments`
```sql
- id (TEXT, PK): ID único del torneo
- name (TEXT): Nombre del torneo (ej: "World Cup 2026")
- status (TEXT): qualifiers, world-cup, completed
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
- metadata (JSONB): Configuración del torneo
```

## 🔐 Seguridad

### Row Level Security (RLS)

Por defecto, las políticas están configuradas para acceso público (ideal para desarrollo). En producción, deberías:

1. Implementar autenticación de usuarios
2. Modificar las políticas RLS en Supabase:

```sql
-- Ejemplo: Solo usuarios autenticados pueden modificar equipos
DROP POLICY IF EXISTS "Enable update access for all users" ON teams;

CREATE POLICY "Enable update for authenticated users only" ON teams
  FOR UPDATE USING (auth.role() = 'authenticated');
```

## 🔄 Flujo de Datos

### Cuando se Simula un Partido:

1. **Frontend** → Llama a `simulateMatch()` en el store
2. **Store** → Ejecuta el motor de simulación
3. **Store** → Actualiza estado local (Zustand + LocalStorage)
4. **Store** → Llama a `matchHistoryService.createMatch()` (async)
5. **Supabase** → Inserta registro en `match_history`
6. **Store** → Llama a `teamsService.batchUpdateTeams()` (async)
7. **Supabase** → Actualiza skills en tabla `teams`
8. **Real-time** → Notifica a otros clientes conectados (si hay)
9. **Frontend** → Actualiza UI con nuevos datos

### Persistencia Dual:

- **LocalStorage**: Para acceso rápido sin internet
- **Supabase**: Para persistencia permanente y multi-dispositivo

## 📱 Características de Real-time

La aplicación se suscribe a cambios en tiempo real:

```typescript
// Los cambios en teams se reflejan automáticamente
teamsService.subscribeToTeams((newTeams) => {
  // Actualiza UI
});

// Nuevos partidos aparecen instantáneamente
matchHistoryService.subscribeToMatches((newMatches) => {
  // Actualiza historial
});
```

## 🚨 Solución de Problemas

### Error: "Supabase not configured"

**Causa**: Credenciales no encontradas o incorrectas

**Solución**:
1. Verifica que `.env.local` existe
2. Comprueba que las credenciales son correctas
3. Reinicia el servidor de desarrollo

### Error: "Failed to fetch"

**Causa**: Problemas de conectividad o CORS

**Solución**:
1. Verifica tu conexión a internet
2. Comprueba que la URL de Supabase es correcta
3. Verifica que el proyecto de Supabase está activo

### Los partidos no se guardan

**Causa**: Permisos RLS o tabla no creada

**Solución**:
1. Verifica que ejecutaste el schema SQL completo
2. Revisa las políticas RLS en Supabase
3. Comprueba los logs del navegador (F12 → Console)

### Error de tipos TypeScript

**Causa**: Tipos de database no actualizados

**Solución**:
1. El archivo `src/types/database.ts` debe coincidir con tu schema
2. Si modificaste el schema, regenera los tipos

## 📈 Consultas Útiles

### Ver todos los partidos:
```sql
SELECT * FROM match_history
ORDER BY played_at DESC
LIMIT 50;
```

### Estadísticas de un equipo:
```sql
SELECT * FROM team_statistics
WHERE id = 'bra';
```

### Partidos recientes de un equipo:
```sql
SELECT * FROM get_team_recent_matches('ger', 10);
```

### Goles totales por región:
```sql
SELECT
  region,
  SUM(home_score + away_score) as total_goals,
  COUNT(*) as total_matches,
  AVG(home_score + away_score) as avg_goals_per_match
FROM match_history
WHERE region IS NOT NULL
GROUP BY region
ORDER BY total_goals DESC;
```

## 🎯 Próximos Pasos

Con Supabase configurado, ahora puedes:

1. **Torneos Múltiples**: Crear un nuevo torneo cuando termine uno
2. **Historial Global**: Ver todos los mundiales históricos
3. **Comparar Equipos**: Analizar rendimiento a través del tiempo
4. **Leaderboards**: Rankings basados en todos los torneos
5. **Sincronización Multi-dispositivo**: Jugar desde diferentes navegadores

## 📚 Recursos Adicionales

- [Documentación de Supabase](https://supabase.com/docs)
- [SQL Editor Guide](https://supabase.com/docs/guides/database/sql-editor)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Realtime](https://supabase.com/docs/guides/realtime)

## 💡 Tips de Optimización

1. **Índices**: Ya incluidos en el schema para queries rápidas
2. **Paginación**: Usa `limit` y `offset` para grandes datasets
3. **Caché**: LocalStorage actúa como caché local
4. **Batch Updates**: Actualiza múltiples equipos a la vez

¡Listo! Tu Football Tournament Simulator ahora tiene una base de datos en la nube completa y profesional. 🚀⚽
