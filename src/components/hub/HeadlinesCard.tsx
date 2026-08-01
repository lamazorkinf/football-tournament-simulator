import { Flame, Shield, Target, TrendingUp, Zap, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';
import { TeamFlag } from '../ui/TeamFlag';
import { penaltiesLabel } from '../../utils/matchLabels';
import { cn } from '../../lib/utils';
import type { HeadlineKind } from '../../core/headlines';
import type { HeadlineView } from '../../hooks/useRecentHeadlines';

const KIND_ICON: Record<HeadlineKind, LucideIcon> = {
  upset: Zap,
  rout: Flame,
  decider: Target,
  hold: Shield,
  streak: TrendingUp,
};

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
          return (
            <div key={`${headline.match.homeTeamId}-${headline.match.awayTeamId}`} className="space-y-1">
              <p className="font-arcade text-[9px] text-gold flex items-center gap-2">
                <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
                {headline.label}
              </p>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 min-w-0">
                  <TeamFlag
                    teamId={headline.match.homeTeamId}
                    teamName={headline.homeTeamName}
                    size={24}
                  />
                  <span
                    className={cn(
                      'truncate',
                      headline.subjectTeamId === headline.match.homeTeamId && 'text-gold',
                    )}
                  >
                    {headline.homeTeamName}
                  </span>
                </span>
                <span className="font-arcade text-sm text-white shrink-0">
                  {headline.match.homeScore} - {headline.match.awayScore}
                </span>
                <span className="flex items-center gap-2 min-w-0 justify-end">
                  <span
                    className={cn(
                      'truncate',
                      headline.subjectTeamId === headline.match.awayTeamId && 'text-gold',
                    )}
                  >
                    {headline.awayTeamName}
                  </span>
                  <TeamFlag
                    teamId={headline.match.awayTeamId}
                    teamName={headline.awayTeamName}
                    size={24}
                  />
                </span>
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
