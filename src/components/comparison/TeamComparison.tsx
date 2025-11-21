import { useState } from 'react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { ArrowLeft, Trophy, Target, TrendingUp, Calendar } from 'lucide-react';
import { TeamFlag } from '../ui/TeamFlag';
import { TeamSelector } from './TeamSelector';
import { ComparisonStats } from './ComparisonStats';
import { H2HMatchHistory } from './H2HMatchHistory';
import { calculateHeadToHeadStats, compareOverallStats } from '../../services/headToHeadService';
import type { Team } from '../../types';

export function TeamComparison() {
  const { teams } = useTournamentStore();
  const [team1, setTeam1] = useState<Team | null>(null);
  const [team2, setTeam2] = useState<Team | null>(null);

  const handleBack = () => {
    // Reset selection to allow new comparison
    setTeam1(null);
    setTeam2(null);
  };

  // If no teams selected, show selection screen
  if (!team1 || !team2) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="bg-gradient-to-r from-primary-600 to-primary-700 text-white">
            <CardTitle className="text-white flex items-center gap-2">
              <Target className="w-6 h-6" />
              Comparación de Equipos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  Selecciona dos equipos para comparar sus estadísticas, historial de enfrentamientos
                  y rendimiento en el torneo.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Equipo 1</h3>
                  <TeamSelector
                    teams={teams}
                    selectedTeam={team1}
                    onSelectTeam={setTeam1}
                    excludeTeamId={team2?.id}
                  />
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Equipo 2</h3>
                  <TeamSelector
                    teams={teams}
                    selectedTeam={team2}
                    onSelectTeam={setTeam2}
                    excludeTeamId={team1?.id}
                  />
                </div>
              </div>

              {team1 && team2 && (
                <div className="flex justify-center">
                  <Button
                    variant="primary"
                    size="lg"
                    className="gap-2"
                    onClick={() => {
                      // Teams are already selected, this will trigger the comparison view
                    }}
                  >
                    <Trophy className="w-5 h-5" />
                    Comparar Equipos
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calculate statistics
  const h2hStats = calculateHeadToHeadStats(team1.id, team2.id);
  const overallComparison = compareOverallStats(team1, team2);

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
            <Target className="w-6 h-6 text-primary-600" />
            <h2 className="text-2xl font-bold text-gray-900">Comparación</h2>
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
                  flagUrl={team1.flag}
                  size={64}
                />
              </div>
              <h3 className="text-xl font-bold text-gray-900">{team1.name}</h3>
              <p className="text-sm text-gray-600">{team1.region}</p>
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-semibold">
                <TrendingUp className="w-4 h-4" />
                Skill: {team1.skill}
              </div>
            </div>

            {/* VS Badge */}
            <div className="flex flex-col items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-bold text-xl shadow-lg">
                VS
              </div>
              {h2hStats.totalMatches > 0 && (
                <p className="text-xs text-gray-500 mt-2">
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
                  flagUrl={team2.flag}
                  size={64}
                />
              </div>
              <h3 className="text-xl font-bold text-gray-900">{team2.name}</h3>
              <p className="text-sm text-gray-600">{team2.region}</p>
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm font-semibold">
                <TrendingUp className="w-4 h-4" />
                Skill: {team2.skill}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Cards */}
      <ComparisonStats
        team1={team1}
        team2={team2}
        h2hStats={h2hStats}
        overallComparison={overallComparison}
      />

      {/* Match History */}
      {h2hStats.totalMatches > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary-600" />
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
              <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Sin Enfrentamientos Previos
              </h3>
              <p className="text-gray-600">
                Estos equipos aún no se han enfrentado en este torneo.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
