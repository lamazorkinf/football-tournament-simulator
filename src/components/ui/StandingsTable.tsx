import type { TeamStanding, Team } from '../../types';
import { cn } from '../../lib/utils';
import { calculateTier, getTierColor, getTierIcon } from '../../core/tiers';
import { TeamFlag } from './TeamFlag';

interface StandingsTableProps {
  standings: TeamStanding[];
  teams: Team[];
  highlightQualified?: number;
  className?: string;
}

export function StandingsTable({
  standings,
  teams,
  highlightQualified = 0,
  className,
}: StandingsTableProps) {
  const getTeam = (teamId: string) => {
    return teams.find((t) => t.id === teamId);
  };

  return (
    <div className={cn('overflow-x-auto -mx-4 sm:mx-0', className)}>
      <table className="min-w-full divide-y divide-gray-200">
        <caption className="sr-only">Team standings table</caption>
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th className="px-2 sm:px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" title="Position">
              Pos
            </th>
            <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Team
            </th>
            <th className="px-2 sm:px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" title="Played">
              P
            </th>
            <th className="px-2 sm:px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" title="Won">
              W
            </th>
            <th className="px-2 sm:px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell" title="Drawn">
              D
            </th>
            <th className="px-2 sm:px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell" title="Lost">
              L
            </th>
            <th className="px-2 sm:px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell" title="Goals For">
              GF
            </th>
            <th className="px-2 sm:px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell" title="Goals Against">
              GA
            </th>
            <th className="px-2 sm:px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" title="Goal Difference">
              GD
            </th>
            <th className="px-2 sm:px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" title="Points">
              Pts
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {standings.map((standing, index) => {
            const isQualified = highlightQualified > 0 && index < highlightQualified;
            return (
              <tr
                key={standing.teamId}
                className={cn(
                  'hover:bg-gray-50 transition-colors',
                  isQualified && 'bg-primary-50 hover:bg-primary-100'
                )}
              >
                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {index + 1}
                </td>
                <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const team = getTeam(standing.teamId);
                      if (team) {
                        return (
                          <>
                            <TeamFlag teamId={team.id} teamName={team.name} flagUrl={team.flag} size={24} />
                            <span>{team.name}</span>
                            {(() => {
                              const tier = team.tier || calculateTier(team.skill);
                              return (
                                <span
                                  className={cn(
                                    'px-2 py-0.5 text-xs rounded-full border',
                                    getTierColor(tier)
                                  )}
                                  title={`Skill: ${team.skill}`}
                                >
                                  {getTierIcon(tier)} {tier}
                                </span>
                              );
                            })()}
                          </>
                        );
                      }
                      return <span>{standing.teamId}</span>;
                    })()}
                  </div>
                </td>
                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-sm text-center text-gray-700">
                  {standing.played}
                </td>
                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-sm text-center text-gray-700">
                  {standing.won}
                </td>
                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-sm text-center text-gray-700 hidden sm:table-cell">
                  {standing.drawn}
                </td>
                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-sm text-center text-gray-700 hidden sm:table-cell">
                  {standing.lost}
                </td>
                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-sm text-center text-gray-700 hidden md:table-cell">
                  {standing.goalsFor}
                </td>
                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-sm text-center text-gray-700 hidden md:table-cell">
                  {standing.goalsAgainst}
                </td>
                <td
                  className={cn(
                    'px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-sm text-center font-medium',
                    standing.goalDifference > 0 && 'text-primary-700',
                    standing.goalDifference < 0 && 'text-red-600'
                  )}
                >
                  {standing.goalDifference > 0 ? '+' : ''}
                  {standing.goalDifference}
                </td>
                <td className="px-2 sm:px-3 py-3 sm:py-4 whitespace-nowrap text-sm text-center font-bold text-gray-900">
                  {standing.points}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
