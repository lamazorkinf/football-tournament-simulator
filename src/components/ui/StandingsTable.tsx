import { Fragment, useState, useEffect } from 'react';
import type { TeamStanding, Team, Match } from '../../types';
import { cn } from '../../lib/utils';
import { TeamFlag } from './TeamFlag';
import { TeamNameTooltip } from './TeamNameTooltip';
import { sortStandings } from '../../core/scheduler';

interface StandingsTableProps {
  standings: TeamStanding[];
  teams: Team[];
  /** Partidos del grupo: necesarios para desempatar por enfrentamiento directo. */
  matches?: Match[];
  highlightQualified?: number;
  className?: string;
}

const thBase = 'px-2 sm:px-3 py-3 text-center font-arcade text-[10px] text-gold uppercase';
const tdBase = 'px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-center tabular-nums';

export function StandingsTable({
  standings,
  teams,
  matches,
  highlightQualified = 0,
  className,
}: StandingsTableProps) {
  // Always sort standings to ensure correct order
  const sortedStandings = sortStandings(standings, teams, matches);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  // La fila de detalle solo existe en móvil (< sm). Se observa el breakpoint
  // para no hacer interactiva la fila en desktop.
  const [isExpandable, setIsExpandable] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const update = () => setIsExpandable(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const toggleExpanded = (teamId: string) => {
    if (!isExpandable) return;
    setExpandedTeamId((prev) => (prev === teamId ? null : teamId));
  };

  const getTeam = (teamId: string) => {
    return teams.find((t) => t.id === teamId);
  };

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="min-w-full divide-y-2 divide-grass">
        <caption className="sr-only">Team standings table</caption>
        <thead className="bg-grass-dark sticky top-0">
          <tr>
            <th className={cn(thBase, 'text-left')} title="Position">
              Pos
            </th>
            <th className={cn(thBase, 'px-3 sm:px-6 text-left')}>Team</th>
            <th className={thBase} title="Played">
              P
            </th>
            <th className={cn(thBase, 'hidden sm:table-cell')} title="Won">
              W
            </th>
            <th className={cn(thBase, 'hidden sm:table-cell')} title="Drawn">
              D
            </th>
            <th className={cn(thBase, 'hidden sm:table-cell')} title="Lost">
              L
            </th>
            <th className={cn(thBase, 'hidden md:table-cell')} title="Goals For">
              GF
            </th>
            <th className={cn(thBase, 'hidden md:table-cell')} title="Goals Against">
              GA
            </th>
            <th className={thBase} title="Goal Difference">
              GD
            </th>
            <th className={thBase} title="Points">
              Pts
            </th>
          </tr>
        </thead>
        <tbody className="divide-y-2 divide-grass">
          {sortedStandings.map((standing, index) => {
            const isQualified = highlightQualified > 0 && index < highlightQualified;
            return (
              <Fragment key={standing.teamId}>
                <tr
                  onClick={() => toggleExpanded(standing.teamId)}
                  // La fila de detalle es sm:hidden: en desktop expandir no
                  // produce ningún cambio visual, así que solo es interactiva en
                  // móvil (evita re-render inútil y el anuncio engañoso de a11y).
                  tabIndex={isExpandable ? 0 : undefined}
                  role={isExpandable ? 'button' : undefined}
                  aria-expanded={isExpandable ? expandedTeamId === standing.teamId : undefined}
                  onKeyDown={(e) => {
                    if (isExpandable && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      toggleExpanded(standing.teamId);
                    }
                  }}
                  className={cn(
                    'transition-colors cursor-pointer sm:cursor-default',
                    isQualified ? 'bg-grass/30 hover:bg-led/20' : 'hover:bg-grass/40'
                  )}
                >
                  <td
                    className={cn(
                      'px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap tabular-nums',
                      isQualified && 'text-led'
                    )}
                  >
                    {index + 1}
                  </td>
                  <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const team = getTeam(standing.teamId);
                        if (team) {
                          return (
                            <>
                              <TeamFlag teamId={team.id} teamName={team.name} flagUrl={team.flag} size={24} />
                              <TeamNameTooltip teamName={team.name}>
                                <span className="font-arcade text-[10px] uppercase">
                                  {team.id.toUpperCase()}
                                </span>
                              </TeamNameTooltip>
                            </>
                          );
                        }
                        return <span className="font-arcade text-[10px] uppercase">{standing.teamId}</span>;
                      })()}
                    </div>
                  </td>
                  <td className={tdBase}>{standing.played}</td>
                  <td className={cn(tdBase, 'hidden sm:table-cell')}>{standing.won}</td>
                  <td className={cn(tdBase, 'hidden sm:table-cell')}>{standing.drawn}</td>
                  <td className={cn(tdBase, 'hidden sm:table-cell')}>{standing.lost}</td>
                  <td className={cn(tdBase, 'hidden md:table-cell')}>{standing.goalsFor}</td>
                  <td className={cn(tdBase, 'hidden md:table-cell')}>{standing.goalsAgainst}</td>
                  <td
                    className={cn(
                      tdBase,
                      standing.goalDifference > 0 && 'text-led',
                      standing.goalDifference < 0 && 'text-loss'
                    )}
                  >
                    {standing.goalDifference > 0 ? '+' : ''}
                    {standing.goalDifference}
                  </td>
                  <td className={cn(tdBase, 'text-led')}>{String(standing.points).padStart(2, '0')}</td>
                </tr>
                {expandedTeamId === standing.teamId && (
                  <tr className="sm:hidden bg-black/40">
                    <td colSpan={10} className="px-4 py-2 font-terminal text-base text-grass-soft">
                      G-E-P:{' '}
                      <span className="text-white tabular-nums">
                        {standing.won}-{standing.drawn}-{standing.lost}
                      </span>
                      {' · '}GF:GA:{' '}
                      <span className="text-white tabular-nums">
                        {standing.goalsFor}:{standing.goalsAgainst}
                      </span>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
