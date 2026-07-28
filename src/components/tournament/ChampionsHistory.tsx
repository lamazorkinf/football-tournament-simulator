import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useSeasonModeStore } from '../../store/useSeasonModeStore';
import { useModeStore } from '../../store/useModeStore';
import { useModeDescriptor } from '../../hooks/useModeDescriptor';
import { competitionForDivision } from '../../modes/registry';
import {
  championsService,
  summarizeChampions,
  type ChampionHistoryRow,
  type PalmaresRow,
  type CompetitionKind,
} from '../../services/championsService';
import { ChampionsPalmares } from './ChampionsPalmares';
import { ChampionsTimeline } from './ChampionsTimeline';
import { Trophy, ListOrdered, AlertTriangle, Medal } from 'lucide-react';
import { LoadingState } from '../ui/LoadingState';
import { EmptyState } from '../ui/EmptyState';
import { Tabs } from '../ui/Tabs';

type Tab = 'palmares' | 'timeline';

// Mapea el tipo de competición a la vista/bracket correspondiente.
const VIEW_FOR_KIND: Record<CompetitionKind, string> = {
  'world-cup': 'worldcup',
  continental: 'continental',
  confederations: 'confederations',
  // Los torneos de un modo de temporada viven todos bajo su vista raíz.
  season: 'league',
};

interface ChampionsHistoryProps {
  onNavigate: (view: string) => void;
}

export function ChampionsHistory({ onNavigate }: ChampionsHistoryProps) {
  // Los campeones son del modo activo: cada modo tiene su palmarés.
  const modeId = useModeStore((s) => s.activeModeId) ?? undefined;
  const descriptor = useModeDescriptor();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeId]);

  const load = async (signal: { cancelled: boolean }) => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const [hist, palm] = await Promise.all([
        championsService.getChampionsHistory(modeId),
        championsService.getPalmares(modeId),
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

  /**
   * Ir al torneo de una fila. Los ids de un modo de temporada son de
   * `mode_tournaments`, no de `tournaments_new`: pedirle a `selectTournament`
   * que los cargue no encuentra nada. Se cambia la temporada mirada al año de la
   * fila y se abre la pestaña de esa competición.
   */
  const handleOpenTournament = async (row: ChampionHistoryRow) => {
    if (row.kind === 'season') {
      const season = useSeasonModeStore.getState();
      if (season.year !== row.year && season.availableYears.includes(row.year)) {
        await season.selectYear(row.year);
      }
      const competition = competitionForDivision(descriptor, row.region || null);
      if (competition) useSeasonModeStore.getState().setActiveTab(competition.id);
      onNavigate(VIEW_FOR_KIND.season);
      return;
    }
    await selectTournament(row.tournamentId);
    onNavigate(VIEW_FOR_KIND[row.kind]);
  };

  if (loading) {
    return <LoadingState label="Cargando campeones…" />;
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
          <EmptyState
            icon={Medal}
            title="Sin torneos completados"
            description="El palmarés se llena cuando se corone el primer campeón."
          />
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
            {summary.teams === 1 ? 'equipo' : 'equipos'}
          </p>
        </CardContent>
      </Card>

      {/* Selector de pestaña */}
      <Tabs
        items={[
          { id: 'palmares', label: 'Copas', icon: Trophy },
          { id: 'timeline', label: 'Por Fecha', icon: ListOrdered },
        ]}
        value={tab}
        onChange={(id) => setTab(id as 'palmares' | 'timeline')}
      />

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
              descriptor={descriptor}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
