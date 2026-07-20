# Responsive Móvil «Handheld Shell» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la experiencia móvil (`<lg`) en una consola portátil: tab bar inferior de juego, pause menu fullscreen, acción de simular siempre bajo el pulgar, gestos de swipe, tablas legibles en 360px y PWA instalable.

**Architecture:** Shell móvil nuevo en `components/ui/` (GameTabBar + PauseMenu + ActionDock) montado desde `App.tsx`; las vistas publican su acción primaria vía un contexto ligero (`useMobileAction`). Las vistas internas cambian poco (columnas de tabla, variante de ScoreBug, swipe sobre estado existente). Desktop (`lg+`) no cambia.

**Tech Stack:** React 19, Tailwind 4 (`@theme` en `src/index.css`), zustand, Framer Motion (ya en deps), lucide-react. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-07-20-responsive-movil-handheld-design.md`

## Global Constraints

- **Sin dependencias nuevas** en `package.json`.
- **No hay framework de tests.** Verificación por tarea: `npm run build` (exit 0) + `npx eslint <archivos tocados>` + chequeo visual en viewports 390px y 360px con `npm run dev`.
- **`npm run lint` está roto de base: 110 errores / 5 warnings en master.** Regla: cero errores NUEVOS. Los archivos nuevos deben dar 0 errores de eslint. Al editar archivos existentes, no agregar violaciones (ojo con rules-of-hooks: `TournamentWizard.tsx` tiene un early return en la línea 42 ANTES de sus hooks — cualquier hook nuevo en ese archivo va ANTES de ese early return).
- **Press Start 2P (`font-arcade`) nunca <10px** (`text-[10px]` es el piso).
- **Sin `border-radius`** (hay un kill global en `index.css`; no agregar excepciones).
- **Touch targets ≥44px** en toda interacción táctil nueva o tocada (`min-h-11` = 44px, `min-h-12` = 48px).
- **`prefers-reduced-motion`**: ya hay un kill global de animaciones en `index.css:96-102`; toda animación nueva debe ser CSS o Framer básica para que ese kill la cubra.
- **Desktop `lg+` sin cambios visuales** (Sidebar, layout, footer intactos).
- Textos UI: mantener la mezcla español/inglés existente (labels cortos de tabs en el estilo arcade: HOME, MATCH, QUALI, COPA, START).
- Commits con `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

```
index.html                                  (modif: viewport-fit, theme-color, manifest, apple-touch-icon)
public/manifest.webmanifest                 (nuevo)
public/icons/icon-192.png                   (nuevo, generado)
public/icons/icon-512.png                   (nuevo, generado)
public/icons/icon-maskable-512.png          (nuevo, generado)
public/icons/apple-touch-icon.png           (nuevo, generado)
scripts/generate-icons.mjs                  (nuevo: generador PNG sin deps)
src/index.css                               (modif: touch, overscroll, token mint, keyframes pause)
src/App.tsx                                 (modif: shell nuevo, header compacto, Scanlines en LOADING)
src/components/ui/GameTabBar.tsx            (nuevo)
src/components/ui/PauseMenu.tsx             (nuevo)
src/components/ui/ActionDock.tsx            (nuevo)
src/components/ui/MobileDrawer.tsx          (BORRAR)
src/components/tournament/WorldCupView.tsx  (BORRAR — código muerto)
src/hooks/useMobileAction.tsx               (nuevo: contexto + hook)
src/hooks/useSwipeNavigation.ts             (nuevo)
src/components/ui/StandingsTable.tsx        (modif: columnas <sm, fila expandible, hover clasificados)
src/components/ui/ScoreBug.tsx              (modif: variante narrow)
src/components/tournament/GroupDetailModal.tsx (modif: ScoreBug narrow en <sm)
src/components/tournament/MatchCenter.tsx   (modif: useMobileAction, swipe, ScoreBug narrow, touch)
src/components/tournament/TournamentWizard.tsx (modif: useMobileAction, tipografía)
src/components/tournament/KnockoutView.tsx  (modif: useMobileAction)
src/components/tournament/QualifiersView.tsx (modif: swipe regiones, touch targets, tipografía)
```

---

### Task 1: Fundamentos CSS/viewport + cleanups absorbidos

**Files:**
- Modify: `index.html`
- Modify: `src/index.css`
- Modify: `src/App.tsx` (solo la pantalla LOADING)
- Delete: `src/components/tournament/WorldCupView.tsx`

