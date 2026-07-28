# Football Tournament Simulator - Características Completas

## 🎯 Descripción General
Simulador completo de torneos de fútbol con eliminatorias regionales y Copa del Mundo. La aplicación permite gestionar equipos, simular partidos y seguir todo el progreso del torneo.

## 🚀 Características Implementadas

### 1. Sistema de Eliminatorias Regionales
- ✅ 6 regiones continentales (Europa, Sudamérica, Norteamérica, África, Asia, Oceanía)
- ✅ Grupos de 5 equipos con formato round-robin
- ✅ Cada equipo juega contra todos dos veces (local y visitante)
- ✅ Total de 20 partidos por grupo
- ✅ Clasifican los 2 mejores equipos de cada grupo

### 2. Motor de Simulación
**Ubicación**: `src/core/engine.ts`

Características:
- ✅ Simulación basada en habilidad de equipos (0-100)
- ✅ Ventaja de local (+3 puntos de habilidad)
- ✅ Distribución tipo Poisson para generar goles
- ✅ Sistema ELO para actualización dinámica de habilidades
- ✅ Soporte para penales (para fase eliminatoria)

### 2b. Oferta de simulación
**Ubicación**: `src/components/ui/SimActions.tsx`

Cuatro acciones, las mismas en todos los modos y en todas las vistas —y nada más:

| Acción | Alcance |
| --- | --- |
| **Jugar** | Simula un partido y muestra el resultado |
| **Ver en vivo** | Simula un partido y lo reproduce minuto a minuto |
| **Simular jornada** | Simula la jornada en curso entera |
| **Jornada en vivo** | Simula la jornada y la reproduce en la grilla en vivo |

Una jornada es la fecha en curso de una liga o fase de grupos; en un cuadro de
eliminación, todos los partidos de la ronda con el mismo número de partido.
**Los cruces a ida y vuelta se juegan partido a partido**: la ida y la vuelta
son dos jornadas distintas, y la vuelta —la que define el cruce con prórroga y
penales si el global queda empatado— sólo se habilita con la ida jugada.

### 3. Programador de Partidos
**Ubicación**: `src/core/scheduler.ts`

Funciones:
- ✅ Generación automática de partidos round-robin
- ✅ Generación de grupos de Copa del Mundo (4 equipos)
- ✅ Cálculo y actualización de tablas de posiciones
- ✅ Ordenamiento por puntos, diferencia de goles y goles a favor

### 4. Gestión de Equipos
**Ubicación**: `src/components/tournament/TeamEditor.tsx`

Características:
- ✅ Editor completo de 212 equipos
- ✅ Búsqueda y filtrado por nombre o región
- ✅ Edición de habilidad (skill rating 30-100)
- ✅ Cambio de región de equipos
- ✅ Regeneración automática de grupos al cambiar región
- ✅ Indicadores visuales de habilidad

### 5. Copa del Mundo
**Ubicación**: `src/components/tournament/WorldCupView.tsx`

Características:
- ✅ Botón de avance automático desde eliminatorias
- ✅ Validación de que todos los partidos estén completos
- ✅ 8 grupos de 4 equipos (32 equipos total)
- ✅ Distribución aleatoria de equipos clasificados
- ✅ Sistema de partidos de grupo (6 partidos por grupo)
- ✅ Tablas de posiciones en tiempo real
- ✅ Vista detallada de cada grupo

### 6. Dashboard de Estadísticas
**Ubicación**: `src/components/tournament/StatsDashboard.tsx`

Métricas:
- ✅ Total de partidos jugados vs. totales
- ✅ Porcentaje de progreso del torneo
- ✅ Top 5 equipos goleadores
- ✅ Top 5 equipos por promedio de goles
- ✅ Estadísticas por región:
  - Total de goles
  - Promedio de goles por partido
  - Partidos jugados
- ✅ Indicadores visuales con iconos

### 7. Exportar/Importar Datos
**Ubicación**: `src/components/tournament/ExportImport.tsx`

Funcionalidades:
- ✅ Exportar torneo completo (equipos + partidos + resultados)
- ✅ Exportar solo datos de equipos
- ✅ Importar torneo guardado
- ✅ Validación de formato de archivo
- ✅ Manejo de errores con mensajes claros
- ✅ Archivos JSON con timestamp
- ✅ Respaldo automático en LocalStorage

### 8. Persistencia de Datos
**Ubicación**: `src/store/useTournamentStore.ts`

Características:
- ✅ Zustand para gestión de estado
- ✅ Middleware de persistencia en LocalStorage
- ✅ Auto-guardado en cada cambio
- ✅ Recuperación automática al recargar página
- ✅ Versionado de datos (v1)

### 9. Interfaz de Usuario

#### Navegación por Pestañas
- ✅ **Qualifiers**: Vista de eliminatorias regionales
- ✅ **World Cup**: Vista de grupos de Copa del Mundo (solo si está activa)
- ✅ **Statistics**: Dashboard con métricas del torneo
- ✅ **Teams**: Editor de equipos
- ✅ **Data**: Exportar/Importar datos

#### Componentes UI Reutilizables
**Ubicación**: `src/components/ui/`

- ✅ `Card`: Contenedor con header y content
- ✅ `Button`: 5 variantes (primary, secondary, outline, ghost, danger)
- ✅ `StandingsTable`: Tabla completa de posiciones
  - Resalta equipos clasificados
  - Diferencia de goles con colores
  - Responsiva para móvil

#### Temas y Diseño
- ✅ Tema verde personalizado con Tailwind CSS v4
- ✅ Diseño responsivo (mobile-first)
- ✅ Uso de emojis de banderas
- ✅ Animaciones y transiciones suaves
- ✅ Alto contraste para accesibilidad

