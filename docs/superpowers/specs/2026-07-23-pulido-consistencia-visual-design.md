# Pulido y consistencia visual

**Fecha:** 2026-07-23
**Estado:** aprobado, pendiente de plan de implementación

## Problema

La app tiene una identidad visual fuerte y deliberada — paleta arcade, `Press Start 2P` y `VT323`, sombras duras, cero `border-radius` (hay un kill global en `src/index.css`), scanlines CRT. Esa identidad se rompe en los bordes: la interfaz delega en el sistema operativo, improvisa el mismo componente varias veces con resultados distintos, y mezcla español con inglés.

Nada de esto es un bug. Es erosión: cada feature agregó su propia versión de una pieza común, y las versiones ya divergieron entre sí.

### Inventario del daño

| Síntoma | Evidencia |
|---|---|
| Diálogos del sistema operativo | 12 `confirm()` + 6 `alert()` en 6 componentes |
| `@radix-ui/react-dialog` instalado sin usar | 0 importaciones en `src/` |
| Cuatro presentaciones distintas de "cargando" | `ChampionsHistory:83`, `HistoricalStats:117`, `TeamComparison:139`, `TeamProfileModal:450` |
| Indicadores de carga circulares y suaves | `animate-spin` en las cuatro, contra el reset global de radios y la animación `steps(4)` del CSS |
| Barra de pestañas reimplementada | 10 botones en 5 vistas, con `px-4 py-3` y `px-6 py-4` mezclados |
| Encabezado de vista reimplementado | 14 `<h2>` con la misma clase; 3 ya divergen en escala responsive |
| Estados vacíos sin forma | ~12 sitios resuelven con un `<p>` gris, sin icono ni salida |
| Strings en inglés | ~14, incluido el `"World Cup"` del sidebar |
| Elipsis inconsistente | `'SIMULANDO…'` y `'Simulando...'` conviven en `MatchCenter.tsx:360` y `:520` |
| Iconos duplicados en navegación | `Globe2` para Clasificatorias y Continental; `Award` para Mundial y Confederaciones |
| Fases bloqueadas indistinguibles | El sidebar muestra Confederaciones igual de disponible que Progreso |
| **Borrado de torneo sin confirmar** | `TournamentHistory.tsx:78-80` — `handleDelete` ejecuta directo |

El último invierte la premisa del primero: hoy la app frena para sortear un torneo continental, pero no para destruir un ciclo entero.

## Objetivo

Una capa de primitivos compartidos en `src/components/ui/` que absorba estas piezas, y la migración de los call sites existentes a ella. Al terminar, agregar una vista nueva no debe requerir reinventar cómo se ve un diálogo, una carga, un vacío, una pestaña ni un encabezado.

## No objetivos

Fuera de alcance explícito, por pertenecer a otros ejes de UX:

- Rutas y URL (hoy la vista vive en `useState` en `App.tsx:48`; F5 vuelve a Progreso y el botón atrás sale de la app).
- Atajos de teclado globales.
- Búsqueda global / paleta de comandos.
- Limpieza de los 120 `console.log`.
- Auditoría de accesibilidad completa. Los primitivos nuevos sí nacen accesibles, pero no se audita el resto de la app.

## Decisiones

### 1. El diálogo se reserva para lo que destruye

**Regla:** el diálogo aparece cuando la acción **destruye trabajo existente**, no cuando **crea progreso**.

Simular una jornada o avanzar de fase escriben en la base y no se deshacen, pero construyen. Regenerar un sorteo o borrar un torneo tiran a la basura partidos ya jugados. Solo los segundos se ganan la interrupción.

Confirmar todo tiene el mismo efecto que no confirmar nada: el usuario aprende a apretar "Aceptar" sin leer, y el freno pierde significado justo donde hace falta.

### 2. Las fases bloqueadas se marcan, no se esconden

Candado y atenuadas en el sidebar, pero navegables. Adentro, un `<EmptyState>` explica qué falta para desbloquear y ofrece el botón que lleva ahí.

Deshabilitarlas impediría mirar la llave continental de un ciclo viejo. Ocultarlas haría que el menú se mueva bajo el cursor y esconde el ciclo completo a quien recién llega.

### 3. Ejecución vertical por frente

Cuatro fases mergeables por separado, cada una con `npx tsc -b` limpio y la suite en verde. Se puede frenar en cualquier corte con la app en estado coherente. Coincide con cómo viene trabajándose el repositorio.

## Diseño

### Fase 1 — Diálogos

