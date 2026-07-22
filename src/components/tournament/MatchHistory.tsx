import { useState, useEffect } from 'react';
import type { Team } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { ScoreBug } from '../ui/ScoreBug';
import { History, Filter, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { matchHistoryService, type MatchHistoryEntry, type MatchCursor } from '../../services/matchHistoryService';
import { isSupabaseConfigured } from '../../lib/supabase';

interface MatchHistoryProps {
  teams: Team[];
}

export function MatchHistory({ teams }: MatchHistoryProps) {
  const [matches, setMatches] = useState<MatchHistoryEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<MatchCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<'all' | 'qualifier' | 'world-cup-group'>('all');
  const [statistics, setStatistics] = useState({
    totalMatches: 0,
    totalGoals: 0,
    averageGoalsPerMatch: 0,
  });

  const PAGE_SIZE = 30;

  useEffect(() => {
    loadFirstPage();
    loadStatistics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Suscripción a inserts: antepone el partido nuevo (si matchea el filtro) y
  // refresca las stats. No re-descarga la lista (rompería el estado paginado).
  useEffect(() => {
    const unsubscribe = matchHistoryService.subscribeToMatches((newMatch) => {
      setMatches((prev) => {
        if (filter !== 'all' && newMatch.stage !== filter) return prev;
        if (prev.some((m) => m.id === newMatch.id)) return prev;
        return [newMatch, ...prev];
      });
      loadStatistics();
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const loadFirstPage = async () => {
    try {
      setLoading(true);
      const page = await matchHistoryService.getMatchesPage({
        pageSize: PAGE_SIZE,
        stage: filter === 'all' ? undefined : filter,
      });
      setMatches(page.matches);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (error) {
      console.error('Error loading matches:', error);
      setMatches([]);
      setNextCursor(null);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      const page = await matchHistoryService.getMatchesPage({
        cursor: nextCursor,
        pageSize: PAGE_SIZE,
        stage: filter === 'all' ? undefined : filter,
      });
      setMatches((prev) => [...prev, ...page.matches]);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (error) {
      console.error('Error loading more matches:', error);
    } finally {
      setLoadingMore(false);
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
    if (change > 0) return <TrendingUp className="w-4 h-4 text-led" />;
    if (change < 0) return <TrendingDown className="w-4 h-4 text-loss" />;
    return <Minus className="w-4 h-4 text-gold" />;
  };

  const getSkillChangeTextClass = (change: number) => {
    if (change > 0) return 'text-led';
    if (change < 0) return 'text-loss';
    return 'text-gold';
  };

  if (!isSupabaseConfigured()) {
    return (
      <Card>
        <CardHeader className="bg-gold text-night">
          <CardTitle className="text-night">⚠️ Supabase No Configurado</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <p className="text-grass-soft mb-4">
              El historial de partidos requiere Supabase para funcionar.
            </p>
            <div className="bg-night border-2 border-grass p-4 text-left">
              <p className="font-arcade text-[10px] text-white text-shadow-retro uppercase mb-2">Para configurar:</p>
              <ol className="list-decimal list-inside text-sm text-grass-soft space-y-1">
                <li>Crea un proyecto en Supabase.com</li>
                <li>Ejecuta el script SQL en <code className="bg-black/60 text-white px-1">supabase/schema.sql</code></li>
                <li>Copia <code className="bg-black/60 text-white px-1">.env.example</code> a <code className="bg-black/60 text-white px-1">.env.local</code></li>
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
              <p className="text-sm text-grass-soft">Total de Partidos</p>
              <p className="text-3xl font-terminal text-led tabular-nums">{statistics.totalMatches}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-grass-soft">Total de Goles</p>
              <p className="text-3xl font-terminal text-led tabular-nums">{statistics.totalGoals}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-grass-soft">Promedio de Goles</p>
              <p className="text-3xl font-terminal text-led tabular-nums">
                {statistics.averageGoalsPerMatch.toFixed(2)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="bg-grass">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-white flex items-center gap-2">
              <History className="w-6 h-6" />
              Historial de Partidos
            </CardTitle>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-white" />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
                className="px-3 py-1 bg-black border-2 border-line text-white text-sm font-terminal"
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
              <div className="animate-spin h-12 w-12 border-b-2 border-gold mx-auto"></div>
              <p className="text-grass-soft mt-4">Cargando partidos...</p>
            </div>
          ) : matches.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-16 h-16 text-grass-soft mx-auto mb-4" />
              <p className="text-grass-soft">No hay partidos registrados aún</p>
              <p className="text-sm text-grass-soft mt-2">
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
                const isDraw = !isHomeWin && !isAwayWin;
                const homeResultClass = isHomeWin ? 'text-led' : isDraw ? 'text-gold' : 'text-loss';
                const awayResultClass = isAwayWin ? 'text-led' : isDraw ? 'text-gold' : 'text-loss';

                return (
                  <div
                    key={match.id}
                    className="bg-grass-dark border-2 border-line p-4 space-y-3 hover:border-gold transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                      <div className="text-xs text-grass-soft">
                        {formatDate(match.playedAt)}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-arcade text-[10px] uppercase bg-black/40 text-gold border border-gold px-2 py-1">
                          {getStageLabel(match.stage)}
                        </span>
                        {match.groupName && (
                          <span className="font-arcade text-[10px] uppercase bg-black/40 text-grass-soft border border-grass px-2 py-1">
                            {match.groupName}
                          </span>
                        )}
                      </div>
                    </div>

                    <ScoreBug
                      size="md"
                      homeTeam={homeTeam}
                      awayTeam={awayTeam}
                      homeScore={match.homeScore}
                      awayScore={match.awayScore}
                    />

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className={`flex items-center justify-end gap-1 ${homeResultClass}`}>
                        <span>Skill: {match.homeSkillBefore} → {match.homeSkillAfter}</span>
                        {getSkillChangeIcon(match.homeSkillChange)}
                        <span className={getSkillChangeTextClass(match.homeSkillChange)}>
                          {match.homeSkillChange > 0 ? '+' : ''}
                          {match.homeSkillChange}
                        </span>
                      </div>
                      <div className={`flex items-center gap-1 ${awayResultClass}`}>
                        <span>Skill: {match.awaySkillBefore} → {match.awaySkillAfter}</span>
                        {getSkillChangeIcon(match.awaySkillChange)}
                        <span className={getSkillChangeTextClass(match.awaySkillChange)}>
                          {match.awaySkillChange > 0 ? '+' : ''}
                          {match.awaySkillChange}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {hasMore && (
                <div className="pt-2 text-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="font-arcade text-[10px] uppercase bg-black/40 text-gold border-2 border-gold px-4 py-2 hover:bg-gold hover:text-night transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? 'Cargando…' : 'Cargar más'}
                  </button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
