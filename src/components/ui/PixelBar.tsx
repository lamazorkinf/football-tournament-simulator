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
