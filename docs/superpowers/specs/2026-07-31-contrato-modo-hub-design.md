# Contrato de modo y Hub único

Fecha: 2026-07-31
Estado: diseño aprobado, pendiente de plan de implementación
Etapa: 1 de 3 (ver "Trabajo futuro")

## Problema

La app abre en `TournamentWizard` ("Progreso del Torneo — Guía paso a paso para
completar el torneo"): cinco tarjetas-paso con círculos vacíos y botones de
sorteo. Es un formulario de trámites administrativos, no la pantalla de inicio de
un juego. Un juego arranca mostrando **el estado del mundo** — dónde estás, qué
pasó recién, qué sigue — y ofrece **una** acción.

Ese problema tiene un agravante estructural. Hoy conviven dos modos
(`national-cycle` y `league-system`) que son mundos paralelos casi sin capa común:

| | Selecciones (`national-cycle`) | Ligas (`league-system`) |
|---|---|---|
| Store | `useTournamentStore` | `useLeagueModeStore` |
| Motor | `core/cycle.ts` | `core/formats/{league,cup,season}.ts` |
| Persistencia | tablas normalizadas | 1 doc JSONB por torneo |
| Pantalla de inicio | `TournamentWizard` (819 líneas) | bloque `main` de `LeagueModeView` |

Cada modo respondió por su cuenta la misma pregunta —"¿cuál es tu próxima
acción?"— con código distinto. `TournamentWizard.mobileAction` la calcula para
selecciones; `LeagueModeView` la calcula para ligas. Con más modos por venir, esa
duplicación se multiplica: cualquier mejora de sensación de juego habría que
escribirla una vez por modo.

## Objetivo

Una sola pantalla de inicio para todos los modos, alimentada por un contrato que
cada modo implementa. Al terminar esta etapa:

- Selecciones y Liga Villamariense abren en el **mismo** componente.
- Agregar un modo nuevo cuesta **un adaptador**, no una pantalla.
- `TournamentWizard` deja de existir.

## No objetivos

- **No entran titulares ni resumen de fecha.** Son las etapas 2 y 3. Esta etapa
  deja el hueco donde van, no lo llena: el bloque de "qué pasó recién" muestra el
  último resultado crudo, sin narrativa.
- **No se toca el motor de simulación** (`core/engine.ts`, `core/cycle.ts`,
  `core/formats/*`). Esta etapa sólo lee estado y dispara acciones que ya existen.
- **No se toca la persistencia.** Cero migraciones.
- **No se rediseña la navegación secundaria.** El sidebar y las vistas de fase
  siguen como están, salvo el ítem que apuntaba al wizard.
- **No se arreglan acá** los bugs de bracket, selector de torneos ni columna
  derecha del Centro de Partidos. Van sueltos.

## El contrato

```ts
// src/core/modeSnapshot.ts

import type { MobileAction } from '../hooks/useMobileAction';
import type { MatchResult } from '../store/useMatchResultsStore';

/** Un peldaño de la escalera de fases del modo. */
export interface LadderStep {
  key: string;
  label: string;
  state: 'done' | 'active' | 'locked';
  /** Navegar a esa fase. Cada modo resuelve a dónde. */
  onSelect: () => void;
}

/** Todo lo que el Hub necesita saber, sin saber de qué modo se trata. */
export interface ModeSnapshot {
  /** "Ciclo 2026" | "Temporada 2027" */
  title: string;
  /** "Torneos Continentales" | "Liga A · Fecha 4" */
  phaseLabel: string;
  /** 0..1 — progreso del modo entero, no de la fase. */
  progress: number;
  /** La única acción del camino feliz. `null` = no hay nada que hacer. */
  nextAction: MobileAction | null;
  ladder: LadderStep[];
  /** Lo último que pasó. Vacío si todavía no se jugó nada. */
  lastResults: MatchResult[];
}
```

`nextAction` reusa `MobileAction` (`{ label, onPress, disabled? }`) de
`src/hooks/useMobileAction.tsx` en vez de declarar un tipo gemelo: es exactamente
la misma forma, y el dock móvil ya la consume.

`lastResults` reusa `MatchResult` de `src/store/useMatchResultsStore.ts`, que ya
es el tipo compartido por los dos modos.

**De dónde salen los `lastResults` en esta etapa:** del propio
`useMatchResultsStore`, es decir, de lo que se acaba de simular en esta sesión.
Los adaptadores no los buscan: se les inyectan, igual que las acciones, para que
sigan siendo puros y sincrónicos. La consecuencia es explícita y aceptada: **al
abrir la app el bloque "qué pasó recién" está vacío**, porque el store es
transitorio. Leer el último partido de `match_history` para que sobreviva entre
sesiones llega en la etapa 2, junto con los titulares — que ya necesitan esa
lectura y son quienes justifican su costo.

### Adaptador de selecciones

```ts
export function snapshotFromCycle(
  tournament: Tournament | null,
  nav: (view: View) => void,
  /** Las acciones del store, inyectadas: el adaptador queda puro y testeable. */
  actions: Pick<
    TournamentStore,
    | 'drawContinental'
    | 'drawConfederations'
    | 'advanceToQualifiers'
    | 'generateDrawAndFixtures'
    | 'advanceToWorldCup'
    | 'advanceToKnockout'
  >,
): ModeSnapshot
```

`nextAction` es **`TournamentWizard.mobileAction` movida de lugar**: la cadena de
guards ya existe y ya está probada, sólo cambia de archivo. Pero hoy está
incompleta — termina en "JUGAR CLASIFICATORIAS" porque el dock móvil se apoyaba
en que las tarjetas-paso cubrían el resto. Al desaparecer las tarjetas hay que
extenderla hasta el final del ciclo:

| Condición | Etiqueta | Acción | |
|---|---|---|---|
| `canDrawContinental` | ▶ SORTEAR CONTINENTAL | `drawContinental` | |
| fase `continental` incompleta | ▶ JUGAR CONTINENTAL | navegar | |
| `canDrawConfederations` | ▶ SORTEAR CONFED | `drawConfederations` | |
| fase `confed` incompleta | ▶ JUGAR CONFED | navegar | |
| `canAdvanceToQualifiers` | ▶ IR A CLASIFICATORIAS | `advanceToQualifiers` | |
| `canDrawQualifiers` y sin fixtures | ▶ EMPEZAR | `generateDrawAndFixtures` | |
| clasificatorias incompletas | ▶ JUGAR CLASIFICATORIAS | navegar | |
| `canAdvanceToWorldCup` | ▶ AVANZAR AL MUNDIAL | `advanceToWorldCup` | nuevo |
| grupos del Mundial incompletos | ▶ JUGAR EL MUNDIAL | navegar | nuevo |
| `canAdvanceToKnockout` | ▶ IR A PLAYOFFS | `advanceToKnockout` | nuevo |
| playoffs incompletos | ▶ JUGAR PLAYOFFS | navegar | nuevo |
| ciclo completo | `null` | — | nuevo |

Los cuatro helpers que hacen falta para los peldaños nuevos
(`canAdvanceToWorldCup`, `getWorldCupGroupProgress`, `canAdvanceToKnockout`,
`getKnockoutProgress`) ya existen en `src/utils/tournamentProgress.ts`; el wizard
los importa hoy.

`ladder`: Continental → Confederaciones → Clasificatorias → Mundial. `state` sale
de los mismos helpers de `cycleProgress` que hoy alimentan `lockedViews` en
`App.tsx`.

`progress`: partidos jugados / partidos totales del ciclo.

### Adaptador de ligas

```ts
export function snapshotFromLeagueSeason(
  season: {
    status: LeagueModeStatus;
    year: number | null;
    tournaments: ModeTournament[];
    busy: boolean;
  },
  goToTab: (tab: string) => void,
  actions: Pick<
    LeagueModeState,
    'startSeason' | 'simulateLeagueMatchday' | 'closeSeason'
  >,
): ModeSnapshot
```

`LeagueModeState` hoy no se exporta desde `useLeagueModeStore.ts`; hay que
exportarlo (sólo el tipo).

`nextAction`, por prioridad:

| Condición | Etiqueta | Acción |
|---|---|---|
| `status === 'needs-seed'` | `null` | el modo no tiene clubes sembrados; el Hub explica y no ofrece nada |
| `status === 'ready'` y `tournaments.length === 0` | ▶ EMPEZAR TEMPORADA | `startSeason` |
| liga con fecha pendiente | ▶ SIMULAR FECHA N | `simulateLeagueMatchday` |
| copa con llave pendiente | ▶ JUGAR LA COPA | `goToTab('cup')` |
| ambas ligas completas | ▶ CERRAR TEMPORADA | `closeSeason` |

No hay fila de "temporada cerrada": `closeSeason` aplica ascensos/descensos,
avanza `currentYear` y llama a `loadForMode`, con lo cual el modo vuelve al
estado `ready` sin torneos — o sea, a la fila "EMPEZAR TEMPORADA" del año
siguiente. **Un modo de ligas no termina nunca.** El único `nextAction: null`
posible es `needs-seed`.

Las dos primeras filas son exactamente los dos estados que hoy rinde el bloque
`activeTab === 'main'` de `LeagueModeView` (`needs-seed` informativo, y `ready`
sin torneos con el botón "Iniciar temporada"). Al absorberlas el Hub, la pestaña
`main` desaparece de `deriveLeagueTabs`.

`ladder`: sale de `deriveLeagueTabs` filtrando `crests` (es una herramienta de
administración, no una fase) y `main` (que deja de existir). `onSelect` hace
`setActiveTab(key)` + `onViewChange('league')`, que es lo que ya hace el sidebar.

`progress`: partidos jugados / totales sumando ambas ligas y la copa.

## El Hub

`src/components/hub/HubView.tsx`. Consume un `ModeSnapshot` y **no importa
ningún store de modo**: recibe el snapshot como prop. Eso es lo que lo hace
testeable con un objeto literal y lo que impide que vuelva a crecer una rama
`if (isNationalMode)` adentro.

Orden vertical, mismo en desktop y mobile:

1. **Cabecera** — `title`, `phaseLabel`, barra de progreso (`PixelBar`, ya existe).
2. **Qué pasó recién** — el último resultado de `lastResults`, con marcador y
   bandera/escudo (`TeamFlag` ya resuelve ambos). Si está vacío, no se rinde el
   bloque. *Acá entra el titular en la etapa 2.*
3. **`CONTINUAR`** — un botón grande con `nextAction.label`. Si `nextAction` es
   `null` va un estado de cierre en su lugar, nunca un botón muerto:
   - ciclo completo → "Ciclo completo" + "Nuevo torneo", que abre el mismo flujo
     de creación que ya ofrecen `TournamentSelector` y `WorldCupViewEnhanced`;
   - modo de ligas sin clubes sembrados (`needs-seed`) → el texto explicativo que
     hoy vive en el bloque `main`, sin acción.
4. **Escalera** — chips desde `ladder`, con `state` marcando hecho/activo/bloqueado.

La resolución del snapshot vive en `src/hooks/useModeSnapshot.ts`, que mira
`useModeStore.activeModeKind()` y llama al adaptador que corresponda. Es el único
lugar de esta etapa que conoce los dos modos.

## Reubicación de las acciones del wizard

Las ocho acciones del wizard se reparten en tres destinos. **Ninguna se pierde.**

| Acción | Destino |
|---|---|
| `drawContinental` | `nextAction` |
| `drawConfederations` | `nextAction` |
| `advanceToQualifiers` | `nextAction` |
| `generateDrawAndFixtures` | `nextAction` |
| `advanceToWorldCup` | `nextAction` |
| `advanceToKnockout` | `nextAction` |
| navegar a una fase | chips de la escalera |
| **rehacer sorteo de clasificatorias** (destructiva, `ConfirmDialog`) | `QualifiersView` |
| **regenerar sorteo del Mundial** (destructiva, `ConfirmDialog`) | `WorldCupViewEnhanced` |
| **sorteo manual** (`DrawSimulator`) | `WorldCupViewEnhanced` |

Las tres últimas se mudan **con su `ConfirmDialog` y sus tests**. No son
opcionales ni obvias: cada una arregló un bug real (el diálogo debe quedar
abierto cuando el guard rechaza; el sorteo manual no debe descartarse si el guard
rechaza). Ver `TournamentWizard.test.tsx`, describes "regenerar sorteo del
Mundial", "rehacer sorteo de clasificatorias" y "handleDrawSimulatorComplete".

## Cambios de navegación

- `src/types/view.ts`: `'wizard'` → `'hub'`.
- `App.tsx`: vista inicial `'hub'`; el hub se rinde para **ambos** modos (hoy la
  rama `!currentTournament` cae a `LeagueModeView`). `LeagueModeView` deja de ser
  la raíz del modo de ligas y pasa a rendir sólo sus pestañas.
- `Sidebar.tsx`: en selecciones, el ítem "Progreso" pasa a "Inicio" → `'hub'`. En
  ligas se agrega "Inicio" → `'hub'` arriba de la sección Temporada.
- `GameTabBar.tsx`: `NATIONAL_TABS[0]` y `LEAGUE_TABS[0]` apuntan a `'hub'`.
  Ambas ya se llaman "INICIO", así que no cambia el ancho (tope de 6 caracteres).
- Los cuatro `onNavigate?.('wizard')` de `ContinentalView`, `ConfederationsCupView`,
  `QualifiersView` y `WorldCupViewEnhanced` pasan a `'hub'`, y su etiqueta "Ir a
  Progreso" a "Ir al inicio".

## Qué se borra

- `src/components/tournament/TournamentWizard.tsx` (819 líneas).
- El bloque `activeTab === 'main'` de `LeagueModeView` y la pestaña `main` de
  `deriveLeagueTabs`: sus dos estados quedan cubiertos por el Hub.
- El ítem de sidebar "Progreso".

## Errores y bordes

- **Modo todavía cargando** (`useModeStore.isLoaded === false`): el Hub rinde
  `Skeleton`, sin acción. No hay botón que pueda apretarse sobre estado incompleto.
- **Selecciones sin torneo cargado**: `App.tsx` ya bloquea con la pantalla
  "Cargando torneo…". El adaptador igual debe tolerar `currentTournament === null`
  devolviendo `nextAction: null`, porque los hooks se declaran antes de los
  returns condicionales (el patrón ya documentado en `App.tsx` y
  `TournamentWizard.tsx`: si cambia la cantidad de hooks ejecutados, React lanza
  "Rendered more hooks than during the previous render").
- **Ligas en `status === 'error'`**: el Hub rinde el `EmptyState` con reintento
  que ya usa `LeagueModeView`.
- **Guard que rechaza**: los stores ya avisan el motivo con su propio toast. El
  Hub no festeja ni navega si la acción devuelve `false` — misma regla que hoy
  respeta el wizard.
- **Acción en vuelo**: mientras `busy` (ligas) o hay batch corriendo
  (selecciones), `nextAction.disabled = true`. `MobileAction` ya soporta el flag.

## Testing

- **Adaptadores** (`core/modeSnapshot.ts`): puros, sin React ni Supabase. Tests
  de tabla con Vitest, una fila por condición de las dos tablas de prioridad de
  arriba. Los casos de `mobileAction` que hoy cubre `TournamentWizard.test.tsx`
  se **migran** acá; los cuatro peldaños nuevos son cobertura nueva.
- **`HubView`**: RTL con snapshots literales. Un test por modo, uno de
  `nextAction: null`, uno de `lastResults: []`, uno de cargando.
- **Acciones mudadas**: los describes de regenerar / rehacer / sorteo manual se
  mueven a `QualifiersView.test.tsx` y `WorldCupViewEnhanced.test.tsx` **sin
  cambiar lo que afirman**. Si un test de esos deja de existir, se perdió un
  arreglo.
- **Guards del store**: `useTournamentStore.drawGuards.test.ts` no se toca. El
  contrato no cambia las reglas, sólo quién las consulta.
- Verificación final con `set -o pipefail` y grep del resumen, no `| tail`.

## Trabajo futuro

- **Etapa 2 — Titulares.** `src/core/headlines.ts`, puro: dado un partido con
  `skillBefore`/`skillChange` (columnas que `match_history` ya guarda, para los
  dos modos), emite titulares con score de notabilidad — batacazo, goleada,
  definición agónica, cierre de fase. Llena el bloque "qué pasó recién" del Hub y
  funciona retroactivamente sobre los ciclos ya jugados.
- **Etapa 3 — Resumen de fecha.** `MatchResultsModal` pasa de lista plana a tres
  bloques: titulares (top 3 por score), movimientos de tabla, y la lista actual
  colapsada.
- **Fuera de plan.** Hitos/récords y audio arcade: no dependen de nada de esto.
