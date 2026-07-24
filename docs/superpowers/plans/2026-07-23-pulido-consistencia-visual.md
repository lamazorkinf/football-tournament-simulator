# Pulido y consistencia visual — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Absorber en primitivos compartidos de `src/components/ui/` las piezas que cada feature venía reimplementando — diálogos, carga, vacío, pestañas y encabezados — y migrar los call sites existentes.

**Architecture:** Cuatro fases mergeables por separado. Cada fase crea primitivos primero (con sus pruebas) y migra call sites después. Ningún cambio toca el motor de simulación, el store ni los servicios de Supabase: todo el trabajo vive en la capa de presentación.

**Tech Stack:** React 19, TypeScript, Tailwind v4 (tokens en `@theme` dentro de `src/index.css`), `@radix-ui/react-dialog` 1.1.15, `sonner` 2.0.7, `lucide-react`, Vitest 4 + Testing Library.

## Global Constraints

- **Idioma:** toda cadena visible va en español, con acentos correctos. Elipsis siempre `…` (U+2026), nunca `...`.
- **Sin `border-radius`:** hay un kill global en `src/index.css:81-83`. No pelear contra él.
- **Animaciones por pasos:** usar `steps(n)`, nunca interpolación suave. La app entera es discreta.
- **Tokens de color:** solo los de `@theme` (`night`, `grass`, `grass-dark`, `grass-soft`, `line`, `gold`, `led`, `loss`, `mint`). Nada de colores literales.
- **Tipografía:** `font-arcade` (Press Start 2P) para títulos y controles, `font-terminal` (VT323) para cuerpo y números. Los números llevan `tabular-nums`.
- **Toque móvil:** los controles interactivos mantienen `min-h-11` en móvil (patrón ya establecido en `Button`).
- **Verificación por fase:** `npx tsc -b` sin errores y `npm test` en verde. Baseline al escribir este plan: **42 archivos, 311 pruebas**.
- **`prefers-reduced-motion`:** `src/index.css:109-115` fuerza `animation-iteration-count: 1` globalmente. Todo indicador de carga tiene que seguir siendo legible cuando su animación se detiene tras un ciclo.

**Desvío respecto del spec:** el spec ubicaba `Spinner` y `Button.loading` en la Fase 2. Suben a la Fase 1 porque `ConfirmDialog` los necesita para no cerrarse mientras `onConfirm` está pendiente. Las fases siguen siendo mergeables por separado.

---

## FASE 1 — Diálogos

### Task 1: Spinner y `Button` con estado `loading`

**Files:**
- Modify: `src/index.css` (agregar keyframe tras la línea 107)
- Create: `src/components/ui/Spinner.tsx`
- Modify: `src/components/ui/Button.tsx`
- Create: `src/components/ui/__tests__/Button.test.tsx`

**Interfaces:**
- Consumes: `cn` de `src/lib/utils.ts`
- Produces: `<Spinner size?: 'sm' | 'md' className?: string />`; `Button` gana `loading?: boolean`

- [ ] **Step 1: Escribir la prueba que falla**

Crear `src/components/ui/__tests__/Button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Button } from '../Button';

describe('Button', () => {
  it('con loading queda deshabilitado, expone aria-busy y no dispara onClick', async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Simular</Button>);

    const button = screen.getByRole('button', { name: /simular/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('sin loading no expone aria-busy y dispara onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Simular</Button>);

    const button = screen.getByRole('button', { name: /simular/i });
    expect(button).not.toHaveAttribute('aria-busy', 'true');

    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('muestra el indicador de carga con rol status cuando está loading', () => {
    render(<Button loading>Simular</Button>);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `npx vitest run src/components/ui/__tests__/Button.test.tsx`
Expected: FAIL — `loading` no existe en las props de `Button`, error de TypeScript y ninguna aserción de `aria-busy` pasa.

- [ ] **Step 3: Agregar el keyframe al CSS**

En `src/index.css`, después del bloque `.pause-in` (línea 107) y antes del `@media (prefers-reduced-motion)`:

```css
@keyframes retro-dot {
  0%, 33%   { opacity: 1; }
  34%, 100% { opacity: 0.2; }
}
.retro-dot {
  animation: retro-dot 0.75s steps(1) infinite;
}
```

- [ ] **Step 4: Crear el Spinner**

Crear `src/components/ui/Spinner.tsx`:

```tsx
import { cn } from '../../lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Indicador de carga en la clave visual de la app: tres bloques cuadrados que
 * se encienden por turnos con `steps(1)`. Nada de círculos girando ni de
 * interpolación suave — la app mata todos los radios y anima por pasos.
 *
 * Con `prefers-reduced-motion` la animación se detiene tras un ciclo (regla
 * global de index.css) y los bloques quedan encendidos y visibles, así que el
 * indicador sigue leyéndose como tal. El `role="status"` cubre el resto.
 */
export function Spinner({ size = 'md', className }: SpinnerProps) {
  const box = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';

  return (
    <span
      role="status"
      aria-label="Cargando"
      className={cn('inline-flex items-center gap-1', className)}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(box, 'bg-gold retro-dot')}
          style={{ animationDelay: `${i * 0.25}s` }}
        />
      ))}
    </span>
  );
}
```

- [ ] **Step 5: Agregar `loading` al Button**

En `src/components/ui/Button.tsx`, reemplazar el archivo completo:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Spinner } from './Spinner';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** Muestra el indicador de carga, deshabilita y marca aria-busy. */
  loading?: boolean;
  className?: string;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  loading = false,
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center gap-2 font-arcade uppercase leading-none border-4 transition-none disabled:opacity-50 disabled:cursor-not-allowed active:translate-x-1 active:translate-y-1 active:shadow-none';

  const variantStyles = {
    primary: 'bg-gold text-night border-white shadow-hard-btn hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0_#7a2b0e]',
    secondary: 'bg-grass text-white border-line shadow-hard-panel hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[3px_3px_0_rgb(0_0_0/0.5)]',
    outline: 'bg-transparent text-led border-line hover:bg-grass/40',
    ghost: 'bg-transparent text-grass-soft border-transparent hover:text-white hover:bg-grass/40',
    danger: 'bg-loss text-white border-white shadow-hard-panel hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[3px_3px_0_rgb(0_0_0/0.5)]',
  };

  const sizeStyles = {
    sm: 'px-3 py-2 text-[10px] min-h-11 lg:min-h-0',
    md: 'px-4 py-3 text-xs min-h-11 lg:min-h-0',
    lg: 'px-6 py-4 text-sm min-h-12 lg:min-h-0',
  };

  return (
    <button
      className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  );
}
```

Nota: `gap-2` sube a `baseStyles` porque ahora el botón puede tener dos hijos. Varios call sites ya pasaban `className="gap-2"`; `twMerge` resuelve el duplicado sin conflicto.

- [ ] **Step 6: Correr las pruebas y verificar que pasan**

Run: `npx vitest run src/components/ui/__tests__/Button.test.tsx`
Expected: PASS — 3 pruebas.

- [ ] **Step 7: Correr la suite completa**

Run: `npm test`
Expected: PASS — 43 archivos, 314 pruebas.

- [ ] **Step 8: Commit**

```bash
git add src/index.css src/components/ui/Spinner.tsx src/components/ui/Button.tsx src/components/ui/__tests__/Button.test.tsx
git commit -m "feat(ui): Spinner por pasos y estado loading en Button"
```

---

### Task 2: ConfirmDialog

**Files:**
- Modify: `src/test/setup.ts`
- Create: `src/components/ui/ConfirmDialog.tsx`
- Create: `src/components/ui/__tests__/ConfirmDialog.test.tsx`

**Interfaces:**
- Consumes: `Button` con `loading` (Task 1), `cn` de `src/lib/utils.ts`
- Produces:
  ```ts
  interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: React.ReactNode;
    confirmLabel?: string;   // default 'Confirmar'
    cancelLabel?: string;    // default 'Cancelar'
    variant?: 'danger' | 'default';  // default 'default'
    onConfirm: () => void | Promise<void>;
  }
  ```

- [ ] **Step 1: Preparar jsdom para Radix**

Radix usa APIs de puntero que jsdom no implementa; sin estos stubs las pruebas del diálogo fallan con `target.hasPointerCapture is not a function`. Agregar en `src/test/setup.ts`, justo antes del bloque `afterEach` (línea 71):

```ts
/**
 * Radix (DismissableLayer, FocusScope) toca APIs de puntero y de scroll que
 * jsdom no implementa. Sin estos stubs, cualquier prueba que abra un Dialog
 * revienta antes de llegar a la aserción.
 */
if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false;
}
if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = () => {};
}
if (!HTMLElement.prototype.releasePointerCapture) {
  HTMLElement.prototype.releasePointerCapture = () => {};
}
if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}
```

- [ ] **Step 2: Escribir las pruebas que fallan**

Crear `src/components/ui/__tests__/ConfirmDialog.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmDialog } from '../ConfirmDialog';

function setup(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title="Borrar torneo"
      description="Se pierden todos los partidos jugados."
      confirmLabel="Borrar"
      onConfirm={onConfirm}
      {...overrides}
    />
  );
  return { onConfirm, onOpenChange };
}

describe('ConfirmDialog', () => {
  it('muestra título y descripción cuando está abierto', () => {
    setup();
    expect(screen.getByText('Borrar torneo')).toBeInTheDocument();
    expect(screen.getByText('Se pierden todos los partidos jugados.')).toBeInTheDocument();
  });

  it('ejecuta onConfirm y cierra al confirmar', async () => {
    const { onConfirm, onOpenChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: /borrar/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('NO ejecuta onConfirm al cancelar', async () => {
    const { onConfirm, onOpenChange } = setup();
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('NO ejecuta onConfirm al cerrar con Escape', async () => {
    const { onConfirm, onOpenChange } = setup();
    await userEvent.keyboard('{Escape}');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('no renderiza nada cuando open es false', () => {
    setup({ open: false });
    expect(screen.queryByText('Borrar torneo')).not.toBeInTheDocument();
  });

  it('mantiene el diálogo abierto mientras onConfirm está pendiente', async () => {
    let resolve: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Regenerar sorteo"
        confirmLabel="Regenerar"
        onConfirm={onConfirm}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /regenerar/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    resolve();
    await screen.findByRole('button', { name: /regenerar/i });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 3: Correr las pruebas y verificar que fallan**

Run: `npx vitest run src/components/ui/__tests__/ConfirmDialog.test.tsx`
Expected: FAIL — `Failed to resolve import "../ConfirmDialog"`.

- [ ] **Step 4: Crear el ConfirmDialog**

Crear `src/components/ui/ConfirmDialog.tsx`:

```tsx
import { useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void | Promise<void>;
}

