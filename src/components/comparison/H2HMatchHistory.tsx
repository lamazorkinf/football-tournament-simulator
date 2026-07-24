import type { Team } from '../../types';
import type { HeadToHeadStats } from '../../services/headToHeadService';
import { getKnockoutRoundName } from '../../services/headToHeadService';
import { Trophy, GitCompare } from 'lucide-react';
import { TeamFlag } from '../ui/TeamFlag';
import { EmptyState } from '../ui/EmptyState';

interface H2HMatchHistoryProps {
  team1: Team;
  team2: Team;
  h2hStats: HeadToHeadStats;
}

export function H2HMatchHistory({ team1, team2, h2hStats }: H2HMatchHistoryProps) {
  if (h2hStats.lastFiveResults.length === 0) {
    return (
      <EmptyState
        icon={GitCompare}
        title="Sin historial"
        description="Estos equipos todavía no se enfrentaron."
      />
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
            className="bg-night border-2 border-grass hover:border-line transition-colors p-4"
          >
            <div className="flex items-center justify-between">
              {/* Team 1 */}
              <div className={`flex-1 text-center ${team1Won ? 'opacity-100' : 'opacity-60'}`}>
                <div className="mb-1 flex justify-center">
                  <TeamFlag
                    teamId={team1.id}
                    teamName={team1.name}
                    size={32}
                  />
                </div>
                <div className="text-sm font-semibold text-white">{team1.name}</div>
                {isTeam1Home && (
                  <div className="text-xs text-grass-soft mt-1">Local</div>
                )}
              </div>

              {/* Score */}
              <div className="flex-1 text-center">
                <div className="flex items-center justify-center gap-4 mb-2">
                  <div
                    className={`text-3xl font-terminal tabular-nums ${
                      team1Won
                        ? 'text-led'
                        : isDraw
                        ? 'text-white'
                        : 'text-grass-soft'
                    }`}
                  >
                    {team1Score}
                  </div>
                  <div className="text-xl text-grass-soft">-</div>
                  <div
                    className={`text-3xl font-terminal tabular-nums ${
                      team2Won
                        ? 'text-led'
                        : isDraw
                        ? 'text-white'
                        : 'text-grass-soft'
                    }`}
                  >
                    {team2Score}
                  </div>
                </div>

                {/* Result Badge */}
                <div
                  className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold border ${
                    team1Won
                      ? 'bg-black/40 text-led border-led'
                      : team2Won
                      ? 'bg-black/40 text-gold border-gold'
                      : 'bg-black/40 text-grass-soft border-grass'
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

                {/* Stage and Tournament */}
                <div className="text-xs text-grass-soft mt-2">
                  {match.tournamentYear && (
                    <div className="font-semibold text-white">Mundial {match.tournamentYear}</div>
                  )}
                  <div>
                    {match.stage === 'qualifier'
                      ? 'Clasificatorias'
                      : match.stage === 'world-cup-group'
                      ? 'Fase de Grupos'
                      : match.stage === 'world-cup-knockout'
                      ? getKnockoutRoundName(match.knockoutRound)
                      : 'Torneo'}
                  </div>
                </div>
              </div>

              {/* Team 2 */}
              <div className={`flex-1 text-center ${team2Won ? 'opacity-100' : 'opacity-60'}`}>
                <div className="mb-1 flex justify-center">
                  <TeamFlag
                    teamId={team2.id}
                    teamName={team2.name}
                    size={32}
                  />
                </div>
                <div className="text-sm font-semibold text-white">{team2.name}</div>
                {!isTeam1Home && (
                  <div className="text-xs text-grass-soft mt-1">Local</div>
                )}
              </div>
            </div>

            {/* Goal Difference Indicator */}
            {Math.abs(match.goalDifference) >= 3 && (
              <div className="mt-3 pt-3 border-t-2 border-grass">
                <div className="text-center text-xs text-gold font-semibold">
                  🔥 Goleada de {Math.abs(match.goalDifference)} goles
                </div>
              </div>
            )}
          </div>
        );
      })}

      {h2hStats.totalMatches > h2hStats.lastFiveResults.length && (
        <div className="text-center py-3 text-sm text-grass-soft">
          Mostrando los últimos {h2hStats.lastFiveResults.length} de {h2hStats.totalMatches} partidos
        </div>
      )}
    </div>
  );
}
