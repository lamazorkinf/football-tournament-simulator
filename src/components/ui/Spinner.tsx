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
