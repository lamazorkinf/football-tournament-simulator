# Ciclo de 4 años: Torneos Continentales, Copa Confederaciones y Calendario por jornadas

**Fecha:** 2026-07-21
**Rama sugerida:** `feat/ciclo-continental-confederaciones`
**Estado:** Diseño aprobado en brainstorming; pendiente de review del usuario antes del plan de implementación.

---

## 1. Objetivo

Convertir la app de "un torneo = un Mundial" a un **Ciclo de 4 años** que encadena, en orden, tres competiciones nuevas/existentes:

1. **Torneos Continentales** (uno por confederación) — eliminación directa con bracket.
2. **Copa Confederaciones** — torneo intercontinental con los finalistas continentales.
3. **Mundial** (clasificatorias → grupos → eliminación) — lo que ya existe.

Y, transversal a todo, **resolver el calendario**: hoy el usuario puede jugar los partidos en cualquier orden (terminar un grupo entero antes de tocar otro). A partir de este cambio, todo se juega **por jornada global**, en orden, sin cherry-picking.

## 2. Decisiones tomadas (brainstorming)

| Tema | Decisión |
|---|---|
| Contenedor | **Ciclo de 4 años** como entidad tope. |
| Encarnación del modelo | **Extender el `Tournament` actual → `Cycle`** (agregar campos, no reescribir). |
| Secuencia | **Fases fijas en orden:** Continental → Confederaciones → Clasificatorias Mundial → Mundial (grupos + knockout). Los "años" son etiquetas cosméticas. |
| Enforcement | **Jornada global estricta.** No se habilita la jornada N+1 hasta completar toda la N. En brackets, jornada = ronda. |
| Siembra continental | **Bombos por skill + sorteo** (con animación), byes a los cabezas de serie, cabezas separados en el bracket. |
| Render de brackets | **Reutilizar el sistema propio** (`KnockoutBracket` / `BracketLine` / `KnockoutView`), extendido a R64. |
| Formato de cruces continentales | **Partido único, sede neutral** (sin ventaja de local), penales si hay empate. |
| Copa Confederaciones | 2 grupos de 4 (round-robin, 3 fechas) → 2 mejores de cada grupo → **semis (1ºA-2ºB / 1ºB-2ºA) → Final + 3er puesto**. |
| Backward compat | **No hay.** Se borran torneos/datos viejos; `Cycle` se crea desde cero. |
| UI hub | **Extender el Match Center** como centro del calendario de la fase activa. |
| Peso Elo por torneo | **Multiplicador de importancia por competición + ronda**, intensidad moderada (spread ~2.1×). Configurable en EngineSettings. |

## 3. Confederaciones y matemática del bracket

Confederaciones = `Region`: **Europa (55), Asia (55), África (55), América (45)**.

Los 4 brackets colapsan a **32 equipos en R32** vía byes, y desde ahí corren en lockstep:

| Conf. | Equipos | Juegan R64 | Partidos R64 | Byes (a R32) |
|---|---|---|---|---|
| Europa / Asia / África | 55 | 46 | 23 | **9** |
| América | 45 | 26 | 13 | **19** |

- Fórmula: `byes = 32 − (equiposR64 / 2)`, con `equiposR64 = 2·(equipos − 32)`.
- Rondas (todas las confs sincronizadas): **R64 → R32 → R16 → QF → SF → Final** = **6 jornadas globales**.
- Total de partidos R64 de la fase = `23·3 + 13 = 82`. Byes auto-avanzan a R32.
- **Finalistas** (campeón + subcampeón) de cada conf → 8 clasificados a la Copa Confederaciones.

## 4. Modelo de datos

### 4.1 Tipos nuevos / extendidos (`src/types/index.ts`)

