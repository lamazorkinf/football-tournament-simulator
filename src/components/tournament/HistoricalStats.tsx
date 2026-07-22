import { useState, useEffect } from 'react';
import type { Team } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { TeamFlag } from '../ui/TeamFlag';
import { PixelBar } from '../ui/PixelBar';
import { matchHistoryService, computeWinRate } from '../../services/matchHistoryService';
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

  // Un solo efecto: trae los partidos UNA vez y calcula tanto las estadísticas
  // por equipo como las regionales. Antes eran dos efectos que descargaban los
  // mismos ~10000 partidos por separado, ninguno con guard de desmontaje
  // (setState tras cambiar de pestaña durante la carga).
  useEffect(() => {
    const signal = { cancelled: false };
    loadStats(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [teams]);

  const loadStats = async (signal: { cancelled: boolean }) => {
    if (!isSupabaseConfigured()) {
      if (!signal.cancelled) setLoading(false);
      return;
    }

    try {
      const [teamRows, regionRows] = await Promise.all([
        matchHistoryService.getTeamStats(),
        matchHistoryService.getRegionStats(),
      ]);
      if (signal.cancelled) return;

      const finalTeamStats: TeamStats[] = teamRows.map((r) => ({
        teamId: r.teamId,
        totalMatches: r.totalMatches,
        wins: r.wins,
        draws: r.draws,
        losses: r.losses,
        goalsFor: r.goalsFor,
        goalsAgainst: r.goalsAgainst,
        winRate: computeWinRate(r.wins, r.totalMatches),
      }));

      const regionalData = regionRows.map((r) => ({
        region: r.region,
        totalGoals: r.totalGoals,
        matchesPlayed: r.matchesPlayed,
        avgGoals: r.matchesPlayed > 0 ? r.totalGoals / r.matchesPlayed : 0,
      }));

      setTeamStats(finalTeamStats);
      setRegionalStatsHistorical(regionalData);
      setLoading(false);
    } catch (error) {
      if (!signal.cancelled) {
        console.error('Error loading historical stats:', error);
        setLoading(false);
      }
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-grass-soft">
            <BarChart3 className="w-16 h-16 mx-auto mb-4 text-grass-soft/40" />
            <p className="font-arcade text-xs text-white text-shadow-retro uppercase mb-2">Supabase Not Configured</p>
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
            <div className="animate-spin h-12 w-12 border-b-2 border-led mx-auto mb-4"></div>
            <p className="text-grass-soft">Loading historical statistics...</p>
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
      <div className="flex border-b-4 border-grass">
        <button
          onClick={() => setSelectedView('overview')}
          className={`flex items-center gap-2 px-4 py-3 font-arcade text-[10px] uppercase border-b-4 transition-colors ${
            selectedView === 'overview'
              ? 'border-gold text-gold bg-grass/30'
              : 'border-transparent text-grass-soft hover:text-white hover:bg-grass/40'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Overview
        </button>
        <button
          onClick={() => setSelectedView('teams')}
          className={`flex items-center gap-2 px-4 py-3 font-arcade text-[10px] uppercase border-b-4 transition-colors ${
            selectedView === 'teams'
              ? 'border-gold text-gold bg-grass/30'
              : 'border-transparent text-grass-soft hover:text-white hover:bg-grass/40'
          }`}
        >
          <Trophy className="w-4 h-4" />
          Top Teams
        </button>
        <button
          onClick={() => setSelectedView('tiers')}
          className={`flex items-center gap-2 px-4 py-3 font-arcade text-[10px] uppercase border-b-4 transition-colors ${
            selectedView === 'tiers'
              ? 'border-gold text-gold bg-grass/30'
              : 'border-transparent text-grass-soft hover:text-white hover:bg-grass/40'
          }`}
        >
          <Award className="w-4 h-4" />
          Tier Analysis
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
                  <p className="text-center text-grass-soft py-8">
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
                          className="flex items-center justify-between p-3 bg-black/40 hover:bg-grass/40 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-terminal text-xl text-grass-soft tabular-nums w-6">
                              {idx + 1}
                            </span>
                            <TeamFlag teamId={team.id} teamName={team.name} flagUrl={team.flag} size={32} />
                            <div>
                              <p className="font-medium text-white">{team.name}</p>
                              <p className="text-xs text-grass-soft">
                                {stat.totalMatches} partidos
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-terminal text-led tabular-nums">
                              {stat.goalsFor}
                            </p>
                            <p className="text-xs text-grass-soft">goles</p>
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
                  <p className="text-center text-grass-soft py-8">
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
                          className="flex items-center justify-between p-3 bg-black/40 hover:bg-grass/40 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-terminal text-xl text-grass-soft tabular-nums w-6">
                              {idx + 1}
                            </span>
                            <TeamFlag teamId={team.id} teamName={team.name} flagUrl={team.flag} size={32} />
                            <div>
                              <p className="font-medium text-white">{team.name}</p>
                              <p className="text-xs text-grass-soft">
                                {stat.goalsFor} en {stat.totalMatches} partidos
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-terminal text-led tabular-nums">
                              {avgGoals.toFixed(2)}
                            </p>
                            <p className="text-xs text-grass-soft">prom</p>
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
                    className="border-2 border-grass p-4 hover:border-gold transition-colors"
                  >
                    <h4 className="font-arcade text-[10px] text-white text-shadow-retro uppercase mb-2">{stat.region}</h4>
                    <div className="space-y-1 text-sm">
                      <p className="text-grass-soft">
                        Partidos: <span className="font-terminal text-white tabular-nums">{stat.matchesPlayed}</span>
                      </p>
                      <p className="text-grass-soft">
                        Goles Totales: <span className="font-terminal text-white tabular-nums">{stat.totalGoals}</span>
                      </p>
                      <p className="text-grass-soft">
                        Prom. Goles:{' '}
                        <span className="font-terminal text-led tabular-nums">
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
                    className="p-4 bg-black/40 hover:bg-grass/40 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="font-terminal text-2xl text-grass-soft tabular-nums w-8">
                          #{index + 1}
                        </div>
                        <TeamFlag teamId={team.id} teamName={team.name} flagUrl={team.flag} size={32} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-white">
                              {team.name}
                            </span>
                            <span
                              className={`px-2 py-0.5 text-xs border ${getTierColor(
                                tier
                              )}`}
                            >
                              {getTierIcon(tier)} {tier}
                            </span>
                          </div>
                          <div className="text-sm text-grass-soft mt-1">
                            {teamStat.totalMatches} partidos • {teamStat.wins}V {teamStat.draws}E{' '}
                            {teamStat.losses}D • {teamStat.goalsFor} GF
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-2xl font-terminal text-led tabular-nums">
                          {teamStat.winRate.toFixed(1)}%
                        </div>
                        <div className="text-xs text-grass-soft">Tasa de Victoria</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <PixelBar value={teamStat.winRate} max={100} color="led" />
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
            const avgSkill = tierTeams.length > 0
              ? tierTeams.reduce((sum, t) => sum + t.skill, 0) / tierTeams.length
              : 0;
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
                      <span className="text-grass-soft">Skill Range:</span>
                      <span className="font-terminal text-white tabular-nums">
                        {tier === 'Elite' && '80-100'}
                        {tier === 'Strong' && '65-79'}
                        {tier === 'Average' && '50-64'}
                        {tier === 'Weak' && '30-49'}
                      </span>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-grass-soft">Average Skill:</span>
                        <span className="font-terminal text-led tabular-nums">
                          {tierTeams.length > 0 ? avgSkill.toFixed(1) : '0'}
                        </span>
                      </div>
                      <PixelBar value={avgSkill} max={100} color="led" />
                    </div>
                    <div className="mt-4">
                      <p className="text-xs text-grass-soft mb-2">Top Teams:</p>
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
                                <span className="text-white">{team.name}</span>
                              </div>
                              <span className="font-terminal text-led tabular-nums">
                                {Math.round(team.skill)}
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
