import { useState, useEffect } from 'react';
import type { Team } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { TeamFlag } from '../ui/TeamFlag';
import { matchHistoryService } from '../../services/matchHistoryService';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Trophy, Award, BarChart3 } from 'lucide-react';
import { calculateTier, getTierColor, getTierIcon, groupTeamsByTier } from '../../core/tiers';

interface HistoricalStatsProps {
  teams: Team[];
}

interface TeamStats {
  teamId: string;
  totalMatches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  winRate: number;
}

export const HistoricalStats = ({ teams }: HistoricalStatsProps) => {
  const [loading, setLoading] = useState(true);
  const [teamStats, setTeamStats] = useState<TeamStats[]>([]);
  const [selectedView, setSelectedView] = useState<'overview' | 'teams' | 'tiers'>('overview');
  const [regionalStatsHistorical, setRegionalStatsHistorical] = useState<any[]>([]);

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    const loadRegionalStats = async () => {
      if (!isSupabaseConfigured()) return;

      try {
        const allMatches = await matchHistoryService.getAllMatches(10000, 0);

        // Group by region using team data - ONLY qualifier matches
        const regionMap = new Map<string, { totalGoals: number; matchesPlayed: number }>();

        allMatches.forEach((match) => {
          // Only count qualifier matches
          if (match.stage !== 'qualifier') return;

          const homeTeam = teams.find(t => t.id === match.homeTeamId);
          const region = homeTeam?.region || 'Unknown';

          if (!regionMap.has(region)) {
            regionMap.set(region, { totalGoals: 0, matchesPlayed: 0 });
          }

          const stats = regionMap.get(region)!;
          stats.totalGoals += match.homeScore + match.awayScore;
          stats.matchesPlayed++;
        });

        const regionalData = Array.from(regionMap.entries()).map(([region, stats]) => ({
          region,
          totalGoals: stats.totalGoals,
          matchesPlayed: stats.matchesPlayed,
          avgGoals: stats.matchesPlayed > 0 ? stats.totalGoals / stats.matchesPlayed : 0,
        }));

        setRegionalStatsHistorical(regionalData);
      } catch (error) {
        console.error('Error loading regional stats:', error);
      }
    };

    if (teamStats.length > 0) {
      loadRegionalStats();
    }
  }, [teamStats, teams]);

  const loadStats = async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    try {
      console.log('🔄 [HistoricalStats] Fetching all matches...');
      const allMatches = await matchHistoryService.getAllMatches(10000, 0); // Get more matches
      console.log(`✅ [HistoricalStats] Total matches fetched: ${allMatches.length}`);
      console.log('📊 [HistoricalStats] Sample matches:', allMatches.slice(0, 3));

      // Calculate per-team statistics
      const teamStatsMap = new Map<string, TeamStats>();

      allMatches.forEach((match) => {
        // Update home team stats
        if (!teamStatsMap.has(match.homeTeamId)) {
          teamStatsMap.set(match.homeTeamId, {
            teamId: match.homeTeamId,
            totalMatches: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            winRate: 0,
          });
        }

        // Update away team stats
        if (!teamStatsMap.has(match.awayTeamId)) {
          teamStatsMap.set(match.awayTeamId, {
            teamId: match.awayTeamId,
            totalMatches: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            winRate: 0,
          });
        }

        const homeStats = teamStatsMap.get(match.homeTeamId)!;
        const awayStats = teamStatsMap.get(match.awayTeamId)!;

        homeStats.totalMatches++;
        awayStats.totalMatches++;

        homeStats.goalsFor += match.homeScore;
        homeStats.goalsAgainst += match.awayScore;
        awayStats.goalsFor += match.awayScore;
        awayStats.goalsAgainst += match.homeScore;

        if (match.homeScore > match.awayScore) {
          homeStats.wins++;
          awayStats.losses++;
        } else if (match.homeScore < match.awayScore) {
          awayStats.wins++;
          homeStats.losses++;
        } else {
          homeStats.draws++;
          awayStats.draws++;
        }
      });

      // Calculate win rates
      teamStatsMap.forEach((stats) => {
        stats.winRate = stats.totalMatches > 0
          ? (stats.wins / stats.totalMatches) * 100
          : 0;
      });

      const finalTeamStats = Array.from(teamStatsMap.values());
      console.log(`📈 [HistoricalStats] Total teams with stats: ${finalTeamStats.length}`);
      console.log('🔝 [HistoricalStats] Top 5 teams by matches:',
        finalTeamStats
          .sort((a, b) => b.totalMatches - a.totalMatches)
          .slice(0, 5)
          .map(t => `${t.teamId}: ${t.totalMatches} matches`)
      );

      setTeamStats(finalTeamStats);
      setLoading(false);
    } catch (error) {
      console.error('Error loading historical stats:', error);
      setLoading(false);
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-gray-500">
            <BarChart3 className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-semibold mb-2">Supabase Not Configured</p>
            <p className="text-sm">
              Configure Supabase to view historical statistics across tournaments.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading historical statistics...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const tierGroups = groupTeamsByTier(teams);
  const topTeams = [...teamStats]
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 10);

  // Calculate statistics from teamStats for Overview
  const topScorersHistorical = [...teamStats]
    .filter((s) => s.goalsFor > 0)
    .sort((a, b) => b.goalsFor - a.goalsFor)
    .slice(0, 5);

  const topAverageHistorical = [...teamStats]
    .filter((s) => s.totalMatches >= 3)
    .sort((a, b) => (b.goalsFor / b.totalMatches) - (a.goalsFor / a.totalMatches))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* View Selector */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setSelectedView('overview')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            selectedView === 'overview'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Overview
          </div>
        </button>
        <button
          onClick={() => setSelectedView('teams')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            selectedView === 'teams'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            Top Teams
          </div>
        </button>
        <button
          onClick={() => setSelectedView('tiers')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 ${
            selectedView === 'tiers'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4" />
            Tier Analysis
          </div>
        </button>
      </div>

      {/* Overview - Now with same layout as Current Tournament */}
      {selectedView === 'overview' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Equipos Más Goleadores</CardTitle>
              </CardHeader>
              <CardContent>
                {topScorersHistorical.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    No hay partidos jugados aún
                  </p>
                ) : (
                  <div className="space-y-3">
                    {topScorersHistorical.map((stat, idx) => {
                      const team = teams.find((t) => t.id === stat.teamId);
                      if (!team) return null;

                      return (
                        <div
                          key={stat.teamId}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xl font-bold text-gray-400 w-6">
                              {idx + 1}
                            </span>
                            <TeamFlag teamId={team.id} teamName={team.name} flagUrl={team.flag} size={32} />
                            <div>
                              <p className="font-medium text-gray-900">{team.name}</p>
                              <p className="text-xs text-gray-500">
                                {stat.totalMatches} partidos
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-primary-600">
                              {stat.goalsFor}
                            </p>
                            <p className="text-xs text-gray-500">goles</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Mejor Promedio de Goles</CardTitle>
              </CardHeader>
              <CardContent>
                {topAverageHistorical.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    No hay suficientes partidos jugados (mín. 3)
                  </p>
                ) : (
                  <div className="space-y-3">
                    {topAverageHistorical.map((stat, idx) => {
                      const team = teams.find((t) => t.id === stat.teamId);
                      if (!team) return null;

                      const avgGoals = stat.goalsFor / stat.totalMatches;

                      return (
                        <div
                          key={stat.teamId}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xl font-bold text-gray-400 w-6">
                              {idx + 1}
                            </span>
                            <TeamFlag teamId={team.id} teamName={team.name} flagUrl={team.flag} size={32} />
                            <div>
                              <p className="font-medium text-gray-900">{team.name}</p>
                              <p className="text-xs text-gray-500">
                                {stat.goalsFor} en {stat.totalMatches} partidos
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-blue-600">
                              {avgGoals.toFixed(2)}
                            </p>
                            <p className="text-xs text-gray-500">prom</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Estadísticas Regionales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {regionalStatsHistorical.map((stat) => (
                  <div
                    key={stat.region}
                    className="border border-gray-200 rounded-lg p-4 hover:border-primary-400 transition-colors"
                  >
                    <h4 className="font-semibold text-gray-900 mb-2">{stat.region}</h4>
                    <div className="space-y-1 text-sm">
                      <p className="text-gray-600">
                        Partidos: <span className="font-medium">{stat.matchesPlayed}</span>
                      </p>
                      <p className="text-gray-600">
                        Goles Totales: <span className="font-medium">{stat.totalGoals}</span>
                      </p>
                      <p className="text-gray-600">
                        Prom. Goles:{' '}
                        <span className="font-medium text-primary-600">
                          {stat.avgGoals.toFixed(2)}
                        </span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Top Teams */}
      {selectedView === 'teams' && (
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Equipos por Tasa de Victoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topTeams.map((teamStat, index) => {
                const team = teams.find((t) => t.id === teamStat.teamId);
                if (!team) return null;

                const tier = team.tier || calculateTier(team.skill);

                return (
                  <div
                    key={teamStat.teamId}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="text-2xl font-bold text-gray-400 w-8">
                        #{index + 1}
                      </div>
                      <TeamFlag teamId={team.id} teamName={team.name} flagUrl={team.flag} size={32} />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">
                            {team.name}
                          </span>
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full border ${getTierColor(
                              tier
                            )}`}
                          >
                            {getTierIcon(tier)} {tier}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          {teamStat.totalMatches} partidos • {teamStat.wins}V {teamStat.draws}E{' '}
                          {teamStat.losses}D • {teamStat.goalsFor} GF
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary-600">
                        {teamStat.winRate.toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-500">Tasa de Victoria</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tier Analysis */}
      {selectedView === 'tiers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(tierGroups).map(([tierName, tierTeams]) => {
            const tier = tierName as keyof typeof tierGroups;
            return (
              <Card key={tier}>
                <CardHeader className={getTierColor(tier)}>
                  <CardTitle className="flex items-center gap-2">
                    <span className="text-2xl">{getTierIcon(tier)}</span>
                    {tier} Tier
                    <span className="ml-auto text-sm font-normal">
                      {tierTeams.length} teams
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mt-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Skill Range:</span>
                      <span className="font-semibold">
                        {tier === 'Elite' && '80-100'}
                        {tier === 'Strong' && '65-79'}
                        {tier === 'Average' && '50-64'}
                        {tier === 'Weak' && '30-49'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Average Skill:</span>
                      <span className="font-semibold">
                        {tierTeams.length > 0
                          ? (
                              tierTeams.reduce((sum, t) => sum + t.skill, 0) /
                              tierTeams.length
                            ).toFixed(1)
                          : '0'}
                      </span>
                    </div>
                    <div className="mt-4">
                      <p className="text-xs text-gray-500 mb-2">Top Teams:</p>
                      <div className="space-y-1">
                        {tierTeams
                          .sort((a, b) => b.skill - a.skill)
                          .slice(0, 5)
                          .map((team) => (
                            <div
                              key={team.id}
                              className="flex items-center justify-between text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <TeamFlag teamId={team.id} teamName={team.name} flagUrl={team.flag} size={24} />
                                <span>{team.name}</span>
                              </div>
                              <span className="font-semibold text-gray-600">
                                {team.skill}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
