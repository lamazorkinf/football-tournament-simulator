import type { Team } from '../../types';
import type { HeadToHeadStats } from '../../services/headToHeadService';
import { Trophy } from 'lucide-react';
import { TeamFlag } from '../ui/TeamFlag';

interface H2HMatchHistoryProps {
  team1: Team;
  team2: Team;
  h2hStats: HeadToHeadStats;
}

export function H2HMatchHistory({ team1, team2, h2hStats }: H2HMatchHistoryProps) {
  if (h2hStats.lastFiveResults.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No hay historial de partidos disponible</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {h2hStats.lastFiveResults.map((match) => {
        const isTeam1Home = match.homeTeamId === team1.id;
        const team1Score = isTeam1Home ? match.homeScore : match.awayScore;
        const team2Score = isTeam1Home ? match.awayScore : match.homeScore;

        const team1Won = match.result === 'team1Win';
        const team2Won = match.result === 'team2Win';
        const isDraw = match.result === 'draw';

        return (
          <div
            key={match.matchId}
            className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between">
              {/* Team 1 */}
              <div className={`flex-1 text-center ${team1Won ? 'opacity-100' : 'opacity-60'}`}>
                <div className="mb-1 flex justify-center">
                  <TeamFlag
                    teamId={team1.id}
                    teamName={team1.name}
                    flagUrl={team1.flag}
                    size={32}
                  />
                </div>
                <div className="text-sm font-semibold text-gray-900">{team1.name}</div>
                {isTeam1Home && (
                  <div className="text-xs text-gray-500 mt-1">Local</div>
                )}
              </div>

              {/* Score */}
              <div className="flex-1 text-center">
                <div className="flex items-center justify-center gap-4 mb-2">
                  <div
                    className={`text-3xl font-bold ${
                      team1Won
                        ? 'text-green-600'
                        : isDraw
                        ? 'text-gray-700'
                        : 'text-gray-400'
                    }`}
                  >
                    {team1Score}
                  </div>
                  <div className="text-xl text-gray-400">-</div>
                  <div
                    className={`text-3xl font-bold ${
                      team2Won
                        ? 'text-green-600'
                        : isDraw
                        ? 'text-gray-700'
                        : 'text-gray-400'
                    }`}
                  >
                    {team2Score}
                  </div>
                </div>

                {/* Result Badge */}
                <div
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${
                    team1Won
                      ? 'bg-green-100 text-green-700'
                      : team2Won
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {team1Won ? (
                    <>
                      <Trophy className="w-3 h-3" />
                      Victoria {team1.name}
                    </>
                  ) : team2Won ? (
                    <>
                      <Trophy className="w-3 h-3" />
                      Victoria {team2.name}
                    </>
                  ) : (
                    'Empate'
                  )}
                </div>

                {/* Stage */}
                <div className="text-xs text-gray-500 mt-2">
                  {match.stage === 'qualifier'
                    ? 'Clasificatorias'
                    : match.stage === 'world-cup-group'
                    ? 'Fase de Grupos'
                    : match.stage === 'world-cup-knockout'
                    ? 'Eliminatorias'
                    : 'Torneo'}
                </div>
              </div>

              {/* Team 2 */}
              <div className={`flex-1 text-center ${team2Won ? 'opacity-100' : 'opacity-60'}`}>
                <div className="mb-1 flex justify-center">
                  <TeamFlag
                    teamId={team2.id}
                    teamName={team2.name}
                    flagUrl={team2.flag}
                    size={32}
                  />
                </div>
                <div className="text-sm font-semibold text-gray-900">{team2.name}</div>
                {!isTeam1Home && (
                  <div className="text-xs text-gray-500 mt-1">Local</div>
                )}
              </div>
            </div>

            {/* Goal Difference Indicator */}
            {Math.abs(match.goalDifference) >= 3 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <div className="text-center text-xs text-orange-600 font-semibold">
                  🔥 Goleada de {Math.abs(match.goalDifference)} goles
                </div>
              </div>
            )}
          </div>
        );
      })}

      {h2hStats.totalMatches > h2hStats.lastFiveResults.length && (
        <div className="text-center py-3 text-sm text-gray-600">
          Mostrando los últimos {h2hStats.lastFiveResults.length} de {h2hStats.totalMatches} partidos
        </div>
      )}
    </div>
  );
}
