# Próxima acción y Hub único

Fecha: 2026-07-31
Estado: diseño aprobado, pendiente de plan de implementación
Base: `2ab41e0` (merge del PR #8)

## Contexto: qué ya está hecho

Este spec reemplaza a un borrador anterior escrito contra un `master` local que
estaba 20 commits atrás de `origin`. Los PRs #6, #7 y #8 ya resolvieron la mitad
de lo que ese borrador proponía, y con un diseño mejor:

- **`src/modes/types.ts`** — descriptor declarativo de modo, guardado en
  `modes.config` (JSONB). Objetivo declarado: dar de alta un modo es
  configuración + siembra de equipos, no código nuevo.
- **`src/modes/nav.ts`** — `deriveModeNav`: una sola derivación de navegación,
  pura y sin React, consumida por `Sidebar`, `GameTabBar`, `PauseMenu`,
  `SeasonModeView` y el ruteo de `App.tsx`.
- **`src/modes/registry.ts`** — los descriptores de selecciones y Villamariense.
- Primitivas únicas de liga, grupos y eliminación; historial, estadísticas y
  campeones por modo.

**Nada de eso se toca.** Este spec se enchufa a ese descriptor.

## Problema

Con toda esa unificación hecha, la pantalla de inicio sigue sin unificarse y
sigue sin parecer un juego:

- `deriveModeNav` devuelve `root = 'wizard'` para el ciclo y `root = 'league'`
  para los modos de temporada. **Dos pantallas de inicio distintas**, ambas
  rotuladas "INICIO" en la barra mobile.
- `TournamentWizard.tsx` sigue con 819 líneas: "Progreso del Torneo — Guía paso
  a paso para completar el torneo", cinco tarjetas-paso con círculos vacíos. Es
  un formulario de trámites, no el inicio de un juego.
- **La "próxima acción" no existe en el descriptor.** Vive suelta como
  `TournamentWizard.mobileAction` (línea 114), sólo para selecciones, y sólo
  para el dock de mobile. Un modo de temporada no tiene ninguna.

Un juego arranca mostrando el estado del mundo —dónde estás, qué pasó recién,
qué está en juego— y ofrece **una** acción.

## Objetivo

1. Una sola pantalla de inicio (`'hub'`) para todos los modos, presente y futuros.
2. La próxima acción pasa a ser una derivación del modo, al lado de la
   navegación, con la misma forma pura y testeable.
3. `TournamentWizard` deja de existir.

## No objetivos

- **No se toca el descriptor ni `deriveModeNav`**, salvo dos cambios acotados:
  `root` pasa a `'hub'` en ambos motores, y `VIEW_META` gana `hub` y pierde
  `wizard`.
- **No entran titulares ni resumen de fecha.** Son las etapas 2 y 3. Esta etapa
  deja el hueco, no lo llena.
- No se toca el motor de simulación ni la persistencia. Cero migraciones.
- No se arreglan acá los bugs de bracket, selector de torneos ni columna derecha
  del Centro de Partidos (siguen vivos tras el rebase, van sueltos).

## Diseño

### 1. `src/modes/nextAction.ts` — la pieza que falta

Espejo exacto de `nav.ts`: puro, sin React, dos ramas por `engine`, testeable
como cualquier función.

```ts
import type { MobileAction } from '../hooks/useMobileAction';

export interface DeriveNextActionInput {
  descriptor: ModeDescriptor;
  /** national-cycle: el ciclo activo. */
  cycle: Cycle | null;
  /** season: estado de la temporada del año en curso. */
  season: { status: SeasonModeStatus; tournaments: ModeTournament[] } | null;
  /** Sorteo o batch en curso: la acción se ofrece deshabilitada. */
  busy: boolean;
  nav: (view: View, tab?: string) => void;
  actions: ModeActions;
}

/** `null` = no hay nada que hacer; el Hub muestra el estado de cierre. */
export function deriveNextAction(input: DeriveNextActionInput): MobileAction | null;
```

`MobileAction` (`{ label, onPress, disabled? }`) ya existe en
`src/hooks/useMobileAction.tsx` y ya la consume el dock de mobile: no se declara
un tipo gemelo.

`ModeActions` es el conjunto de acciones de store que el Hub puede disparar,
**inyectadas por parámetro** en vez de importadas: eso es lo que mantiene puro a
`deriveNextAction`, igual que `deriveModeNav` no importa ningún store. Son las
seis del ciclo (`drawContinental`, `drawConfederations`, `advanceToQualifiers`,
`generateDrawAndFixtures`, `advanceToWorldCup`, `advanceToKnockout`) y cuatro de
la temporada (`startSeason`, `simulateJornada`, `closeSeason`, `loadForMode`).

`SeasonModeStatus` y `SeasonModeState` hoy son locales a
`useSeasonModeStore.ts`: hay que exportarlos (sólo los tipos).

**Rama `national-cycle`** — es `TournamentWizard.mobileAction` movida de lugar
(cadena de guards ya escrita y ya probada), extendida hasta el final del ciclo:
hoy termina en "JUGAR CLASIFICATORIAS" porque las tarjetas-paso cubrían el
resto, y al borrarlas quedarían sin dueño.

| Condición | Etiqueta | |
|---|---|---|
| `canDrawContinental` | ▶ SORTEAR CONTINENTAL | |
| fase `continental` incompleta | ▶ JUGAR CONTINENTAL | |
| `canDrawConfederations` | ▶ SORTEAR CONFED | |
| fase `confed` incompleta | ▶ JUGAR CONFED | |
| `canAdvanceToQualifiers` | ▶ IR A CLASIFICATORIAS | |
| `canDrawQualifiers` y sin fixtures | ▶ EMPEZAR | |
| clasificatorias incompletas | ▶ JUGAR CLASIFICATORIAS | |
| `canAdvanceToWorldCup` | ▶ AVANZAR AL MUNDIAL | nuevo |
| grupos del Mundial incompletos | ▶ JUGAR EL MUNDIAL | nuevo |
| `canAdvanceToKnockout` | ▶ IR A PLAYOFFS | nuevo |
| playoffs incompletos | ▶ JUGAR PLAYOFFS | nuevo |
| ciclo completo | `null` | nuevo |

Los helpers de los cuatro peldaños nuevos ya existen en
`src/utils/tournamentProgress.ts`.

**Rama `season`** — hoy no existe ninguna:

| Condición | Etiqueta |
|---|---|
| `status === 'error'` | ▶ REINTENTAR |
| `status === 'needs-seed'` | `null` (modo sin clubes sembrados) |
| `status === 'ready'` y sin torneos | ▶ EMPEZAR TEMPORADA |
| competición con fecha pendiente | ▶ SIMULAR FECHA N |
| copa con cruce pendiente | ▶ JUGAR LA COPA |
| todas las ligas completas | ▶ CERRAR TEMPORADA |

**Un modo de temporada no termina nunca:** `closeSeason` aplica
ascensos/descensos, avanza el año y recarga, con lo cual vuelve a "ready sin
torneos" — o sea, a "EMPEZAR TEMPORADA" del año siguiente. El único `null`
posible ahí es `needs-seed`.

Regla transversal, la misma que ya respeta el wizard: si la acción del store
devuelve `false`, el store ya avisó el motivo con su propio toast, así que el
handler **no festeja ni navega**.

### 2. `src/hooks/useNextAction.ts`

Espejo de `useModeNav`: lee los stores, inyecta las acciones y llama a
`deriveNextAction`. Es el único lugar de esta etapa que toca stores.

### 3. `src/components/hub/HubView.tsx`

Presentacional. Recibe sus datos como props y no importa ningún store, así que
se testea con objetos literales.

1. **Cabecera** — título del modo, fase actual, `PixelBar` de progreso.
2. **Qué pasó recién** — el último resultado de `useMatchResultsStore`. Si está
   vacío no se rinde el bloque. *Acá entra el titular en la etapa 2.*
3. **`CONTINUAR`** — un botón grande con la etiqueta de `nextAction`. Con
   `nextAction === null`, un estado de cierre (ciclo completo → "Nuevo torneo";
   `needs-seed` → el texto explicativo). Nunca un botón muerto.
4. **Escalera de fases** — **no se inventa nada**: son los items de
   `nav.sections` con `key === 'competition'`, que `deriveModeNav` ya deriva del
   descriptor, con su `locked` y su `icon`. El chip de la vista actual se marca
   como activo.

Que la escalera salga de la navegación existente es la ganancia del rebase: el
borrador anterior definía un tipo `LadderStep` paralelo que ahora no hace falta.

### 4. Reubicación de las acciones del wizard

Las ocho acciones se reparten en tres destinos. **Ninguna se pierde.**

| Acción | Destino |
|---|---|
| `drawContinental`, `drawConfederations`, `advanceToQualifiers`, `generateDrawAndFixtures`, `advanceToWorldCup`, `advanceToKnockout` | `deriveNextAction` |
| navegar a una fase | chips de la escalera (ya existen en la nav) |
| **rehacer sorteo de clasificatorias** (destructiva, `ConfirmDialog`) | `QualifiersView` |
| **regenerar sorteo del Mundial** (destructiva, `ConfirmDialog`) | `WorldCupViewEnhanced` |
| **sorteo manual** (`DrawSimulator`) | `WorldCupViewEnhanced` |

Las tres últimas se mudan **con su `ConfirmDialog` y sus tests**. Cada una
arregló un bug real: el diálogo debe quedar abierto cuando el guard rechaza (se
logra lanzando, no retornando), y el sorteo manual no debe descartarse si el
guard rechaza. Ver los describes correspondientes en `TournamentWizard.test.tsx`.

### 5. Cambios de navegación

- `src/types/view.ts`: `'wizard'` → `'hub'`.
- `src/modes/nav.ts`: `VIEW_META` gana `hub: { label: 'Inicio', shortLabel: 'INICIO', icon: 'home' }` y pierde `wizard`; `root` pasa a `'hub'` para **ambos** motores.
- **`'league'` no desaparece:** sigue siendo el contenedor de las pestañas de
  competición de los modos de temporada (`target: { view: 'league', tab: … }`).
  Lo que deja de ser es la *raíz*.
- `App.tsx`: vista inicial `'hub'`; el Hub entra en el mapa `shared`, porque
  aplica a los dos motores y no necesita `currentTournament`.
- Los `onNavigate?.('wizard')` de las vistas de fase pasan a `'hub'`, y su
  etiqueta "Ir a Progreso" a "Ir al inicio".

## Qué se borra

- `src/components/tournament/TournamentWizard.tsx` (819 líneas) y su test.
- La entrada `wizard` de `VIEW_META`.

## Errores y bordes

- **Descriptor todavía sin cargar** (`useModeStore.isLoaded === false`): el Hub
  rinde `Skeleton`, sin acción.
- **Selecciones sin torneo**: `App.tsx` ya bloquea con "Cargando torneo…". La
  rama del ciclo igual debe tolerar `cycle === null` devolviendo `null`.
- **Hooks antes de los returns condicionales.** `useNextAction` se declara junto
  a los demás hooks de `App.tsx`, antes de los `return` de `initStatus` y
  `!currentTournament`. Si no, al pasar `currentTournament` de `null` a existente
  cambia la cantidad de hooks y React lanza "Rendered more hooks than during the
  previous render" — ya documentado en `App.tsx` y `TournamentWizard.tsx`.
- **Acción en vuelo**: con `isDrawing || isBatchProcessing` (ciclo) o `busy`
  (temporada), `nextAction.disabled = true`.

## Testing

- `deriveNextAction`: puro → tests de tabla, una fila por condición de las dos
  tablas de prioridad. Los casos de `mobileAction` que hoy cubre
  `TournamentWizard.test.tsx` se **migran** acá; los peldaños nuevos y toda la
  rama `season` son cobertura nueva.
- `HubView`: RTL con props literales. Un test por motor, uno de `nextAction`
  nulo, uno de cargando.
- Acciones mudadas: los describes se mueven a `QualifiersView.test.tsx` y
  `WorldCupViewEnhanced.test.tsx` **sin cambiar lo que afirman**. Si uno deja de
  existir, se perdió un arreglo.
- `deriveModeNav`: sus tests (`src/modes/__tests__/nav.test.ts`) se actualizan al
  nuevo `root`. `modoNuevo.test.ts` —"un modo nuevo sin escribir código"— debe
  seguir pasando: es el criterio de cierre de la unificación.
- Verificación con `set -o pipefail` y grep del resumen, nunca `| tail`.

## Trabajo futuro

- **Etapa 2 — Titulares.** `src/core/headlines.ts`, puro: dado un partido con
  `skillBefore`/`skillChange` (columnas que `match_history` ya guarda, para todos
  los modos), emite titulares con score de notabilidad — batacazo, goleada,
  definición agónica, cierre de fase. Llena el bloque "qué pasó recién" y
  funciona retroactivamente.
- **Etapa 3 — Resumen de fecha.** `MatchResultsModal` pasa de lista plana a tres
  bloques: titulares, movimientos de tabla, y la lista actual colapsada.
- **Bugs sueltos, revalidados sobre esta base:** `TournamentHistory.tsx:208`
  muestra el id del campeón en vez del nombre (`ContinentalView` y
  `ConfederationsCupView` ya lo resuelven bien, sirven de modelo);
  `KnockoutView.tsx:432+` tiene headers `sticky` sin `z-index` y las tarjetas los
  pisan; `MatchCenter.tsx:405` dice "Todos los partidos han sido jugados" cuando
  todavía no hay fixture.
