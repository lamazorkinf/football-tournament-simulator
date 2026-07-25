import { useEffect, useState } from 'react';
import type { Team, Group, WorldCupGroup } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { TeamFlag } from '../ui/TeamFlag';
import { ClickableTeamName } from '../ui/ClickableTeamName';
import { EnergyMeter } from '../ui/EnergyMeter';
import { useTeamProfile } from '../../hooks/useTeamProfile';
import { History } from 'lucide-react';
import { matchHistoryService, type MatchHistoryEntry } from '../../services/matchHistoryService';
import { useTournamentStore, buildEnergyContext } from '../../store/useTournamentStore';
import { useConfigStore } from '../../store/useConfigStore';

interface MatchPreviewProps {
  homeTeam: Team;
  awayTeam: Team;
  group: Group | WorldCupGroup;
  teams: Team[];
}

export function MatchPreview({ homeTeam, awayTeam, group, teams }: MatchPreviewProps) {
  const { openTeamProfile } = useTeamProfile();
  const cycle = useTournamentStore((s) => s.currentTournament);
  // Vía selector, no `getEngineConfig()`: así un cambio en Ajustes (Task 9)
  // se refleja en la previa ya montada, no solo tras recargar o remontar.
  const fatigueEnabled = useConfigStore((s) => s.config.fatigue.enabled);
  const [homeTeamHistory, setHomeTeamHistory] = useState<MatchHistoryEntry[]>([]);
  const [awayTeamHistory, setAwayTeamHistory] = useState<MatchHistoryEntry[]>([]);
  const [h2hHistory, setH2hHistory] = useState<{ home: number; draw: number; away: number }>({
    home: 0,
    draw: 0,
    away: 0,
  });

  useEffect(() => {
    // Guard de cancelación: al simular partidos seguidos, el preview apunta a
    // otro par de equipos y las respuestas fuera de orden pisaban las nuevas.
    // Se resetea el estado para no mostrar los datos del partido anterior
    // mientras carga el nuevo.
    let cancelled = false;

    setHomeTeamHistory([]);
    setAwayTeamHistory([]);
    setH2hHistory({ home: 0, draw: 0, away: 0 });

    const loadMatchHistory = async () => {
      try {
        // Get last 5 matches for each team
        const homeMatches = await matchHistoryService.getTeamMatches(homeTeam.id, 5);
        const awayMatches = await matchHistoryService.getTeamMatches(awayTeam.id, 5);
        if (cancelled) return;

        setHomeTeamHistory(homeMatches);
        setAwayTeamHistory(awayMatches);

        // Calculate H2H history
        const allHomeMatches = await matchHistoryService.getTeamMatches(homeTeam.id, 100);
        if (cancelled) return;

        const h2hMatches = allHomeMatches.filter(
          (m) =>
            (m.homeTeamId === homeTeam.id && m.awayTeamId === awayTeam.id) ||
            (m.homeTeamId === awayTeam.id && m.awayTeamId === homeTeam.id)
        );

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

        if (!cancelled) setH2hHistory({ home: homeWins, draw: draws, away: awayWins });
      } catch (error) {
        if (!cancelled) console.error('Error loading match history:', error);
      }
    };

    loadMatchHistory();

    return () => {
      cancelled = true;
    };
  }, [homeTeam.id, awayTeam.id]);

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
    if (result === 'W') return 'bg-led text-night';
    if (result === 'D') return 'bg-grass-soft text-night';
    return 'bg-loss text-white';
  };

  // Energía de los dos equipos, vía `buildEnergyContext` (única fuente del
  // cálculo). La previa solo se muestra para partidos de fase de grupos (ver
  // MatchCenter, que la invoca únicamente cuando encuentra un `group`), así
  // que alcanza con distinguir clasificatorias de grupos de Mundial: `Group`
  // (clasificatorias) trae `region`, `WorldCupGroup` no. El `matchday` sale
  // de buscar el partido sin jugar entre esos dos equipos dentro del grupo,
  // porque la previa no recibe el `Match` en sí, solo sus equipos.
  const previewedMatch = group.matches.find(
    (m) => m.homeTeamId === homeTeam.id && m.awayTeamId === awayTeam.id && !m.isPlayed
  );
  const energyContext =
    cycle && fatigueEnabled
      ? buildEnergyContext(
          cycle,
          'region' in group ? 'qualifier' : 'world-cup-group',
          undefined,
          previewedMatch?.matchday,
          homeTeam.id,
          awayTeam.id
        )
      : null;

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
                <tr className="border-b-2 border-grass">
                  <th className="text-left py-2 px-2 font-arcade text-[10px] text-gold uppercase">#</th>
                  <th className="text-left py-2 px-2 font-arcade text-[10px] text-gold uppercase">Equipo</th>
                  <th className="text-center py-2 px-1 font-arcade text-[10px] text-gold uppercase">Pts</th>
                  <th className="text-center py-2 px-1 font-arcade text-[10px] text-gold uppercase">PJ</th>
                  <th className="text-center py-2 px-1 font-arcade text-[10px] text-gold uppercase">PG</th>
                  <th className="text-center py-2 px-1 font-arcade text-[10px] text-gold uppercase">PE</th>
                  <th className="text-center py-2 px-1 font-arcade text-[10px] text-gold uppercase">PP</th>
                  <th className="text-center py-2 px-1 font-arcade text-[10px] text-gold uppercase">GF</th>
                  <th className="text-center py-2 px-1 font-arcade text-[10px] text-gold uppercase">GC</th>
                  <th className="text-center py-2 px-1 font-arcade text-[10px] text-gold uppercase">DG</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-grass">
                {sortedStandings.map((standing, idx) => {
                  const team = teams.find((t) => t.id === standing.teamId);
                  const isMatchTeam = standing.teamId === homeTeam.id || standing.teamId === awayTeam.id;
                  return (
                    <tr
                      key={standing.teamId}
                      className={isMatchTeam ? 'bg-grass/30 font-semibold' : ''}
                    >
                      <td className="py-2 px-2 tabular-nums">{idx + 1}</td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          {team && (
                            <>
                              <TeamFlag
                                teamId={team.id}
                                teamName={team.name}
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
                      <td className="text-center py-2 px-1 font-bold text-gold tabular-nums">{standing.points}</td>
                      <td className="text-center py-2 px-1 tabular-nums">{standing.played}</td>
                      <td className="text-center py-2 px-1 tabular-nums">{standing.won}</td>
                      <td className="text-center py-2 px-1 tabular-nums">{standing.drawn}</td>
                      <td className="text-center py-2 px-1 tabular-nums">{standing.lost}</td>
                      <td className="text-center py-2 px-1 tabular-nums">{standing.goalsFor}</td>
                      <td className="text-center py-2 px-1 tabular-nums">{standing.goalsAgainst}</td>
                      <td className="text-center py-2 px-1 tabular-nums">{standing.goalsFor - standing.goalsAgainst}</td>
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
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TeamFlag
                    teamId={homeTeam.id}
                    teamName={homeTeam.name}
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
                    homeTeamHistory.map((match) => {
                      const result = getMatchResult(match, homeTeam.id);
                      return (
                        <div
                          key={match.id}
                          className={`w-6 h-6 flex items-center justify-center text-xs font-bold border border-line ${getResultColor(
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
                    <span className="text-xs text-grass-soft">Sin historial</span>
                  )}
                </div>
              </div>
              {energyContext && <EnergyMeter energy={energyContext.homeEnergy} label={homeTeam.name} />}
            </div>

            {/* Away Team Form */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TeamFlag
                    teamId={awayTeam.id}
                    teamName={awayTeam.name}
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
                    awayTeamHistory.map((match) => {
                      const result = getMatchResult(match, awayTeam.id);
                      return (
                        <div
                          key={match.id}
                          className={`w-6 h-6 flex items-center justify-center text-xs font-bold border border-line ${getResultColor(
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
                    <span className="text-xs text-grass-soft">Sin historial</span>
                  )}
                </div>
              </div>
              {energyContext && <EnergyMeter energy={energyContext.awayEnergy} label={awayTeam.name} />}
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
                  size={24}
                  onClick={() => openTeamProfile(homeTeam)}
                  clickable
                />
                <span className="font-bold text-lg text-led font-terminal tabular-nums">{h2hHistory.home}</span>
              </div>
              <span className="text-grass-soft">-</span>
              <span className="font-bold text-lg text-white font-terminal tabular-nums">{h2hHistory.draw}</span>
              <span className="text-grass-soft">-</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-led font-terminal tabular-nums">{h2hHistory.away}</span>
                <TeamFlag
                  teamId={awayTeam.id}
                  teamName={awayTeam.name}
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