**Componente nuevo:** `src/components/ui/ConfirmDialog.tsx`, sobre `@radix-ui/react-dialog` (ya instalado, hoy sin usar).

Radix aporta gratis lo que un `confirm()` no da y una implementación a mano suele olvidar: foco atrapado dentro del diálogo, retorno del foco al disparador al cerrar, `Escape`, y los roles ARIA correctos.

API:

```tsx
<ConfirmDialog
  open={boolean}
  onOpenChange={(open: boolean) => void}
  title={string}
  description={ReactNode}
  confirmLabel={string}       // default: 'Confirmar'
  cancelLabel={string}        // default: 'Cancelar'
  variant={'danger' | 'default'}  // default: 'default'
  onConfirm={() => void | Promise<void>}
/>
```

Con `variant="danger"` el botón de confirmar usa la variante `danger` del `Button` y el borde del panel pasa a `--color-loss`. Mientras `onConfirm` esté pendiente, el botón entra en estado `loading` (Fase 2) y el diálogo no se cierra hasta que resuelve.

Estilo: `bg-grass-dark`, `border-4 border-line`, `shadow-hard-panel`, título en `font-arcade text-xs text-gold uppercase` — los mismos tokens que `ProgressModal` ya usa.

**Migración — van a `ConfirmDialog` (5 sitios):**

| Archivo | Acción |
|---|---|
| `TournamentHistory.tsx:78` | Borrar torneo — **hoy no confirma nada, se agrega el freno** |
| `TournamentWizard.tsx:241` | Regenerar sorteo y fixtures del Mundial |
| `WorldCupViewEnhanced.tsx:126` | Regenerar playoffs |
| `TeamEditor.tsx:60` | Borrar equipo (además hay que traducirlo) |
| `FavoritesView.tsx:42` | Quitar todos los favoritos |

**Migración — pasan directo con toast (8 sitios):**

| Archivo | Acción |
|---|---|
| `TournamentWizard.tsx:67` | Generar sorteo y fixtures de clasificatorias |
| `TournamentWizard.tsx:79` | Sortear los 4 torneos continentales |
| `TournamentWizard.tsx:87` | Sortear Copa Confederaciones |
| `TournamentWizard.tsx:95` | Avanzar a clasificatorias |
| `TournamentWizard.tsx:178` | Avanzar al Mundial con sorteo automático |
| `TournamentWizard.tsx:252` | Generar dieciseisavos |
| `WorldCupViewEnhanced.tsx:113` | Generar dieciseisavos (duplicado del anterior) |
| `MatchCenter.tsx:268` | Simular jornada completa |

Dos consecuencias a resolver en esta fase:

- El `confirm()` de `MatchCenter:268` hoy transporta información real: avisa que **se simulan todos los partidos de la jornada, de todas las regiones, sin importar los filtros activos**. Al quitar el diálogo esa advertencia no se pierde: baja a texto fijo junto al botón "Simular Jornada", visible antes de apretar en vez de como interrupción después. Es además el comportamiento que ya tiene la variante "en vivo", que nunca confirmó.
- "Generar Dieciseisavos" existe en `TournamentWizard.tsx:252` y `WorldCupViewEnhanced.tsx:113` con textos distintos. Se unifica el mensaje del toast.

**Migración — los 6 `alert()` desaparecen:**

| Archivo | Destino |
|---|---|
| `TournamentSelector.tsx:24` (año inválido) | Error inline bajo el input |
| `TournamentSelector.tsx:30` (año duplicado) | Error inline bajo el input |
| `TournamentSelector.tsx:44` (fallo al crear) | `toast.error` |
| `TeamEditor.tsx:73` (fallo al borrar) | `toast.error` |
| `TeamEditor.tsx:99` (equipos refrescados) | `toast.success` |
| `TeamEditor.tsx:101` (error al refrescar) | `toast.error` |

Los dos de validación de año se vuelven inline porque el usuario está mirando el input, no el centro de la pantalla; un diálogo modal para "el año debe estar entre 2000 y 2100" lo saca del contexto donde tiene que corregir.

### Fase 2 — Carga y vacío

**Componentes nuevos** en `src/components/ui/`:

- **`Spinner.tsx`** — cuadrado, animación por pasos, en oro. Props: `size` (`sm` | `md`). Sin `border-radius` y sin interpolación suave: la app entera es de pasos discretos y el indicador de carga tiene que serlo también. Reemplaza los cuatro spinners actuales.
- **`Skeleton.tsx`** — bloques sólidos en `--color-grass` con animación `blink` atenuada. Props: `className` para dimensionar. Se usa donde la forma del contenido es previsible: las listas de `MatchHistory` y las dos pestañas de `ChampionsHistory`. Preserva el layout y evita el salto al llegar los datos.
- **`EmptyState.tsx`** — `icon`, `title`, `description`, `action?` (`{ label, onClick }`). Cubre los ~12 estados vacíos actuales.
- **`LoadingState.tsx`** — compone `Spinner` + rótulo, para las pantallas que hoy repiten `div animate-spin` + `<p>`.

