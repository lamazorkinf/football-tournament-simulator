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