/**
 * Diálogo de confirmación en la clave visual de la app, en reemplazo de
 * `window.confirm`. Radix aporta el foco atrapado, el retorno del foco al
 * disparador, Escape y los roles ARIA — todo lo que una implementación a mano
 * suele olvidar.
 *
 * Regla de uso: este diálogo es solo para acciones que DESTRUYEN trabajo
 * existente (regenerar un sorteo, borrar un torneo o un equipo). Las acciones
 * que crean progreso pasan directo con un toast. Confirmar todo equivale a no
 * confirmar nada: el usuario aprende a apretar "Aceptar" sin leer.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      // Mientras la acción corre, ni Escape ni el backdrop cierran: cerrar a
      // mitad dejaría al usuario sin saber si se completó.
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 z-50" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
            'w-[calc(100%-2rem)] max-w-md p-6',
            'bg-grass-dark border-4 shadow-hard-panel pause-in',
            variant === 'danger' ? 'border-loss' : 'border-line'
          )}
        >
          <div className="flex items-start gap-3 mb-4">
            {variant === 'danger' && (
              <AlertTriangle className="w-6 h-6 text-loss flex-shrink-0" />
            )}
            <Dialog.Title className="font-arcade text-xs text-gold uppercase leading-relaxed">
              {title}
            </Dialog.Title>
          </div>

          {description ? (
            <Dialog.Description asChild>
              <div className="text-grass-soft text-sm mb-6 space-y-2">{description}</div>
            </Dialog.Description>
          ) : (
            // Sin descripción, Radix avisa por consola salvo que se declare.
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}

          <div className="flex gap-2 justify-end flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {cancelLabel}
            </Button>
            <Button
              variant={variant === 'danger' ? 'danger' : 'primary'}
              size="sm"
              onClick={handleConfirm}
              loading={pending}
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

- [ ] **Step 5: Correr las pruebas y verificar que pasan**

Run: `npx vitest run src/components/ui/__tests__/ConfirmDialog.test.tsx`
Expected: PASS — 6 pruebas.

- [ ] **Step 6: Correr la suite completa**

Run: `npm test`
Expected: PASS — 44 archivos, 320 pruebas.

- [ ] **Step 7: Commit**

```bash
git add src/test/setup.ts src/components/ui/ConfirmDialog.tsx src/components/ui/__tests__/ConfirmDialog.test.tsx
git commit -m "feat(ui): ConfirmDialog retro sobre Radix"
```

---

### Task 3: Migrar los 5 sitios destructivos

**Files:**
- Modify: `src/components/tournament/TournamentHistory.tsx` (agrega el freno que hoy no existe)
- Modify: `src/components/tournament/TournamentWizard.tsx:239-248`
- Modify: `src/components/tournament/WorldCupViewEnhanced.tsx:124-134`
- Modify: `src/components/tournament/TeamEditor.tsx:58-85`
- Modify: `src/components/favorites/FavoritesView.tsx:41-43`
- Create: `src/components/tournament/__tests__/TournamentHistory.test.tsx`

**Interfaces:**
- Consumes: `ConfirmDialog` (Task 2)
- Produces: nada que consuman tareas posteriores

- [ ] **Step 1: Escribir la prueba que falla — borrar torneo sin confirmar es el bug más grave**

Crear `src/components/tournament/__tests__/TournamentHistory.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TournamentHistory } from '../TournamentHistory';
import { useTournamentStore } from '../../../store/useTournamentStore';

const deleteTournament = vi.fn();

function makeTournament(id: string, year: number) {
  return {
    id,
    year,
    name: `Mundial ${year}`,
    qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
    worldCup: null,
  };
}

describe('TournamentHistory', () => {
  beforeEach(() => {
    deleteTournament.mockClear();
    useTournamentStore.setState({
      tournaments: [makeTournament('a', 2026), makeTournament('b', 2030)],
      currentTournamentId: 'a',
      deleteTournament,
    } as never);
  });

  it('no borra el torneo hasta confirmar', async () => {
    render(<TournamentHistory />);

    await userEvent.click(screen.getAllByTitle('Eliminar torneo')[0]);
    expect(deleteTournament).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /^eliminar$/i }));
    expect(deleteTournament).toHaveBeenCalledTimes(1);
  });

  it('cancelar deja el torneo intacto', async () => {
    render(<TournamentHistory />);

    await userEvent.click(screen.getAllByTitle('Eliminar torneo')[0]);
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(deleteTournament).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `npx vitest run src/components/tournament/__tests__/TournamentHistory.test.tsx`
Expected: FAIL en la primera aserción — `deleteTournament` ya fue llamado, porque hoy `handleDelete` ejecuta directo.

- [ ] **Step 3: Agregar el freno en TournamentHistory**

En `src/components/tournament/TournamentHistory.tsx`, agregar el import y el estado:

```tsx
import { ConfirmDialog } from '../ui/ConfirmDialog';
```

Reemplazar `handleDelete` (líneas 78-80):

```tsx
  const [pendingDelete, setPendingDelete] = useState<Tournament | null>(null);

  const handleDelete = (tournament: Tournament) => {
    setPendingDelete(tournament);
  };
```

Cambiar el `onClick` del botón de basura (línea 238) para que pase el torneo entero:

```tsx
                      onClick={() => handleDelete(tournament)}
```

Y antes del cierre del componente, junto al resto del JSX de nivel superior:

```tsx
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        variant="danger"
        title="Eliminar torneo"
        confirmLabel="Eliminar"
        description={
          <>
            <p>Se elimina <strong className="text-white">{pendingDelete?.name}</strong> y todo su historial de partidos.</p>
            <p>Esta acción no se puede deshacer.</p>
          </>
        }
        onConfirm={() => {
          if (pendingDelete) deleteTournament(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `npx vitest run src/components/tournament/__tests__/TournamentHistory.test.tsx`
Expected: PASS — 2 pruebas.

- [ ] **Step 5: Migrar `FavoritesView`**

En `src/components/favorites/FavoritesView.tsx`, agregar el import de `ConfirmDialog`, reemplazar `handleClear` (líneas 41-43):

```tsx
  const [confirmClear, setConfirmClear] = useState(false);

  const handleClear = () => setConfirmClear(true);
```

Y agregar al final del JSX, dentro del `<div className="space-y-6">`:

```tsx
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        variant="danger"
        title="Quitar todos los favoritos"
        confirmLabel="Quitar todos"
        description={<p>Se desmarcan los {favoriteCount} equipos favoritos. Podés volver a marcarlos cuando quieras.</p>}
        onConfirm={clearFavorites}
      />
```

- [ ] **Step 6: Migrar `TeamEditor`**

En `src/components/tournament/TeamEditor.tsx`, agregar el import de `ConfirmDialog` y `toast` (`import { toast } from 'sonner';`), y reemplazar `handleDeleteTeam` (líneas 58-85):

```tsx
  const [pendingDeleteTeam, setPendingDeleteTeam] = useState<Team | null>(null);

  const confirmDeleteTeam = async (team: Team) => {
    if (isSupabaseConfigured()) {
      try {
        await teamsService.deleteTeam(team.id);
      } catch (error) {
        console.error('Error deleting team from Supabase:', error);
        toast.error('No se pudo eliminar el equipo de la base. Intentá de nuevo.');
        return;
      }
    }

    // Refrescar la lista de equipos desde la base en vez de recargar la página
    // entera, que descartaba cualquier estado en memoria no persistido.
    try {
      await loadTeamsFromDatabase();
    } catch (error) {
      console.error('Error refreshing teams after delete:', error);
    }
  };
```

El `TeamRow` invoca hoy `onDelete(team.id, team.name)`. Cambiar la llamada del padre para que abra el diálogo con el equipo completo: `onDelete={() => setPendingDeleteTeam(team)}` y ajustar la firma de la prop en `TeamRow` a `onDelete: () => void`.

Agregar el diálogo al final del fragmento:

```tsx
      <ConfirmDialog
        open={pendingDeleteTeam !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteTeam(null); }}
        variant="danger"
        title="Eliminar equipo"
        confirmLabel="Eliminar"
        description={
          <>
            <p>Se elimina <strong className="text-white">{pendingDeleteTeam?.name}</strong> de todos los grupos.</p>
            <p>Esta acción no se puede deshacer.</p>
          </>
        }
        onConfirm={async () => {
          if (pendingDeleteTeam) await confirmDeleteTeam(pendingDeleteTeam);
          setPendingDeleteTeam(null);
        }}
      />
```

- [ ] **Step 7: Migrar `TournamentWizard` (regenerar sorteo del Mundial)**

En `src/components/tournament/TournamentWizard.tsx`, agregar el import de `ConfirmDialog`, agregar el estado junto a los existentes (línea 55):

```tsx
  const [confirmRegenWorldCup, setConfirmRegenWorldCup] = useState(false);
```

Reemplazar `handleRegenerateWorldCupDraw` (líneas 239-248):

```tsx
  const handleRegenerateWorldCupDraw = () => setConfirmRegenWorldCup(true);
```

Y agregar el diálogo junto al `AnimatePresence` del `DrawSimulator`:

```tsx
      <ConfirmDialog
        open={confirmRegenWorldCup}
        onOpenChange={setConfirmRegenWorldCup}
        variant="danger"
        title="Regenerar sorteo del Mundial"
        confirmLabel="Regenerar"
        description={
          <>
            <p>Se eliminan todos los partidos actuales del Mundial (grupos y playoffs) y se crean grupos nuevos con los mismos 64 equipos clasificados.</p>
            <p>Esta acción no se puede deshacer.</p>
          </>
        }
        onConfirm={() => {
          regenerateWorldCupDrawAndFixtures();
          toast.success('Sorteo del Mundial regenerado');
        }}
      />
```

- [ ] **Step 8: Migrar `WorldCupViewEnhanced` (regenerar playoffs)**

En `src/components/tournament/WorldCupViewEnhanced.tsx`, agregar el import de `ConfirmDialog` y el estado, y reemplazar `handleRegenerateKnockout` (líneas 124-134):

```tsx
  const [confirmRegenKnockout, setConfirmRegenKnockout] = useState(false);

  const handleRegenerateKnockout = () => setConfirmRegenKnockout(true);
```

Agregar el diálogo al final del JSX de nivel superior:

```tsx
      <ConfirmDialog
        open={confirmRegenKnockout}
        onOpenChange={setConfirmRegenKnockout}
        variant="danger"
        title="Regenerar playoffs"
        confirmLabel="Regenerar"
        description={
          <>
            <p>Se eliminan todos los partidos de playoffs no jugados y se vuelven a generar los cruces según las posiciones actuales de la fase de grupos.</p>
            <p>Esta acción no se puede deshacer.</p>
          </>
        }
        onConfirm={async () => {
          await regenerateKnockoutStage();
          toast.success('Playoffs regenerados');
        }}
      />
```

- [ ] **Step 9: Verificar que no quedan confirms destructivos**

Run: `grep -rn "confirm(" src --include="*.tsx" | grep -v __tests__`
Expected: quedan exactamente 8 apariciones, todas de acciones de avance (se eliminan en la Task 4). Ninguna en `TournamentHistory`, `FavoritesView`, `TeamEditor`, ni las dos de regeneración.

- [ ] **Step 10: Correr la suite completa**

Run: `npm test`
Expected: PASS — 45 archivos, 322 pruebas.

- [ ] **Step 11: Commit**

```bash
git add src/components/tournament/TournamentHistory.tsx src/components/tournament/TournamentWizard.tsx src/components/tournament/WorldCupViewEnhanced.tsx src/components/tournament/TeamEditor.tsx src/components/favorites/FavoritesView.tsx src/components/tournament/__tests__/TournamentHistory.test.tsx
git commit -m "feat(ui): ConfirmDialog en las 5 acciones destructivas

Borrar un torneo no pedía confirmación alguna: un click en el botón rojo
y desaparecía el ciclo entero. Ahora sí la pide."
```

---

### Task 4: Quitar los 8 confirms de acciones de avance

**Files:**
- Modify: `src/components/tournament/TournamentWizard.tsx` (6 sitios)
- Modify: `src/components/tournament/WorldCupViewEnhanced.tsx:111-122`
- Modify: `src/components/tournament/MatchCenter.tsx:253-285` y `:510-532`

**Interfaces:**
- Consumes: nada nuevo
- Produces: nada

- [ ] **Step 1: Quitar los confirms del wizard**

En `src/components/tournament/TournamentWizard.tsx`, reemplazar los cuerpos de los handlers para que ejecuten directo. `handleGenerateDraw` (líneas 58-76):

```tsx
  const handleGenerateDraw = async () => {
    if (!currentTournament) return;
    const hasOriginalSkills = currentTournament.originalSkills &&
      Object.keys(currentTournament.originalSkills).length > 0;

    // await: sin esto el toast de éxito se mostraba de inmediato, aunque el
    // sorteo aún no hubiera terminado (o hubiera fallado).
    await generateDrawAndFixtures();

    toast.success(
      hasOriginalSkills
        ? 'Sorteo generado — habilidades en la base de este Mundial'
        : 'Sorteo y fixtures generados'
    );
  };

  const handleDrawContinental = () => {
    drawContinental();
    toast.success('Torneos continentales sorteados');
    onNavigate?.('continental');
  };

  const handleDrawConfederations = () => {
    drawConfederations();
    toast.success('Copa Confederaciones sorteada');
    onNavigate?.('confederations');
  };

  const handleAdvanceToQualifiers = () => {
    advanceToQualifiers();
    toast.success('Fase de Clasificatorias habilitada');
    onNavigate?.('qualifiers');
  };
```

`handleAdvanceToWorldCup` (líneas 176-185):

```tsx
  const handleAdvanceToWorldCup = () => {
    advanceToWorldCup();
    toast.success('Avanzado a Copa del Mundo con 64 equipos clasificados');
  };
```

`handleAdvanceToKnockout` (líneas 250-259):

```tsx
  const handleAdvanceToKnockout = async () => {
    await advanceToKnockout();
    toast.success('Dieciseisavos de final generados');
  };
```

La advertencia sobre las habilidades que hoy vive en el texto del `confirm` (`ℹ️ Las habilidades se ajustan a la línea de base de este Mundial…`) no se pierde: ya está reflejada en el toast de éxito, y el paso 3 la deja visible de forma permanente en el StepCard.

- [ ] **Step 2: Quitar el confirm duplicado de WorldCupViewEnhanced**

En `src/components/tournament/WorldCupViewEnhanced.tsx`, reemplazar `handleAdvanceToKnockout` (líneas 111-122):

```tsx
  const handleAdvanceToKnockout = async () => {
    await advanceToKnockout();
    toast.success('Dieciseisavos de final generados');
    setActiveTab('playoffs');
  };
```

El texto del toast queda idéntico al del wizard: hoy son dos mensajes distintos para la misma acción.

- [ ] **Step 3: Quitar el confirm de MatchCenter y bajar su advertencia al botón**

En `src/components/tournament/MatchCenter.tsx`, reemplazar el bloque del confirm (líneas 268-274) por nada — `handleSimulateMatchday` pasa directo del chequeo de `toSimulate.length` al `try`:

```tsx
    try {
      const outcomes = await runJornadaSimulation(toSimulate);
      const results = buildJornadaResults(jornada, outcomes);
      showResults(results, `${jornadaTitle} — Resultados`);
      toast.success(`${jornada.label} completada — ${outcomes.length} partidos simulados`);
    } catch (error) {
      console.error('Error simulating matchday:', error);
      toast.error('Error al simular la jornada');
    }
```

La advertencia que llevaba el confirm ("se simulan todas las regiones sin importar los filtros") baja a texto fijo bajo los botones. Reemplazar el bloque Quick Actions (líneas 510-532):

```tsx
            {/* Quick Actions */}
            <div className="hidden lg:block space-y-2">
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="primary"
                  onClick={handleSimulateMatchday}
                  disabled={!canSimulateJornada}
                  loading={isBatchProcessing}
                  className="gap-2"
                >
                  {!isBatchProcessing && <Play className="w-4 h-4" />}
                  <span>{isBatchProcessing ? 'Simulando…' : 'Simular Jornada'}</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSimulateMatchdayLive}
                  disabled={!canSimulateJornada}
                  className="gap-2"
                >
                  <Radio className="w-4 h-4" />
                  <span>Jornada en vivo</span>
                </Button>
              </div>
              <p className="text-xs text-grass-soft">
                Se simula la jornada completa, de todas las regiones, sin importar los filtros.
              </p>
            </div>