### 10. Vista de Grupo Detallada
**Ubicación**: `src/components/tournament/GroupView.tsx`

Características:
- ✅ Tabla de posiciones actualizada en tiempo real
- ✅ Lista completa de partidos
- ✅ Las cuatro acciones de simulación del juego (ver §"Oferta de simulación")
- ✅ Indicador de progreso (X/Y partidos jugados)
- ✅ Navegación fácil de regreso

### 11. Vista Regional
**Ubicación**: `src/components/tournament/RegionView.tsx`

Características:
- ✅ Tarjetas por cada grupo de la región
- ✅ Indicador visual de progreso
- ✅ Contador de partidos jugados
- ✅ Diseño en grid responsivo
- ✅ Iconos regionales personalizados

## 📊 Datos Incluidos

### Equipos Seeded
- ✅ 212 países/territorios
- ✅ Distribución por regiones:
  - Europa: 55 equipos
  - África: 54 equipos
  - Asia: 47 equipos
  - Norteamérica: 20 equipos
  - Sudamérica: 10 equipos
  - Oceanía: 12 equipos
- ✅ Ratings realistas basados en ranking FIFA aproximado
- ✅ Banderas emoji para cada equipo

## 🎮 Flujo del Usuario

### 1. Inicio
1. App se inicializa con torneo automáticamente
2. Se generan grupos de 5 equipos por región
3. Se crean 20 partidos por grupo (round-robin doble)

### 2. Fase de Eliminatorias
1. Usuario navega por regiones
2. Hace clic en un grupo para ver detalles
3. Simula partidos sueltos o la jornada entera, con o sin reproducción en vivo
4. Puede editar equipos en cualquier momento
5. Visualiza estadísticas en tiempo real

### 3. Avance a Copa del Mundo
1. Botón "Advance to World Cup" aparece cuando está disponible
2. Sistema valida que todos los partidos estén completos
3. Selecciona top 2 de cada grupo (clasificados)
4. Genera 8 grupos de 4 equipos aleatoriamente
5. Crea 6 partidos por grupo (round-robin simple)

### 4. Copa del Mundo
1. Usuario navega a pestaña "World Cup"
2. Ve los 8 grupos con equipos clasificados
3. Simula partidos de cada grupo
4. Puede exportar progreso en cualquier momento

### 5. Gestión de Datos
1. Exportar torneo completo o solo equipos
2. Importar torneos guardados
3. Todo se guarda automáticamente en LocalStorage

## 🛠️ Tecnologías Utilizadas

- **React 19**: UI Library
- **TypeScript**: Type safety
- **Vite**: Build tool y dev server
- **Tailwind CSS v4**: Styling framework
- **Zustand**: State management
- **LocalStorage**: Data persistence
- **Lucide React**: Icon library
- **nanoid**: ID generation

## 📁 Estructura del Proyecto

```
src/
├── components/
│   ├── ui/                    # Componentes reutilizables
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   └── StandingsTable.tsx
│   └── tournament/            # Componentes del torneo
│       ├── RegionView.tsx
│       ├── GroupView.tsx
│       ├── WorldCupView.tsx
│       ├── TeamEditor.tsx
│       ├── StatsDashboard.tsx
│       └── ExportImport.tsx
├── core/                      # Lógica de negocio
│   ├── engine.ts             # Motor de simulación
│   └── scheduler.ts          # Programador de partidos
├── store/                     # Estado global
│   └── useTournamentStore.ts
├── types/                     # TypeScript types
│   └── index.ts
├── data/                      # Datos estáticos
│   └── teams.json            # 212 equipos
├── lib/                       # Utilidades
│   └── utils.ts
└── App.tsx                    # Componente principal
```

## 🎨 Tema de Colores (Verde)

```css
primary-50:  #f0fdf4
primary-100: #dcfce7
primary-200: #bbf7d0
primary-300: #86efac
primary-400: #4ade80
primary-500: #22c55e
primary-600: #16a34a  /* Principal */
primary-700: #15803d
primary-800: #166534
primary-900: #14532d
primary-950: #052e16
```

## 🔄 Próximas Mejoras Sugeridas

1. **Fase Eliminatoria de Copa del Mundo**
   - Round of 16
   - Cuartos de final
   - Semifinales
   - Tercer lugar
   - Final
   - Sistema de penales

2. **Estadísticas Avanzadas**
   - Goleadores individuales (simulados)
   - Racha de victorias/derrotas
   - Equipos más ofensivos/defensivos
   - Gráficos de rendimiento

3. **Configuración de Torneo**
   - Ajustar número de equipos clasificados
   - Cambiar formato de grupos
   - Configurar factor de ventaja local
   - Ajustar K-factor del sistema ELO

4. **Mejoras de UX**
   - Animaciones de resultados
   - Notificaciones de eventos importantes
   - Modo oscuro
   - Múltiples idiomas

5. **Tests Automatizados**
   - Tests unitarios para engine
   - Tests de integración para scheduler
   - Tests E2E para flujos principales

## 📝 Notas Técnicas

### Simulación de Partidos
El motor de simulación usa un enfoque basado en habilidad:
- Habilidad base de cada equipo (30-100)
- Ventaja local de +3 puntos
- Generación de goles usando distribución Poisson
- Actualización dinámica de habilidad post-partido (ELO)

### Persistencia
Los datos se guardan automáticamente en LocalStorage:
- Clave: `football-tournament-storage`
- Formato: JSON con versionado
- Se actualiza en cada acción del usuario

### Responsividad
Breakpoints de Tailwind:
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px

## 🚀 Comandos

```bash
# Desarrollo
npm run dev

# Construcción
npm run build

# Preview de producción
npm run preview

# Linting
npm run lint
```

## 📄 Licencia
Este proyecto es de código abierto y está disponible bajo la licencia MIT.