**Regla de elección:** skeleton cuando se sabe qué forma tiene el contenido que viene; spinner cuando no.

**`Button` gana `loading?: boolean`.** Cuando está activo: muestra `<Spinner size="sm" />` inline antes del contenido, fuerza `disabled` y agrega `aria-busy="true"`. Ahí muere el `'SIMULANDO…'` / `'Simulando...'` de `MatchCenter`.

**Pantalla de arranque.** `App.tsx:109-120` hoy renderiza `LOADING…` en texto plano parpadeando. Pasa a una pantalla con el trofeo, una barra de progreso indeterminada y el nombre del torneo cuando ya se conoce. Es lo primero que ve el usuario de la app.

`PixelBar` no sirve tal cual: su API es `value`/`max` y con `max={0}` da cero segmentos llenos, no una animación. Hay que agregarle un modo `indeterminate` que recorra los 20 segmentos por pasos y, cuando esté activo, omita `aria-valuenow` — un `role="meter"` sin valor conocido no debe declarar uno.

**Caso nuevo — fase bloqueada.** Al hacer navegables las fases bloqueadas (decisión 2), cada vista de fase necesita un `EmptyState` cuando su fase todavía no arrancó. Ejemplo: *"Confederaciones se desbloquea cuando termine la fase continental"* con acción *"Ir a Continental"*. Aplica a `ContinentalView`, `ConfederationsCupView`, `QualifiersView` y `WorldCupViewEnhanced`. La condición de desbloqueo de cada una ya existe en `src/utils/cycleProgress.ts` (`canDrawContinental`, `canDrawConfederations`, `canAdvanceToQualifiers`, `isContinentalDrawn`, `isConfederationsDrawn`) y en `src/utils/tournamentProgress.ts` (`canAdvanceToWorldCup`); no hay que derivar lógica nueva.

### Fase 3 — Primitivos duplicados

**`Tabs.tsx`:**

```tsx
<Tabs
  items={{ id: string; label: string; icon?: LucideIcon }[]}
  value={string}
  onChange={(id: string) => void}
/>
```

Absorbe los 10 botones de `SettingsHub:41`, `HistoricalStats:150,161,172`, `WorldCupViewEnhanced:156,173`, `StatsDashboard:120,131` y `ChampionsHistory:161,172`. Fija un solo padding (se adopta `px-4 py-3`, el mayoritario) y aporta `role="tablist"` / `role="tab"` con navegación por flechas, que hoy ninguna implementación tiene.

**`ViewHeader.tsx`:**

```tsx
<ViewHeader
  icon={LucideIcon}
  title={string}
  subtitle={string?}
  actions={ReactNode?}
/>
```

Absorbe los 14 encabezados. Fija una sola escala responsive — hoy `QualifiersView:114` usa `text-base sm:text-lg` y `TournamentWizard:279` usa `text-base sm:text-xl` mientras los otros 12 usan `text-lg` fijo, así que en móvil algunos títulos se achican y otros no.

Se adopta `text-base sm:text-lg` como escala única: en móvil, `Press Start 2P` a `text-lg` desborda en los títulos largos.

Al migrar aparecen tres títulos en inglés: `WorldCupGridView.tsx:27` (`"World Cup Group Stage"`), `TournamentOverview.tsx:35` (`"Tournament Progress"`) y `KnockoutView.tsx:275` (`"Knockout Stage"`).

### Fase 4 — Sidebar y microcopy

**Agrupación** de los 13 ítems de `Sidebar.tsx:15-29`:

| Sección | Ítems |
|---|---|
| CICLO ACTUAL | Progreso · Centro de Partidos · Continental · Confederaciones · Clasificatorias · Mundial |
| ANÁLISIS | Estadísticas · Comparar · Favoritos |
| ARCHIVO | Campeones · Historial · Torneos |
| *(pie)* | Configuración |

El orden dentro de CICLO ACTUAL sigue el orden real del ciclo, que hoy no se respeta: Clasificatorias aparece antes que Continental aunque se juegue después.

Encabezados de sección en `font-arcade text-[9px] text-grass-soft uppercase`. Colapsado, los encabezados desaparecen y quedan separadores de 2px.