```

Esto además elimina el `'Simulando...'` con tres puntos, que convivía con el `'SIMULANDO…'` del `ActionDock` en la línea 360.

- [ ] **Step 4: Verificar que no queda ningún confirm ni alert**

Run: `grep -rn "confirm(\|[^.]alert(" src --include="*.tsx" | grep -v __tests__`
Expected: quedan solo los 6 `alert()` (se eliminan en la Task 5). Cero `confirm(`.

- [ ] **Step 5: Correr la suite completa**

Run: `npm test`
Expected: PASS — 45 archivos, 322 pruebas.

- [ ] **Step 6: Commit**

```bash
git add src/components/tournament/TournamentWizard.tsx src/components/tournament/WorldCupViewEnhanced.tsx src/components/tournament/MatchCenter.tsx
git commit -m "refactor(ui): las acciones de avance ya no interrumpen

Sortear, avanzar de fase y simular una jornada crean progreso: pasan
directo con toast. La advertencia sobre los filtros baja al botón, donde
se lee antes de apretar."
```

---

### Task 5: Reemplazar los 6 `alert()`

**Files:**
- Modify: `src/components/ui/TournamentSelector.tsx` (3 sitios + error inline)
- Modify: `src/components/tournament/TeamEditor.tsx:95-106` (2 sitios; el tercero ya cayó en la Task 3)

**Interfaces:**
- Consumes: `toast` de `sonner`
- Produces: nada

- [ ] **Step 1: Error inline en TournamentSelector**

En `src/components/ui/TournamentSelector.tsx`, agregar `import { toast } from 'sonner';`, agregar el estado del error junto a los existentes (línea 17) y reemplazar `handleCreateNew` (líneas 21-45):

```tsx
  const [yearError, setYearError] = useState<string | null>(null);

  const handleCreateNew = async () => {
    const year = parseInt(newYear, 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      setYearError('Ingresá un año entre 2000 y 2100');
      return;
    }

    if (tournaments.some((t) => t.year === year)) {
      setYearError(`Ya existe un torneo para el año ${year}`);
      return;
    }

    setYearError(null);

    // try/catch: si la creación falla (p.ej. sin red), sin esto la promesa
    // quedaba sin manejar, el modal no se cerraba y el usuario no recibía
    // ningún feedback.
    try {
      await createNewTournament(year);
      setShowNewModal(false);
      setNewYear('');
      setIsOpen(false);
    } catch (error) {
      console.error('Error creating tournament:', error);
      toast.error('No se pudo crear el torneo. Revisá la conexión e intentá de nuevo.');
    }
  };
```

- [ ] **Step 2: Mostrar el error bajo el input**

En el mismo archivo, el `<input>` del modal (líneas 199-212) pierde el `mb-4` y gana el manejo del error. Reemplazar por:

```tsx
              <input
                type="number"
                value={newYear}
                onChange={(e) => { setNewYear(e.target.value); setYearError(null); }}
                placeholder="Ej: 2030"
                min="2000"
                max="2100"
                aria-invalid={yearError !== null}
                aria-describedby={yearError ? 'year-error' : undefined}
                className={`w-full px-4 py-2 bg-night border-2 text-white placeholder:text-grass-soft focus:ring-2 focus:ring-gold focus:border-transparent outline-none ${
                  yearError ? 'border-loss' : 'border-grass'
                }`}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateNew();
                  if (e.key === 'Escape') setShowNewModal(false);
                }}
              />
              {yearError ? (
                <p id="year-error" className="text-loss text-sm mt-2 mb-4">{yearError}</p>
              ) : (
                <div className="mb-4" />
              )}
