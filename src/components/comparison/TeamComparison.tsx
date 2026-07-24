import { useState, useEffect } from 'react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { PixelBar } from '../ui/PixelBar';
import { LoadingState } from '../ui/LoadingState';
import { ArrowLeft, Target, TrendingUp, Calendar } from 'lucide-react';
import { TeamFlag } from '../ui/TeamFlag';
import { TeamSelector } from './TeamSelector';
import { H2HMatchHistory } from './H2HMatchHistory';
import { calculateHeadToHeadStats, type HeadToHeadStats } from '../../services/headToHeadService';
import type { Team } from '../../types';

export function TeamComparison() {
  const { teams } = useTournamentStore();
  const [team1, setTeam1] = useState<Team | null>(null);
  const [team2, setTeam2] = useState<Team | null>(null);
  const [h2hStats, setH2hStats] = useState<HeadToHeadStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // Load h2h stats when both teams are selected
  useEffect(() => {
    if (!team1 || !team2) {
      setH2hStats(null);
      setError(false);
      return;
    }

    // Guard de carrera al cambiar de par de equipos durante el fetch.
    let cancelled = false;
    setLoading(true);
    setError(false);

    calculateHeadToHeadStats(team1.id, team2.id)
      .then((stats) => {
        if (cancelled) return;
        setH2hStats(stats);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        // Sin marcar el error, h2hStats quedaba null y el spinner era eterno.
        console.error('Error calculating h2h stats:', err);
        setError(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [team1, team2]);

  const handleBack = () => {
    // Reset selection to allow new comparison
    setTeam1(null);
    setTeam2(null);
    setH2hStats(null);
    setError(false);
  };

  // If no teams selected, show selection screen
  if (!team1 || !team2) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="bg-grass">
            <CardTitle className="text-white text-shadow-retro flex items-center gap-2">
              <Target className="w-6 h-6" />
              Comparación de Equipos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="bg-grass/30 border-2 border-grass p-4">
                <p className="text-sm text-white">
                  Selecciona dos equipos para comparar sus estadísticas, historial de enfrentamientos
                  y rendimiento en el torneo.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-arcade text-[10px] text-gold uppercase mb-3">Equipo 1</h3>
                  <TeamSelector
                    teams={teams}
                    selectedTeam={team1}
                    onSelectTeam={setTeam1}
                    excludeTeamId={team2?.id}
                  />
                </div>

                <div>
                  <h3 className="font-arcade text-[10px] text-gold uppercase mb-3">Equipo 2</h3>
                  <TeamSelector
                    teams={teams}
                    selectedTeam={team2}
                    onSelectTeam={setTeam2}
                    excludeTeamId={team1?.id}
                  />
                </div>
              </div>

              {/* Al seleccionar ambos equipos, el efecto carga el H2H y la
                  vista de comparación se muestra automáticamente. */}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Estado de error: con salida para no quedar atrapado.
  if (error) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-12 pb-12">
            <div className="text-center space-y-4">
              <p className="text-loss font-arcade text-xs uppercase">
                No se pudieron cargar las estadísticas
              </p>
              <p className="text-grass-soft text-sm">
                Revisá la conexión e intentá con otro par de equipos.
              </p>
              <Button variant="outline" size="sm" onClick={handleBack} className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Cambiar Equipos
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show loading state while fetching h2h stats
  if (loading || !h2hStats) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent>
            <LoadingState label="Cargando estadísticas…" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Cambiar Equipos
          </Button>
          <div className="flex items-center gap-2">
            <Target className="w-6 h-6 text-gold" />
            <h2 className="font-arcade text-lg text-white text-shadow-retro">Comparación</h2>
          </div>
        </div>
      </div>

      {/* Team Headers */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-4 items-center">
            {/* Team 1 */}
            <div className="text-center">
              <div className="mb-2 flex justify-center">
                <TeamFlag
                  teamId={team1.id}
                  teamName={team1.name}
                  size={64}
                />
              </div>
              <h3 className="text-xl font-bold text-white">{team1.name}</h3>
              <p className="text-sm text-grass-soft">{team1.region}</p>
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-black/40 border border-gold text-gold text-sm font-semibold">
                <TrendingUp className="w-4 h-4" />
                Skill: {Math.round(team1.skill)}
              </div>
              <div className="mt-2 max-w-[160px] mx-auto">
                <PixelBar value={team1.skill} max={100} color="led" />
              </div>
            </div>

            {/* VS Badge */}
            <div className="flex flex-col items-center justify-center">
              <div className="w-16 h-16 bg-gold border-4 border-white flex items-center justify-center font-arcade text-night text-xl shadow-hard-btn">
                VS
              </div>
              {h2hStats.totalMatches > 0 && (
                <p className="text-xs text-grass-soft mt-2">
                  {h2hStats.totalMatches} {h2hStats.totalMatches === 1 ? 'partido' : 'partidos'}
                </p>
              )}
            </div>

            {/* Team 2 */}
            <div className="text-center">
              <div className="mb-2 flex justify-center">
                <TeamFlag
                  teamId={team2.id}
                  teamName={team2.name}
                  size={64}
                />
              </div>
              <h3 className="text-xl font-bold text-white">{team2.name}</h3>
              <p className="text-sm text-grass-soft">{team2.region}</p>
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-black/40 border border-gold text-gold text-sm font-semibold">
                <TrendingUp className="w-4 h-4" />
                Skill: {Math.round(team2.skill)}
              </div>
              <div className="mt-2 max-w-[160px] mx-auto">
                <PixelBar value={team2.skill} max={100} color="led" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Match History */}
      {h2hStats.totalMatches > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gold" />
              Historial de Enfrentamientos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <H2HMatchHistory
              team1={team1}
              team2={team2}
              h2hStats={h2hStats}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Calendar className="w-16 h-16 text-grass-soft/40 mx-auto mb-4" />
              <h3 className="font-arcade text-sm text-white text-shadow-retro uppercase mb-2">
                Sin Enfrentamientos Previos
              </h3>
              <p className="text-grass-soft">
                Estos equipos aún no se han enfrentado en este torneo.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