```ts
// Etapa del partido (se agregan las 3 nuevas)
type MatchStage =
  | 'qualifier'
  | 'continental'
  | 'confed-group'
  | 'confed-knockout'
  | 'world-cup-group'
  | 'world-cup-knockout';

// Ronda de knockout: se agrega 'round-of-64'
type KnockoutRound =
  | 'round-of-64' | 'round-of-32' | 'round-of-16'
  | 'quarter' | 'semi' | 'third-place' | 'final';

// Fase del ciclo (puntero de calendario)
type CyclePhase =
  | 'continental' | 'confed' | 'wc-qualifiers' | 'wc-groups' | 'wc-knockout' | 'completed';

interface CalendarState {
  phase: CyclePhase;
  matchday: number;        // jornada/ronda actual dentro de la fase (1-based)
}

// Bracket continental: KnockoutBracket + roundOf64
interface ContinentalBracket {
  region: Region;
  roundOf64: KnockoutMatch[];   // solo los 23/13 cruces reales (los byes no aparecen)
  roundOf32: KnockoutMatch[];
  roundOf16: KnockoutMatch[];
  quarterFinals: KnockoutMatch[];
  semiFinals: KnockoutMatch[];
  final: KnockoutMatch | null;
  championId?: string;          // finalista 1
  runnerUpId?: string;          // finalista 2
  byeTeamIds: string[];         // cabezas de serie con bye a R32
}

interface ContinentalStage {
  brackets: Record<Region, ContinentalBracket>;
  isComplete: boolean;
}

interface ConfederationsCup {
  groups: WorldCupGroup[];      // 2 grupos de 4 (reutiliza el tipo existente)
  knockout: {
    semiFinals: KnockoutMatch[];  // 1ºA-2ºB, 1ºB-2ºA
    thirdPlace: KnockoutMatch | null;
    final: KnockoutMatch | null;
  };
  championId?: string;
  isComplete: boolean;
}

// Cycle = Tournament actual + campos nuevos
interface Cycle extends Tournament {
  continental: ContinentalStage;
  confederationsCup: ConfederationsCup;
  calendar: CalendarState;
  // status: 'continental' | 'confed' | 'wc-qualifiers' | 'wc-groups' | 'wc-knockout' | 'completed'
}
```

`Tournament` conserva `qualifiers`, `worldCup`, `year`, `originalSkills`, etc. El store pasa a manejar `cycles: Cycle[]` (renombrado de `tournaments`), `currentCycleId`, `currentCycle`.

### 4.2 Estructura de jornadas del ciclo

| Fase | Jornadas | Detalle |
|---|---|---|
| Continental | 6 | R64, R32, R16, QF, SF, Final (4 confs en paralelo) |
| Confederaciones | 5 | Grupos ×3, Semis, (Final + 3er puesto) |
| Clasificatorias | 20 | Template existente (`FIXTURE_TEMPLATE`, matchday 1-20) |
| Mundial grupos | 3 | Template existente (`WORLD_CUP_FIXTURE_TEMPLATE`) |
| Mundial knockout | 5 | R32, R16, QF, SF, (3er puesto + Final) |

## 5. Motor de calendario (`src/core/calendar.ts`)

Módulo **puro y testeable**, sin React ni Supabase, en la misma línea que `engine.ts` / `scheduler.ts`. Responsabilidades:

- `getPlayableMatches(cycle): Match[]` — los partidos de **la jornada actual de la fase actual**.
- `isMatchPlayable(cycle, matchId): boolean` — guard usado por el store y la UI.
- `isCurrentMatchdayComplete(cycle): boolean` — todos los partidos de la jornada actual jugados.
- `getMatchdayCount(cycle, phase): number` — dinámico para brackets.
- `nextRoundMatches(bracket)` — generación pura de la ronda siguiente a partir de los ganadores (reutiliza `core/knockout.ts` donde aplique).

**Avance de calendario — dos niveles:**

1. **Intra-fase (automático):** cuando `isCurrentMatchdayComplete` pasa a `true`, el store incrementa `calendar.matchday` y, si es una fase de bracket, genera los partidos de la ronda siguiente desde los ganadores (igual que hoy el knockout del Mundial auto-genera rondas).
2. **Boundary de fase (paso explícito con sorteo):** al terminar la última jornada de una fase, se **bloquea** el avance hasta que el usuario ejecute el **sorteo de la fase siguiente** (posible animación). Esto encaja en el modelo de *steps* del `TournamentWizard` actual.

**Transiciones de fase** (orquestadas por el store, reutilizando acciones existentes):

| De → A | Acción |
|---|---|
| (inicio) → Continental | Sortear los 4 brackets continentales (bombos + byes). |
| Continental → Confed | Juntar los 8 finalistas y **sortear** los 2 grupos (1 equipo por conf por grupo). |
| Confed → Clasificatorias | Ejecutar el sorteo de clasificatorias actual (`generateDrawAndFixtures`). |
| Clasificatorias → WC grupos | Calcular los 64 clasificados + sorteo de grupos (`advanceToWorldCup` / draw manual). |
| WC grupos → WC knockout | Generar R32 (`advanceToKnockout`). |
| WC knockout → completed | Coronar campeón del ciclo. |

