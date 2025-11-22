import { useState, useEffect } from 'react';
import { Trophy } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { teamTournamentPerformanceService, type TeamTournamentPerformance } from '../../services/teamTournamentPerformanceService';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

interface TeamTournamentHistoryProps {
  teamId: string;
  teamName: string;
}

interface PerformanceWithTournament extends TeamTournamentPerformance {
  tournamentYear?: number;
  tournamentName?: string;
}

export function TeamTournamentHistory({ teamId, teamName }: TeamTournamentHistoryProps) {
  const [performances, setPerformances] = useState<PerformanceWithTournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPerformances();
  }, [teamId]);

  const loadPerformances = async () => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    try {
      const data = await teamTournamentPerformanceService.getTeamAllPerformances(teamId);

      // Load tournament information
      const tournamentIds = data.map(p => p.tournamentId);
      if (tournamentIds.length > 0) {
        const { data: tournaments } = (await supabase
          .from('tournaments_new')
          .select('id, year, name')
          .in('id', tournamentIds)) as any;

        const tournamentMap = new Map(tournaments?.map((t: any) => [t.id, t]) || []);

        const performancesWithTournament = data.map(p => {
          const tournament = tournamentMap.get(p.tournamentId) as any;
          return {
            ...p,
            tournamentYear: tournament?.year,
            tournamentName: tournament?.name,
          };
        });

        setPerformances(performancesWithTournament);
      } else {
        setPerformances(data);
      }
    } catch (error) {
      console.error('Error loading tournament performances:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isSupabaseConfigured()) {
    return null;
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Historial de Torneos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-gray-500 py-4">Cargando...</div>
        </CardContent>
      </Card>
    );
  }

  if (performances.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Historial de Torneos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-gray-500 py-4">
            {teamName} aún no ha participado en ningún torneo
          </div>
        </CardContent>
      </Card>
    );
  }

  // Get trophy counts
  const championCount = performances.filter(p => p.finalStage === 'champion').length;
  const runnerUpCount = performances.filter(p => p.finalStage === 'runner-up').length;
  const thirdPlaceCount = performances.filter(p => p.finalStage === 'third-place').length;

  // Get stage icons
  const getStageIcon = (stage: string) => {
    if (stage === 'champion') return '🏆';
    if (stage === 'runner-up') return '🥈';
    if (stage === 'third-place') return '🥉';
    if (stage === 'fourth-place') return '4️⃣';
    return null;
  };

  // Get stage color
  const getStageColor = (stage: string) => {
    if (stage === 'champion') return 'text-yellow-600 bg-yellow-50';
    if (stage === 'runner-up') return 'text-gray-600 bg-gray-50';
    if (stage === 'third-place') return 'text-orange-600 bg-orange-50';
    if (stage === 'fourth-place') return 'text-blue-600 bg-blue-50';
    if (stage.includes('semifinals')) return 'text-purple-600 bg-purple-50';
    if (stage.includes('quarterfinals')) return 'text-indigo-600 bg-indigo-50';
    return 'text-gray-600 bg-gray-50';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5" />
          Historial de Torneos
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Trophy Summary */}
        {(championCount > 0 || runnerUpCount > 0 || thirdPlaceCount > 0) && (
          <div className="grid grid-cols-3 gap-4 mb-6 pb-6 border-b border-gray-200">
            {championCount > 0 && (
              <div className="text-center">
                <div className="text-3xl mb-1">🏆</div>
                <div className="text-2xl font-bold text-yellow-600">{championCount}</div>
                <div className="text-xs text-gray-600">
                  {championCount === 1 ? 'Campeonato' : 'Campeonatos'}
                </div>
              </div>
            )}
            {runnerUpCount > 0 && (
              <div className="text-center">
                <div className="text-3xl mb-1">🥈</div>
                <div className="text-2xl font-bold text-gray-600">{runnerUpCount}</div>
                <div className="text-xs text-gray-600">
                  {runnerUpCount === 1 ? 'Subcampeonato' : 'Subcampeonatos'}
                </div>
              </div>
            )}
            {thirdPlaceCount > 0 && (
              <div className="text-center">
                <div className="text-3xl mb-1">🥉</div>
                <div className="text-2xl font-bold text-orange-600">{thirdPlaceCount}</div>
                <div className="text-xs text-gray-600">
                  {thirdPlaceCount === 1 ? 'Tercer Lugar' : 'Terceros Lugares'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Performance List */}
        <div className="space-y-3">
          {performances.map((performance) => {
            const icon = getStageIcon(performance.finalStage);
            const colorClass = getStageColor(performance.finalStage);
            const displayName = teamTournamentPerformanceService.getFinalStageDisplayName(
              performance.finalStage as any
            );

            return (
              <div
                key={performance.id}
                className={`p-3 rounded-lg border transition-all ${colorClass}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {icon && <span className="text-2xl">{icon}</span>}
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-sm">{displayName}</div>
                        {performance.tournamentYear && (
                          <div className="text-lg font-bold text-gray-700">
                            {performance.tournamentYear}
                          </div>
                        )}
                      </div>
                      {performance.qualifierRegion && (
                        <div className="text-xs text-gray-600">
                          Región: {performance.qualifierRegion}
                          {performance.qualifierGroupName && ` - ${performance.qualifierGroupName}`}
                        </div>
                      )}
                      {performance.worldCupGroupName && (
                        <div className="text-xs text-gray-600">
                          Grupo Mundial: {performance.worldCupGroupName}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Match Statistics */}
                <div className="grid grid-cols-4 gap-2 text-xs mt-2 pt-2 border-t border-gray-200">
                  <div className="text-center">
                    <div className="font-semibold text-gray-700">{performance.totalMatchesPlayed}</div>
                    <div className="text-gray-500">PJ</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-green-600">
                      {performance.totalWins}-{performance.totalDraws}-{performance.totalLosses}
                    </div>
                    <div className="text-gray-500">G-E-P</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-blue-600">{performance.totalGoalsFor}</div>
                    <div className="text-gray-500">GF</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-red-600">{performance.totalGoalsAgainst}</div>
                    <div className="text-gray-500">GC</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary Stats */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-primary-600">
                {performances.length}
              </div>
              <div className="text-xs text-gray-600">
                {performances.length === 1 ? 'Torneo' : 'Torneos'}
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {performances.reduce((sum, p) => sum + p.totalWins, 0)}
              </div>
              <div className="text-xs text-gray-600">Victorias Totales</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {performances.reduce((sum, p) => sum + p.totalGoalsFor, 0)}
              </div>
              <div className="text-xs text-gray-600">Goles Anotados</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-primary-600">
                {(
                  performances.reduce((sum, p) => sum + p.totalGoalsFor, 0) /
                  Math.max(performances.reduce((sum, p) => sum + p.totalMatchesPlayed, 0), 1)
                ).toFixed(2)}
              </div>
              <div className="text-xs text-gray-600">Prom. Goles</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
