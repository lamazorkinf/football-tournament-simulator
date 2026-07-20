# Responsive móvil: Handheld Shell — la app como consola portátil

**Fecha:** 2026-07-20
**Estado:** Aprobado por el usuario
**Alcance:** Capa de presentación + shell de navegación móvil + manifest PWA. Sin cambios en `core/`, `services/`, `store/` de lógica (solo se consumen acciones existentes) ni Supabase. Desktop (`lg+`) no cambia.

## Objetivo

Que usar el simulador desde el teléfono se sienta como jugar en una consola portátil, no como una página web comprimida: navegación inferior pensada para el pulgar, la acción de simular siempre alcanzable, gestos, tablas legibles en 360px y app instalable a pantalla completa. Profundiza la estética Modo Retro (spec `2026-07-20-modo-retro-ui-design.md`); no la diluye.

Flujo crítico que debe funcionar con una mano: abrir la app → ver el estado del torneo → simular una jornada → ver resultados y tabla.

## 1. Shell móvil (`<lg`)

Tres componentes nuevos en `components/ui/`. `MobileDrawer.tsx` se elimina.

### GameTabBar

Barra inferior fija, visible solo `<lg`, con 5 slots:

| Slot | Vista | Etiqueta |
|---|---|---|
| 1 | `wizard` | `HOME` |
| 2 | `matches` | `MATCH` |
| 3 | `qualifiers` | `QUALI` |
| 4 | `worldcup` | `COPA` |
| 5 | pause menu | `START` |

- Ícono (lucide, coherente con los actuales) arriba + etiqueta en Press Start 2P 10px abajo.
- Tab activa: fondo `grass`, texto blanco, borde superior 4px `gold` (el "cartucho insertado"). Inactivas: `grass-soft` sobre `grass-dark`.
- Cada tab ≥44px de alto de área táctil; la barra suma `padding-bottom: env(safe-area-inset-bottom)`.
- Feedback de presión: efecto "hundirse" coherente con `Button`.

### PauseMenu

Overlay fullscreen (reemplaza al drawer lateral; no es un panel deslizante):

- Título `⏸ PAUSE` en Press Start 2P.
- Lista de vistas secundarias con el patrón `▶` activo existente: Stats, Comparar, Campeones, History, Torneos, Configuración.
- `TournamentSelector` integrado.
- Botón `RESUME` para cerrar (además de tocar START de nuevo).
- Entrada/salida con animación `steps()`; con `prefers-reduced-motion` aparece sin animación.
- Ítems ≥44px de alto.

### Header móvil compacto

Sin hamburguesa: título del torneo + `TournamentSelector`, altura reducida respecto al header actual, `padding-top: env(safe-area-inset-top)` para notch. Sticky se mantiene.

## 2. ActionDock — la acción primaria bajo el pulgar

Franja fija encima de la `GameTabBar` (solo `<lg`) que muestra la acción primaria de la vista actual como botón `gold` full-width con el efecto "hundirse".

**API:** contexto ligero `MobileActionContext` + hook `useMobileAction({ label, onPress, disabled })`. Cada vista publica su acción en un `useEffect` (y la limpia al desmontar). Si la vista actual no publica nada, el dock no se renderiza — sin altura fantasma.

Acciones iniciales:

- **MatchCenter** → `▶ SIMULAR JORNADA` (reutiliza `handleSimulateMatchday`; respeta `isBatchProcessing`/`isSavingMatch` como estado disabled).
- **TournamentWizard** → `▶ PRESS START` cuando `canGenerateDraw` (misma acción del botón existente).
- **KnockoutView** → simular el siguiente partido pendiente de la ronda visible.

Las demás vistas no publican acción (son de lectura). El scroll del contenido reserva espacio inferior (`padding-bottom`) para que nada quede tapado por dock + tab bar.

## 3. Tablas y marcadores en pantalla angosta

### StandingsTable

- En `<sm` quedan visibles: `POS · EQUIPO · PJ · DIF · PTS` (se oculta también `W`, hoy visible). El chip de tier muestra solo el ícono en `<sm` (ya ocurre con el texto).
- Tap en una fila expande un renglón de detalle en VT323: `G-E-P · GF:GA`. Un solo renglón expandido a la vez. En `sm+` el tap no hace falta (las columnas están visibles) pero no molesta si funciona.
- Follow-up absorbido: hover/estado distintivo en filas clasificadas (hoy `hover:bg-grass/40` genérico pisa el `bg-grass/30` de clasificados).