## 6. Torneos Continentales

- Participan **todos** los equipos de la confederación (55/55/55/45).
- **Sorteo (`generateContinentalBracket(teams)`):**
  1. Ordenar por skill (desc).
  2. Los mejores `byesCount` (9 o 19) = **Bombo 1**: reciben bye a R32 y se colocan como cabezas en secciones **separadas** del bracket.
  3. El resto se reparte en bombos por skill y se sortea (Fisher-Yates) en los cruces de R64, manteniendo a los cabezas en secciones distintas (no se cruzan en R64).
- **Cruces:** partido único, sede neutral → `simulateMatch(..., disableHomeAdvantage = true)`. Empate → penales (`simulateMatchWithPenalties`).
- Reutiliza `KnockoutMatch` / `KnockoutBracket` (+ `roundOf64`), `core/knockout.ts` para R32→Final, y el render de `BracketLine` / `KnockoutView` extendido con la columna R64 (scroll horizontal).
- **Nota:** el generador actual `generateRoundOf32` exige exactamente 16 grupos del Mundial; **no se reutiliza** para R64/R32 continental. Se agrega `generateContinentalBracket` + avance de rondas específico.

## 7. Copa Confederaciones

- **Clasificados:** 8 (campeón + subcampeón de cada conf).
- **Sorteo de grupos:** 2 grupos de 4 con **exactamente un equipo de cada confederación por grupo** (el campeón de una conf a un grupo, su subcampeón al otro). Semillado por skill para **balancear fuerza** (evitar que un grupo junte los 4 campeones).
- **Grupos:** round-robin simple, **3 jornadas** (reutiliza `WorldCupGroup` + `WORLD_CUP_FIXTURE_TEMPLATE`, 6 partidos por grupo). Los 2 mejores de cada grupo clasifican.
- **Semis:** 1ºA-2ºB / 1ºB-2ºA. Luego **Final + 3er puesto**. Neutral, penales en cruces.

## 8. Peso de cada torneo sobre el skill (Elo por etapa)

