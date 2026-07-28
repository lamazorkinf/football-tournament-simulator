import { Play, Radio } from 'lucide-react';
import { Button } from './Button';
import { useLiveMatchStore, type LiveMatchDescriptor } from '../../store/useLiveMatchStore';

/**
 * LA OFERTA DE SIMULACIÓN DEL JUEGO — cuatro acciones, las mismas en todos los
 * modos y en todas las vistas:
 *
 *   1. Jugar          — simular un partido (resultado directo)
 *   2. Ver en vivo    — simular un partido y reproducirlo minuto a minuto
 *   3. Simular jornada— simular la jornada en curso entera
 *   4. Jornada en vivo— simular la jornada y reproducirla en la grilla en vivo
 *
 * Nada más. Antes cada vista inventaba las suyas ("Jugar todo", "Jugar ronda",
 * "Simular" en una y "Jugar" en otra), así que la misma acción cambiaba de
 * nombre —y de existencia— según dónde estuvieras. Estos dos componentes son el
 * único lugar donde se dibujan: sumar una vista no vuelve a abrir esa puerta.
 */

interface MatchSimActionsProps {
  /** Simulación individual. Sin esto no se ofrece (partido ya jugado, etc.). */
  onSimulate?: () => void;
  /** Datos para reproducir el partido en vivo. */
  live?: LiveMatchDescriptor;
  disabled?: boolean;
  /** Motivo del bloqueo, como tooltip. */
  disabledTitle?: string;
  /** Los dos botones al ancho del contenedor (tarjetas angostas, mobile). */
  stacked?: boolean;
  className?: string;
}

/** Las dos acciones de UN partido: jugarlo o verlo en vivo. */
export function MatchSimActions({
  onSimulate,
  live,
  disabled = false,
  disabledTitle,
  stacked = false,
  className = '',
}: MatchSimActionsProps) {
  const openLiveMatch = useLiveMatchStore((s) => s.openLiveMatch);
  if (!onSimulate && !live) return null;

  return (
    <div className={`flex ${stacked ? 'flex-col' : 'flex-row'} gap-2 ${className}`}>
      {onSimulate && (
        <Button
          variant="primary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onSimulate();
          }}
          disabled={disabled}
          title={disabled ? disabledTitle : undefined}
          className={`gap-1 ${stacked ? 'w-full' : 'flex-1 sm:flex-none'}`}
        >
          <Play className="w-3 h-3" /> Jugar
        </Button>
      )}
      {live && (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            openLiveMatch(live);
          }}
          disabled={disabled}
          title={disabled ? disabledTitle : undefined}
          className={`gap-1 ${stacked ? 'w-full' : 'flex-1 sm:flex-none'}`}
        >
          <Radio className="w-3 h-3" /> Ver en vivo
        </Button>
      )}
    </div>
  );
}

interface JornadaSimActionsProps {
  /** Rótulo de la jornada que se va a jugar (ej: 'Continental · Cuartos'). */
  jornadaLabel?: string;
  onSimulate: () => void;
  onSimulateLive: () => void;
  disabled?: boolean;
  /** Simulación en curso: los botones muestran el estado. */
  busy?: boolean;
  /** Aclaración bajo los botones (alcance de la jornada, por ejemplo). */
  hint?: string;
  className?: string;
}

/** Las dos acciones de UNA jornada: simularla entera o verla en vivo. */
export function JornadaSimActions({
  jornadaLabel,
  onSimulate,
  onSimulateLive,
  disabled = false,
  busy = false,
  hint,
  className = '',
}: JornadaSimActionsProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={onSimulate}
          disabled={disabled}
          loading={busy}
          className="gap-2"
        >
          {!busy && <Play className="w-4 h-4" />}
          <span>{busy ? 'Simulando…' : 'Simular jornada'}</span>
        </Button>
        <Button
          variant="outline"
          onClick={onSimulateLive}
          disabled={disabled || busy}
          className="gap-2"
        >
          <Radio className="w-4 h-4" />
          <span>Jornada en vivo</span>
        </Button>
      </div>
      {(jornadaLabel || hint) && (
        <p className="text-xs text-grass-soft">
          {jornadaLabel && (
            <span className="font-arcade text-[10px] text-gold uppercase">{jornadaLabel}</span>
          )}
          {jornadaLabel && hint ? ' — ' : ''}
          {hint}
        </p>
      )}
    </div>
  );
}
