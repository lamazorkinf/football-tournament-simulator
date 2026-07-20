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
          <div className="text-center text-grass-soft py-4">Cargando...</div>
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
          <div className="text-center text-grass-soft py-4">
            {teamName} aún no ha participado en ningún torneo
          </div>
        </CardContent>
      </Card>
    );
  }

  // Get trophy counts and years
  const championYears = performances.filter(p => p.finalStage === 'champion').map(p => p.tournamentYear).filter(Boolean);
  const runnerUpYears = performances.filter(p => p.finalStage === 'runner-up').map(p => p.tournamentYear).filter(Boolean);
  const thirdPlaceYears = performances.filter(p => p.finalStage === 'third-place').map(p => p.tournamentYear).filter(Boolean);
  const fourthPlaceYears = performances.filter(p => p.finalStage === 'fourth-place').map(p => p.tournamentYear).filter(Boolean);

  // Get stage color
  const getStageColor = (stage: string) => {
    if (stage === 'champion') return 'text-gold bg-black/40 border-gold';
    if (['runner-up', 'third-place', 'fourth-place', 'eliminated-semifinals'].includes(stage)) {
      return 'text-led bg-black/40 border-led';
    }
    return 'text-grass-soft bg-black/40 border-grass';
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial de Torneos</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Trophy Summary */}
        {(championYears.length > 0 || runnerUpYears.length > 0 || thirdPlaceYears.length > 0 || fourthPlaceYears.length > 0) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 pb-6 border-b-2 border-grass">
            {championYears.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🏆</span>
                  <span className="font-semibold text-gold">
                    {championYears.length === 1 ? 'Campeón' : 'Campeón'}
                  </span>
                </div>
                <div className="text-sm text-grass-soft space-y-1">
                  {championYears.map((year, idx) => (
                    <div key={idx} className="font-medium text-white font-terminal tabular-nums">{year}</div>
                  ))}
                </div>
              </div>
            )}
            {runnerUpYears.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🥈</span>
                  <span className="font-semibold text-grass-soft">
                    Subcampeón
                  </span>
                </div>
                <div className="text-sm text-grass-soft space-y-1">
                  {runnerUpYears.map((year, idx) => (
                    <div key={idx} className="font-medium text-white font-terminal tabular-nums">{year}</div>
                  ))}
                </div>
              </div>
            )}
            {thirdPlaceYears.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🥉</span>
                  <span className="font-semibold text-grass-soft">
                    3° Lugar
                  </span>
                </div>
                <div className="text-sm text-grass-soft space-y-1">
                  {thirdPlaceYears.map((year, idx) => (
                    <div key={idx} className="font-medium text-white font-terminal tabular-nums">{year}</div>
                  ))}
                </div>
              </div>
            )}
            {fourthPlaceYears.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">4️⃣</span>
                  <span className="font-semibold text-grass-soft">
                    4° Lugar
                  </span>
                </div>
                <div className="text-sm text-grass-soft space-y-1">
                  {fourthPlaceYears.map((year, idx) => (
                    <div key={idx} className="font-medium text-white font-terminal tabular-nums">{year}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Performance List */}
        <div className="space-y-3">
          {performances.map((performance) => {
            const colorClass = getStageColor(performance.finalStage);
            const displayName = teamTournamentPerformanceService.getFinalStageDisplayName(
              performance.finalStage as any
            );

            return (
              <div
                key={performance.id}
                className={`p-3 border-2 transition-all ${colorClass}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      {performance.tournamentYear && (
                        <div className="text-lg font-bold text-white font-terminal tabular-nums">
                          {performance.tournamentYear}
                        </div>
                      )}
                      <div className="font-semibold text-sm">{displayName}</div>
                    </div>
                    {performance.qualifierRegion && (
                      <div className="text-xs text-grass-soft mt-1">
                        Región: {performance.qualifierRegion}
                        {performance.qualifierGroupName && ` - ${performance.qualifierGroupName}`}
                      </div>
                    )}
                    {performance.worldCupGroupName && (
                      <div className="text-xs text-grass-soft mt-1">
                        Grupo Mundial: {performance.worldCupGroupName}
                      </div>
                    )}
                  </div>
                </div>

                {/* Match Statistics */}
                <div className="grid grid-cols-4 gap-2 text-xs mt-2 pt-2 border-t-2 border-grass">
                  <div className="text-center">
                    <div className="font-semibold text-white font-terminal tabular-nums">{performance.totalMatchesPlayed}</div>
                    <div className="text-grass-soft">PJ</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-led font-terminal tabular-nums">
                      {performance.totalWins}-{performance.totalDraws}-{performance.totalLosses}
                    </div>
                    <div className="text-grass-soft">G-E-P</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-led font-terminal tabular-nums">{performance.totalGoalsFor}</div>
                    <div className="text-grass-soft">GF</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-loss font-terminal tabular-nums">{performance.totalGoalsAgainst}</div>
                    <div className="text-grass-soft">GC</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary Stats */}
        <div className="mt-6 pt-6 border-t-2 border-grass">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-gold font-terminal tabular-nums">
                {performances.length}
              </div>
              <div className="text-xs text-grass-soft">
                {performances.length === 1 ? 'Torneo' : 'Torneos'}
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-led font-terminal tabular-nums">
                {performances.reduce((sum, p) => sum + p.totalWins, 0)}
              </div>
              <div className="text-xs text-grass-soft">Victorias Totales</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-led font-terminal tabular-nums">
                {performances.reduce((sum, p) => sum + p.totalGoalsFor, 0)}
              </div>
              <div className="text-xs text-grass-soft">Goles Anotados</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gold font-terminal tabular-nums">
                {(
                  performances.reduce((sum, p) => sum + p.totalGoalsFor, 0) /
                  Math.max(performances.reduce((sum, p) => sum + p.totalMatchesPlayed, 0), 1)
                ).toFixed(2)}
              </div>
              <div className="text-xs text-grass-soft">Prom. Goles</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