**Iconos únicos.** Hoy `Globe2` sirve para Clasificatorias y Continental, y `Award` para Mundial y Confederaciones — las cuatro fases del ciclo, justo las que más se confunden entre sí:

| Vista | Icono |
|---|---|
| Continental | `Globe2` |
| Clasificatorias | `Route` |
| Mundial | `Trophy` |
| Confederaciones | `Shield` |

El `Trophy` del encabezado del sidebar no cuenta como colisión: es marca, no navegación.

**Fases bloqueadas** con `Lock` en lugar de su icono y opacidad reducida, pero clickeables. La condición sale de los helpers de `cycleProgress.ts` ya citados.

**Microcopy.** Traducción de los strings en inglés:

| Archivo | String |
|---|---|
| `Sidebar.tsx:46` | `"World Cup"` → describe el ciclo completo, no solo el Mundial |
| `QualifiersView.tsx:59` | `"No tournament available"` |
| `GroupView.tsx:106` | `"Back to Regions"` |
| `WorldCupGridView.tsx:27` | `"World Cup Group Stage"` |
| `WorldCupGridView.tsx:168` | `"All matches played"` |
| `TournamentOverview.tsx:35` | `"Tournament Progress"` |
| `KnockoutView.tsx:275` | `"Knockout Stage"` |
| `TeamEditor.tsx:134` | `"Search teams..."` |
| `TeamEditor.tsx:158` | `"No teams found"` |
| `HistoricalStats.tsx:105` | `"Supabase Not Configured"` |
| `HistoricalStats.tsx:118` | `"Loading historical statistics..."` |
| `ExportImport.tsx:101` | `"Failed to import tournament"` |

Más los strings de `TeamEditor.tsx:60,73,99,101`, que ya se traducen en la Fase 1 al migrarlos.

**Elipsis:** se unifica en `…` (U+2026). Hoy `MatchCenter.tsx:360` usa `…` y `:520` usa `...` para el mismo estado.

## Verificación

Cada fase cierra con:

- `npx tsc -b` sin errores.
- `npm test` en verde. Baseline al momento de escribir este documento: **42 archivos, 311 pruebas**.

Los primitivos nuevos llevan pruebas propias con Testing Library:

- `ConfirmDialog`: confirma, cancela, cierra con `Escape`, y no cierra mientras `onConfirm` está pendiente.
- `EmptyState`: dispara el CTA cuando se le pasa `action`.
- `Tabs`: cambia de pestaña con click y con flechas; expone los roles ARIA.
- `Button`: con `loading` queda deshabilitado y expone `aria-busy`.

La migración de call sites se apoya en las pruebas de vista ya existentes: `MatchHistory`, `ContinentalView`, `ConfederationsCupView`, `Sidebar`, `TournamentWizard`, `LiveMatchModal` y `WatchLiveButton`. Nótese que **no existe** `MatchCenter.test.tsx`: lo que hay son pruebas de sus módulos puros (`matchCenterCollector`, `matchBatchSimulable`), así que la migración de `MatchCenter.tsx:268` no tiene red debajo.

Un dato que conviene tener presente: **ningún test actual toca `window.confirm`** — la búsqueda no arroja una sola aparición en los 42 archivos de prueba. O sea que las 12 acciones hoy protegidas por un `confirm()` nunca se ejercitan más allá de la guarda. Eso corta para los dos lados: nada se rompe al quitar el diálogo nativo, pero tampoco hay nada que avise si la migración cambia el comportamiento. Para los 5 sitios que pasan a `ConfirmDialog` conviene agregar una prueba por sitio que verifique que la acción **no** se ejecuta al cancelar.

Verificación manual antes del merge final: recorrer un ciclo completo en la app (sortear continental → confederaciones → clasificatorias → Mundial → playoffs) comprobando que no aparece ningún diálogo del sistema operativo, que las fases bloqueadas explican su desbloqueo, y que ninguna vista muestra texto en inglés.

## Riesgos

- **`Sidebar.test.tsx` existe** y va a romper con la reagrupación. Es esperado: hay que actualizarlo, no sortearlo.
- **La regla de confirmación es un juicio de producto.** Si al usarla resulta que perder el freno en "avanzar al Mundial" incomoda, mover ese sitio al grupo de `ConfirmDialog` es un cambio de una línea.
- **`ViewHeader` toca 14 archivos** y es la migración más ancha. Si una vista tiene un encabezado que no encaja en la API, es preferible dejarla fuera y anotarlo antes que ensanchar la API con props de un solo uso.
