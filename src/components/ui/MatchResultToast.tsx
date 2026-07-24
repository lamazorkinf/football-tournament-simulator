import { toast } from 'sonner';
import { penaltiesLabel, type PenaltiesScore } from '../../utils/matchLabels';

export interface MatchResultToastProps {
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  /** Solo las eliminatorias pueden terminar en penales. */
  penalties?: PenaltiesScore | null;
}

/**
 * Contenido del aviso que anuncia el resultado de UN partido simulado.
 * Es el mismo en todas las fases: antes cada vista armaba su propio mensaje
 * (grupos decía "¡Partido jugado! 1 - 1", eliminatorias solo "🏆"), así que un
 * 1-1 definido por penales se leía como empate según dónde lo simularas.
 */
export function MatchResultToast({
  homeName,
  awayName,
  homeScore,
  awayScore,
  penalties,
}: MatchResultToastProps) {
  const penales = penaltiesLabel(penalties);

  return (
    <div className="flex items-center gap-3">
      <span aria-hidden="true">⚽</span>
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{homeName}</span>
          <span className="font-bold text-lg px-2 tabular-nums">
            {homeScore} - {awayScore}
          </span>
          <span className="font-semibold">{awayName}</span>
        </div>
        {penales && <span className="text-xs text-gold">{penales}</span>}
      </div>
    </div>
  );
}

/** Único punto de emisión del aviso de resultado en toda la app. */
export function showMatchResultToast(props: MatchResultToastProps) {
  toast.success(<MatchResultToast {...props} />, { duration: 5000 });
}
