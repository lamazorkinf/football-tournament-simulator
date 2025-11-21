import { useState, useEffect } from 'react';
import type { Team } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { TeamFlag } from '../ui/TeamFlag';
import { matchHistoryService } from '../../services/matchHistoryService';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Trophy, Target, TrendingUp, Award, BarChart3 } from 'lucide-react';
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
  const [stats, setStats] = useState<any>(null);
  const [teamStats, setTeamStats] = useState<TeamStats[]>([]);
  const [selectedView, setSelectedView] = useState<'overview' | 'teams' | 'tiers'>('overview');

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    try {
      const globalStats = await matchHistoryService.getMatchStatistics();
      const allMatches = await matchHistoryService.getAllMatches(1000, 0);

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

      setStats(globalStats);
      setTeamStats(Array.from(teamStatsMap.values()));
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

      {/* Overview */}
      {selectedView === 'overview' && stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Matches</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {stats.totalMatches || 0}
                  </p>
                </div>
                <Target className="w-12 h-12 text-primary-600 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Goals</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {stats.totalGoals || 0}
                  </p>
                </div>
                <Trophy className="w-12 h-12 text-yellow-600 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Avg Goals/Match</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {stats.averageGoals?.toFixed(2) || '0.00'}
                  </p>
                </div>
                <TrendingUp className="w-12 h-12 text-green-600 opacity-20" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">High Scoring</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {stats.highScoringMatches || 0}
                  </p>
                  <p className="text-xs text-gray-500">5+ goals</p>
                </div>
                <Award className="w-12 h-12 text-blue-600 opacity-20" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top Teams */}
      {selectedView === 'teams' && (
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Teams by Win Rate</CardTitle>
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
                          {teamStat.totalMatches} matches • {teamStat.wins}W {teamStat.draws}D{' '}
                          {teamStat.losses}L • {teamStat.goalsFor} GF
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary-600">
                        {teamStat.winRate.toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-500">Win Rate</div>
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
