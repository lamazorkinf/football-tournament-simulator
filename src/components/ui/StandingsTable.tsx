import type { TeamStanding, Team } from '../../types';
import { cn } from '../../lib/utils';
import { calculateTier, getTierColor, getTierIcon } from '../../core/tiers';
import { TeamFlag } from './TeamFlag';
import { TeamNameTooltip } from './TeamNameTooltip';
import { sortStandings } from '../../core/scheduler';

interface StandingsTableProps {
  standings: TeamStanding[];
  teams: Team[];
  highlightQualified?: number;
  className?: string;
}

const thBase = 'px-2 sm:px-3 py-3 text-center font-arcade text-[10px] text-gold uppercase';
const tdBase = 'px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-center tabular-nums';

export function StandingsTable({
  standings,
  teams,
  highlightQualified = 0,
  className,
}: StandingsTableProps) {
  // Always sort standings to ensure correct order
  const sortedStandings = sortStandings(standings, teams);

  const getTeam = (teamId: string) => {
    return teams.find((t) => t.id === teamId);
  };

  return (
    <div className={cn('overflow-x-auto -mx-4 sm:mx-0', className)}>
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
            <th className={thBase} title="Won">
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
              <tr
                key={standing.teamId}
                className={cn('hover:bg-grass/40 transition-colors', isQualified && 'bg-grass/30')}
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
                            {(() => {
                              const tier = team.tier || calculateTier(team.skill);
                              return (
                                <span
                                  className={cn(
                                    'px-2 py-0.5 text-xs border flex-shrink-0',
                                    getTierColor(tier)
                                  )}
                                  title={`${tier} - Skill: ${team.skill}`}
                                >
                                  {getTierIcon(tier)} <span className="hidden sm:inline ml-1">{tier}</span>
                                </span>
                              );
                            })()}
                          </>
                        );
                      }
                      return <span className="font-arcade text-[10px] uppercase">{standing.teamId}</span>;
                    })()}
                  </div>
                </td>
                <td className={tdBase}>{standing.played}</td>
                <td className={tdBase}>{standing.won}</td>
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