**Interfaces:**
- Consumes: —
- Produces: token `--color-mint` (#e8f8e8) disponible como `text-mint`; utilidades de safe-area vía `env()` directo en clases arbitrarias (no requiere config); baseline de lint anotado para la Task 9.

- [ ] **Step 1: Anotar el baseline de lint**

Run: `npm run lint 2>&1 | tail -3`
Expected: `✖ 115 problems (110 errors, 5 warnings)` (o similar). Guardar el número exacto — es la vara de la Task 9.

- [ ] **Step 2: Viewport con safe areas en `index.html`**

Buscar:
```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
```
Reemplazar por:
```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
    <meta name="theme-color" content="#0a0c12" />
```

- [ ] **Step 3: CSS global táctil + token mint en `src/index.css`**

En el bloque `@theme`, debajo de `--color-loss: #ff4757;`, agregar:
```css
  --color-mint: #e8f8e8;
```

En `@layer base`, reemplazar:
```css
  body {
    background-color: var(--color-night);
    color: #e8f8e8;
    font-family: var(--font-terminal);
    font-size: 1.125rem; /* VT323 es chica: base 18px */
  }
```
por:
```css
  html {
    touch-action: manipulation;
  }
  body {
    background-color: var(--color-night);
    color: var(--color-mint);
    font-family: var(--font-terminal);
    font-size: 1.125rem; /* VT323 es chica: base 18px */
    overscroll-behavior-y: contain;
  }
```

Al final del archivo (después del bloque `.scanlines`), agregar los keyframes del pause menu (los usa la Task 2):
```css
@keyframes pause-in {
  from { opacity: 0; transform: scale(1.06); }
  to { opacity: 1; transform: scale(1); }
}
.pause-in {
  animation: pause-in 0.18s steps(3);
}
```
(El kill de `prefers-reduced-motion` ya existente cubre esta animación.)

- [ ] **Step 4: Scanlines en la pantalla LOADING de `App.tsx`**

Buscar:
```tsx
  if (!currentTournament) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-night">
```
Reemplazar por:
```tsx
  if (!currentTournament) {
    return (
      <>
        <Scanlines />
        <div className="min-h-screen flex items-center justify-center bg-night">
```
y cerrar el fragmento (`</div></>`; ajustar el cierre existente).

- [ ] **Step 5: Borrar código muerto**

Run: `grep -rn "from './WorldCupView'\|from '../tournament/WorldCupView'" src/` — Expected: sin resultados (solo `WorldCupViewEnhanced` se usa).
Run: `git rm src/components/tournament/WorldCupView.tsx`

- [ ] **Step 6: Build + lint de tocados**

Run: `npm run build` — Expected: exit 0, `✓ built in …`.
Run: `npx eslint index.html src/index.css src/App.tsx 2>&1 | tail -5` — Expected: sin errores nuevos en `App.tsx` (los CSS/HTML no los procesa eslint; no debe fallar).

- [ ] **Step 7: Chequeo visual**

`npm run dev` → en 390px: la app carga igual que antes; en la pantalla LOADING (recargar con red lenta o throttling) se ven scanlines. Sin zoom con doble tap.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(mobile): fundamentos táctiles, safe viewport y cleanups retro"
```

---

### Task 2: GameTabBar + PauseMenu — el shell handheld

**Files:**
- Create: `src/components/ui/GameTabBar.tsx`
- Create: `src/components/ui/PauseMenu.tsx`
- Modify: `src/App.tsx`
- Delete: `src/components/ui/MobileDrawer.tsx`

**Interfaces:**
- Consumes: `.pause-in` (Task 1), `TournamentSelector` existente.
- Produces:
  - `GameTabBar({ currentView: View, onViewChange: (v: View) => void, onStartPress: () => void, isPauseOpen: boolean })`
  - `PauseMenu({ isOpen: boolean, onClose: () => void, currentView: View, onViewChange: (v: View) => void })`
  - `App.tsx` deja un contenedor `<div className="lg:hidden fixed inset-x-0 bottom-0 z-40">` donde la Task 3 insertará `<ActionDock />` encima de la tab bar.
  - `View` = unión de 10 strings ya usada por `Sidebar` (cada componente la redeclara localmente, patrón existente).

- [ ] **Step 1: Crear `src/components/ui/GameTabBar.tsx`**

```tsx
import { Workflow, CalendarDays, Globe2, Award, Menu } from 'lucide-react';

type View = 'wizard' | 'qualifiers' | 'worldcup' | 'stats' | 'settings' | 'history' | 'matches' | 'comparison' | 'tournaments' | 'champions';

const TABS = [
  { id: 'wizard' as View, icon: Workflow, label: 'HOME' },
  { id: 'matches' as View, icon: CalendarDays, label: 'MATCH' },
  { id: 'qualifiers' as View, icon: Globe2, label: 'QUALI' },
  { id: 'worldcup' as View, icon: Award, label: 'COPA' },
];

interface GameTabBarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  onStartPress: () => void;
  isPauseOpen: boolean;
}