```

- [ ] **Step 3: Toasts en TeamEditor**

En `src/components/tournament/TeamEditor.tsx`, reemplazar `handleRefreshFromDatabase` (líneas 95-106):

```tsx
  const handleRefreshFromDatabase = async () => {
    setIsRefreshing(true);
    try {
      await loadTeamsFromDatabase();
      toast.success('Equipos actualizados desde la base');
    } catch (error) {
      console.error('Error refreshing teams from database:', error);
      toast.error('No se pudieron actualizar los equipos');
    } finally {
      setIsRefreshing(false);
    }
  };
```

El `import { toast } from 'sonner';` ya se agregó en la Task 3.

- [ ] **Step 4: Verificar que no queda ningún diálogo nativo**

Run: `grep -rn "confirm(\|[^.]alert(" src --include="*.tsx" --include="*.ts" | grep -v __tests__`
Expected: sin resultados.

- [ ] **Step 5: Verificar tipos y correr la suite**

Run: `npx tsc -b && npm test`
Expected: tsc sin salida; PASS — 45 archivos, 322 pruebas.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/TournamentSelector.tsx src/components/tournament/TeamEditor.tsx
git commit -m "refactor(ui): fuera los 6 alert() nativos

Validación de año inline bajo el input, donde el usuario está mirando;
el resto pasa a toast. Ya no queda ningún diálogo del sistema operativo."
```

---

## FASE 2 — Carga y vacío

### Task 6: EmptyState

**Files:**
- Create: `src/components/ui/EmptyState.tsx`
- Create: `src/components/ui/__tests__/EmptyState.test.tsx`

**Interfaces:**
- Consumes: `Button` (Task 1), `cn`
- Produces:
  ```ts
  interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description?: string;
    action?: { label: string; onClick: () => void };
    className?: string;
  }
  ```

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `src/components/ui/__tests__/EmptyState.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Trophy } from 'lucide-react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('muestra título y descripción', () => {
    render(<EmptyState icon={Trophy} title="Sin partidos" description="Todavía no se jugó ninguno" />);
    expect(screen.getByText('Sin partidos')).toBeInTheDocument();
    expect(screen.getByText('Todavía no se jugó ninguno')).toBeInTheDocument();
  });

  it('dispara el CTA cuando se le pasa action', async () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        icon={Trophy}
        title="Confederaciones bloqueada"
        action={{ label: 'Ir a Continental', onClick }}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /ir a continental/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('no renderiza botón cuando no hay action', () => {
    render(<EmptyState icon={Trophy} title="Sin datos" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `npx vitest run src/components/ui/__tests__/EmptyState.test.tsx`
Expected: FAIL — `Failed to resolve import "../EmptyState"`.

- [ ] **Step 3: Crear el EmptyState**

Crear `src/components/ui/EmptyState.tsx`:

```tsx
import type { LucideIcon } from 'lucide-react';
import { Button } from './Button';
import { cn } from '../../lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

/**
 * Estado vacío con forma: icono, título, contexto y salida opcional.
 * Reemplaza los `<p>` grises sueltos que cada vista resolvía por su cuenta.
 *
 * Un vacío sin salida deja al usuario sin saber qué hacer; cuando existe una
 * acción que lo resuelve, va en `action`.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center text-center py-12 px-4', className)}>
      <Icon className="w-12 h-12 text-grass mb-4" aria-hidden="true" />
      <p className="font-arcade text-xs text-white text-shadow-retro uppercase leading-relaxed mb-2">
        {title}
      </p>
      {description && (
        <p className="text-grass-soft text-sm max-w-md mb-4">{description}</p>
      )}
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `npx vitest run src/components/ui/__tests__/EmptyState.test.tsx`
Expected: PASS — 3 pruebas.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/EmptyState.tsx src/components/ui/__tests__/EmptyState.test.tsx
git commit -m "feat(ui): EmptyState con icono, contexto y salida"
```

---

### Task 7: Skeleton, LoadingState y PixelBar indeterminada

**Files:**
- Modify: `src/index.css` (keyframe `pixel-sweep`)
- Create: `src/components/ui/Skeleton.tsx`
- Create: `src/components/ui/LoadingState.tsx`
- Modify: `src/components/ui/PixelBar.tsx`
- Create: `src/components/ui/__tests__/PixelBar.test.tsx`

**Interfaces:**
- Consumes: `Spinner` (Task 1), `cn`
- Produces: `<Skeleton className?: string />`; `<LoadingState label?: string />`; `PixelBar` gana `indeterminate?: boolean`

- [ ] **Step 1: Escribir la prueba que falla**

Crear `src/components/ui/__tests__/PixelBar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PixelBar } from '../PixelBar';

describe('PixelBar', () => {
  it('expone el valor actual en modo determinado', () => {
    render(<PixelBar value={50} max={100} />);
    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '50');
  });

  it('omite aria-valuenow en modo indeterminado', () => {
    render(<PixelBar value={0} max={100} indeterminate />);
    const meter = screen.getByRole('meter');
    expect(meter).not.toHaveAttribute('aria-valuenow');
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `npx vitest run src/components/ui/__tests__/PixelBar.test.tsx`
Expected: FAIL en la segunda prueba — `indeterminate` no existe y `aria-valuenow="0"` sigue presente.

- [ ] **Step 3: Agregar el keyframe del barrido**

En `src/index.css`, después del bloque `.retro-dot` agregado en la Task 1:

```css
@keyframes pixel-sweep {
  0%, 15%   { background-color: var(--color-led); }
  16%, 100% { background-color: var(--color-grass-dark); }
}
.pixel-sweep {
  animation: pixel-sweep 1.6s steps(1) infinite;
}
```

Los 20 segmentos con `animationDelay` escalonado cada 0.08 s completan el ciclo de 1.6 s, produciendo una banda encendida que recorre la barra por pasos.

- [ ] **Step 4: Agregar el modo indeterminado a PixelBar**

Reemplazar `src/components/ui/PixelBar.tsx`:

```tsx
interface PixelBarProps {
  value: number;
  max: number;
  color?: 'led' | 'gold' | 'loss';
  /** Progreso desconocido: los segmentos barren en bucle y no se declara valor. */
  indeterminate?: boolean;
}

const COLOR_CLASS = { led: 'bg-led', gold: 'bg-gold', loss: 'bg-loss' } as const;
const SEGMENTS = 20;
const SWEEP_SECONDS = 1.6;

export function PixelBar({ value, max, color = 'led', indeterminate = false }: PixelBarProps) {
  const filled = max > 0 ? Math.round((value / max) * SEGMENTS) : 0;

  return (
    <div
      className="flex gap-0.5 border-2 border-grass bg-black p-0.5"
      role="meter"
      // Un meter sin valor conocido no debe declarar uno: se omite valuenow
      // y se marca como ocupado.
      aria-valuenow={indeterminate ? undefined : value}
      aria-valuemin={indeterminate ? undefined : 0}
      aria-valuemax={indeterminate ? undefined : max}
      aria-busy={indeterminate || undefined}
      aria-label={indeterminate ? 'Cargando' : undefined}
    >
      {Array.from({ length: SEGMENTS }, (_, i) =>
        indeterminate ? (
          <span
            key={i}
            className="h-3 flex-1 bg-grass-dark pixel-sweep"
            style={{ animationDelay: `${(i * SWEEP_SECONDS) / SEGMENTS}s` }}
          />
        ) : (
          <span
            key={i}
            className={`h-3 flex-1 ${i < filled ? COLOR_CLASS[color] : 'bg-grass-dark'}`}
          />
        )
      )}
    </div>
  );
}
```

- [ ] **Step 5: Correr la prueba y verificar que pasa**

Run: `npx vitest run src/components/ui/__tests__/PixelBar.test.tsx`
Expected: PASS — 2 pruebas.

- [ ] **Step 6: Crear Skeleton y LoadingState**

Crear `src/components/ui/Skeleton.tsx`:

```tsx
import { cn } from '../../lib/utils';

interface SkeletonProps {
  className?: string;
}

/**
 * Bloque sólido que ocupa el lugar del contenido mientras carga. Se usa donde
 * la forma de lo que viene es previsible (listas, tablas): preserva el layout
 * y evita el salto al llegar los datos.
 *
 * Donde no se sabe qué forma tiene el contenido, va Spinner.
 */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden="true" className={cn('bg-grass/40 blink h-4', className)} />;
}
```

Crear `src/components/ui/LoadingState.tsx`:

```tsx
import { Spinner } from './Spinner';
import { cn } from '../../lib/utils';

