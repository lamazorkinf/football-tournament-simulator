import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useTournamentStore } from '../../store/useTournamentStore';
import {
  championsService,
  summarizeChampions,
  type ChampionHistoryRow,
  type PalmaresRow,
  type CompetitionKind,
} from '../../services/championsService';
import { ChampionsPalmares } from './ChampionsPalmares';
import { ChampionsTimeline } from './ChampionsTimeline';
import { Trophy, ListOrdered, Loader, AlertTriangle } from 'lucide-react';

type Tab = 'palmares' | 'timeline';

// Mapea el tipo de competición a la vista/bracket correspondiente.
const VIEW_FOR_KIND: Record<CompetitionKind, string> = {
  'world-cup': 'worldcup',
  continental: 'continental',
  confederations: 'confederations',
};

interface ChampionsHistoryProps {
  onNavigate: (view: string) => void;
}

export function ChampionsHistory({ onNavigate }: ChampionsHistoryProps) {
  const [tab, setTab] = useState<Tab>('palmares');
  const [history, setHistory] = useState<ChampionHistoryRow[]>([]);
  const [palmares, setPalmares] = useState<PalmaresRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const { selectTournament } = useTournamentStore();

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, []);

  const load = async (signal: { cancelled: boolean }) => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const [hist, palm] = await Promise.all([
        championsService.getChampionsHistory(),
        championsService.getPalmares(),
      ]);
      if (signal.cancelled) return;
      setHistory(hist);
      setPalmares(palm);
      setLoading(false);
    } catch (err) {
      console.error('Error loading champions history:', err);
      if (!signal.cancelled) {
        setError(true);
        setLoading(false);
      }
    }
  };

  const handleSelectTeam = (teamId: string) => {
    setTeamFilter(teamId);
    setTab('timeline');
  };

  const handleOpenTournament = async (tournamentId: string, kind: CompetitionKind) => {
    await selectTournament(tournamentId);
    onNavigate(VIEW_FOR_KIND[kind]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="w-8 h-8 animate-spin text-gold" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <div className="text-center py-12">
            <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-gold" />
            <p className="font-arcade text-xs text-white text-shadow-retro uppercase mb-2">
              Error al cargar los campeones
            </p>
            <p className="text-sm text-grass-soft mb-4">
              No se pudo leer el historial. Reintentá.
            </p>
            <button
              onClick={() => load({ cancelled: false })}
              className="px-4 py-2 font-arcade text-[10px] uppercase border-2 border-gold text-gold hover:bg-grass/40 transition-colors"
            >
              Reintentar
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (history.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-shadow-retro">
            <Trophy className="w-5 h-5 text-gold" />
            HIGH SCORES
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Trophy className="w-16 h-16 mx-auto mb-4 text-grass-soft" />
            <p className="font-arcade text-xs text-white text-shadow-retro uppercase mb-2">
              No hay torneos completados
            </p>
            <p className="text-sm text-grass-soft mt-2">
              Los campeones aparecerán aquí cuando completes un torneo
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const summary = summarizeChampions(history);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-shadow-retro">
            <Trophy className="w-5 h-5 text-gold" />
            HIGH SCORES
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-grass-soft">
            {summary.totalTitles} {summary.totalTitles === 1 ? 'título' : 'títulos'} ·{' '}
            {summary.years} {summary.years === 1 ? 'año' : 'años'} · {summary.teams}{' '}
            {summary.teams === 1 ? 'selección' : 'selecciones'}
          </p>
        </CardContent>
      </Card>

      {/* Selector de pestaña */}
      <div className="flex border-b-4 border-grass">
        <button
          onClick={() => setTab('palmares')}
          className={`flex items-center gap-2 px-4 py-3 font-arcade text-[10px] uppercase border-b-4 transition-colors ${
            tab === 'palmares'
              ? 'border-gold text-gold bg-grass/30'
              : 'border-transparent text-grass-soft hover:text-white hover:bg-grass/40'
          }`}
        >
          <Trophy className="w-4 h-4" />
          Palmarés
        </button>
        <button
          onClick={() => setTab('timeline')}
          className={`flex items-center gap-2 px-4 py-3 font-arcade text-[10px] uppercase border-b-4 transition-colors ${
            tab === 'timeline'
              ? 'border-gold text-gold bg-grass/30'
              : 'border-transparent text-grass-soft hover:text-white hover:bg-grass/40'
          }`}
        >
          <ListOrdered className="w-4 h-4" />
          Cronología
        </button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {tab === 'palmares' ? (
            <ChampionsPalmares rows={palmares} onSelectTeam={handleSelectTeam} />
          ) : (
            <ChampionsTimeline
              rows={history}
              teamFilter={teamFilter}
              onClearTeamFilter={() => setTeamFilter(null)}
              onOpenTournament={handleOpenTournament}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
