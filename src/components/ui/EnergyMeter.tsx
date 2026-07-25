import { PixelBar } from './PixelBar';
import { ENERGY_MAX } from '../../core/energy';
import { useConfigStore } from '../../store/useConfigStore';

interface EnergyMeterProps {
  /** 60-100 (o el rango que tenga configurado el piso de fatiga). */
  energy: number;
  /** Nombre del equipo, para el lector de pantalla. */
  label: string;
}

/**
 * La barra arranca en el piso de energía y no en cero: entre el piso y 100
 * hay puntos útiles, y mapearlos sobre 0-100 dejaría la barra siempre más de
 * medio llena y sin diferencias visibles.
 *
 * El piso sale del config EN VIVO, vía `useConfigStore` con selector (no
 * `getEngineConfig()`, que no suscribe: ver Task 9), no de `DEFAULT_FATIGUE`
 * — mismo criterio que ya sigue `commitEnergy` en `core/energy.ts`: el
 * usuario puede bajarlo desde Ajustes (rango 40-90) y clampear contra el
 * default lo ignoraría en silencio. Si el piso bajara a 40, tratar como
 * vacío todo lo que cae entre 40 y 60 rompería la barra Y el
 * `aria-valuemin`/`aria-valuenow` (un `aria-valuenow` por debajo de
 * `aria-valuemin` es un estado ARIA inválido); si subiera a 90, perdería la
 * resolución visual que es la razón de ser de este componente. Con el
 * selector, un cambio en Ajustes se refleja en cualquier medidor ya montado
 * sin recargar ni remontar.
 */
export function EnergyMeter({ energy, label }: EnergyMeterProps) {
  const floor = useConfigStore((s) => s.config.fatigue.energyMin);
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