interface LoadingStateProps {
  label?: string;
  className?: string;
}

/** Carga centrada para pantallas completas. Una sola pieza para toda la app. */
export function LoadingState({ label = 'Cargando…', className }: LoadingStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-12', className)}>
      <Spinner />
      <p className="font-arcade text-[10px] text-grass-soft uppercase">{label}</p>
    </div>
  );
}
```

- [ ] **Step 7: Correr la suite completa**

Run: `npm test`
Expected: PASS — 47 archivos, 327 pruebas.

- [ ] **Step 8: Commit**

```bash
git add src/index.css src/components/ui/Skeleton.tsx src/components/ui/LoadingState.tsx src/components/ui/PixelBar.tsx src/components/ui/__tests__/PixelBar.test.tsx
git commit -m "feat(ui): Skeleton, LoadingState y PixelBar indeterminada"
```

---

### Task 8: Migrar los cinco spinners y la pantalla de arranque

**Files:**
- Modify: `src/components/tournament/ChampionsHistory.tsx:81-87`
- Modify: `src/components/tournament/HistoricalStats.tsx:115-126`
- Modify: `src/components/comparison/TeamComparison.tsx:136-149`
- Modify: `src/components/tournament/TeamProfileModal.tsx:449-455`
- Modify: `src/components/tournament/MatchHistory.tsx:235-239`
- Modify: `src/App.tsx:109-120`

**Interfaces:**
- Consumes: `LoadingState`, `Skeleton`, `PixelBar` con `indeterminate` (Task 7)
- Produces: nada

- [ ] **Step 1: Migrar los cuatro spinners de pantalla**

En cada archivo, importar `LoadingState` desde la ruta relativa correspondiente (`../ui/LoadingState` en los tres de `tournament/`, `../ui/LoadingState` en `comparison/`) y reemplazar el bloque de carga:

`ChampionsHistory.tsx:81-87` →
```tsx
  if (loading) {
    return <LoadingState label="Cargando campeones…" />;
  }
```

`HistoricalStats.tsx:115-126` →
```tsx
  if (loading) {
    return (
      <Card>
        <CardContent>
          <LoadingState label="Cargando estadísticas históricas…" />
        </CardContent>
      </Card>
    );
  }
```

`TeamComparison.tsx:136-149` →
```tsx
  if (loading || !h2hStats) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent>
            <LoadingState label="Cargando estadísticas…" />
          </CardContent>
        </Card>
      </div>
    );
  }
