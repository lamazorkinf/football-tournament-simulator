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
