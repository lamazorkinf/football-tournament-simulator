import { useEffect, useState } from 'react';
import type { Team, Group, WorldCupGroup } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { TeamFlag } from '../ui/TeamFlag';
import { ClickableTeamName } from '../ui/ClickableTeamName';
import { useTeamProfile } from '../../hooks/useTeamProfile';
import { History } from 'lucide-react';
import { matchHistoryService, type MatchHistoryEntry } from '../../services/matchHistoryService';

interface MatchPreviewProps {
  homeTeam: Team;
  awayTeam: Team;
  group: Group | WorldCupGroup;
  teams: Team[];
}

export function MatchPreview({ homeTeam, awayTeam, group, teams }: MatchPreviewProps) {
  const { openTeamProfile } = useTeamProfile();
  const [homeTeamHistory, setHomeTeamHistory] = useState<MatchHistoryEntry[]>([]);
  const [awayTeamHistory, setAwayTeamHistory] = useState<MatchHistoryEntry[]>([]);
  const [h2hHistory, setH2hHistory] = useState<{ home: number; draw: number; away: number }>({
    home: 0,
    draw: 0,
    away: 0,
  });

  useEffect(() => {
    loadMatchHistory();
  }, [homeTeam.id, awayTeam.id]);

  const loadMatchHistory = async () => {
    try {
      // Get last 5 matches for each team
      const homeMatches = await matchHistoryService.getTeamMatches(homeTeam.id, 5);
      const awayMatches = await matchHistoryService.getTeamMatches(awayTeam.id, 5);

      setHomeTeamHistory(homeMatches);
      setAwayTeamHistory(awayMatches);

      // Calculate H2H history
      const allHomeMatches = await matchHistoryService.getTeamMatches(homeTeam.id, 100);
      const h2hMatches = allHomeMatches.filter(
        (m) =>
          (m.homeTeamId === homeTeam.id && m.awayTeamId === awayTeam.id) ||
          (m.homeTeamId === awayTeam.id && m.awayTeamId === homeTeam.id)
      );

      console.log(`H2H: ${homeTeam.name} vs ${awayTeam.name}`, {
        totalHomeMatches: allHomeMatches.length,
        h2hMatches: h2hMatches.length,
        matches: h2hMatches
      });

      let homeWins = 0;
      let draws = 0;
      let awayWins = 0;

      h2hMatches.forEach((match) => {
        if (match.homeTeamId === homeTeam.id) {
          // homeTeam is playing at home
          if (match.homeScore > match.awayScore) homeWins++;
          else if (match.homeScore === match.awayScore) draws++;
          else awayWins++;
        } else {
          // homeTeam is playing away (so they are the away team in the match)
          if (match.awayScore > match.homeScore) homeWins++;
          else if (match.homeScore === match.awayScore) draws++;
          else awayWins++;
        }
      });

      setH2hHistory({ home: homeWins, draw: draws, away: awayWins });
    } catch (error) {
      console.error('Error loading match history:', error);
    }
  };

  // Sort standings
  const sortedStandings = [...group.standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return 0;
  });

  const getMatchResult = (match: MatchHistoryEntry, teamId: string): 'W' | 'D' | 'L' => {
    const isHome = match.homeTeamId === teamId;
    const teamScore = isHome ? match.homeScore : match.awayScore;
    const opponentScore = isHome ? match.awayScore : match.homeScore;

    if (teamScore > opponentScore) return 'W';
    if (teamScore === opponentScore) return 'D';
    return 'L';
  };

  const getResultColor = (result: 'W' | 'D' | 'L') => {
    if (result === 'W') return 'bg-green-500';
    if (result === 'D') return 'bg-gray-400';
    return 'bg-red-500';
  };


  return (
    <div className="space-y-4">
      {/* Group Standings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tabla de Posiciones - {group.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 font-semibold text-gray-700">#</th>
                  <th className="text-left py-2 px-2 font-semibold text-gray-700">Equipo</th>
                  <th className="text-center py-2 px-1 font-semibold text-gray-700">Pts</th>
                  <th className="text-center py-2 px-1 font-semibold text-gray-700">PJ</th>
                  <th className="text-center py-2 px-1 font-semibold text-gray-700">PG</th>
                  <th className="text-center py-2 px-1 font-semibold text-gray-700">PE</th>
                  <th className="text-center py-2 px-1 font-semibold text-gray-700">PP</th>
                  <th className="text-center py-2 px-1 font-semibold text-gray-700">GF</th>
                  <th className="text-center py-2 px-1 font-semibold text-gray-700">GC</th>
                  <th className="text-center py-2 px-1 font-semibold text-gray-700">DG</th>
                </tr>
              </thead>
              <tbody>
                {sortedStandings.map((standing, idx) => {
                  const team = teams.find((t) => t.id === standing.teamId);
                  const isMatchTeam = standing.teamId === homeTeam.id || standing.teamId === awayTeam.id;
                  return (
                    <tr
                      key={standing.teamId}
                      className={`border-b border-gray-100 ${
                        isMatchTeam ? 'bg-primary-50 font-semibold' : ''
                      }`}
                    >
                      <td className="py-2 px-2 text-gray-600">{idx + 1}</td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          {team && (
                            <>
                              <TeamFlag
                                teamId={team.id}
                                teamName={team.name}
                                flagUrl={team.flag}
                                size={16}
                                onClick={() => openTeamProfile(team)}
                                clickable
                              />
                              <ClickableTeamName team={team}>
                                <span className="truncate">{team.name}</span>
                              </ClickableTeamName>
                            </>
                          )}
                          {!team && <span className="truncate">{standing.teamId}</span>}
                        </div>
                      </td>
                      <td className="text-center py-2 px-1 font-bold">{standing.points}</td>
                      <td className="text-center py-2 px-1">{standing.played}</td>
                      <td className="text-center py-2 px-1">{standing.won}</td>
                      <td className="text-center py-2 px-1">{standing.drawn}</td>
                      <td className="text-center py-2 px-1">{standing.lost}</td>
                      <td className="text-center py-2 px-1">{standing.goalsFor}</td>
                      <td className="text-center py-2 px-1">{standing.goalsAgainst}</td>
                      <td className="text-center py-2 px-1">{standing.goalsFor - standing.goalsAgainst}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Team Form - Last 5 matches */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Últimos 5 Partidos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Home Team Form */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TeamFlag
                  teamId={homeTeam.id}
                  teamName={homeTeam.name}
                  flagUrl={homeTeam.flag}
                  size={24}
                  onClick={() => openTeamProfile(homeTeam)}
                  clickable
                />
                <ClickableTeamName team={homeTeam}>
                  <span className="font-medium text-sm">{homeTeam.name}</span>
                </ClickableTeamName>
              </div>
              <div className="flex gap-1">
                {homeTeamHistory.length > 0 ? (
                  homeTeamHistory.map((match, idx) => {
                    const result = getMatchResult(match, homeTeam.id);
                    return (
                      <div
                        key={idx}
                        className={`w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold ${getResultColor(
                          result
                        )}`}
                        title={`${
                          match.homeTeamId === homeTeam.id
                            ? match.homeScore + '-' + match.awayScore
                            : match.awayScore + '-' + match.homeScore
                        }`}
                      >
                        {result}
                      </div>
                    );
                  })
                ) : (
                  <span className="text-xs text-gray-500">Sin historial</span>
                )}
              </div>
            </div>

            {/* Away Team Form */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TeamFlag
                  teamId={awayTeam.id}
                  teamName={awayTeam.name}
                  flagUrl={awayTeam.flag}
                  size={24}
                  onClick={() => openTeamProfile(awayTeam)}
                  clickable
                />
                <ClickableTeamName team={awayTeam}>
                  <span className="font-medium text-sm">{awayTeam.name}</span>
                </ClickableTeamName>
              </div>
              <div className="flex gap-1">
                {awayTeamHistory.length > 0 ? (
                  awayTeamHistory.map((match, idx) => {
                    const result = getMatchResult(match, awayTeam.id);
                    return (
                      <div
                        key={idx}
                        className={`w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold ${getResultColor(
                          result
                        )}`}
                        title={`${
                          match.homeTeamId === awayTeam.id
                            ? match.homeScore + '-' + match.awayScore
                            : match.awayScore + '-' + match.homeScore
                        }`}
                      >
                        {result}
                      </div>
                    );
                  })
                ) : (
                  <span className="text-xs text-gray-500">Sin historial</span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Head to Head History */}
      {(h2hHistory.home > 0 || h2hHistory.draw > 0 || h2hHistory.away > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="w-4 h-4" />
              Historial de Enfrentamientos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center gap-3 text-sm">
              <div className="flex items-center gap-2">
                <TeamFlag
                  teamId={homeTeam.id}
                  teamName={homeTeam.name}
                  flagUrl={homeTeam.flag}
                  size={24}
                  onClick={() => openTeamProfile(homeTeam)}
                  clickable
                />
                <span className="font-bold text-lg text-green-600">{h2hHistory.home}</span>
              </div>
              <span className="text-gray-400">-</span>
              <span className="font-bold text-lg text-gray-600">{h2hHistory.draw}</span>
              <span className="text-gray-400">-</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-green-600">{h2hHistory.away}</span>
                <TeamFlag
                  teamId={awayTeam.id}
                  teamName={awayTeam.name}
                  flagUrl={awayTeam.flag}
                  size={24}
                  onClick={() => openTeamProfile(awayTeam)}
                  clickable
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