### ScoreBug variante `narrow`

Nueva prop `size: 'narrow' | 'md' | 'lg'` (aditiva, sin romper usos existentes): layout apilado — banderas + códigos arriba, marcador LED centrado abajo — que entra cómodo en 360px. `KnockoutView` móvil y `GroupDetailModal` la adoptan.

## 4. Gestos

Swipe horizontal con Framer Motion (ya en deps), activo solo `<lg`, sobre estado ya existente — sin carousel ni librerías nuevas:

- **MatchCenter**: swipe cambia `selectedMatchday` (izquierda = siguiente, derecha = anterior). Indicador `◀ JORNADA N ▶` estilo selector de nivel; los extremos no hacen wrap.
- **QualifiersView**: swipe cambia `selectedRegion` sobre el orden de las tabs de región existentes.
- Transición del contenido en `steps()`; con `prefers-reduced-motion`, cambio instantáneo.
- El swipe no debe robar el scroll vertical: umbral de distancia + predominancia horizontal antes de disparar.

## 5. Jerarquía pixel y touch en `<sm`

Auditoría por vista con estas reglas:

- Press Start 2P nunca <10px; en `<sm` los títulos degradan un escalón (`text-xl` → `text-base`, etc.) y se reduce su cantidad de usos por pantalla.
- VT323 es el protagonista del cuerpo en móvil, mínimo `text-base`.
- Touch targets ≥44px: botones de fila (`MatchRow`), tabs de región, `TournamentSelector`, botones de modals.
- Global: `touch-action: manipulation` (elimina el delay/doble-tap zoom residual), `overscroll-behavior-y: contain` en body (mata el rebote blanco de Safari). El viewport ya tiene `user-scalable=no`; se agrega `viewport-fit=cover`.

## 6. PWA instalable (sin service worker)

- `public/manifest.webmanifest`: `name`/`short_name`, `display: standalone`, `theme_color` y `background_color: #0A0C12`, `orientation: portrait`, íconos 192/512 + maskable.
- Íconos pixel-art propios (trofeo dorado sobre `night`, estética del logo actual) + `apple-touch-icon` 180px.
- `<meta name="theme-color">` y link al manifest en `index.html`.
- Splash iOS: color de fondo + ícono (sin imágenes por dispositivo — no valen el costo).
- **Sin service worker**: la app depende de Supabase; offline no aporta y el caché de versiones viejas es un riesgo clásico. Queda como follow-up explícito si algún día se quiere.

## 7. Follow-ups del Modo Retro absorbidos

Solo los que caen en archivos que este trabajo toca:

- `Scanlines` montado también en la pantalla LOADING (App.tsx).
- Tokenizar el color de body `#e8f8e8` en `index.css`.
- Hover distintivo en filas clasificadas de `StandingsTable`.
- Variante `narrow` de `ScoreBug`.
- Borrar `WorldCupView.tsx` (código muerto; App usa `WorldCupViewEnhanced`).

Quedan fuera (ticket "retro cleanup"): spinners residuales, helpers duplicados de skill-change, `generateRightAnglePath`.

## Verificación

- **Continua, no al final**: dev server + chequeo visual en viewports 390px (iPhone) y 360px (Android) al cerrar cada tarea, validando el flujo crítico con una mano.
- `npm run build` sin errores.
- `npm run lint` sin errores nuevos sobre los 110 de base en master.
- `prefers-reduced-motion`: sin animaciones de shell, pause menu ni swipe.
- Desktop `lg+`: sin regresiones visuales (Sidebar y layout intactos).

## Criterios de éxito

- El flujo crítico completo se opera con el pulgar, sin estirar la mano al borde superior.
- Ninguna interacción táctil principal mide menos de 44px.
- La tabla de posiciones se lee de un vistazo en 360px sin scroll horizontal.
- Instalada como PWA abre fullscreen con ícono y colores retro.
- El drawer hamburguesa ya no existe en móvil.

## Fuera de alcance

- Service worker / offline.
- Sonidos y haptics (`navigator.vibrate` es casi no-op en iOS).
- Cambios de lógica, datos o estructura de información.
- Rediseño desktop.
