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
