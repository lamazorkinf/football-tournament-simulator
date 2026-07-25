import { PixelBar } from './PixelBar';
import { DEFAULT_FATIGUE, ENERGY_MAX } from '../../core/energy';

interface EnergyMeterProps {
  /** 60-100. */
  energy: number;
  /** Nombre del equipo, para el lector de pantalla. */
  label: string;
}

/**
 * La barra arranca en el piso de energía y no en cero: entre 60 y 100 hay 40
 * puntos útiles, y mapearlos sobre 0-100 dejaría la barra siempre más de medio
 * llena y sin diferencias visibles.
 */
export function EnergyMeter({ energy, label }: EnergyMeterProps) {
  const floor = DEFAULT_FATIGUE.energyMin;
  const span = ENERGY_MAX - floor;
  const normalized = Math.max(0, Math.min(span, energy - floor));

  const color = energy >= 85 ? 'led' : energy >= 72 ? 'gold' : 'loss';

  // `PixelBar` trae su propio role="meter", pero con los valores normalizados
  // (0-40), que no son los que el usuario ve ni los que sirven a un lector de
  // pantalla. Se la marca aria-hidden y el medidor accesible es el contenedor,
  // que declara la energía real.
  return (
    <div
      className="flex items-center gap-2"
      role="meter"
      aria-label={`Energía de ${label}`}
      aria-valuenow={Math.round(energy)}
      aria-valuemin={floor}
      aria-valuemax={ENERGY_MAX}
    >
      <div aria-hidden="true" className="flex-1">
        <PixelBar value={normalized} max={span} color={color} />
      </div>
      <span className="text-xs text-grass-soft tabular-nums">{Math.round(energy)}%</span>
    </div>
  );
}
