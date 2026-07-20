# Modo Retro UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar toda la capa de presentación como un videojuego de fútbol arcade 16 bits según `docs/superpowers/specs/2026-07-20-modo-retro-ui-design.md`.

**Architecture:** Tokens de tema en `src/index.css` con `@theme` de Tailwind 4 + dos fuentes pixel locales; se rediseñan primero los componentes base de `components/ui/` y después cada vista aplica una tabla de mapeo de clases fija. Sin cambios en `core/`, `services/`, `store/` (salvo un flag de scanlines en `useConfigStore`).

**Tech Stack:** React 19, Tailwind CSS 4 (`@theme` en CSS), zustand/persist, Framer Motion (ya instalado), Vite.

## Global Constraints

- **No hay framework de tests unitarios en el proyecto** (no hay script `test` en `package.json`). El ciclo de verificación de CADA tarea es: `npm run build` (debe pasar), `npm run lint` (debe pasar) y verificación visual en `npm run dev` (http://localhost:5173). No agregar framework de tests: esto es trabajo puramente visual.
- **Sin `border-radius` en toda la app.** El Task 1 fuerza el radio global a 0; no reintroducirlo con estilos inline.
- **Press Start 2P** (`font-arcade`) solo para display: títulos, botones, nav, marcadores, headers de tabla. Tamaño mínimo 10px (`text-[10px]`). Nunca en párrafos ni celdas de datos.
- **VT323** (`font-terminal`) para todo lo demás (cuerpo, tablas, tooltips). Es la fuente por defecto del `body` desde Task 1.
- Semántica de estados: victoria/clasificado = `led` (#7DFF9E), empate/repechaje = `gold` (#FFD23F), derrota/eliminado = `loss` (#FF4757).
- Los puntos en tablas se muestran con cero a la izquierda: `String(pts).padStart(2, '0')`.
- Animaciones solo con `steps()` o la clase `.blink` de Task 1; todas quedan anuladas bajo `prefers-reduced-motion` (lo garantiza el CSS global de Task 1 — no hace falta repetirlo por componente).
- La escala `primary-*` vieja NO se toca hasta el Task 15 (limpieza final): las vistas sin migrar la siguen usando y deben seguir compilando.
- Commit al final de cada tarea con el mensaje indicado, terminando en `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

### Tabla de mapeo de clases (referencia canónica para TODAS las tareas de vistas)

| Patrón actual | Reemplazo Modo Retro |
|---|---|
| `bg-gray-50` / `bg-gray-100` (fondos de página/sección) | `bg-night` |
| `bg-white` (tarjetas/paneles) | `bg-grass-dark border-4 border-line shadow-hard-panel` |
| `border border-gray-200` / `border-gray-300` | `border-4 border-line` (paneles) o `border-2 border-grass` (subdivisiones internas) |
| `rounded-*`, `shadow-md`, `shadow-sm`, `shadow-lg` | eliminar (el radio ya es 0 global; la sombra la pone el panel) |
| `text-gray-900` / `text-gray-800` (títulos) | `font-arcade text-white text-shadow-retro` + bajar 2-3 pasos el tamaño (la pixel rinde más grande) |
| `text-gray-600` / `text-gray-500` / `text-gray-700` (secundario) | `text-grass-soft` |
| `text-primary-600` / `text-primary-700` (acento) | `text-gold` |
| `bg-primary-600 text-white` (CTA inline, no `<Button>`) | reemplazar por el componente `<Button>` de Task 3 |
| `bg-primary-50` / `bg-primary-100` (fondos suaves) | `bg-grass/30` |
| `divide-gray-200` / `border-b border-gray-*` en tablas | `border-b-2 border-grass` |
| `hover:bg-gray-100` / `hover:bg-gray-50` | `hover:bg-grass/40` |
| Números/valores destacados | `text-led font-terminal tabular-nums` |

---

### Task 1: Fuentes locales, tokens de tema y CSS global

**Files:**
- Create: `public/fonts/press-start-2p-latin.woff2`, `public/fonts/vt323-latin.woff2`
- Modify: `src/index.css` (reemplazo completo), `index.html`

**Interfaces:**
- Produces: utilidades Tailwind `bg-night`, `bg-grass`, `bg-grass-dark`, `border-line`, `text-gold`, `text-led`, `text-loss`, `text-grass-soft`, `font-arcade`, `font-terminal`, `shadow-hard-panel`, `shadow-hard-btn`, `text-shadow-retro` (clase CSS), `.blink` (clase CSS), `.scanlines` (clase CSS). Todas las tareas siguientes dependen de esto.

- [ ] **Step 1: Descargar las fuentes (subset latin) a `public/fonts/`**

```bash
cd /Users/augustoniedfeld/Desarrollo/football-tournament-simulator
mkdir -p public/fonts
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap" -o /tmp/gf.css
# La URL del bloque cuyo comentario previo es /* latin */ (el último de cada familia):
PS2P=$(grep -A5 "latin \*/" /tmp/gf.css | grep -o "https://[^)]*pressstart2p[^)]*woff2" | tail -1)
VT=$(grep -A5 "latin \*/" /tmp/gf.css | grep -o "https://[^)]*vt323[^)]*woff2" | tail -1)
curl -s "$PS2P" -o public/fonts/press-start-2p-latin.woff2
curl -s "$VT" -o public/fonts/vt323-latin.woff2
ls -la public/fonts/  # ambos archivos > 4 KB
```

- [ ] **Step 2: Reemplazar `src/index.css` completo con tokens y CSS global**

```css
@import "tailwindcss";

@font-face {
  font-family: 'Press Start 2P';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/press-start-2p-latin.woff2') format('woff2');
}
@font-face {
  font-family: 'VT323';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/vt323-latin.woff2') format('woff2');
}

@theme {
  /* Paleta Modo Retro */
  --color-night: #0a0c12;
  --color-grass: #1f6f38;
  --color-grass-dark: #05270f;
  --color-grass-soft: #6fae7d;
  --color-line: #2fbf5f;
  --color-gold: #ffd23f;
  --color-led: #7dff9e;
  --color-loss: #ff4757;

  /* Escala primary vieja: NO borrar hasta Task 15 (vistas sin migrar la usan) */
  --color-primary-50: #f0fdf4;
  --color-primary-100: #dcfce7;
  --color-primary-200: #bbf7d0;
  --color-primary-300: #86efac;
  --color-primary-400: #4ade80;
  --color-primary-500: #22c55e;
  --color-primary-600: #16a34a;
  --color-primary-700: #15803d;
  --color-primary-800: #166534;
  --color-primary-900: #14532d;
  --color-primary-950: #052e16;

  /* Tipografías */
  --font-arcade: 'Press Start 2P', monospace;
  --font-terminal: 'VT323', monospace;

  /* Sombras duras */
  --shadow-hard-panel: 6px 6px 0 rgb(0 0 0 / 0.5);
  --shadow-hard-btn: 4px 4px 0 #7a2b0e;

  /* Radio global a 0: mata todos los rounded-* existentes de una vez */
  --radius-xs: 0px;
  --radius-sm: 0px;
  --radius-md: 0px;
  --radius-lg: 0px;
  --radius-xl: 0px;
  --radius-2xl: 0px;
  --radius-3xl: 0px;
  --radius-4xl: 0px;

  --animate-slide-in: slide-in 0.3s steps(4);
}

@keyframes slide-in {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes blink {
  0%, 49% { opacity: 1; }
  50%, 100% { opacity: 0.25; }
}

@layer base {
  body {
    background-color: var(--color-night);
    color: #e8f8e8;
    font-family: var(--font-terminal);
    font-size: 1.125rem; /* VT323 es chica: base 18px */
  }
  :focus-visible {
    outline: 2px solid var(--color-gold);
    outline-offset: 2px;
    border-radius: 0;
  }
}

@utility text-shadow-retro {
  text-shadow: 3px 3px 0 var(--color-grass);
}

.blink {
  animation: blink 1s steps(1) infinite;
}

.scanlines {
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  background: repeating-linear-gradient(0deg, rgb(0 0 0 / 0.14) 0 1px, transparent 1px 3px);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Actualizar `index.html`** — cambiar `lang="en"` por `lang="es"` y `<title>football</title>` por `<title>World Cup Simulator</title>`.

- [ ] **Step 4: Verificar**

```bash
npm run build   # Expected: exit 0
npm run lint    # Expected: exit 0
```

Arrancar `npm run dev`: fondo negro azulado global, texto VT323. Las vistas todavía tienen tarjetas blancas (se migran después) — esperado.

- [ ] **Step 5: Commit**

```bash
git add public/fonts src/index.css index.html
git commit -m "feat(ui): retro theme tokens, pixel fonts and global CSS"
```

---

### Task 2: Scanlines con toggle persistido

**Files:**
- Create: `src/components/ui/Scanlines.tsx`
- Modify: `src/store/useConfigStore.ts`, `src/App.tsx`

**Interfaces:**
- Consumes: clase `.scanlines` (Task 1).
- Produces: `useConfigStore` gana `scanlines: boolean` y `toggleScanlines: () => void` (Task 14 monta el switch en Configuración); componente `<Scanlines />` montado en `App.tsx`.

- [ ] **Step 1: Agregar el flag al store** — en `src/store/useConfigStore.ts`, dentro de `ConfigStore` agregar `scanlines: boolean;` y `toggleScanlines: () => void;`, y en el `create` agregar:

```ts
      scanlines: true,

      toggleScanlines: () => set((state) => ({ scanlines: !state.scanlines })),
```

(zustand/persist hace merge superficial: usuarios existentes reciben el default `true` sin migración.)

- [ ] **Step 2: Crear `src/components/ui/Scanlines.tsx`**

```tsx
import { useConfigStore } from '../../store/useConfigStore';

export function Scanlines() {
  const scanlines = useConfigStore((s) => s.scanlines);
  if (!scanlines) return null;
  return <div className="scanlines" aria-hidden="true" />;
}
```

- [ ] **Step 3: Montar en `App.tsx`** — importar `Scanlines` y renderizar `<Scanlines />` como primer hijo dentro de `<TeamProfileProvider>`, junto a `<ProgressModal />`.

- [ ] **Step 4: Verificar** — `npm run build && npm run lint` (exit 0). En dev: scanlines visibles; en consola del navegador `localStorage` conserva `football-engine-config`.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Scanlines.tsx src/store/useConfigStore.ts src/App.tsx
git commit -m "feat(ui): CRT scanlines overlay with persisted toggle"
```

---

### Task 3: Button retro

**Files:**
- Modify: `src/components/ui/Button.tsx`

**Interfaces:**
- Consumes: tokens de Task 1.
- Produces: misma API (`variant: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'`, `size: 'sm' | 'md' | 'lg'`) — ningún consumidor cambia.

- [ ] **Step 1: Reemplazar los estilos** (la estructura del componente no cambia):

```tsx
  const baseStyles =
    'inline-flex items-center justify-center font-arcade uppercase leading-none border-4 transition-none disabled:opacity-50 disabled:cursor-not-allowed active:translate-x-1 active:translate-y-1 active:shadow-none';

  const variantStyles = {
    primary:
      'bg-gold text-night border-white shadow-hard-btn hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0_#7a2b0e]',
    secondary:
      'bg-grass text-white border-line shadow-hard-panel hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[3px_3px_0_rgb(0_0_0/0.5)]',
    outline: 'bg-transparent text-led border-line hover:bg-grass/40',
    ghost: 'bg-transparent text-grass-soft border-transparent hover:text-white hover:bg-grass/40',
    danger:
      'bg-loss text-white border-white shadow-hard-panel hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[3px_3px_0_rgb(0_0_0/0.5)]',
  };

  const sizeStyles = {
    sm: 'px-3 py-2 text-[10px]',
    md: 'px-4 py-3 text-xs',
    lg: 'px-6 py-4 text-sm',
  };
```

- [ ] **Step 2: Verificar** — `npm run build && npm run lint`; en dev, los botones de cualquier vista se ven dorados/verdes con sombra dura y "se hunden" al hover/click.

- [ ] **Step 3: Commit** — `git add src/components/ui/Button.tsx && git commit -m "feat(ui): retro arcade Button"`

---

### Task 4: Card retro

**Files:**
- Modify: `src/components/ui/Card.tsx`

**Interfaces:**
- Produces: misma API (`Card`, `CardHeader`, `CardTitle`, `CardContent`).

- [ ] **Step 1: Reemplazar clases:**
  - `Card`: `'bg-white rounded-lg shadow-md border border-gray-200'` → `'bg-grass-dark border-4 border-line shadow-hard-panel'`
  - `CardHeader`: `'px-6 py-4 border-b border-gray-200'` → `'px-6 py-4 border-b-4 border-grass'`
  - `CardTitle`: `'text-lg font-semibold text-gray-900'` → `'font-arcade text-xs text-gold uppercase leading-relaxed'`
  - `CardContent`: sin cambios (`'px-6 py-4'`).

- [ ] **Step 2: Verificar** — `npm run build && npm run lint`; toda tarjeta que use `<Card>` ya se ve como panel arcade.

- [ ] **Step 3: Commit** — `git add src/components/ui/Card.tsx && git commit -m "feat(ui): retro arcade Card"`

---

### Task 5: TeamFlag pixelada

**Files:**
- Modify: `src/components/ui/TeamFlag.tsx`

**Interfaces:**
- Produces: misma API.

- [ ] **Step 1:** En el `<img>`, agregar a `className`: `outline outline-2 outline-white` y al objeto `style`: `imageRendering: 'pixelated'`. En el fallback de texto agregar `font-arcade text-[10px]`.

- [ ] **Step 2: Verificar** — build + lint + visual: banderas nítidas "pixel" con contorno blanco.

- [ ] **Step 3: Commit** — `git add src/components/ui/TeamFlag.tsx && git commit -m "feat(ui): pixelated team flags"`

---

### Task 6: StandingsTable retro con códigos de 3 letras

**Files:**
- Modify: `src/components/ui/StandingsTable.tsx`

**Interfaces:**
- Consumes: `TeamNameTooltip` existente (leer su API en `src/components/ui/TeamNameTooltip.tsx` antes de usarla), `calculateTier`/`getTierColor` existentes (conservar la lógica, adaptar solo colores si devuelven clases claras).
- Produces: misma API (`standings`, `teams`, `highlightQualified`, `className`).

- [ ] **Step 1: Restylear la tabla** aplicando la tabla de mapeo global. Concretamente:
  - `<thead>`: `bg-gray-50` → `bg-grass-dark`; cada `<th>`: `text-xs font-medium text-gray-500 uppercase tracking-wider` → `font-arcade text-[10px] text-gold uppercase`.
  - Filas: separador `divide-gray-200` → `divide-y-2 divide-grass`; celdas `text-gray-*` → color por defecto del body; números con `tabular-nums`.
  - Columna Pts: renderizar `String(standing.points).padStart(2, '0')` con `text-led`.
  - Filas dentro de `highlightQualified` (las primeras N): agregar `text-led` en la celda de posición.
  - Nombre de equipo: reemplazar el nombre completo por `team.id.toUpperCase()` (código de 3 letras) envuelto en `TeamNameTooltip` con el nombre completo. La bandera `TeamFlag` queda igual.

- [ ] **Step 2: Verificar** — build + lint; en dev (vista Clasificatorias) la tabla se lee bien en VT323, códigos de 3 letras con tooltip al hover, puntos `07` en verde LED.

- [ ] **Step 3: Commit** — `git add src/components/ui/StandingsTable.tsx && git commit -m "feat(ui): retro standings table with FIFA codes"`

---

### Task 7: Sidebar, MobileDrawer y TournamentSelector

**Files:**
- Modify: `src/components/ui/Sidebar.tsx`, `src/components/ui/MobileDrawer.tsx`, `src/components/ui/TournamentSelector.tsx`

**Interfaces:**
- Produces: mismas APIs.

- [ ] **Step 1: Sidebar** —
  - `<aside>`: `lg:bg-white lg:border-r lg:border-gray-200` → `lg:bg-grass-dark lg:border-r-4 lg:border-grass`.
  - Header: quitar `bg-gradient-to-r from-primary-50 to-primary-100`; título año en `font-arcade text-sm text-gold text-shadow-retro`; subtítulo "World Cup" en `text-grass-soft`.
  - Botón colapsar: `bg-white border-gray-300` → `bg-grass-dark border-2 border-line text-led`.
  - Ítems de nav: inactivo `text-grass-soft hover:bg-grass/40 hover:text-white`; activo `bg-grass text-white` con prefijo `<span className="text-gold">▶ </span>` antes del label (solo cuando `isActive && !isCollapsed`). Labels en `font-arcade text-[10px] uppercase leading-relaxed`; los íconos lucide se conservan.
- [ ] **Step 2: MobileDrawer** — mismo tratamiento que Sidebar (fondo `bg-grass-dark`, ítems idénticos).
- [ ] **Step 3: TournamentSelector** — aplicar tabla de mapeo (panel `bg-grass-dark border-2 border-line`, texto por defecto, acentos `text-gold`).
- [ ] **Step 4: Verificar** — build + lint; en dev la navegación entera es arcade, el ítem activo lleva `▶` dorado; probar también el drawer en viewport móvil.
- [ ] **Step 5: Commit** — `git add src/components/ui/Sidebar.tsx src/components/ui/MobileDrawer.tsx src/components/ui/TournamentSelector.tsx && git commit -m "feat(ui): retro navigation (sidebar, drawer, selector)"`

---

### Task 8: Marco de App + Wizard "SELECT MODE"

**Files:**
- Modify: `src/App.tsx`, `src/components/tournament/TournamentWizard.tsx`

**Interfaces:**
- Consumes: `Button` (Task 3), `Card` (Task 4).

- [ ] **Step 1: App.tsx** — aplicar mapeo global: `bg-gray-50` → `bg-night` (pantalla de carga incluida), header móvil `bg-white … border-gray-200` → `bg-grass-dark border-b-4 border-grass`, footer ídem con texto `text-grass-soft`. El spinner de carga: reemplazar por texto `font-arcade text-gold blink` con `LOADING…`.
- [ ] **Step 2: TournamentWizard** — aplicar mapeo global a toda la vista. El título principal de la vista pasa a `font-arcade text-shadow-retro` con eyebrow `SELECT MODE` en `text-gold font-arcade text-[10px]`. El botón de simular jornada/avanzar usa `<Button size="lg">▶ PRESS START</Button>`.
- [ ] **Step 3: Verificar** — build + lint; dev: pantalla Progreso 100% retro, sin restos grises/blancos en esa vista.
- [ ] **Step 4: Commit** — `git add src/App.tsx src/components/tournament/TournamentWizard.tsx && git commit -m "feat(ui): retro app shell and SELECT MODE wizard"`

---

### Task 9: ScoreBug LED + MatchCenter

**Files:**
- Create: `src/components/ui/ScoreBug.tsx`
- Modify: `src/components/tournament/MatchCenter.tsx`

**Interfaces:**
- Produces: `ScoreBug` — `function ScoreBug({ homeTeam, awayTeam, homeScore, awayScore, size }: { homeTeam: Team; awayTeam: Team; homeScore: number | null; awayScore: number | null; size?: 'md' | 'lg' }): JSX.Element` (import `Team` de `src/types`). Reutilizado en Tasks 10, 11 y 13.

- [ ] **Step 1: Crear `src/components/ui/ScoreBug.tsx`**

```tsx
import type { Team } from '../../types';
import { TeamFlag } from './TeamFlag';
import { TeamNameTooltip } from './TeamNameTooltip';

interface ScoreBugProps {
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number | null;
  awayScore: number | null;
  size?: 'md' | 'lg';
}

export function ScoreBug({ homeTeam, awayTeam, homeScore, awayScore, size = 'md' }: ScoreBugProps) {
  const played = homeScore !== null && awayScore !== null;
  const digits = size === 'lg' ? 'text-2xl px-4 py-2' : 'text-base px-3 py-1.5';
  const code = size === 'lg' ? 'text-sm' : 'text-[10px]';
  return (
    <div className="flex items-center gap-3 bg-grass-dark border-4 border-line shadow-hard-panel px-4 py-3">
      <div className={`flex flex-1 items-center gap-2 font-arcade ${code}`}>
        <TeamFlag teamId={homeTeam.id} teamName={homeTeam.name} size={24} />
        <TeamNameTooltip teamName={homeTeam.name}>
          <span>{homeTeam.id.toUpperCase()}</span>
        </TeamNameTooltip>
      </div>
      <div className={`bg-black border-2 border-line font-arcade text-led tabular-nums ${digits}`}>
        {played ? `${homeScore}-${awayScore}` : 'VS'}
      </div>
      <div className={`flex flex-1 items-center justify-end gap-2 font-arcade ${code}`}>
        <TeamNameTooltip teamName={awayTeam.name}>
          <span>{awayTeam.id.toUpperCase()}</span>
        </TeamNameTooltip>
        <TeamFlag teamId={awayTeam.id} teamName={awayTeam.name} size={24} />
      </div>
    </div>
  );
}
```

Nota: antes de commitear, verificar la firma real de `TeamNameTooltip` y de `TeamFlag` en sus archivos y ajustar los props del snippet si difieren (el snippet asume `teamName`/children).

- [ ] **Step 2: MatchCenter** — aplicar mapeo global a la vista; renderizar cada partido de la lista con `<ScoreBug size="md">` y el partido destacado (si la vista tiene uno) con `size="lg"`. Los encabezados de jornada/fecha en `font-arcade text-[10px] text-gold uppercase`.
- [ ] **Step 3: Verificar** — build + lint; dev: Centro de Partidos como cartelera LED.
- [ ] **Step 4: Commit** — `git add src/components/ui/ScoreBug.tsx src/components/tournament/MatchCenter.tsx && git commit -m "feat(ui): LED ScoreBug and retro Match Center"`

---

### Task 10: Clasificatorias (QualifiersView + GroupView)

**Files:**
- Modify: `src/components/tournament/QualifiersView.tsx`, `src/components/tournament/GroupView.tsx`

**Interfaces:**
- Consumes: `StandingsTable` (Task 6), `ScoreBug` (Task 9), `Card` (Task 4), `Button` (Task 3).

- [ ] **Step 1:** Aplicar la tabla de mapeo global a ambas vistas. Selectores de región/grupo: activo `bg-grass text-white border-2 border-line`, inactivo `text-grass-soft border-2 border-transparent hover:bg-grass/40`. Listas de partidos → `ScoreBug size="md"`.
- [ ] **Step 2: Verificar** — build + lint; dev: recorrer todas las regiones y grupos, sin restos de tarjetas blancas.
- [ ] **Step 3: Commit** — `git add src/components/tournament/QualifiersView.tsx src/components/tournament/GroupView.tsx && git commit -m "feat(ui): retro qualifiers views"`

---

### Task 11: Mundial + bracket pixelado

**Files:**
- Modify: `src/components/tournament/WorldCupViewEnhanced.tsx`, `src/components/tournament/WorldCupGridView.tsx`, `src/components/tournament/BracketLine.tsx`, `src/utils/bracketLines.ts` (solo si dibuja curvas)

**Interfaces:**
- Consumes: `ScoreBug` (Task 9), `StandingsTable` (Task 6).

- [ ] **Step 1: Vistas** — mapeo global; enfrentamientos de eliminatoria con `ScoreBug`; el campeón (si ya está definido) en `font-arcade text-gold blink`.
- [ ] **Step 2: BracketLine** — las líneas conectoras pasan a estilo pixel: trazo `#2fbf5f`, `strokeWidth` 3, sin curvas (`shape-rendering="crispEdges"` en el SVG y solo segmentos horizontales/verticales — si `bracketLines.ts` genera paths con curvas/diagonales, convertirlos a escalones H/V).
- [ ] **Step 3: Verificar** — build + lint; dev: bracket completo legible, líneas rectas escalonadas verdes.
- [ ] **Step 4: Commit** — `git add src/components/tournament/WorldCupViewEnhanced.tsx src/components/tournament/WorldCupGridView.tsx src/components/tournament/BracketLine.tsx src/utils/bracketLines.ts && git commit -m "feat(ui): retro world cup views and pixel bracket"`

---

### Task 12: PixelBar + Stats y Comparador

**Files:**
- Create: `src/components/ui/PixelBar.tsx`
- Modify: `src/components/tournament/StatsDashboard.tsx`, `src/components/comparison/TeamComparison.tsx`, `src/components/tournament/HistoricalStats.tsx`

**Interfaces:**
- Produces: `PixelBar` — `function PixelBar({ value, max, color }: { value: number; max: number; color?: 'led' | 'gold' | 'loss' }): JSX.Element` — barra segmentada en 20 bloques.

- [ ] **Step 1: Crear `src/components/ui/PixelBar.tsx`**

```tsx
interface PixelBarProps {
  value: number;
  max: number;
  color?: 'led' | 'gold' | 'loss';
}

const COLOR_CLASS = { led: 'bg-led', gold: 'bg-gold', loss: 'bg-loss' } as const;

export function PixelBar({ value, max, color = 'led' }: PixelBarProps) {
  const SEGMENTS = 20;
  const filled = max > 0 ? Math.round((value / max) * SEGMENTS) : 0;
  return (
    <div
      className="flex gap-0.5 border-2 border-grass bg-black p-0.5"
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={`h-3 flex-1 ${i < filled ? COLOR_CLASS[color] : 'bg-grass-dark'}`}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2:** Aplicar mapeo global a las tres vistas y reemplazar toda barra de progreso continua (divs con `width: %` o similares) por `<PixelBar>`.
- [ ] **Step 3: Verificar** — build + lint; dev: stats y comparador con barras de bloques.
- [ ] **Step 4: Commit** — `git add src/components/ui/PixelBar.tsx src/components/tournament/StatsDashboard.tsx src/components/comparison/TeamComparison.tsx src/components/tournament/HistoricalStats.tsx && git commit -m "feat(ui): segmented PixelBar and retro stats views"`

---

### Task 13: HIGH SCORES — Campeones, Historial, Torneos

**Files:**
- Modify: `src/components/tournament/ChampionsHistory.tsx`, `src/components/tournament/TournamentHistory.tsx`, `src/components/tournament/MatchHistory.tsx`

**Interfaces:**
- Consumes: `ScoreBug` (Task 9), `Card` (Task 4).

- [ ] **Step 1: ChampionsHistory** — encabezado `HIGH SCORES` en `font-arcade text-gold text-shadow-retro`; el campeón más reciente con clase `blink`; lista de campeones como filas de tabla arcade (posición, bandera, código, año) con el mapeo global.
- [ ] **Step 2: TournamentHistory y MatchHistory** — mapeo global; resultados históricos con `ScoreBug size="md"`.
- [ ] **Step 3: Verificar** — build + lint + visual en las tres vistas.
- [ ] **Step 4: Commit** — `git add src/components/tournament/ChampionsHistory.tsx src/components/tournament/TournamentHistory.tsx src/components/tournament/MatchHistory.tsx && git commit -m "feat(ui): retro high scores and history views"`

---

### Task 14: Configuración, modals, toasts y tooltips

**Files:**
- Modify: `src/components/settings/SettingsHub.tsx`, `src/components/settings/EngineSettings.tsx`, `src/components/ui/MatchResultsModal.tsx`, `src/components/ui/ProgressModal.tsx`, `src/components/tournament/RunnersUpModal.tsx`, `src/components/ui/ToastContainer.tsx`, `src/components/ui/TeamNameTooltip.tsx`, `src/components/ui/ClickableTeamName.tsx`

**Interfaces:**
- Consumes: `useConfigStore.scanlines` / `toggleScanlines` (Task 2).

- [ ] **Step 1: Toggle de scanlines en SettingsHub** — agregar una sección "Pantalla" con:

```tsx
const scanlines = useConfigStore((s) => s.scanlines);
const toggleScanlines = useConfigStore((s) => s.toggleScanlines);
// …
<Card>
  <CardHeader><CardTitle>Pantalla</CardTitle></CardHeader>
  <CardContent>
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <span>Efecto CRT (scanlines)</span>
      <button
        role="switch"
        aria-checked={scanlines}
        onClick={toggleScanlines}
        className={`font-arcade text-[10px] px-3 py-2 border-2 ${
          scanlines ? 'bg-grass text-led border-line' : 'bg-grass-dark text-grass-soft border-grass'
        }`}
      >
        {scanlines ? 'ON' : 'OFF'}
      </button>
    </label>
  </CardContent>
</Card>
```

- [ ] **Step 2: EngineSettings** — mapeo global (inputs/sliders: `bg-grass-dark border-2 border-line`, valores en `text-led`).
- [ ] **Step 3: Modals** (los tres) — contenedor `bg-grass-dark border-4 border-line shadow-hard-panel`; título en `font-arcade text-xs text-gold uppercase`; overlay `bg-black/80`; botones ya salen de Task 3.
- [ ] **Step 4: ToastContainer** — cajas `bg-grass-dark border-4 border-line font-terminal`; éxito con borde `border-line`, error con borde `border-loss`; conserva `--animate-slide-in` (ya es `steps(4)` desde Task 1).
- [ ] **Step 5: TeamNameTooltip y ClickableTeamName** — tooltip `bg-black border-2 border-line font-terminal text-base px-2 py-1`.
- [ ] **Step 6: Verificar** — build + lint; dev: abrir un modal, disparar un toast (simular jornada), toggle de scanlines ON/OFF persiste tras recargar.
- [ ] **Step 7: Commit** — `git add src/components/settings src/components/ui/MatchResultsModal.tsx src/components/ui/ProgressModal.tsx src/components/tournament/RunnersUpModal.tsx src/components/ui/ToastContainer.tsx src/components/ui/TeamNameTooltip.tsx src/components/ui/ClickableTeamName.tsx && git commit -m "feat(ui): retro settings, modals, toasts and tooltips"`

---

### Task 15: Limpieza final y verificación de criterios de éxito

**Files:**
- Modify: `src/index.css`, `tailwind.config.js`, restos que aparezcan en el grep

- [ ] **Step 1: Buscar restos de la estética vieja**

```bash
grep -rn "bg-white\|bg-gray-50\|bg-gray-100\|text-gray-\|border-gray-\|primary-" src/ --include="*.tsx" | grep -v node_modules
```

Expected: sin resultados. Si aparecen, aplicar la tabla de mapeo global en cada uno.

- [ ] **Step 2: Eliminar la escala `primary-*`** de `@theme` en `src/index.css` (las 11 líneas `--color-primary-*`) y borrar el bloque `colors.primary` duplicado de `tailwind.config.js` (en Tailwind 4 el theme vive en CSS; dejar el archivo solo con `content` o eliminarlo si Vite no lo requiere — verificar con build).
- [ ] **Step 3: Verificación final completa**

```bash
npm run build   # exit 0
npm run lint    # exit 0
```

En dev, checklist de criterios de éxito del spec:
1. Ninguna vista conserva gris claro / tarjeta blanca / verde Tailwind.
2. Tablas de Clasificatorias y Stats legibles a tamaño normal.
3. Con "reducir movimiento" activado en el SO no hay parpadeos (`blink` queda congelado).
4. Toggle de scanlines funciona y persiste tras recargar.
5. Contraste AA: verificar `#FFD23F` y `#7DFF9E` sobre `#0A0C12` y `#05270F` en https://webaim.org/resources/contrastchecker/ (los cuatro pares superan 7:1, pero confirmar tras cualquier ajuste de paleta).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(ui): remove legacy palette and finish retro migration"
```