Se agrega un **multiplicador de importancia** que escala el K: `K_efectivo = kFactor_base × importancia(etapa, ronda)`. **Solo afecta el cambio de skill**, no el modelo de goles. En cruces resueltos por penales, el Elo cuenta el resultado como **empate** (FIFA-style; manda el marcador de los 90').

**Tabla de defaults (intensidad moderada, tuneable en EngineSettings):**

| Clave de importancia | Etapa / ronda | Peso |
|---|---|---|
| `qualifier` | Clasificatorias Mundial | 0.75 |
| `continentalEarly` | Continental R64–R16 | 0.90 |
| `continentalLate` | Continental QF–Final | 1.20 |
| `confedGroup` | Copa Confed – grupos | 1.10 |
| `confedKnockout` | Copa Confed – semis/final | 1.40 |
| `wcGroup` | Mundial – grupos | 1.25 |
| `wcKnockout` | Mundial – knockout | 1.60 |

**Integración:**
- `EngineConfig` (en `useConfigStore`) suma `importanceByStage: Record<ImportanceKey, number>`. Se bumpea la versión del store (2 → 3) con `migrate` que inyecta los defaults.
- `EngineSettings.tsx` agrega las 7 perillas.
- `engine.ts::calculateSkillChanges(homeSkill, awaySkill, homeScore, awayScore, importance = 1)` — `importance` multiplica el `kFactor`.
- Helper `getStageImportance(stage, round, config)` mapea `(stage, round)` → peso. El store lo calcula al simular cada partido y lo pasa al engine.

## 9. Enforcement del orden + UI

- **Store:** `simulateMatch` y `simulateKnockoutMatch` (y los nuevos de continental/confed) **rechazan** cualquier partido que no esté en la jornada actual (`isMatchPlayable`). Esto elimina el cherry-picking de raíz. `simulateMatchdayBatch` opera solo sobre la jornada actual.
- **Auto-avance:** al completar la jornada actual, el store avanza `calendar.matchday` (y genera la ronda siguiente en brackets). Los boundaries de fase quedan gateados por el sorteo (paso del wizard).
- **Match Center (hub del calendario):** muestra **solo la jornada actual jugable** (jugar sueltos en cualquier orden o "Simular jornada"); las futuras aparecen **bloqueadas**. Header/timeline arriba con fase del ciclo + jornada.
- **`GroupView` / `KnockoutView`:** los botones "Play" sueltos se **deshabilitan** para partidos fuera de la jornada actual.
- **`TournamentWizard`:** se extiende con los steps **Continental** y **Copa Confederaciones** antes de Clasificatorias; sigue orquestando los sorteos de cada boundary (con animación estilo `DrawSimulator` donde aporte).
- **Vistas nuevas:** `ContinentalView` (una por confederación, bracket R64) y `ConfederationsCupView` (grupos + mini-bracket).

## 10. Persistencia (Supabase + local)

- **Migración nueva** (`008_cycle_continental_confed.sql`):
  - Extender `tournaments_new` (o tabla `cycles`) con columnas de calendario: `phase`, `matchday`, `status` ampliado.
  - `matches_new.match_type` suma `'continental' | 'confed-group' | 'confed-knockout'`, con contexto de bracket/grupo y campos de penales ya existentes.
  - Tablas para brackets continentales (posiciones, ronda, byes) y grupos de confederaciones.
- **Modo local:** todo funciona igual vía `persist` de Zustand cuando Supabase no está configurado (`isSupabaseConfigured() === false`).
- **Borrado de datos viejos:** limpiar torneos legacy (localStorage + Supabase) como parte del release.
- Servicios en `src/services/` siguen el patrón normalizado existente; se agregan `continentalService` y `confederationsService`.

## 11. Supuestos

- Todos los partidos competitivos afectan el Elo/skill (como hoy), ahora con peso por etapa.
- El "año 3" del ciclo queda sin competición; al terminar el Mundial se crea un ciclo nuevo con la regresión de skill del 3% (como hoy entre torneos).
- Clasificatorias y Mundial **no cambian de formato**; solo pasan a estar bloqueados por jornada.
- Continental y Copa Confederaciones se juegan en **sede neutral** (sin ventaja de local).
- El sorteo de confederaciones reparte campeón/subcampeón de cada conf en grupos opuestos y balancea por skill.

## 12. Plan de implementación (fases sugeridas para el plan)

1. **Modelo + calendario puro:** tipos `Cycle`/`CalendarState`/`ContinentalBracket`/`ConfederationsCup`, `core/calendar.ts` + tests. Sin UI.
2. **Peso Elo por etapa:** `EngineConfig.importanceByStage`, `calculateSkillChanges(importance)`, `getStageImportance`, EngineSettings + tests.
3. **Continental:** `generateContinentalBracket` (byes/bombos/sorteo) + avance de rondas + `ContinentalView` (render R64) + tests.
4. **Copa Confederaciones:** sorteo con restricción por conf + grupos + KO + `ConfederationsCupView` + tests.
5. **Enforcement + hub:** guards en el store, Match Center como centro del calendario, bloqueo de jornadas futuras, steps nuevos en `TournamentWizard`.
6. **Persistencia + wiring:** migración `008`, servicios, transiciones de fase, borrado de datos viejos, flujo de creación de ciclo.

## 13. Riesgos y cuestiones a confirmar en implementación

- Confirmar la forma exacta de `FIXTURE_TEMPLATE` (cantidad de partidos por jornada en clasificatorias) para que el gate por jornada sea correcto.
- Render de bracket de 64 llaves: layout y scroll horizontal dentro de la estética retro.
- Decidir si los sorteos continental/confed reutilizan `DrawSimulator` (animado) o una versión más simple.
- Tamaño del refactor en `useTournamentStore.ts` (2103 líneas): la lógica de calendario/fases es el punto de mayor acoplamiento; considerar extraer un slice de calendario.
- Migración de datos: el borrado de saves viejos debe cubrir localStorage (`football-tournament-storage`) y las tablas de Supabase.

## 14. Testing

- **Puros (Vitest):** `core/calendar.ts` (playable/complete/advance/transiciones), matemática de byes por confederación, `generateContinentalBracket` (32 en R32, cabezas separados), sorteo de confederaciones (1 por conf por grupo), `getStageImportance` y `calculateSkillChanges` con importancia.
- **Store:** rechazo de partidos fuera de jornada; auto-avance al completar jornada; transiciones de fase.
