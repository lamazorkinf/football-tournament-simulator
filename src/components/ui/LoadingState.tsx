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
