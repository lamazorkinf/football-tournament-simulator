import { useState, useEffect } from 'react';
import type { Team } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { TeamFlag } from '../ui/TeamFlag';
import { History, Filter, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { matchHistoryService, type MatchHistoryEntry } from '../../services/matchHistoryService';
import { isSupabaseConfigured } from '../../lib/supabase';

interface MatchHistoryProps {
  teams: Team[];
}

export function MatchHistory({ teams }: MatchHistoryProps) {
  const [matches, setMatches] = useState<MatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'qualifier' | 'world-cup-group'>('all');
  const [statistics, setStatistics] = useState({
    totalMatches: 0,
    totalGoals: 0,
    averageGoalsPerMatch: 0,
  });

  useEffect(() => {
    loadMatches();
    loadStatistics();

    // Subscribe to real-time updates
    const unsubscribe = matchHistoryService.subscribeToMatches((newMatches) => {
      setMatches(newMatches);
      loadStatistics();
    });

    return () => unsubscribe();
  }, [filter]);

  const loadMatches = async () => {
    try {
      setLoading(true);
      let matchData: MatchHistoryEntry[];

      if (filter === 'all') {
        matchData = await matchHistoryService.getAllMatches(100);
      } else {
        matchData = await matchHistoryService.getMatchesByStage(filter);
      }

      setMatches(matchData);
    } catch (error) {
      console.error('Error loading matches:', error);
      setMatches([]);
    } finally {
      setLoading(false);
    }
  };

  const loadStatistics = async () => {
    try {
      const stats = await matchHistoryService.getMatchStatistics();
      setStatistics(stats);
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  };

  const getTeam = (teamId: string) => {
    return teams.find((t) => t.id === teamId);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const getStageLabel = (stage: string) => {
    const labels = {
      qualifier: 'Eliminatoria',
      'world-cup-group': 'Copa del Mundo - Grupos',
      'world-cup-knockout': 'Copa del Mundo - Eliminación',
    };
    return labels[stage as keyof typeof labels] || stage;
  };

  const getSkillChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (change < 0) return <TrendingDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  if (!isSupabaseConfigured()) {
    return (
      <Card>
        <CardHeader className="bg-yellow-600 text-white rounded-t-lg">
          <CardTitle className="text-white">⚠️ Supabase No Configurado</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">
              El historial de partidos requiere Supabase para funcionar.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 text-left">
              <p className="font-semibold text-gray-900 mb-2">Para configurar:</p>
              <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
                <li>Crea un proyecto en Supabase.com</li>
                <li>Ejecuta el script SQL en <code className="bg-gray-200 px-1 rounded">supabase/schema.sql</code></li>
                <li>Copia <code className="bg-gray-200 px-1 rounded">.env.example</code> a <code className="bg-gray-200 px-1 rounded">.env.local</code></li>
                <li>Agrega tus credenciales de Supabase</li>
                <li>Reinicia el servidor de desarrollo</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-gray-600">Total de Partidos</p>
              <p className="text-3xl font-bold text-gray-900">{statistics.totalMatches}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-gray-600">Total de Goles</p>
              <p className="text-3xl font-bold text-primary-600">{statistics.totalGoals}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-gray-600">Promedio de Goles</p>
              <p className="text-3xl font-bold text-blue-600">
                {statistics.averageGoalsPerMatch.toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="bg-primary-600 text-white rounded-t-lg">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <History className="w-6 h-6" />
              Historial de Partidos
            </CardTitle>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
                className="px-3 py-1 rounded bg-white text-gray-900 text-sm"
              >
                <option value="all">Todos</option>
                <option value="qualifier">Eliminatorias</option>
                <option value="world-cup-group">Copa del Mundo</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
              <p className="text-gray-600 mt-4">Cargando partidos...</p>
            </div>
          ) : matches.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600">No hay partidos registrados aún</p>
              <p className="text-sm text-gray-500 mt-2">
                Los partidos se guardarán automáticamente cuando simules en el torneo
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {matches.map((match) => {
                const homeTeam = getTeam(match.homeTeamId);
                const awayTeam = getTeam(match.awayTeamId);

                if (!homeTeam || !awayTeam) return null;

                const isHomeWin = match.homeScore > match.awayScore;
                const isAwayWin = match.awayScore > match.homeScore;

                return (
                  <div
                    key={match.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-primary-400 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs text-gray-500">
                        {formatDate(match.playedAt)}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded">
                          {getStageLabel(match.stage)}
                        </span>
                        {match.groupName && (
                          <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                            {match.groupName}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
                      {/* Home Team */}
                      <div className={`text-right ${isHomeWin ? 'font-bold' : ''}`}>
                        <div className="flex items-center justify-end gap-2">
                          <div>
                            <div className="text-sm">{homeTeam.name}</div>
                            <div className="text-xs text-gray-500 flex items-center justify-end gap-1">
                              Skill: {match.homeSkillBefore} → {match.homeSkillAfter}
                              {getSkillChangeIcon(match.homeSkillChange)}
                              <span
                                className={
                                  match.homeSkillChange > 0
                                    ? 'text-green-600'
                                    : match.homeSkillChange < 0
                                    ? 'text-red-600'
                                    : ''
                                }
                              >
                                {match.homeSkillChange > 0 ? '+' : ''}
                                {match.homeSkillChange}
                              </span>
                            </div>
                          </div>
                          <TeamFlag
                            teamId={homeTeam.id}
                            teamName={homeTeam.name}
                            flagUrl={homeTeam.flag}
                            size={32}
                          />
                        </div>
                      </div>

                      {/* Score */}
                      <div className="text-center px-4">
                        <div className="text-2xl font-bold">
                          {match.homeScore} - {match.awayScore}
                        </div>
                      </div>

                      {/* Away Team */}
                      <div className={`text-left ${isAwayWin ? 'font-bold' : ''}`}>
                        <div className="flex items-center gap-2">
                          <TeamFlag
                            teamId={awayTeam.id}
                            teamName={awayTeam.name}
                            flagUrl={awayTeam.flag}
                            size={32}
                          />
                          <div>
                            <div className="text-sm">{awayTeam.name}</div>
                            <div className="text-xs text-gray-500 flex items-center gap-1">
                              Skill: {match.awaySkillBefore} → {match.awaySkillAfter}
                              {getSkillChangeIcon(match.awaySkillChange)}
                              <span
                                className={
                                  match.awaySkillChange > 0
                                    ? 'text-green-600'
                                    : match.awaySkillChange < 0
                                    ? 'text-red-600'
                                    : ''
                                }
                              >
                                {match.awaySkillChange > 0 ? '+' : ''}
                                {match.awaySkillChange}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
