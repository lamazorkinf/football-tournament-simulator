# Rediseño UI/UX: Modo Retro — arcade 16 bits

**Fecha:** 2026-07-20
**Estado:** Aprobado por el usuario
**Alcance:** Solo capa de presentación. Sin cambios en `core/`, `services/`, `store/` ni Supabase.

## Objetivo

Que el Football Tournament Simulator deje de verse como un dashboard genérico y se sienta como un videojuego de fútbol arcade de los 90 (Tecmo Cup, Sensible Soccer). Un solo tema visual (noche de arcade); no habrá modo claro — decisión estética deliberada.

Mockup de referencia aprobado: propuesta 02 del dossier de rediseño (artifact "Rediseño — Football Tournament Simulator", sección "Modo Retro").

## Sistema de diseño

### Color

Tokens definidos con `@theme` en `src/index.css`, reemplazando la escala `primary` actual (verde Tailwind). Eliminar también la escala duplicada en `tailwind.config.js` si sigue presente.

| Token | Hex | Uso |
|---|---|---|
| `night` | `#0A0C12` | Fondo global |
| `grass` | `#1F6F38` | Paneles, estructura, nav activa |
| `grass-dark` | `#05270F` | Fondo de paneles de datos |
| `line` | `#2FBF5F` | Bordes de paneles |
| `gold` | `#FFD23F` | Acciones, destacados, campeón |
| `led` | `#7DFF9E` | Números, marcadores, puntos |
| `loss` | `#FF4757` | Derrotas, eliminados |
| `shadow-btn` | `#7A2B0E` | Sombra dura de botones dorados |
| `shadow-panel` | `rgba(0,0,0,.5)` | Sombra dura de paneles |

Semántica de estados: victoria/clasificado = `led`, empate/repechaje = `gold`, derrota/eliminado = `loss`.

### Tipografía

Dos fuentes, servidas localmente desde `public/fonts/` como woff2 (sin CDN):

- **Press Start 2P** — solo display: títulos, botones, navegación, marcadores, headers de tabla. Tamaño mínimo 10px, siempre con espacio generoso. Nunca en párrafos ni celdas de datos.
- **VT323** — cuerpo y datos: tablas, listas, texto corrido, tooltips. Es pixel pero alta y legible; resuelve la legibilidad en tablas densas.

En tablas y marcadores, los equipos se muestran con código FIFA de 3 letras (BRA, ARG) y el nombre completo va en tooltip reutilizando `TeamNameTooltip`. Fuera de tablas (perfiles, comparador) se permite el nombre completo en VT323.

### Componentes base

Rediseñar en su lugar (mismas props y API, solo cambia la presentación):

- **Panel/Card** (`Card.tsx`): borde sólido 4px color `line`, fondo `grass-dark`, sombra dura desplazada 6px sin blur. Sin `border-radius` en toda la app.
- **Button** (`Button.tsx`): fondo `gold`, texto oscuro, borde 4px blanco, sombra dura 4px. Hover: la sombra se reduce y el botón se desplaza hacia ella (efecto botón físico). Variante secundaria: fondo `grass`, texto blanco.
- **StandingsTable**: headers en Press Start 2P chica color `gold`; filas en VT323; puntos con ceros a la izquierda (07) en color `led`; separadores de fila de 2px `grass`.
- **Sidebar / MobileDrawer**: fondo `grass-dark`, borde derecho 4px `grass`; ítem activo con fondo `grass`, texto blanco y prefijo `▶` en `gold`; logo con text-shadow dura.
- **Marcador (score bug)**: fondo negro, dígitos `led`, borde 2px `line`, tipografía Press Start 2P.
- **Banderas** (`TeamFlag`): `image-rendering: pixelated` + contorno blanco 2px, sin bordes redondeados.
- **Modals** (`MatchResultsModal`, `ProgressModal`, `RunnersUpModal`, dialogs Radix): caja de diálogo de juego retro — borde grueso, título en Press Start 2P, cuerpo VT323.
- **Toasts** (`ToastContainer` / sonner): mismo tratamiento de caja retro, entrada con animación en pasos.
- **Scanlines**: overlay global CRT muy sutil (`repeating-linear-gradient`), componente propio montado en `App.tsx`, **desactivable desde Configuración** (persistido en `useConfigStore`).

## Aplicación por vistas

1. **Wizard/Progreso** (`TournamentWizard`): pantalla "SELECT MODE" arcade; botón principal `▶ PRESS START` para simular.
2. **Centro de Partidos** (`MatchCenter`): partidos como cartelera LED; el destacado como marcador grande.
3. **Clasificatorias** (`QualifiersView`, `GroupView`): tablas con el sistema nuevo y semántica de zonas por color.
4. **Mundial** (`WorldCupViewEnhanced`, `WorldCupGridView`, `BracketLine`): bracket con líneas pixeladas (escalonadas, sin curvas).
5. **Campeones/Historial** (`ChampionsHistory`, `TournamentHistory`, `MatchHistory`): salón "HIGH SCORES"; campeón en dorado con parpadeo.
6. **Stats/Comparar** (`StatsDashboard`, `TeamComparison`, `HistoricalStats`): barras de progreso segmentadas en bloques, no continuas.
7. **Configuración** (`SettingsHub`, `EngineSettings`): incluye el toggle de scanlines.

## Motion y accesibilidad

- Transiciones con `steps()` (movimiento discreto); parpadeo solo en el elemento activo/destacado. Framer Motion se mantiene, configurado con transiciones escalonadas.
- Todo efecto de movimiento y parpadeo respeta `prefers-reduced-motion` (se desactiva).
- Contraste AA verificado para `gold` y `led` sobre `night`/`grass-dark`.
- Focus visible: outline 2px `gold` desplazado, coherente con el estilo.
- Sonidos arcade: fuera de alcance (YAGNI).

## Estrategia de implementación

Tres fases; cada una deja la app funcionando y visualmente consistente (sin vistas a medio migrar):

1. **Fundación**: tokens de color, fuentes locales, scanlines y rediseño de los componentes base estructurales: `Button`, `Card`, `StandingsTable`, `Sidebar`, `MobileDrawer`, `TeamFlag`, `TournamentSelector`. La app entera ya queda retro a nivel estructura.
2. **Vistas principales**: Wizard, Centro de Partidos, Clasificatorias, Mundial (incluye bracket).
3. **Vistas secundarias y overlays**: Stats, Comparar, Campeones, Historial, Torneos, Configuración, y los overlays de `components/ui/` (modals, toasts, tooltips).

## Criterios de éxito

- Ninguna vista conserva la estética anterior (gris claro / tarjeta blanca / verde Tailwind).
- Las tablas densas (clasificatorias, stats) se leen sin esfuerzo a tamaño normal.
- `npm run build` y `npm run lint` pasan sin errores.
- Con `prefers-reduced-motion` activo no hay parpadeos ni animaciones.
- El toggle de scanlines funciona y persiste.

## Fuera de alcance

- Sonidos y música.
- Modo claro / theming alternativo.
- Cambios de lógica, datos o navegación.
- Rediseño de la estructura de información (las vistas y su contenido no cambian, solo su piel).