```

`TeamProfileModal.tsx:449-455` → reemplazar la rama `loading ?` por:
```tsx
          {loading ? (
            <LoadingState label="Cargando perfil…" />
          ) : (
```

Quitar de cada archivo el import de `Loader` de `lucide-react` si queda sin uso — `npx tsc -b` lo señala.

- [ ] **Step 2: Reemplazar la pantalla de arranque**

En `src/App.tsx`, agregar los imports de `PixelBar` y `Trophy` de `lucide-react`, y reemplazar el bloque de carga (líneas 109-120):

```tsx
  if (!currentTournament) {
    return (
      <>
        <Scanlines />
        <div className="min-h-screen flex items-center justify-center bg-night px-6">
          <div className="w-full max-w-xs text-center space-y-6">
            <Trophy className="w-16 h-16 text-gold mx-auto" />
            <p className="font-arcade text-sm text-gold text-shadow-retro">
              FOOTBALL SIM
            </p>
            <PixelBar value={0} max={100} indeterminate />
            <p className="font-arcade text-[10px] text-grass-soft uppercase">
              Cargando torneo…
            </p>
          </div>
        </div>
      </>
    );
  }
```

- [ ] **Step 3: Skeleton en la lista de MatchHistory**

`MatchHistory.tsx:235-239` tiene un quinto indicador de carga que no estaba en el inventario original del spec, y encima diverge de los otros cuatro: usa `border-gold` donde el resto usa `border-led`.

Como es una lista de forma previsible, va `Skeleton` en vez de `LoadingState`: preserva el layout y evita el salto cuando llegan los datos. Reemplazar la rama `loading` por:

```tsx
          {loading ? (
            <div className="space-y-3" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : matches.length === 0 ? (
```

- [ ] **Step 4: Skeleton en las pestañas de ChampionsHistory**

Mismo criterio: `ChampionsPalmares` y `ChampionsTimeline` renderizan listas. Si el `LoadingState` del paso 1 hace saltar el layout al llegar los datos, sustituirlo por seis `<Skeleton className="h-16" />` dentro del `CardContent`. Si la vista ya se siente estable, dejar el `LoadingState` y anotarlo — no vale la pena forzar el skeleton donde el spinner ya funciona.

- [ ] **Step 5: Verificar que no quedan spinners circulares**

Run: `grep -rn "animate-spin" src --include="*.tsx" | grep -v __tests__`
Expected: solo la aparición de `TeamEditor.tsx:122` (el icono `RefreshCw` girando dentro de su botón, que es un caso legítimo distinto de un indicador de carga de pantalla). Ninguna en las cinco vistas migradas ni en `App.tsx`.

- [ ] **Step 6: Verificar tipos y correr la suite**

Run: `npx tsc -b && npm test`
Expected: tsc sin salida; PASS — 47 archivos, 327 pruebas.

- [ ] **Step 7: Commit**

```bash
git add src/components/tournament/ChampionsHistory.tsx src/components/tournament/HistoricalStats.tsx src/components/tournament/MatchHistory.tsx src/components/comparison/TeamComparison.tsx src/components/tournament/TeamProfileModal.tsx src/App.tsx
git commit -m "refactor(ui): una sola presentación de carga en toda la app

Había cinco, todas círculos girando suave en una app que mata los radios
y anima por pasos, y ni siquiera coincidían entre sí en el color. La
pantalla de arranque deja de ser texto pelado."
```

---

### Task 9: EmptyState en los estados vacíos y en las fases bloqueadas

**Files:**
- Modify: `src/components/tournament/MatchHistory.tsx:243`
- Modify: `src/components/tournament/TournamentHistory.tsx:133-138`
- Modify: `src/components/tournament/ChampionsHistory.tsx:126`
- Modify: `src/components/tournament/StatsDashboard.tsx:154,195`
- Modify: `src/components/tournament/HistoricalStats.tsx:194,240`
- Modify: `src/components/favorites/FavoritesView.tsx:112`
- Modify: `src/components/comparison/H2HMatchHistory.tsx:17`
- Modify: `src/components/tournament/ContinentalView.tsx`
- Modify: `src/components/tournament/ConfederationsCupView.tsx`
- Modify: `src/components/tournament/QualifiersView.tsx:56-62`
- Create: `src/components/tournament/__tests__/PhaseLocked.test.tsx`

**Interfaces:**
- Consumes: `EmptyState` (Task 6); helpers ya existentes de `src/utils/cycleProgress.ts` (`isContinentalDrawn`, `isConfederationsDrawn`) y de `src/utils/tournamentProgress.ts`
- Produces: nada

- [ ] **Step 1: Escribir la prueba que falla**

Crear `src/components/tournament/__tests__/PhaseLocked.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ConfederationsCupView } from '../ConfederationsCupView';
import { makeDrawnContinentalCycle } from '../../../test/fixtures/cycle';

describe('Fase bloqueada', () => {
  it('explica el desbloqueo y ofrece la salida cuando la confed no fue sorteada', async () => {
    // Continental sorteada pero sin terminar: la confed todavía no existe.
    const { cycle, teams } = makeDrawnContinentalCycle();
    const onNavigate = vi.fn();

    render(<ConfederationsCupView cycle={cycle} teams={teams} onNavigate={onNavigate} />);

    expect(screen.getByText(/se desbloquea/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /ir a continental/i }));
    expect(onNavigate).toHaveBeenCalledWith('continental');
  });
});
```

`src/test/fixtures/cycle.ts` ya expone `makeDrawnContinentalCycle()`, que devuelve `{ cycle, teams }` con la fase continental sorteada y la Copa Confederaciones todavía sin sortear — exactamente el estado que necesita esta prueba.

`ConfederationsCupView` y `ContinentalView` reciben hoy solo `{ cycle, teams }`. Ambas ganan la prop opcional en el paso siguiente:

```tsx
interface ConfederationsCupViewProps {
  cycle: Cycle;
  teams: Team[];
  onNavigate?: (view: string) => void;
}
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `npx vitest run src/components/tournament/__tests__/PhaseLocked.test.tsx`
Expected: FAIL — no existe el texto de desbloqueo.

- [ ] **Step 3: Agregar el EmptyState de fase bloqueada**

En `ConfederationsCupView.tsx`, antes del render normal:

```tsx
  if (!isConfederationsDrawn(cycle)) {
    return (
      <EmptyState
        icon={Lock}
        title="Copa Confederaciones bloqueada"
        description="Se desbloquea cuando terminen los cuatro torneos continentales y se conozcan los 8 finalistas."
        action={{ label: 'Ir a Continental', onClick: () => onNavigate?.('continental') }}
      />
    );
  }
```

En `ContinentalView.tsx`, el equivalente con `isContinentalDrawn(cycle)`:

```tsx
  if (!isContinentalDrawn(cycle)) {
    return (
      <EmptyState
        icon={Lock}
        title="Torneos continentales sin sortear"
        description="Sorteá los cuatro torneos continentales desde Progreso para empezar el ciclo."
        action={{ label: 'Ir a Progreso', onClick: () => onNavigate?.('wizard') }}
      />
    );
  }
```

En `QualifiersView.tsx`, reemplazar el bloque `No tournament available` (líneas 56-62):

```tsx
  if (!currentTournament) {
    return (
      <EmptyState
        icon={Globe2}
        title="Sin torneo activo"
        description="Creá un torneo desde el selector para ver las clasificatorias."
      />
    );
  }
```

`onNavigate` se propaga desde `App.tsx:189-192`, que ya pasa `cycle` y `teams` a ambas vistas: agregar `onNavigate={handleNavigate}`.

- [ ] **Step 4: Migrar el resto de los estados vacíos**

Reemplazar cada `<p>` gris por un `EmptyState` con icono acorde:

| Archivo:línea | Icono | Título | Descripción |
|---|---|---|---|
| `MatchHistory.tsx:243` | `History` | Sin partidos registrados | Los resultados aparecen acá a medida que se juegan. |
| `TournamentHistory.tsx:133` | `Archive` | Sin torneos | Creá uno desde el selector de torneos. |
| `TournamentHistory.tsx:138` | `Archive` | Sin torneos en esta categoría | Probá con otro filtro. |
| `ChampionsHistory.tsx:126` | `Medal` | Sin torneos completados | El palmarés se llena cuando se corone el primer campeón. |
| `StatsDashboard.tsx:154` | `BarChart3` | Sin partidos jugados | Simulá algunos partidos para ver estadísticas. |
| `StatsDashboard.tsx:195` | `BarChart3` | Faltan partidos | Se necesitan al menos 3 partidos jugados. |
| `HistoricalStats.tsx:194` | `History` | Sin partidos jugados | El historial se llena a medida que se juegan partidos. |
| `HistoricalStats.tsx:240` | `History` | Faltan partidos | Se necesitan al menos 3 partidos jugados. |
| `FavoritesView.tsx:112` | `Search` | Sin coincidencias | Ningún equipo coincide con la búsqueda. |
| `H2HMatchHistory.tsx:17` | `GitCompare` | Sin historial | Estos equipos todavía no se enfrentaron. |

- [ ] **Step 5: Correr las pruebas y verificar que pasan**

Run: `npx vitest run src/components/tournament/__tests__/PhaseLocked.test.tsx`
Expected: PASS — 1 prueba.

- [ ] **Step 6: Verificar tipos y correr la suite**

Run: `npx tsc -b && npm test`
Expected: tsc sin salida; PASS — 48 archivos, 328 pruebas.

- [ ] **Step 7: Commit**

```bash
git add src/components/tournament src/components/favorites src/components/comparison src/App.tsx
git commit -m "feat(ui): estados vacíos con forma y salida

Las fases bloqueadas dejan de ser una pantalla muerta: explican qué falta
para desbloquearlas y ofrecen el botón que lleva ahí."
```

---

## FASE 3 — Primitivos duplicados

### Task 10: Tabs

**Files:**
- Create: `src/components/ui/Tabs.tsx`
- Create: `src/components/ui/__tests__/Tabs.test.tsx`

**Interfaces:**
- Consumes: `cn`
- Produces:
  ```ts
  interface TabItem { id: string; label: string; icon?: LucideIcon }
  interface TabsProps {
    items: TabItem[];
    value: string;
    onChange: (id: string) => void;
    className?: string;
  }
  ```

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `src/components/ui/__tests__/Tabs.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Tabs } from '../Tabs';

const ITEMS = [
  { id: 'palmares', label: 'Palmarés' },
  { id: 'cronologia', label: 'Cronología' },
];

describe('Tabs', () => {
  it('expone los roles ARIA de lista de pestañas', () => {
    render(<Tabs items={ITEMS} value="palmares" onChange={vi.fn()} />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'Palmarés' })).toHaveAttribute('aria-selected', 'true');
  });

  it('cambia de pestaña al hacer click', async () => {
    const onChange = vi.fn();
    render(<Tabs items={ITEMS} value="palmares" onChange={onChange} />);

    await userEvent.click(screen.getByRole('tab', { name: 'Cronología' }));
    expect(onChange).toHaveBeenCalledWith('cronologia');
  });

  it('navega con las flechas y cicla en los extremos', async () => {
    const onChange = vi.fn();
    render(<Tabs items={ITEMS} value="palmares" onChange={onChange} />);

    screen.getByRole('tab', { name: 'Palmarés' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('cronologia');

    onChange.mockClear();
    await userEvent.keyboard('{ArrowLeft}');
    expect(onChange).toHaveBeenCalledWith('cronologia');
  });
});
```

La tercera aserción verifica el ciclado: desde la primera pestaña, `ArrowLeft` va a la última.

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `npx vitest run src/components/ui/__tests__/Tabs.test.tsx`
Expected: FAIL — `Failed to resolve import "../Tabs"`.

- [ ] **Step 3: Crear el Tabs**

Crear `src/components/ui/Tabs.tsx`:

```tsx
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface TabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
}

interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * Barra de pestañas única para toda la app. Reemplaza las cinco copias que
 * había de la misma cadena de clases, que ya habían divergido en padding.
 *
 * Aporta además los roles ARIA y la navegación por flechas, que ninguna de las
 * implementaciones a mano tenía.
 */
export function Tabs({ items, value, onChange, className }: TabsProps) {
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();

    const index = items.findIndex((item) => item.id === value);
    if (index === -1) return;

    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = (index + delta + items.length) % items.length;
    onChange(items[next].id);
  };

  return (
    <div
      role="tablist"
      onKeyDown={handleKeyDown}
      className={cn('flex border-b-4 border-grass overflow-x-auto', className)}
    >
      {items.map(({ id, label, icon: Icon }) => {
        const active = id === value;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-3 min-h-11 lg:min-h-0 whitespace-nowrap',
              'font-arcade text-[10px] uppercase border-b-4 transition-colors',
              active
                ? 'border-gold text-gold bg-grass/30'
                : 'border-transparent text-grass-soft hover:text-white hover:bg-grass/40'
            )}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `npx vitest run src/components/ui/__tests__/Tabs.test.tsx`
Expected: PASS — 3 pruebas.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/Tabs.tsx src/components/ui/__tests__/Tabs.test.tsx
git commit -m "feat(ui): componente Tabs con roles ARIA y navegación por flechas"
```

---

### Task 11: Migrar las cinco barras de pestañas

**Files:**
- Modify: `src/components/settings/SettingsHub.tsx:41`
- Modify: `src/components/tournament/HistoricalStats.tsx:150,161,172`
- Modify: `src/components/tournament/WorldCupViewEnhanced.tsx:156,173`
- Modify: `src/components/tournament/StatsDashboard.tsx:120,131`
- Modify: `src/components/tournament/ChampionsHistory.tsx:161,172`

**Interfaces:**
- Consumes: `Tabs`, `TabItem` (Task 10)
- Produces: nada

- [ ] **Step 1: Migrar StatsDashboard**

En `src/components/tournament/StatsDashboard.tsx`, reemplazar el bloque de líneas 116-140 por:

```tsx
      <Tabs
        items={[
          { id: 'current', label: 'Torneo Actual', icon: TrendingUp },
          { id: 'historical', label: 'Estadísticas Históricas', icon: History },
        ]}
        value={view}
        onChange={(id) => setView(id as 'current' | 'historical')}
      />
```

- [ ] **Step 2: Migrar ChampionsHistory**

En `src/components/tournament/ChampionsHistory.tsx`, reemplazar el bloque de líneas 158-181 por:

```tsx
      <Tabs
        items={[
          { id: 'palmares', label: 'Palmarés', icon: Trophy },
          { id: 'timeline', label: 'Cronología', icon: ListOrdered },
        ]}
        value={tab}
        onChange={(id) => setTab(id as 'palmares' | 'timeline')}
      />
```

- [ ] **Step 3: Migrar SettingsHub**

`SettingsHub` ya tiene su array `tabs` con `{ id, label, icon }`, así que la migración es directa. Reemplazar el bloque de líneas 33-52 por:

```tsx
        <Tabs items={tabs} value={activeTab} onChange={(id) => setActiveTab(id as typeof activeTab)} />
```

El array `tabs` existente ya cumple la forma de `TabItem`. Ojo: sus iconos venían con `w-5 h-5` y `Tabs` los normaliza a `w-4 h-4`, igual que el resto de la app.

- [ ] **Step 4: Migrar HistoricalStats y WorldCupViewEnhanced**

Mismo procedimiento: extraer las etiquetas e iconos de cada botón a un array `items`, pasar el estado como `value` y el setter como `onChange` (casteando el `string` al tipo del estado), y borrar el `<div className="flex border-b-4 border-grass">` que los envolvía.

`HistoricalStats` tiene tres pestañas (líneas 150, 161 y 172) y `WorldCupViewEnhanced` dos (líneas 156 y 173). Las dos de `WorldCupViewEnhanced` y las de `SettingsHub` usaban `px-6 py-4`; al migrar quedan en `px-4 py-3`, el padding mayoritario. Es el cambio visual buscado, no una regresión.

- [ ] **Step 5: Verificar que no quedan copias de la clase**

Run: `grep -rn "border-b-4 transition-colors" src --include="*.tsx" | grep -v __tests__ | grep -v "ui/Tabs.tsx"`
Expected: sin resultados.

- [ ] **Step 6: Verificar tipos y correr la suite**

Run: `npx tsc -b && npm test`
Expected: tsc sin salida; PASS — 49 archivos, 331 pruebas.

- [ ] **Step 7: Commit**

```bash
git add src/components/settings/SettingsHub.tsx src/components/tournament/HistoricalStats.tsx src/components/tournament/WorldCupViewEnhanced.tsx src/components/tournament/StatsDashboard.tsx src/components/tournament/ChampionsHistory.tsx
git commit -m "refactor(ui): las cinco vistas con pestañas usan el componente Tabs"
```

---

### Task 12: ViewHeader

**Files:**
- Create: `src/components/ui/ViewHeader.tsx`
- Create: `src/components/ui/__tests__/ViewHeader.test.tsx`
- Modify: los 14 archivos con encabezado (ver tabla en el paso 4)

**Interfaces:**
- Consumes: `cn`
- Produces:
  ```ts
  interface ViewHeaderProps {
    icon: LucideIcon;
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
  }
  ```

- [ ] **Step 1: Escribir la prueba que falla**

Crear `src/components/ui/__tests__/ViewHeader.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Trophy } from 'lucide-react';
import { ViewHeader } from '../ViewHeader';

describe('ViewHeader', () => {
  it('renderiza el título como encabezado de nivel 2', () => {
    render(<ViewHeader icon={Trophy} title="Copa del Mundo" subtitle="Mundial 2026" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Copa del Mundo' })).toBeInTheDocument();
    expect(screen.getByText('Mundial 2026')).toBeInTheDocument();
  });

  it('renderiza las acciones que recibe', () => {
    render(<ViewHeader icon={Trophy} title="Copa del Mundo" actions={<button>Regenerar</button>} />);
    expect(screen.getByRole('button', { name: 'Regenerar' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr la prueba y verificar que falla**

Run: `npx vitest run src/components/ui/__tests__/ViewHeader.test.tsx`
Expected: FAIL — `Failed to resolve import "../ViewHeader"`.

- [ ] **Step 3: Crear el ViewHeader**

Crear `src/components/ui/ViewHeader.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CardHeader } from './Card';

interface ViewHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

/**
 * Encabezado de vista con una única escala responsive.
 *
 * Antes cada vista repetía la misma cadena de clases y tres ya habían
 * divergido, así que en móvil algunos títulos se achicaban y otros no. Se fija
 * `text-base sm:text-lg`: Press Start 2P a `text-lg` desborda en móvil con los
 * títulos largos.
 */
export function ViewHeader({ icon: Icon, title, subtitle, actions }: ViewHeaderProps) {
  return (
    <CardHeader>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Icon className="w-8 h-8 text-gold flex-shrink-0" />
          <div className="min-w-0">
            <h2 className="font-arcade text-base sm:text-lg text-white text-shadow-retro truncate">
              {title}
            </h2>
            {subtitle && <p className="text-grass-soft text-sm mt-1 truncate">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
      </div>
    </CardHeader>
  );
}
```

- [ ] **Step 4: Correr la prueba y verificar que pasa**

Run: `npx vitest run src/components/ui/__tests__/ViewHeader.test.tsx`
Expected: PASS — 2 pruebas.

- [ ] **Step 5: Migrar los encabezados**

Sustituir en cada uno el `<CardHeader>` con el `<h2>` a mano por `<ViewHeader>`:

| Archivo:línea | Título resultante |
|---|---|
| `SettingsHub.tsx:27` | Configuración |
| `TournamentHistory.tsx:94` | Historial de Torneos |
| `WorldCupGridView.tsx:27` | Fase de Grupos del Mundial |
| `QualifiersView.tsx:114` | Clasificatorias |
| `TournamentOverview.tsx:35` | Progreso del Torneo |
| `WorldCupViewEnhanced.tsx:35` | Copa del Mundo |
| `WorldCupViewEnhanced.tsx:144` | Copa del Mundo |
| `RegionView.tsx:42` | `{region}` |
| `KnockoutView.tsx:275` | Eliminación Directa |
| `TeamComparison.tsx:163` | Comparación |
| `TournamentWizard.tsx:279` | Progreso del Torneo |

Tres encabezados quedan **fuera** por no ser encabezados de vista: `ChampionCelebration.tsx:67` (nombre del campeón dentro de una celebración), `GroupDetailModal.tsx:65` (título de modal) y `TournamentWizard.tsx:540` (el `<h3>` del cartel de torneo completado). Dejarlos como están: forzarlos en la API la ensancharía con props de un solo uso.

- [ ] **Step 6: Verificar tipos y correr la suite**

Run: `npx tsc -b && npm test`
Expected: tsc sin salida; PASS — 50 archivos, 333 pruebas.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/ViewHeader.tsx src/components/ui/__tests__/ViewHeader.test.tsx src/components
git commit -m "refactor(ui): ViewHeader con una sola escala responsive

Tres encabezados ya habían divergido: en móvil unos títulos se achicaban
y otros desbordaban."
```

---

## FASE 4 — Sidebar y microcopy

### Task 13: Sidebar agrupado con iconos únicos y fases bloqueadas

**Files:**
- Modify: `src/components/ui/Sidebar.tsx`
- Modify: `src/components/ui/__tests__/Sidebar.test.tsx`
- Modify: `src/App.tsx:143-147` (pasar el ciclo al Sidebar)

**Interfaces:**
- Consumes: `EmptyState` no; helpers de `src/utils/cycleProgress.ts` (`isContinentalDrawn`, `isConfederationsDrawn`) y `src/utils/tournamentProgress.ts`
- Produces: nada

- [ ] **Step 1: Escribir las pruebas que fallan**

Ampliar `src/components/ui/__tests__/Sidebar.test.tsx` con los casos nuevos, conservando el existente:

```tsx
  it('agrupa los ítems en secciones', () => {
    useTournamentStore.setState({ tournaments: [], currentTournamentId: null });
    render(<Sidebar currentView="wizard" onViewChange={vi.fn()} tournamentYear={2026} />);

    expect(screen.getByText('Ciclo actual')).toBeInTheDocument();
    expect(screen.getByText('Análisis')).toBeInTheDocument();
    expect(screen.getByText('Archivo')).toBeInTheDocument();
  });

  it('marca como bloqueadas las fases no desbloqueadas pero las deja clickeables', async () => {
    useTournamentStore.setState({ tournaments: [], currentTournamentId: null });
    const onViewChange = vi.fn();
    render(
      <Sidebar
        currentView="wizard"
        onViewChange={onViewChange}
        tournamentYear={2026}
        lockedViews={['confederations']}
      />
    );

    const confed = screen.getByRole('button', { name: /confederaciones/i });
    expect(confed).not.toBeDisabled();
    await userEvent.click(confed);
    expect(onViewChange).toHaveBeenCalledWith('confederations');
  });
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `npx vitest run src/components/ui/__tests__/Sidebar.test.tsx`
Expected: FAIL — no existen los encabezados de sección ni la prop `lockedViews`.

- [ ] **Step 3: Reagrupar el Sidebar**

En `src/components/ui/Sidebar.tsx`, reemplazar el array plano `menuItems` (líneas 15-29) por secciones, y agregar la prop `lockedViews`:

```tsx
import { Trophy, Globe2, Award, BarChart3, Settings, History, CalendarDays, GitCompare, Workflow, Archive, ChevronLeft, ChevronRight, Medal, Star, Route, Shield, Lock } from 'lucide-react';

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  tournamentYear: number;
  /** Fases del ciclo todavía no desbloqueadas: se marcan, pero siguen navegables. */
  lockedViews?: View[];
}

const SECTIONS: { title: string; items: { id: View; icon: LucideIcon; label: string }[] }[] = [
  {
    title: 'Ciclo actual',
    items: [
      { id: 'wizard', icon: Workflow, label: 'Progreso' },
      { id: 'matches', icon: CalendarDays, label: 'Centro de Partidos' },
      { id: 'continental', icon: Globe2, label: 'Continental' },
      { id: 'confederations', icon: Shield, label: 'Confederaciones' },
      { id: 'qualifiers', icon: Route, label: 'Clasificatorias' },
      { id: 'worldcup', icon: Trophy, label: 'Mundial' },
    ],
  },
  {
    title: 'Análisis',
    items: [
      { id: 'stats', icon: BarChart3, label: 'Estadísticas' },
      { id: 'comparison', icon: GitCompare, label: 'Comparar' },
      { id: 'favorites', icon: Star, label: 'Favoritos' },
    ],
  },
  {
    title: 'Archivo',
    items: [
      { id: 'champions', icon: Medal, label: 'Campeones' },
      { id: 'history', icon: History, label: 'Historial' },
      { id: 'tournaments', icon: Archive, label: 'Torneos' },
    ],
  },
];

const FOOTER_ITEM = { id: 'settings' as View, icon: Settings, label: 'Configuración' };
```

El orden dentro de "Ciclo actual" sigue el orden real del ciclo. Hoy Clasificatorias aparece antes que Continental, aunque se juegue después.

Los iconos duplicados quedan resueltos: `Globe2` solo en Continental, `Route` en Clasificatorias, `Trophy` en Mundial, `Shield` en Confederaciones. El `Trophy` del encabezado del sidebar no es navegación.

En el `<nav>`, renderizar cada sección con su encabezado (oculto al colapsar) y, para los ítems bloqueados, sustituir el icono por `Lock` y agregar `opacity-50`:

```tsx
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {SECTIONS.map((section) => (
            <div key={section.title} className="space-y-1">
              {!isCollapsed ? (
                <p className="px-3 font-arcade text-[9px] text-grass-soft uppercase">
                  {section.title}
                </p>
              ) : (
                <div className="border-t-2 border-grass mx-2" />
              )}
              {section.items.map((item) => renderItem(item))}
            </div>
          ))}
        </nav>
```

`renderItem` se define dentro del componente, conservando el markup del botón actual (líneas 83-100):

```tsx
  const renderItem = (item: { id: View; icon: LucideIcon; label: string }) => {
    const isActive = currentView === item.id;
    const locked = lockedViews?.includes(item.id) ?? false;
    // La fase bloqueada muestra candado en lugar de su icono, pero el botón
    // sigue habilitado: entrar lleva al EmptyState que explica el desbloqueo.
    const Icon = locked ? Lock : item.icon;

    return (
      <button
        key={item.id}
        onClick={() => onViewChange(item.id)}
        title={locked ? `${item.label} — todavía bloqueada` : isCollapsed ? item.label : undefined}
        className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all duration-150 ${
          isActive
            ? 'bg-grass text-white'
            : 'text-grass-soft hover:bg-grass/40 hover:text-white'
        } ${locked ? 'opacity-50' : ''} ${isCollapsed ? 'justify-center' : ''}`}
      >
        <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-gold' : 'text-grass-soft'}`} />
        {!isCollapsed && (
          <span className="truncate font-arcade text-[10px] uppercase leading-relaxed">
            {isActive && <span className="text-gold">▶ </span>}
            {item.label}
          </span>
        )}
      </button>
    );
  };
```

El `FOOTER_ITEM` se renderiza con el mismo `renderItem` en el pie, antes del bloque de versión.

- [ ] **Step 4: Calcular `lockedViews` en App.tsx**

En `src/App.tsx`, derivar la lista y pasarla:

```tsx
  const lockedViews = useMemo(() => {
    if (!currentTournament) return [];
    const locked: string[] = [];
    if (!isContinentalDrawn(currentTournament)) locked.push('continental');
    if (!isConfederationsDrawn(currentTournament)) locked.push('confederations');
    if (!currentTournament.confederationsCup.isComplete) locked.push('qualifiers');
    if (!currentTournament.worldCup) locked.push('worldcup');
    return locked as View[];
  }, [currentTournament]);
```

`useMemo` debe declararse antes de los returns condicionales de las líneas 100 y 109, y ser tolerante a `currentTournament` nulo — mismo motivo que documenta `TournamentWizard.tsx:124-127`: si la cantidad de hooks cambia entre renders, React lanza "Rendered more hooks than during the previous render".

Pasar la prop: `<Sidebar ... lockedViews={lockedViews} />`.

- [ ] **Step 5: Correr las pruebas y verificar que pasan**

Run: `npx vitest run src/components/ui/__tests__/Sidebar.test.tsx`
Expected: PASS — 3 pruebas.

- [ ] **Step 6: Verificar tipos y correr la suite**

Run: `npx tsc -b && npm test`
Expected: tsc sin salida; PASS — 50 archivos, 335 pruebas.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/Sidebar.tsx src/components/ui/__tests__/Sidebar.test.tsx src/App.tsx
git commit -m "feat(ui): sidebar agrupado, iconos únicos y fases bloqueadas visibles

Globe2 servía para Clasificatorias y Continental, y Award para Mundial y
Confederaciones: justo las cuatro fases que más se confunden entre sí."
```

---

### Task 14: Microcopy

**Files:**
- Modify: `src/components/ui/Sidebar.tsx:46`
- Modify: `src/components/tournament/TeamEditor.tsx` (archivo casi entero en inglés)
- Modify: `src/components/tournament/GroupView.tsx:106`
- Modify: `src/components/tournament/WorldCupGridView.tsx:168`
- Modify: `src/components/tournament/HistoricalStats.tsx:105`
- Modify: `src/components/tournament/ExportImport.tsx:101`

**Interfaces:**
- Consumes: nada
- Produces: nada

- [ ] **Step 1: Traducir los strings sueltos**

| Archivo:línea | Antes | Después |
|---|---|---|
| `Sidebar.tsx:46` | `World Cup` | `Ciclo mundial` |
| `GroupView.tsx:106` | `Back to Regions` | `Volver a regiones` |
| `WorldCupGridView.tsx:168` | `All matches played` | `Todos los partidos jugados` |
| `HistoricalStats.tsx:105` | `Supabase Not Configured` | `Supabase sin configurar` |
| `ExportImport.tsx:101` | `Failed to import tournament` | `No se pudo importar el torneo` |

`Sidebar.tsx:46` decía "World Cup" bajo el año, pero el ciclo es mucho más que el Mundial: incluye continentales, Confederaciones y clasificatorias.

- [ ] **Step 2: Traducir TeamEditor completo**

`TeamEditor` quedó casi entero sin traducir. Además de los ya cubiertos en la Fase 1:

| Línea | Antes | Después |
|---|---|---|
| `113` | `Team Editor` | `Editor de Equipos` |
| `123` | `Refreshing...` / `Refresh from DB` | `Actualizando…` / `Actualizar desde la base` |
| `134` | `Search teams...` | `Buscar equipo…` |
| `146` | `All Regions ({teams.length})` | `Todas las regiones ({teams.length})` |
| `158` | `No teams found` | Se reemplaza por `<EmptyState icon={Search} title="Sin coincidencias" description="Ningún equipo coincide con la búsqueda." />` |

Las regiones del `<option>` (`Europe`, `America`, `Africa`, `Asia`) son valores del tipo `Region`, no texto de interfaz: **no se traducen**, porque el valor viaja a la base. Si se quisiera mostrarlas en español haría falta un mapa de etiquetas, que queda fuera de alcance.

- [ ] **Step 3: Unificar la elipsis**

Run: `grep -rn "\.\.\.'" src --include="*.tsx" | grep -v __tests__`
Reemplazar cada `...` de texto visible por `…`. No tocar los spread de JavaScript (`...props`, `...items`), que el grep del patrón `...'` ya excluye en su mayoría — revisar cada resultado antes de cambiarlo.

- [ ] **Step 4: Verificar que no queda inglés visible**

Run: `grep -rnE "placeholder=\"[A-Z][a-z]+ [a-z]+\.\.\.\"|>(Search|Refresh|All Regions|Team Editor|Back to|No teams|All matches)" src --include="*.tsx" | grep -v __tests__`
Expected: sin resultados.

- [ ] **Step 5: Verificar tipos y correr la suite**

Run: `npx tsc -b && npm test`
Expected: tsc sin salida; PASS — 50 archivos, 335 pruebas.

- [ ] **Step 6: Commit**

```bash
git add src/components
git commit -m "fix(ui): traducir el microcopy en inglés y unificar la elipsis"
```

---

### Task 15: Verificación manual y cierre

**Files:** ninguno — es una pasada de verificación

- [ ] **Step 1: Build de producción**

Run: `npm run build`
Expected: `tsc -b` sin errores y build de Vite exitoso.

- [ ] **Step 2: Levantar la app**

Run: `npm run dev`
Abrir la URL que imprime Vite.

- [ ] **Step 3: Recorrer un ciclo completo**

Con un torneo nuevo, verificar en orden:

1. La pantalla de arranque muestra el trofeo y la barra indeterminada, no `LOADING…` pelado.
2. El sidebar muestra las tres secciones, y Confederaciones/Clasificatorias/Mundial aparecen con candado.
3. Entrar a Confederaciones bloqueada: el `EmptyState` explica el desbloqueo y el botón lleva a Continental.
4. Sortear continentales desde Progreso: **no aparece ningún diálogo**, solo el toast, y navega a Continental.
5. Simular la jornada: el botón entra en estado `loading` y el texto bajo él advierte sobre los filtros.
6. Completar continental y confederaciones: los candados van desapareciendo del sidebar.
7. En Torneos, apretar el botón rojo de basura: **aparece el diálogo retro**, en rojo. Cancelar deja el torneo. Confirmar lo borra.
8. Recorrer Estadísticas, Campeones e Historial: las pestañas responden a las flechas del teclado.
9. Ninguna pantalla muestra texto en inglés.

- [ ] **Step 4: Verificar que no quedó ningún diálogo nativo**

Run: `grep -rn "window.confirm\|window.alert\|[^.]confirm(\|[^.]alert(" src --include="*.tsx" --include="*.ts" | grep -v __tests__`
Expected: sin resultados.

- [ ] **Step 5: Commit final si hubo ajustes**

```bash
git add -A
git commit -m "fix(ui): ajustes de la verificación manual"
```

---

## Cobertura del spec

| Requisito del spec | Task |
|---|---|
| `ConfirmDialog` sobre Radix | 2 |
| 5 sitios destructivos migrados (incluido el borrado sin freno) | 3 |
| 8 acciones de avance sin diálogo | 4 |
| Advertencia de filtros de `MatchCenter` preservada | 4 |
| "Generar Dieciseisavos" unificado | 4 |
| 6 `alert()` eliminados, 2 como error inline | 5 |
| `Spinner` cuadrado por pasos | 1 |
| `Button` con `loading` | 1 |
| `Skeleton` (componente + adopción en `MatchHistory` y `ChampionsHistory`) | 7, 8 |
| `EmptyState` | 6, 9 |
| Pantalla de arranque | 8 |
| `PixelBar` indeterminada | 7 |
| `EmptyState` de fase bloqueada en las 4 vistas | 9 |
| `Tabs` con roles ARIA y flechas | 10, 11 |
| `ViewHeader` con escala única | 12 |
| Sidebar agrupado en 3 secciones | 13 |
| Iconos únicos por fase | 13 |
| Fases bloqueadas marcadas y navegables | 13 |
| Microcopy traducido + elipsis unificada | 14 |
| Verificación manual del ciclo completo | 15 |

## Hallazgos posteriores al spec

Cosas que aparecieron al escribir el plan y que el spec no registraba:

- **Hay cinco indicadores de carga, no cuatro.** `MatchHistory.tsx:236` tiene el quinto, y usa `border-gold` donde los otros usan `border-led`. Cubierto por la Task 8.
- **`TeamEditor` está casi entero sin traducir**, no solo los cuatro strings que listaba el spec: también `Team Editor`, `Refresh from DB`, `Refreshing...`, `All Regions` y `Search teams...`. Cubierto por la Task 14.
- **`ContinentalView` y `ConfederationsCupView` no reciben `onNavigate`.** Hay que agregarles la prop opcional para que el `EmptyState` de fase bloqueada pueda ofrecer salida. Cubierto por la Task 9.
- **Las regiones (`Europe`, `America`, `Africa`, `Asia`) no se traducen**: son valores del tipo `Region` que viajan a la base. Mostrarlas en español requeriría un mapa de etiquetas, que queda fuera de alcance.
