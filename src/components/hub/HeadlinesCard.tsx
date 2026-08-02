import { Flame, Shield, Target, TrendingUp, Zap, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';
import { TeamFlag } from '../ui/TeamFlag';
import { penaltiesLabel } from '../../utils/matchLabels';
import { cn } from '../../lib/utils';
import type { HeadlineKind, HeadlineView } from '../../core/headlines';

const KIND_ICON: Record<HeadlineKind, LucideIcon> = {
  upset: Zap,
  rout: Flame,
  decider: Target,
  hold: Shield,
  streak: TrendingUp,
};

/**
 * Fila de un equipo dentro del marcador de un partido: agrupa su escudo, su
 * nombre y su gol. Sirve para las dos variantes del layout SIN duplicar el
 * nombre ni el escudo en el DOM:
 *
 * - Marcador apilado (< `sm`, el piso de 320 px del proyecto): es un renglón
 *   propio, con el gol de ESE equipo a la derecha — un marcador de verdad.
 * - Fila ancha (>= `sm`, el diseño aprobado): el wrapper se "aplana" con
 *   `display: contents`, así que el bloque escudo+nombre pasa a ser un ítem
 *   directo de esa fila, junto al marcador combinado que se dibuja aparte
 *   (ver más abajo). El gol individual de este componente queda oculto ahí:
 *   la fila ancha muestra el marcador combinado "home - away", no dos goles
 *   sueltos.
 */
function TeamScoreRow({
  teamId,
  teamName,
  score,
  highlighted,
  mirror = false,
}: {
  teamId: string;
  teamName: string;
  score: number;
  highlighted: boolean;
  /** El equipo visitante se ve invertido (nombre, escudo) en la fila ancha. */
  mirror?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 sm:contents">
      <span className={cn('flex items-center gap-2 min-w-0', mirror && 'sm:flex-row-reverse')}>
        <TeamFlag teamId={teamId} teamName={teamName} size={24} />
        <span className={cn('truncate', highlighted && 'text-gold')}>{teamName}</span>
      </span>
      <span className="font-arcade text-sm text-white shrink-0 sm:hidden">{score}</span>
    </div>
  );
}

/**
 * La portada del Hub: lo más notable de los últimos partidos del modo.
 *
 * Presentacional puro — recibe todo por props y no importa ningún store, igual
 * que `HubView`. Con la lista vacía no rinde nada: el bloque aparece cuando hay
 * algo que contar, no antes.
 */
export function HeadlinesCard({ headlines }: { headlines: HeadlineView[] }) {
  if (headlines.length === 0) return null;

  return (
    <Card>
      <CardContent className="py-4 space-y-4">
        {/* "TITULARES" y no "LO ÚLTIMO": Press Start 2P no tiene la Ú mayúscula,
            y escribirlo sin tilde sería una falta de ortografía en pantalla. */}
        <p className="font-arcade text-[9px] text-grass-soft uppercase">Titulares</p>

        {headlines.map((headline) => {
          const Icon = KIND_ICON[headline.kind];
          const penales = penaltiesLabel(headline.match.penalties);
          const homeHighlighted = headline.subjectTeamId === headline.match.homeTeamId;
          const awayHighlighted = headline.subjectTeamId === headline.match.awayTeamId;
          return (
            /* El par de equipos alcanza como `key` porque `deriveHeadlines`
               garantiza que un equipo no aparece dos veces en la lista que
               devuelve (ver la deduplicación por equipo en `core/headlines.ts`).
               Si esa regla cambiara, acá habría colisión de keys. */
            <div key={`${headline.match.homeTeamId}-${headline.match.awayTeamId}`} className="space-y-1">
              <p className="font-arcade text-[9px] text-gold flex items-center gap-2">
                <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
                {headline.label}
              </p>

              {/* Contenedor único para las dos variantes: columna apilada por
                  debajo de `sm` (un renglón por equipo), fila ancha desde
                  `sm` (el diseño aprobado, con el marcador combinado en el
                  medio). `TeamScoreRow` no se duplica — el mismo bloque
                  escudo+nombre cambia de posición por CSS. */}
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <TeamScoreRow
                  teamId={headline.match.homeTeamId}
                  teamName={headline.homeTeamName}
                  score={headline.match.homeScore}
                  highlighted={homeHighlighted}
                />
                {/* Marcador combinado: sólo se ve desde `sm`, cuando la fila
                    ancha reemplaza a los goles individuales de cada renglón. */}
                <span className="hidden sm:inline font-arcade text-sm text-white shrink-0">
                  {headline.match.homeScore} - {headline.match.awayScore}
                </span>
                <TeamScoreRow
                  teamId={headline.match.awayTeamId}
                  teamName={headline.awayTeamName}
                  score={headline.match.awayScore}
                  highlighted={awayHighlighted}
                  mirror
                />
              </div>

              <p className="text-grass-soft text-xs">
                {headline.detail}
                {penales && ` · ${penales}`}
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