export function GameTabBar({ currentView, onViewChange, onStartPress, isPauseOpen }: GameTabBarProps) {
  const tabClass = (active: boolean) =>
    `flex flex-col items-center justify-center gap-1 min-h-14 pt-2 pb-1 font-arcade text-[10px] uppercase transition-colors active:translate-y-0.5 ${
      active
        ? 'bg-grass text-white shadow-[inset_0_4px_0_var(--color-gold)]'
        : 'text-grass-soft hover:bg-grass/40'
    }`;

  return (
    <nav
      aria-label="Navegación principal"
      className="bg-grass-dark border-t-4 border-grass pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5">
        {TABS.map(({ id, icon: Icon, label }) => {
          const active = currentView === id;
          return (
            <button
              key={id}
              onClick={() => onViewChange(id)}
              className={tabClass(active)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className={`w-5 h-5 ${active ? 'text-gold' : ''}`} />
              {label}
            </button>
          );
        })}
        <button
          onClick={onStartPress}
          className={tabClass(isPauseOpen)}
          aria-expanded={isPauseOpen}
          aria-haspopup="menu"
        >
          <Menu className={`w-5 h-5 ${isPauseOpen ? 'text-gold' : ''}`} />
          START
        </button>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Crear `src/components/ui/PauseMenu.tsx`**

```tsx
import { BarChart3, GitCompare, Medal, History, Archive, Settings } from 'lucide-react';
import { TournamentSelector } from './TournamentSelector';

type View = 'wizard' | 'qualifiers' | 'worldcup' | 'stats' | 'settings' | 'history' | 'matches' | 'comparison' | 'tournaments' | 'champions';

const MENU_ITEMS = [
  { id: 'stats' as View, icon: BarChart3, label: 'Statistics' },
  { id: 'comparison' as View, icon: GitCompare, label: 'Comparar' },
  { id: 'champions' as View, icon: Medal, label: 'Campeones' },
  { id: 'history' as View, icon: History, label: 'History' },
  { id: 'tournaments' as View, icon: Archive, label: 'Torneos' },
  { id: 'settings' as View, icon: Settings, label: 'Configuración' },
];

interface PauseMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentView: View;
  onViewChange: (view: View) => void;
}

export function PauseMenu({ isOpen, onClose, currentView, onViewChange }: PauseMenuProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Menú de pausa"
      className="fixed inset-0 z-50 lg:hidden bg-night/95 pause-in flex flex-col px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
    >
      <h2 className="font-arcade text-lg text-gold text-shadow-retro text-center mb-6">⏸ PAUSE</h2>

      <div className="mb-6">
        <TournamentSelector />
      </div>

      <nav className="flex-1 overflow-y-auto space-y-2">
        {MENU_ITEMS.map(({ id, icon: Icon, label }) => {
          const active = currentView === id;
          return (
            <button
              key={id}
              onClick={() => {
                onViewChange(id);
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-4 min-h-12 font-arcade text-[10px] uppercase border-2 transition-colors ${
                active
                  ? 'bg-grass text-white border-line'
                  : 'text-grass-soft border-grass hover:bg-grass/40 hover:text-white'
              }`}
            >
              <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-gold' : ''}`} />
              <span className="truncate">
                {active && <span className="text-gold">▶ </span>}
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      <button
        onClick={onClose}
        className="mt-6 w-full min-h-12 bg-gold text-night border-4 border-white shadow-hard-btn font-arcade text-xs uppercase active:translate-x-1 active:translate-y-1 active:shadow-none"
      >
        ▶ RESUME
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Reescribir el shell móvil en `App.tsx`**

1. Imports: eliminar `import { MobileDrawer } from './components/ui/MobileDrawer';` y `import { Menu } from 'lucide-react';`. Agregar:
```tsx
import { GameTabBar } from './components/ui/GameTabBar';
import { PauseMenu } from './components/ui/PauseMenu';
```
2. Estado: reemplazar `const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);` por `const [isPauseOpen, setIsPauseOpen] = useState(false);`
3. Agregar handler debajo de `handleNavigate`:
```tsx
  const handleTabChange = (view: View) => {
    setCurrentView(view);
    setViewOptions({});
    setIsPauseOpen(false);
  };
```
4. Eliminar el bloque `{/* Mobile Drawer */}` completo (`<MobileDrawer … />`).
5. Reemplazar el header móvil completo (el bloque `<header className="lg:hidden …">…</header>`) por esta versión compacta sin hamburguesa:
```tsx
        <header className="lg:hidden bg-grass-dark border-b-4 border-grass sticky top-0 z-30 pt-[env(safe-area-inset-top)]">
          <div className="px-4 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="font-arcade text-xs text-white text-shadow-retro truncate">
                {currentTournament.name}
              </h1>
            </div>
            <div className="flex-shrink-0">
              <TournamentSelector />
            </div>
          </div>
        </header>
```
6. En el div de contenido (`<div className={\`transition-all duration-300 …\`}>`) agregar padding inferior móvil para que nada quede tapado por dock + tab bar: la className queda
```tsx
      <div className={`transition-all duration-300 pb-36 lg:pb-0 ${isCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
```
7. Antes del cierre de `</TeamProfileProvider>` (después del div de contenido), montar el shell inferior y el pause menu:
```tsx
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-40">
        <GameTabBar
          currentView={currentView}
          onViewChange={handleTabChange}
          onStartPress={() => setIsPauseOpen((v) => !v)}
          isPauseOpen={isPauseOpen}
        />
      </div>
      <PauseMenu
        isOpen={isPauseOpen}
        onClose={() => setIsPauseOpen(false)}
        currentView={currentView}
        onViewChange={(view) => setCurrentView(view)}
      />
```

- [ ] **Step 4: Borrar el drawer**

Run: `git rm src/components/ui/MobileDrawer.tsx`
Run: `grep -rn "MobileDrawer" src/` — Expected: sin resultados.

- [ ] **Step 5: Build + lint**

Run: `npm run build` — Expected: exit 0.
Run: `npx eslint src/components/ui/GameTabBar.tsx src/components/ui/PauseMenu.tsx src/App.tsx` — Expected: 0 errores.

- [ ] **Step 6: Chequeo visual (390px y 360px)**

- Tab bar abajo con 5 slots, activa con franja dorada superior; tap navega; START abre el pause fullscreen con `⏸ PAUSE`, selector, 6 ítems y RESUME.
- Header compacto sin hamburguesa. En desktop (1280px): Sidebar intacto, sin tab bar, sin dock.
- En 360px las 5 etiquetas entran sin wrap (labels de 4-5 chars a 10px).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(mobile): shell handheld con GameTabBar y PauseMenu, adiós drawer"
```

---

### Task 3: ActionDock + useMobileAction — la acción bajo el pulgar

**Files:**
- Create: `src/hooks/useMobileAction.tsx`
- Create: `src/components/ui/ActionDock.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/tournament/MatchCenter.tsx`
- Modify: `src/components/tournament/TournamentWizard.tsx`
- Modify: `src/components/tournament/KnockoutView.tsx`

**Interfaces:**
- Consumes: contenedor inferior fijo de Task 2; `handleSimulateMatchday`, `isBatchProcessing`, `isSavingMatch`, `unplayedMatches` (MatchCenter); `generateDrawAndFixtures` (Wizard); `handleSimulate`, `knockout`, `isSavingMatch` (KnockoutView).
- Produces:
  - `useMobileAction(action: { label: string; onPress: () => void; disabled?: boolean } | null): void` — hook que publica/limpia la acción.
  - `MobileActionProvider({ children })` y `useMobileActionValue(): MobileAction | null` (consumido solo por ActionDock).
  - `ActionDock()` — se renderiza a sí mismo solo si hay acción.

- [ ] **Step 1: Crear `src/hooks/useMobileAction.tsx`**

Diseño anti-loop: `onPress` vive en un ref (no dispara el efecto); el efecto depende solo de `label`/`disabled`; el `setAction` de `useState` es estable.

```tsx
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface MobileAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

const MobileActionContext = createContext<{
  action: MobileAction | null;
  setAction: (a: MobileAction | null) => void;
} | null>(null);

export function MobileActionProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<MobileAction | null>(null);
  return (
    <MobileActionContext.Provider value={{ action, setAction }}>
      {children}
    </MobileActionContext.Provider>
  );
}

export function useMobileActionValue(): MobileAction | null {
  const ctx = useContext(MobileActionContext);
  return ctx?.action ?? null;
}

export function useMobileAction(action: MobileAction | null): void {
  const ctx = useContext(MobileActionContext);
  const setAction = ctx?.setAction;
  const onPressRef = useRef<(() => void) | undefined>(action?.onPress);
  onPressRef.current = action?.onPress;

  const label = action?.label ?? null;
  const disabled = action?.disabled ?? false;

  useEffect(() => {
    if (!setAction) return;
    if (label === null) {
      setAction(null);
      return;
    }
    setAction({ label, disabled, onPress: () => onPressRef.current?.() });
    return () => setAction(null);
  }, [setAction, label, disabled]);
}
```

- [ ] **Step 2: Crear `src/components/ui/ActionDock.tsx`**

```tsx
import { useMobileActionValue } from '../../hooks/useMobileAction';
import { Button } from './Button';

export function ActionDock() {
  const action = useMobileActionValue();
  if (!action) return null;

  return (
    <div className="px-3 py-2 bg-night/90 border-t-2 border-grass">
      <Button
        variant="primary"
        size="lg"
        className="w-full min-h-12 text-xs"
        onClick={action.onPress}
        disabled={action.disabled}
      >
        {action.label}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Montar provider y dock en `App.tsx`**

1. Imports:
```tsx
import { ActionDock } from './components/ui/ActionDock';
import { MobileActionProvider } from './hooks/useMobileAction';
```
2. Envolver: dentro de `<TeamProfileProvider>`, envolver todo el contenido existente con `<MobileActionProvider>…</MobileActionProvider>`.
3. En el contenedor inferior fijo de Task 2, insertar el dock ANTES de la tab bar:
```tsx
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-40">
        <ActionDock />
        <GameTabBar … />
      </div>
```

- [ ] **Step 4: Publicar acción en `MatchCenter.tsx`**

1. Import: `import { useMobileAction } from '../../hooks/useMobileAction';`
2. Inmediatamente DESPUÉS de la definición de `handleSimulateMatchday` (que termina cerca de la línea 265) agregar:
```tsx
  useMobileAction({
    label: isBatchProcessing ? 'SIMULANDO…' : '▶ SIMULAR JORNADA',
    onPress: handleSimulateMatchday,
    disabled: unplayedMatches.length === 0 || isSavingMatch || isBatchProcessing,
  });
```
(MatchCenter no tiene early returns antes de este punto; el hook queda incondicional.)

- [ ] **Step 5: Publicar acción en `TournamentWizard.tsx` — CUIDADO con el early return de la línea 42**

El archivo hace `if (!currentTournament) return null;` ANTES de sus hooks (violación pre-existente). Para no agregar una violación nueva, nuestro hook va ANTES de ese early return, y `handleGenerateDraw` se mueve arriba con guard:

1. Import: `import { useMobileAction } from '../../hooks/useMobileAction';`
2. Mover la definición completa de `handleGenerateDraw` (líneas 81-96) para que quede después de los `useState` (línea 40) y antes del `if (!currentTournament)`, agregándole el guard en la primera línea del cuerpo:
```tsx
  const handleGenerateDraw = () => {
    if (!currentTournament) return;
    const hasOriginalSkills = currentTournament.originalSkills &&
      Object.keys(currentTournament.originalSkills).length > 0;
    // … resto del cuerpo idéntico al actual …
  };
```
3. Inmediatamente después de `handleGenerateDraw` (y todavía antes del early return) agregar:
```tsx
  useMobileAction(
    currentTournament && !currentTournament.hasAnyMatchPlayed
      ? { label: '▶ PRESS START', onPress: handleGenerateDraw }
      : null
  );
```
4. Verificar que `const canGenerateDraw = !currentTournament.hasAnyMatchPlayed;` (línea 63) y el botón `▶ PRESS START` del StepCard quedan como están (desktop no cambia).

- [ ] **Step 6: Publicar acción en `KnockoutView.tsx`**

1. Import: `import { useMobileAction } from '../../hooks/useMobileAction';`
2. Después de la definición de `handleSimulate` (termina en la línea ~212) y ANTES del return condicional de la celebración (`if (tournamentComplete && showCelebration…`), agregar:
```tsx
  const nextPendingMatch = [
    ...knockout.roundOf32,
    ...knockout.roundOf16,
    ...knockout.quarterFinals,
    ...knockout.semiFinals,
    ...(knockout.thirdPlace ? [knockout.thirdPlace] : []),
    ...(knockout.final ? [knockout.final] : []),
  ].find((m) => !m.isPlayed && m.homeTeamId && m.awayTeamId);

  useMobileAction(
    nextPendingMatch
      ? {
          label: isSavingMatch ? 'GUARDANDO…' : '▶ SIMULAR PARTIDO',
          onPress: () => handleSimulate(nextPendingMatch.id),
          disabled: isSavingMatch,
        }
      : null
  );
```

- [ ] **Step 7: Build + lint**

Run: `npm run build` — Expected: exit 0.
Run: `npx eslint src/hooks/useMobileAction.tsx src/components/ui/ActionDock.tsx src/App.tsx src/components/tournament/MatchCenter.tsx src/components/tournament/TournamentWizard.tsx src/components/tournament/KnockoutView.tsx 2>&1 | tail -20`
Expected: los archivos nuevos con 0 errores; en los existentes, mismos errores que en master (comparar con `git stash && npx eslint <archivo> && git stash pop` si hay duda). Cero errores `react-hooks/rules-of-hooks` NUEVOS.

- [ ] **Step 8: Chequeo visual (390px)**

- En MATCH: dock `▶ SIMULAR JORNADA` visible sobre la tab bar; tap simula (aparece confirm + modal de resultados); durante el batch muestra `SIMULANDO…` deshabilitado.
- En HOME con torneo virgen: dock `▶ PRESS START`. En vistas de lectura (Stats): sin dock, sin hueco.
- El final del contenido de cada vista no queda tapado (pb-36 del shell).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(mobile): ActionDock contextual con useMobileAction en las tres vistas de acción"
```

---

### Task 4: StandingsTable móvil — columnas priorizadas + fila expandible

**Files:**
- Modify: `src/components/ui/StandingsTable.tsx`

**Interfaces:**
- Consumes: — (API pública `StandingsTableProps` no cambia)
- Produces: en `<sm` la tabla muestra POS·EQUIPO·PJ·DIF·PTS; tap en fila alterna un renglón de detalle `G-E-P · GF:GA`.

- [ ] **Step 1: Estado de expansión + import**

Agregar como primera línea del archivo (hoy no importa nada de React):
```tsx
import { Fragment, useState } from 'react';
```
Dentro del componente, después de `const sortedStandings = …`:
```tsx
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
```

- [ ] **Step 2: Ocultar W en `<sm`**

En el `<th title="Won">`: cambiar `className={thBase}` por `className={cn(thBase, 'hidden sm:table-cell')}`.
En la celda correspondiente `<td className={tdBase}>{standing.won}</td>`: cambiar a `className={cn(tdBase, 'hidden sm:table-cell')}`.

- [ ] **Step 3: Fila clickeable + hover distintivo de clasificados**

Envolver cada `<tr>` del map y su fila de detalle en un `<Fragment key={standing.teamId}>` (mover el `key` del `<tr>` al Fragment). El `<tr>` principal queda:
```tsx
              <tr
                onClick={() =>
                  setExpandedTeamId(expandedTeamId === standing.teamId ? null : standing.teamId)
                }
                className={cn(
                  'transition-colors cursor-pointer sm:cursor-default',
                  isQualified ? 'bg-grass/30 hover:bg-led/20' : 'hover:bg-grass/40'
                )}
              >
```
Y justo después del `</tr>` principal, el renglón de detalle (solo móvil):
```tsx
              {expandedTeamId === standing.teamId && (
                <tr className="sm:hidden bg-black/40">
                  <td colSpan={10} className="px-4 py-2 font-terminal text-base text-grass-soft">
                    G-E-P:{' '}
                    <span className="text-white tabular-nums">
                      {standing.won}-{standing.drawn}-{standing.lost}
                    </span>
                    {' · '}GF:GA:{' '}
                    <span className="text-white tabular-nums">
                      {standing.goalsFor}:{standing.goalsAgainst}
                    </span>
                  </td>
                </tr>
              )}
```

- [ ] **Step 4: Build + lint**

Run: `npm run build` — Expected: exit 0.
Run: `npx eslint src/components/ui/StandingsTable.tsx` — Expected: 0 errores.

- [ ] **Step 5: Chequeo visual (360px)**

En QUALI → un grupo: la tabla muestra Pos/Team/P/GD/Pts sin scroll horizontal; tap en una fila abre el renglón `G-E-P · GF:GA`; tap de nuevo lo cierra; filas clasificadas se distinguen en reposo y en hover. Desktop: sin cambios salvo el hover de clasificados.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/StandingsTable.tsx
git commit -m "feat(mobile): StandingsTable con columnas priorizadas y fila expandible"
```

---

### Task 5: ScoreBug `narrow` + adopción

**Files:**
- Modify: `src/components/ui/ScoreBug.tsx`
- Modify: `src/components/tournament/GroupDetailModal.tsx`
- Modify: `src/components/tournament/MatchCenter.tsx` (MatchRow)

**Interfaces:**
- Consumes: `ScoreBugProps` existente.
- Produces: `size?: 'narrow' | 'md' | 'lg'` (aditivo). Nota consciente: el spec nombraba también a `KnockoutView` como adoptante, pero su `MatchCard` ya usa un layout apilado propio con highlight de ganador y penales que la variante narrow empobrecería — no se toca (documentado aquí como desviación del spec).

- [ ] **Step 1: Variante narrow en `ScoreBug.tsx`**

Cambiar el tipo: `size?: 'narrow' | 'md' | 'lg';` y agregar al inicio del cuerpo del componente (antes del return actual):
```tsx
  if (size === 'narrow') {
    return (
      <div className="bg-grass-dark border-4 border-line shadow-hard-panel px-3 py-2 space-y-2 w-full">
        <div className="flex items-center justify-between gap-2 font-arcade text-[10px]">
          <span className="flex items-center gap-2 min-w-0">
            <TeamFlag teamId={homeTeam.id} teamName={homeTeam.name} flagUrl={homeTeam.flag} size={24} />
            <TeamNameTooltip teamName={homeTeam.name}>
              <span>{homeTeam.id.toUpperCase()}</span>
            </TeamNameTooltip>
          </span>
          <span className="flex items-center gap-2 min-w-0">
            <TeamNameTooltip teamName={awayTeam.name}>
              <span>{awayTeam.id.toUpperCase()}</span>
            </TeamNameTooltip>
            <TeamFlag teamId={awayTeam.id} teamName={awayTeam.name} flagUrl={awayTeam.flag} size={24} />
          </span>
        </div>
        <div className="bg-black border-2 border-line font-arcade text-led tabular-nums text-center text-xl py-1">
          {played ? `${homeScore}-${awayScore}` : 'VS'}
        </div>
      </div>
    );
  }
```
(`played` ya está calculado arriba; las constantes `flagSize/digits/code` existentes solo aplican a md/lg.)

- [ ] **Step 2: Adopción en `MatchCenter.tsx` (MatchRow)**

En `MatchRow`, reemplazar el `<ScoreBug size="md" … />` por render dual responsive:
```tsx
            <>
              <div className="w-full sm:hidden">
                <ScoreBug
                  size="narrow"
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                  homeScore={match.isPlayed ? match.homeScore : null}
                  awayScore={match.isPlayed ? match.awayScore : null}
                />
              </div>
              <div className="hidden sm:block">
                <ScoreBug
                  size="md"
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                  homeScore={match.isPlayed ? match.homeScore : null}
                  awayScore={match.isPlayed ? match.awayScore : null}
                />
              </div>
            </>
```

- [ ] **Step 3: Adopción en `GroupDetailModal.tsx`**

1. Import: `import { ScoreBug } from '../ui/ScoreBug';`
2. En el map de partidos, envolver el contenido actual de la caja del partido: el cluster existente (home + score + away) pasa a estar oculto en `<sm` y se agrega el narrow para móvil. La caja queda:
```tsx
                          <div
                            key={match.id}
                            className="bg-grass-dark border-2 border-grass p-3 hover:bg-grass/20 transition-colors"
                          >
                            <div className="sm:hidden space-y-2">
                              <ScoreBug
                                size="narrow"
                                homeTeam={homeTeam}
                                awayTeam={awayTeam}
                                homeScore={match.isPlayed ? match.homeScore : null}
                                awayScore={match.isPlayed ? match.awayScore : null}
                              />
                              {!match.isPlayed && onSimulate && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => onSimulate(match.id)}
                                  className="w-full min-h-11"
                                >
                                  Simular
                                </Button>
                              )}
                            </div>
                            <div className="hidden sm:flex items-center justify-between">
                              {/* …aquí va, SIN cambios, el contenido actual: home team, score, away team y botón Simular… */}
                            </div>
                          </div>
```

- [ ] **Step 4: Build + lint**

Run: `npm run build` — Expected: exit 0.
Run: `npx eslint src/components/ui/ScoreBug.tsx src/components/tournament/GroupDetailModal.tsx src/components/tournament/MatchCenter.tsx` — Expected: sin errores nuevos.

- [ ] **Step 5: Chequeo visual (360px)**

MATCH: cada partido pendiente muestra el marcador apilado (equipos arriba, LED abajo) sin desborde. Grupo del Mundial (grid → modal): partidos en narrow con botón Simular full-width. En `sm+`: idéntico a antes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(mobile): variante narrow de ScoreBug en MatchCenter y GroupDetailModal"
```

---

### Task 6: Gestos de swipe — jornadas y regiones

**Files:**
- Create: `src/hooks/useSwipeNavigation.ts`
- Modify: `src/components/tournament/MatchCenter.tsx`
- Modify: `src/components/tournament/QualifiersView.tsx`

**Interfaces:**
- Consumes: `handlePrevMatchday`/`handleNextMatchday` y `selectedMatchday` (MatchCenter); `selectedRegion`/`setSelectedRegion` (QualifiersView).
- Produces: `useSwipeNavigation(onPrev: () => void, onNext: () => void): { onTouchStart; onTouchEnd }` — props para spread en cualquier contenedor.

- [ ] **Step 1: Crear `src/hooks/useSwipeNavigation.ts`**

Umbral 48px + predominancia horizontal 1.5× para no robar el scroll vertical:
```ts
import { useRef } from 'react';
import type { TouchEvent } from 'react';

interface SwipeHandlers {
  onTouchStart: (e: TouchEvent<HTMLElement>) => void;
  onTouchEnd: (e: TouchEvent<HTMLElement>) => void;
}

export function useSwipeNavigation(onPrev: () => void, onNext: () => void): SwipeHandlers {
  const start = useRef<{ x: number; y: number } | null>(null);

  return {
    onTouchStart: (e) => {
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    },
    onTouchEnd: (e) => {
      if (!start.current) return;
      const dx = e.changedTouches[0].clientX - start.current.x;
      const dy = e.changedTouches[0].clientY - start.current.y;
      start.current = null;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) onNext();
      else onPrev();
    },
  };
}
```

- [ ] **Step 2: Swipe de jornadas en `MatchCenter.tsx`**

1. Import: `import { useSwipeNavigation } from '../../hooks/useSwipeNavigation';`
2. Junto a los handlers existentes (después de `handleNextMatchday`):
```tsx
  const swipeHandlers = useSwipeNavigation(handlePrevMatchday, handleNextMatchday);
```
3. Spread en el contenedor del layout de dos columnas y re-animación por jornada:
```tsx
      <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] gap-6" {...swipeHandlers}>
```
y en el `<Card className="flex flex-col">` de Próximos Partidos, agregar `key={String(selectedMatchday)}` y sumar la clase `animate-slide-in lg:animate-none` para que el cambio de jornada entre con el step existente.
4. Indicador de nivel solo móvil: encima de ese grid (antes del div), agregar:
```tsx
      {availableMatchdays.length > 0 && (
        <div className="sm:hidden flex items-center justify-center gap-4">
          <button
            onClick={handlePrevMatchday}
            disabled={selectedMatchday === 'all' || selectedMatchday === availableMatchdays[0]}
            className="min-h-11 min-w-11 flex items-center justify-center text-gold disabled:opacity-30 font-arcade text-sm"
            aria-label="Jornada anterior"
          >
            ◀
          </button>
          <span className="font-arcade text-[10px] text-gold uppercase min-w-[100px] text-center">
            {selectedMatchday === 'all' ? 'Todas' : `Jornada ${selectedMatchday}`}
          </span>
          <button
            onClick={handleNextMatchday}
            disabled={selectedMatchday === availableMatchdays[availableMatchdays.length - 1]}
            className="min-h-11 min-w-11 flex items-center justify-center text-gold disabled:opacity-30 font-arcade text-sm"
            aria-label="Jornada siguiente"
          >
            ▶
          </button>
        </div>
      )}
```

- [ ] **Step 3: Swipe de regiones en `QualifiersView.tsx`**

1. Import: `import { useSwipeNavigation } from '../../hooks/useSwipeNavigation';`
2. Después de `const regions: Region[] = […]` (línea 46) definir el orden con 'all' primero y los handlers:
```tsx
  const regionOrder: (Region | 'all')[] = ['all', ...regions];
  const regionIndex = regionOrder.indexOf(selectedRegion);
  const swipeHandlers = useSwipeNavigation(
    () => {
      if (regionIndex > 0) setSelectedRegion(regionOrder[regionIndex - 1]);
    },
    () => {
      if (regionIndex < regionOrder.length - 1) setSelectedRegion(regionOrder[regionIndex + 1]);
    }
  );
```
ATENCIÓN rules-of-hooks: QualifiersView tiene early returns en las líneas 38 (`!currentTournament`) y 53 (`selectedGroup`). `useSwipeNavigation` solo usa `useRef`, pero igual debe llamarse ANTES de esos early returns: colocar el bloque anterior junto a los `useState` del tope del componente (las constantes `regions`/`regionOrder` pueden declararse ahí también; no dependen del torneo).
3. Spread + animación en el contenedor de la lista de regiones:
```tsx
      <div className="space-y-6 animate-slide-in lg:animate-none" key={selectedRegion} {...swipeHandlers}>
```
(el div que hace `{filteredRegions.map(…)}`).
4. Indicador móvil arriba de esa lista:
```tsx
      <div className="sm:hidden flex items-center justify-center gap-4">
        <button
          onClick={() => regionIndex > 0 && setSelectedRegion(regionOrder[regionIndex - 1])}
          disabled={regionIndex === 0}
          className="min-h-11 min-w-11 flex items-center justify-center text-gold disabled:opacity-30 font-arcade text-sm"
          aria-label="Región anterior"
        >
          ◀
        </button>
        <span className="font-arcade text-[10px] text-gold uppercase min-w-[100px] text-center">
          {selectedRegion === 'all' ? 'Todas' : selectedRegion}
        </span>
        <button
          onClick={() => regionIndex < regionOrder.length - 1 && setSelectedRegion(regionOrder[regionIndex + 1])}
          disabled={regionIndex === regionOrder.length - 1}
          className="min-h-11 min-w-11 flex items-center justify-center text-gold disabled:opacity-30 font-arcade text-sm"
          aria-label="Región siguiente"
        >
          ▶
        </button>
      </div>
```

- [ ] **Step 4: Build + lint**

Run: `npm run build` — Expected: exit 0.
Run: `npx eslint src/hooks/useSwipeNavigation.ts src/components/tournament/MatchCenter.tsx src/components/tournament/QualifiersView.tsx` — Expected: sin errores nuevos (hook nuevo: 0).

- [ ] **Step 5: Chequeo visual (390px, con emulación táctil)**

MATCH: swipe izquierda avanza jornada, derecha retrocede, con animación en pasos; el scroll vertical no se ve afectado; el indicador ◀ JORNADA N ▶ responde al tap. QUALI: swipe recorre Todas → Europe → America → Africa → Asia sin wrap. Con `prefers-reduced-motion`: cambio instantáneo.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(mobile): swipe entre jornadas y regiones con indicador de nivel"
```

---

### Task 7: Jerarquía pixel + touch targets en `<sm`

**Files:**
- Modify: `src/components/ui/Button.tsx`
- Modify: `src/components/tournament/QualifiersView.tsx`
- Modify: `src/components/tournament/MatchCenter.tsx`
- Modify: `src/components/tournament/TournamentWizard.tsx`
- Modify: `src/components/tournament/GroupDetailModal.tsx`

**Interfaces:**
- Consumes: — (solo clases)
- Produces: botones `sm`/`md` con altura táctil mínima en `<lg`; títulos arcade degradados un escalón en `<sm`.

- [ ] **Step 1: Altura táctil mínima en `Button.tsx`**

En `sizeStyles`, dar piso táctil en pantallas touch (proxy: `<lg`) sin tocar desktop:
```tsx
  const sizeStyles = {
    sm: 'px-3 py-2 text-[10px] min-h-11 lg:min-h-0',
    md: 'px-4 py-3 text-xs min-h-11 lg:min-h-0',
    lg: 'px-6 py-4 text-sm min-h-12 lg:min-h-0',
  };
```

- [ ] **Step 2: Verificación global de piso tipográfico**

Run: `grep -rn "text-\[[0-9]px\]\|text-\[[0-9]\.[0-9]*px\]" src/ | grep -v "text-\[10px\]"`
Expected: sin resultados (nada de Press Start 2P por debajo de 10px). Si aparece alguno, subirlo a `text-[10px]`.

- [ ] **Step 3: `QualifiersView.tsx` — tabs de región táctiles + título**

- En los DOS botones de filtro de región (el de "Todas las regiones" y el del map), cambiar `px-4 py-2` por `px-4 py-2 min-h-11`.
- Título: `<h2 className="font-arcade text-lg …">` → `text-base sm:text-lg`.

- [ ] **Step 4: `MatchCenter.tsx` — selects y chevrons táctiles**

- Los dos `<select>` (región y stage): cambiar `px-3 py-2` por `px-3 py-2 min-h-11`.
- Los dos botones de paginación de jornada del bloque desktop (líneas ~448-466): cambiar `p-1` por `p-2.5`.

- [ ] **Step 5: `TournamentWizard.tsx` — título y paddings**

- `<h2 className="font-arcade text-xl …">Progreso del Torneo</h2>` → `text-base sm:text-xl`.
- El contenedor de steps `<div className="p-6 space-y-6">` → `p-4 sm:p-6 space-y-4 sm:space-y-6`.

- [ ] **Step 6: `GroupDetailModal.tsx` — botón de cierre táctil**

El botón X del header: `p-1` → `p-2.5` (44px con el ícono de 20px).

- [ ] **Step 7: Build + lint + visual**

Run: `npm run build` — Expected: exit 0.
Run: `npx eslint src/components/ui/Button.tsx src/components/tournament/QualifiersView.tsx src/components/tournament/MatchCenter.tsx src/components/tournament/TournamentWizard.tsx src/components/tournament/GroupDetailModal.tsx` — Expected: sin errores nuevos.
Visual 360px: ningún botón/tab por debajo de 44px (verificar con el inspector); títulos arcade sin desbordes; desktop sin cambios de altura visibles en botones (`lg:min-h-0`).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(mobile): touch targets 44px+ y jerarquía pixel en pantallas chicas"
```

---

### Task 8: PWA instalable (manifest + íconos, sin service worker)

**Files:**
- Create: `scripts/generate-icons.mjs`
- Create: `public/manifest.webmanifest`
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`, `public/icons/apple-touch-icon.png` (generados por el script y commiteados)
- Modify: `index.html`

**Interfaces:**
- Consumes: paleta retro (night `#0a0c12`, gold `#ffd23f`, line `#2fbf5f`, white, shadow `#7a2b0e`).
- Produces: app instalable standalone. El script queda en el repo para regenerar íconos.

- [ ] **Step 1: Crear `scripts/generate-icons.mjs`** (encoder PNG mínimo con `node:zlib`, sin dependencias)

```js
// Genera los íconos PWA pixel-art (trofeo retro) sin dependencias externas.
// Uso: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const NIGHT = [10, 12, 18];
const PALETTE = {
  '.': NIGHT,            // fondo
  G: [255, 210, 63],     // gold
  D: [122, 43, 14],      // sombra
  W: [255, 255, 255],    // blanco
  L: [47, 191, 95],      // line
};

// Trofeo 16x16
const ART = [
  '................',
  '..WWWWWWWWWWWW..',
  '..WGGGGGGGGGGW..',
  '.LWGGGGGGGGGGWL.',
  '.LWGGGGGGGGGGWL.',
  '..WGGGGGGGGGGW..',
  '..WGGGGGGGGGGW..',
  '...WGGGGGGGGW...',
  '....WGGGGGGW....',
  '.....WGGGGW.....',
  '......WGGW......',
  '......WGGW......',
  '.....WGGGGW.....',
  '....WGGGGGGW....',
  '...WGGDDDDGGW...',
  '................',
];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixelAt) {
  // pixelAt(x, y) -> [r, g, b]
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filtro None
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixelAt(x, y);
      const off = y * (size * 3 + 1) + 1 + x * 3;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function renderIcon(size, artScaleRatio) {
  // artScaleRatio: fracción del lado que ocupa el arte (1 = borde a borde)
  const artPx = Math.floor((size * artScaleRatio) / 16) * 16;
  const scale = artPx / 16;
  const offset = Math.floor((size - artPx) / 2);
  return encodePng(size, (x, y) => {
    const ax = Math.floor((x - offset) / scale);
    const ay = Math.floor((y - offset) / scale);
    if (ax < 0 || ax > 15 || ay < 0 || ay > 15) return NIGHT;
    return PALETTE[ART[ay][ax]];
  });
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', renderIcon(192, 1));
writeFileSync('public/icons/icon-512.png', renderIcon(512, 1));
// maskable: el arte ocupa el 60% central (zona segura del 80%)
writeFileSync('public/icons/icon-maskable-512.png', renderIcon(512, 0.6));
writeFileSync('public/icons/apple-touch-icon.png', renderIcon(180, 0.85));
console.log('✅ Íconos generados en public/icons/');
```

- [ ] **Step 2: Generar y verificar**

Run: `node scripts/generate-icons.mjs` — Expected: `✅ Íconos generados en public/icons/`
Run: `file public/icons/*.png` — Expected: los 4 como `PNG image data, 192 x 192` / `512 x 512` / `180 x 180`, `8-bit/color RGB`.
Abrir `public/icons/icon-192.png` (visor o navegador): trofeo dorado pixel sobre fondo noche.

- [ ] **Step 3: Crear `public/manifest.webmanifest`**

```json
{
  "name": "Football Tournament Simulator",
  "short_name": "WC Simulator",
  "description": "Simulador arcade de torneos de fútbol",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0a0c12",
  "theme_color": "#0a0c12",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 4: Vincular en `index.html`**

Dentro de `<head>`, después de la meta `theme-color` (Task 1), agregar:
```html
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="WC Simulator" />
```

- [ ] **Step 5: Build + verificación**

Run: `npm run build && ls dist/manifest.webmanifest dist/icons/` — Expected: manifest y los 4 PNG copiados a `dist/`.
Con `npm run preview`: en Chrome DevTools → Application → Manifest: sin warnings de instalabilidad (ícono 512 presente, display standalone).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(pwa): manifest e íconos pixel-art instalables, sin service worker"
```

---

### Task 9: Verificación final integral

**Files:** — (solo verificación; fixes menores si aparecen)

- [ ] **Step 1: Build limpio**

Run: `npm run build` — Expected: exit 0.

- [ ] **Step 2: Lint — cero errores nuevos**

Run: `npm run lint 2>&1 | tail -3`
Expected: mismo total (o menor) que el baseline anotado en Task 1 Step 1. Si hay errores nuevos, arreglarlos antes de seguir. Nota: borrar `WorldCupView.tsx` y `MobileDrawer.tsx` puede REDUCIR el total; eso es esperado — lo prohibido es que suba por errores en código nuevo/editado.

- [ ] **Step 3: Flujo crítico con una mano (390px y 360px)**

Con `npm run dev` + emulación táctil:
1. Abrir la app → header compacto, tab bar abajo, sin drawer.
2. HOME → estado del torneo legible; si el torneo está virgen, dock `▶ PRESS START`.
3. MATCH → dock `▶ SIMULAR JORNADA` → confirm → modal de resultados en pasos.
4. Swipe a la jornada siguiente; abrir QUALI → swipe de regiones → grupo → tabla priorizada → tap fila expande detalle.
5. START → pause menu → Configuración → volver con RESUME y tab bar.
Todo alcanzable con el pulgar (mitad inferior de la pantalla), salvo la lectura.

- [ ] **Step 4: Reduced motion + desktop**

- Con `prefers-reduced-motion: reduce` emulado: sin animación de pause menu, sin slide de swipe, sin blink.
- En 1280px+: Sidebar, header desktop inexistente (como siempre), sin tab bar/dock, footer intacto, StandingsTable completa con hover de clasificados.

- [ ] **Step 5: Commit final (si hubo fixes)**

```bash
git add -A
git commit -m "fix(mobile): ajustes de la verificación final"
```

---

## Notas para el ejecutor

- El orden de tareas importa: 2 depende de 1 (keyframes), 3 depende de 2 (contenedor inferior), 6 depende de 3 (MatchCenter ya editado).
- Ante cualquier duda entre spec y plan, manda el spec; la única desviación consciente está documentada en Task 5 (KnockoutView no adopta narrow).
- `confirm()` nativo se usa en varios handlers (`handleSimulateMatchday`, `handleGenerateDraw`): funciona en móvil y NO se reemplaza en este trabajo.
