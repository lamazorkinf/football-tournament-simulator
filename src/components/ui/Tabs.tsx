import { useRef } from 'react';
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
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();

    const index = items.findIndex((item) => item.id === value);
    if (index === -1) return;

    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = (index + delta + items.length) % items.length;
    const nextId = items[next].id;
    onChange(nextId);
    // El foco acompaña a la pestaña activa (patrón ARIA): si se queda atrás,
    // el lector de pantalla sigue anunciando la anterior y el Tab siguiente
    // sale del tablist desde el botón equivocado.
    tabRefs.current[nextId]?.focus();
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
            ref={(el) => {
              tabRefs.current[id] = el;
            }}
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
