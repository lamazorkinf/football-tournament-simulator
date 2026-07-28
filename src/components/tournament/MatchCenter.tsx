import { useState, useMemo } from 'react';
import type { Cycle, Team, Region } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { ScoreBug } from '../ui/ScoreBug';
import { MatchSimActions, JornadaSimActions } from '../ui/SimActions';
import { MatchDetailModal } from './MatchDetailModal';
import { MatchPreview } from './MatchPreview';
import { Filter, Clock, CheckCircle, ChevronLeft, ChevronRight, Eye, Star } from 'lucide-react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useFavoritesStore } from '../../store/useFavoritesStore';
import { useMobileAction } from '../../hooks/useMobileAction';
import { useSwipeNavigation } from '../../hooks/useSwipeNavigation';
import { useCycleJornada } from '../../hooks/useCycleJornada';
import { getCyclePhaseBanner } from '../../utils/cycleProgress';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { collectAllMatches, type MatchStage, type MatchWithContext } from './matchCenterCollector';
import type { JornadaGroup } from '../../core/jornada';
import type { PenaltiesScore } from '../../utils/matchLabels';
import { showMatchResultToast } from '../ui/MatchResultToast';

interface MatchCenterProps {
  tournament: Cycle;
  teams: Team[];
  onNavigate?: (view: string, options?: { region?: Region; groupId?: string }) => void;
}

export function MatchCenter({ tournament, teams, onNavigate }: MatchCenterProps) {
  const { simulateMatch, simulateKnockoutMatch, simulateContinentalMatch, simulateConfederationsMatch, isSavingMatch } = useTournamentStore();
  const jornadaSim = useCycleJornada(tournament, teams);
  const [selectedRegion, setSelectedRegion] = useState<Region | 'all'>('all');
  const [selectedStage, setSelectedStage] = useState<MatchStage | 'all'>('all');
  const [selectedMatch, setSelectedMatch] = useState<MatchWithContext | null>(null);
  // Índice de la jornada elegida en jornadaGroups, o 'all' para ver todo.
  const [selectedJornadaIndex, setSelectedJornadaIndex] = useState<number | 'all'>(0);
  // Partido concreto que se muestra en el preview móvil. Antes el modal usaba
  // siempre unplayedMatches[0], así que tocar cualquier fila abría el preview
  // del primer partido, no el tocado.
  const [mobilePreviewMatch, setMobilePreviewMatch] = useState<MatchWithContext | null>(null);
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  // Collect all matches from all sources (qualifiers, world cup, continental, confed)
  const allMatches = useMemo(() => collectAllMatches(tournament), [tournament]);

  // Jornadas del ciclo (fase, número) en orden. La "jornada actual" es la
  // primera con partido sin jugar — es GLOBAL: ignora los filtros visuales.
  const { jornadaGroups, currentJornada } = jornadaSim;

  // Default de la jornada mostrada = jornada actual. Se reajusta durante el
  // render SOLO al cambiar de torneo (patrón React de "derivar estado de
  // props" sin efecto en cascada). Dentro de un mismo torneo la selección no
  // sigue el avance de la jornada actual: si simulás la jornada mostrada, la
  // vista se queda en ella (los botones de simular apuntan siempre a la
  // jornada actual GLOBAL, no a la mostrada).
  const currentJornadaIndex = useMemo(() => {
    if (!currentJornada) return jornadaGroups.length > 0 ? 0 : 'all';
    return jornadaGroups.findIndex(
      (g) => g.phase === currentJornada.phase && g.jornada === currentJornada.jornada,
    );
  }, [jornadaGroups, currentJornada]);

  // Centinela null → la derivación corre también en el primer montaje, así el
  // default es la jornada actual (y no el índice 0 fijo del useState).
  const [prevTournamentId, setPrevTournamentId] = useState<string | null>(null);
  if (tournament.id !== prevTournamentId) {
    setPrevTournamentId(tournament.id);
    setSelectedJornadaIndex(currentJornadaIndex);
    setSelectedRegion('all');
    setSelectedStage('all');
  }

  const selectedJornada: JornadaGroup | null =
    selectedJornadaIndex === 'all' ? null : jornadaGroups[selectedJornadaIndex] ?? null;

  // Lista mostrada: los partidos de la jornada elegida (o todos si 'all'),
  // con los filtros de región/etapa aplicados SOLO como filtro visual.
  const filteredMatches = useMemo(() => {
    const source = selectedJornada ? selectedJornada.matches : allMatches;
    const filtered = source.filter((m) => {
      const regionMatch = selectedRegion === 'all' || m.region === selectedRegion;
      const stageMatch = selectedStage === 'all' || m.stage === selectedStage;
      return regionMatch && stageMatch;
    });
    return filtered.sort((a, b) => {
      const mdA = a.match.matchday ?? 999;
      const mdB = b.match.matchday ?? 999;
      return mdA !== mdB ? mdA - mdB : a.groupName.localeCompare(b.groupName);
    });
  }, [allMatches, selectedJornada, selectedRegion, selectedStage]);

  // Separate played and unplayed for display
  const unplayedMatches = filteredMatches.filter((m) => !m.match.isPlayed);

  const handleSimulateMatch = async (matchWithContext: MatchWithContext) => {
    const { match, stage, groupId } = matchWithContext;

    // Don't allow simulation if another match is being saved
    if (isSavingMatch) {
      toast.warning('Espera a que se guarde el partido anterior');
      return;
    }

    const homeTeam = getTeam(match.homeTeamId);
    const awayTeam = getTeam(match.awayTeamId);

    // Knockout/Continental/Confederaciones pueden tener equipos "por definir"
    // hasta que se resuelve la ronda anterior. Evita el no-op silencioso de las
    // funciones del store (que devuelven null si faltan equipos) con un mensaje.
    if (!homeTeam || !awayTeam) {
      toast.info('Este partido todavía no tiene definidos los dos equipos');
      return;
    }

    // Cada fase se simula con su propia función del store. Las de
    // knockout/continental/confederaciones devuelven el marcador directamente;
    // qualifier/world-cup actualizan el estado y hay que releer el partido.
    let homeScore: number | null | undefined;
    let awayScore: number | null | undefined;
    // Solo las eliminatorias pueden terminar en penales.
    let penalties: PenaltiesScore | undefined;

    if (stage === 'qualifier' || stage === 'world-cup') {
      await simulateMatch(match.id, groupId, stage === 'qualifier' ? 'qualifier' : 'world-cup');

      const currentTournament = useTournamentStore.getState().currentTournament;
      if (!currentTournament) return;

      let updatedMatch = match;
      if (stage === 'qualifier' && matchWithContext.region) {
        const group = currentTournament.qualifiers[matchWithContext.region]?.find(g => g.id === groupId);
        updatedMatch = group?.matches.find(m => m.id === match.id) || match;
      } else if (stage === 'world-cup') {
        const group = currentTournament.worldCup?.groups.find(g => g.id === groupId);
        updatedMatch = group?.matches.find(m => m.id === match.id) || match;
      }
      homeScore = updatedMatch.homeScore;
      awayScore = updatedMatch.awayScore;
    } else {
      const result =
        stage === 'knockout' ? await simulateKnockoutMatch(match.id)
        : stage === 'continental' ? await simulateContinentalMatch(match.id)
        : await simulateConfederationsMatch(match.id);

      if (!result) {
        // null = fuera de jornada, ronda anterior sin terminar, o ya jugado.
        toast.info('No se pudo simular ahora (puede estar fuera de la jornada o la ronda anterior aún no terminó)');
        return;
      }
      homeScore = result.homeScore;
      awayScore = result.awayScore;
      penalties = result.penalties;
    }

    // Mismo aviso que el resto de la app, sea cual sea la fase.
    showMatchResultToast({
      homeName: homeTeam.name,
      awayName: awayTeam.name,
      homeScore: homeScore ?? 0,
      awayScore: awayScore ?? 0,
      penalties,
    });
  };

  useMobileAction({
    label: jornadaSim.isBusy ? 'SIMULANDO…' : '▶ SIMULAR JORNADA',
    onPress: jornadaSim.simulate,
    disabled: !jornadaSim.canSimulate,
  });

  const handleMatchClick = (matchCtx: MatchWithContext) => {
    // Open modal on mobile, do nothing on desktop
    if (window.innerWidth < 1024) {
      setMobilePreviewMatch(matchCtx);
      setShowMobilePreview(true);
    }
  };

  // Índice efectivo de la jornada mostrada (para el paginador).
  const effectiveIndex = selectedJornadaIndex === 'all' ? jornadaGroups.length : selectedJornadaIndex;
  const atFirstJornada = effectiveIndex <= 0;
  const atLastJornada = selectedJornadaIndex === 'all';

  const handlePrevMatchday = () => {
    if (selectedJornadaIndex === 'all') {
      if (jornadaGroups.length > 0) setSelectedJornadaIndex(jornadaGroups.length - 1);
    } else if (selectedJornadaIndex > 0) {
      setSelectedJornadaIndex(selectedJornadaIndex - 1);
    }
  };

  const handleNextMatchday = () => {
    if (selectedJornadaIndex === 'all') return;
    if (selectedJornadaIndex < jornadaGroups.length - 1) {
      setSelectedJornadaIndex(selectedJornadaIndex + 1);
    } else {
      setSelectedJornadaIndex('all');
    }
  };

  const swipeHandlers = useSwipeNavigation(
    () => {
      if (!atFirstJornada) handlePrevMatchday();
    },
    () => {
      if (!atLastJornada) handleNextMatchday();
    }
  );

  const jornadaLabelText =
    selectedJornadaIndex === 'all'
      ? 'Todas'
      : selectedJornada
        ? `${selectedJornada.phaseLabel} · ${selectedJornada.label}`
        : '—';

  const getTeam = (teamId: string) => teams.find((t) => t.id === teamId);

  const regions: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

  const phaseBanner = getCyclePhaseBanner(tournament);

  return (
    <div className="space-y-6">
      {phaseBanner && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-grass/20 border-2 border-gold p-4">
          <p className="font-arcade text-[10px] uppercase text-gold">
            Fase activa: {phaseBanner.label}
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigate?.(phaseBanner.targetView)}
            className="gap-2"
          >
            Ir a la vista →
          </Button>
        </div>
      )}

      {/* Match Detail Modal */}
      {selectedMatch && (() => {
        const homeTeam = getTeam(selectedMatch.match.homeTeamId);
        const awayTeam = getTeam(selectedMatch.match.awayTeamId);
        return homeTeam && awayTeam ? (
          <MatchDetailModal
            match={selectedMatch.match}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            onClose={() => setSelectedMatch(null)}
          />
        ) : null;
      })()}

      {/* Filters & Quick Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between min-w-0">
            <div className="flex flex-wrap gap-3 items-center w-full lg:w-auto">
              <Filter className="w-5 h-5 text-grass-soft flex-shrink-0" />

              {/* Region Filter */}
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value as Region | 'all')}
                className="px-3 py-2 min-h-11 lg:min-h-0 bg-night border-2 border-grass text-sm text-white focus:outline-none focus:border-gold max-w-full truncate"
              >
                <option value="all">Todas las regiones</option>
                {regions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>

              {/* Stage Filter */}
              <select
                value={selectedStage}
                onChange={(e) => setSelectedStage(e.target.value as MatchStage | 'all')}
                className="px-3 py-2 min-h-11 lg:min-h-0 bg-night border-2 border-grass text-sm text-white focus:outline-none focus:border-gold max-w-full truncate"
              >
                <option value="all">Todas las etapas</option>
                <option value="qualifier">Clasificatorias</option>
                <option value="world-cup">Mundial · Grupos</option>
                <option value="knockout">Mundial · Playoffs</option>
                <option value="continental">Continental</option>
                <option value="confederations">Confederaciones</option>
              </select>

              {/* Jornada Pagination */}
              {jornadaGroups.length > 0 && (
                <div className="hidden sm:flex items-center gap-2 border-2 border-grass px-2 py-1">
                  <button
                    onClick={handlePrevMatchday}
                    disabled={atFirstJornada}
                    className="p-2.5 lg:p-1 text-grass-soft hover:bg-grass/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Jornada anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-arcade text-[10px] text-gold uppercase min-w-[140px] text-center truncate">
                    {jornadaLabelText}
                  </span>
                  <button
                    onClick={handleNextMatchday}
                    disabled={atLastJornada}
                    className="p-2.5 lg:p-1 text-grass-soft hover:bg-grass/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Jornada siguiente"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="hidden lg:block">
              <JornadaSimActions
                jornadaLabel={jornadaSim.title}
                onSimulate={jornadaSim.simulate}
                onSimulateLive={jornadaSim.simulateLive}
                disabled={!jornadaSim.canSimulate}
                busy={jornadaSim.isBusy}
                hint="se juega entera, de todas las regiones, sin importar los filtros."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Matchday indicator + live action: mobile only */}
      {jornadaGroups.length > 0 && (
        <div className="sm:hidden space-y-3">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={handlePrevMatchday}
              disabled={atFirstJornada}
              className="min-h-11 min-w-11 flex items-center justify-center text-gold disabled:opacity-30 font-arcade text-sm"
              aria-label="Jornada anterior"
            >
              ◀
            </button>
            <span className="font-arcade text-[10px] text-gold uppercase min-w-[140px] text-center truncate">
              {jornadaLabelText}
            </span>
            <button
              onClick={handleNextMatchday}
              disabled={atLastJornada}
              className="min-h-11 min-w-11 flex items-center justify-center text-gold disabled:opacity-30 font-arcade text-sm"
              aria-label="Jornada siguiente"
            >
              ▶
            </button>
          </div>
          <JornadaSimActions
            jornadaLabel={jornadaSim.title}
            onSimulate={jornadaSim.simulate}
            onSimulateLive={jornadaSim.simulateLive}
            disabled={!jornadaSim.canSimulate}
            busy={jornadaSim.isBusy}
          />
        </div>
      )}

      {/* Two Column Layout: Upcoming vs Preview (60%-40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] gap-6" {...swipeHandlers}>
        {/* Left Column: Upcoming Matches (60%) */}
        <Card className="flex flex-col animate-slide-in lg:animate-none" key={String(selectedJornadaIndex)}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 flex-wrap min-w-0">
              <Clock className="w-5 h-5 text-gold flex-shrink-0" />
              <span className="truncate">Próximos Partidos ({unplayedMatches.length})</span>
              {selectedJornada && (
                <span className="px-2 py-1 font-arcade text-[10px] text-gold uppercase bg-grass/30 flex-shrink-0">
                  {selectedJornada.phaseLabel} · {selectedJornada.label}
                </span>
              )}
              {selectedJornada && (
                <span className="px-2 py-1 font-arcade text-[10px] text-grass-soft uppercase flex-shrink-0">
                  {selectedJornada.matches.filter((m) => m.match.isPlayed).length}/{selectedJornada.matches.length} jugados
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            {unplayedMatches.length > 0 ? (
              <div className="space-y-2">
                {unplayedMatches.map((matchCtx, idx) => (
                  <MatchRow
                    key={matchCtx.match.id}
                    matchCtx={matchCtx}
                    teams={teams}
                    onSimulate={() => handleSimulateMatch(matchCtx)}
                    onMatchClick={() => handleMatchClick(matchCtx)}
                    index={idx}
                    compact={true}
                    disabled={isSavingMatch}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center text-grass-soft py-12">
                <CheckCircle className="w-16 h-16 mx-auto mb-4 text-led" />
                <p className="font-arcade text-xs text-white text-shadow-retro uppercase">Sin partidos próximos</p>
                <p className="text-sm mt-2">Todos los partidos han sido jugados</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Column: Match Preview (40%) - Desktop Only */}
        <div className="hidden lg:block">
          {unplayedMatches.length > 0 && (() => {
            const nextMatch = unplayedMatches[0];
            const homeTeam = getTeam(nextMatch.match.homeTeamId);
            const awayTeam = getTeam(nextMatch.match.awayTeamId);

            // Find the group for this match
            let group = null;
            if (nextMatch.stage === 'qualifier' && nextMatch.region) {
              group = tournament.qualifiers[nextMatch.region]?.find(g => g.id === nextMatch.groupId);
            } else if (nextMatch.stage === 'world-cup') {
              group = tournament.worldCup?.groups.find(g => g.id === nextMatch.groupId);
            }

            return homeTeam && awayTeam ? (
              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 flex-wrap min-w-0">
                    <Eye className="w-5 h-5 text-gold flex-shrink-0" />
                    <span className="truncate">Vista Previa del Próximo Partido</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-auto space-y-4">
                  <ScoreBug
                    size="lg"
                    homeTeam={homeTeam}
                    awayTeam={awayTeam}
                    homeScore={nextMatch.match.isPlayed ? nextMatch.match.homeScore : null}
                    awayScore={nextMatch.match.isPlayed ? nextMatch.match.awayScore : null}
                  />
                  {/* El preview detallado (posiciones/H2H) solo existe para fases
                      con grupo. Para knockout/continental/confed mostramos el
                      marcador y un rótulo de la ronda. */}
                  {group ? (
                    <MatchPreview
                      homeTeam={homeTeam}
                      awayTeam={awayTeam}
                      group={group}
                      teams={teams}
                    />
                  ) : (
                    <p className="text-center text-sm text-grass-soft">
                      {nextMatch.groupName}
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="flex flex-col">
                <CardContent className="pt-6">
                  <div className="text-center text-grass-soft py-12">
                    <Eye className="w-16 h-16 mx-auto mb-4 text-grass-soft" />
                    <p className="text-sm">No hay datos disponibles para este partido</p>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>
      </div>

      {/* Mobile Preview Modal */}
      <AnimatePresence>
        {showMobilePreview && mobilePreviewMatch && (() => {
          const nextMatch = mobilePreviewMatch;
          const homeTeam = getTeam(nextMatch.match.homeTeamId);
          const awayTeam = getTeam(nextMatch.match.awayTeamId);

          // Find the group for this match
          let group = null;
          if (nextMatch.stage === 'qualifier' && nextMatch.region) {
            group = tournament.qualifiers[nextMatch.region]?.find(g => g.id === nextMatch.groupId);
          } else if (nextMatch.stage === 'world-cup') {
            group = tournament.worldCup?.groups.find(g => g.id === nextMatch.groupId);
          }

          return homeTeam && awayTeam ? (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowMobilePreview(false)}
                className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              />

              {/* Modal */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="fixed inset-4 bg-grass-dark border-4 border-line shadow-hard-panel z-50 overflow-auto lg:hidden"
              >
                <div className="sticky top-0 bg-grass-dark border-b-4 border-grass p-4 flex items-center justify-between">
                  <h3 className="font-arcade text-sm text-white text-shadow-retro">Vista Previa del Partido</h3>
                  <button
                    onClick={() => setShowMobilePreview(false)}
                    className="p-2 text-grass-soft hover:bg-grass/40 transition-colors"
                  >
                    <CheckCircle className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 space-y-4">
                  <ScoreBug
                    size="lg"
                    homeTeam={homeTeam}
                    awayTeam={awayTeam}
                    homeScore={nextMatch.match.isPlayed ? nextMatch.match.homeScore : null}
                    awayScore={nextMatch.match.isPlayed ? nextMatch.match.awayScore : null}
                  />
                  {group ? (
                    <MatchPreview
                      homeTeam={homeTeam}
                      awayTeam={awayTeam}
                      group={group}
                      teams={teams}
                    />
                  ) : (
                    <p className="text-center text-sm text-grass-soft">
                      {nextMatch.groupName}
                    </p>
                  )}
                </div>
              </motion.div>
            </>
          ) : null;
        })()}
      </AnimatePresence>
    </div>
  );
}

interface MatchRowProps {
  matchCtx: MatchWithContext;
  teams: Team[];
  onSimulate?: () => void;
  onViewDetails?: () => void;
  onMatchClick?: () => void; // Navigate to group when clicking the match container
  index: number;
  compact?: boolean; // Compact centered layout for recent-match rows
  disabled?: boolean; // Disable the play button
}

function MatchRow({ matchCtx, teams, onSimulate, onMatchClick, index, compact = false, disabled = false }: MatchRowProps) {
  const { match, stage, groupName, region } = matchCtx;
  const favoriteTeamIds = useFavoritesStore((s) => s.favoriteTeamIds);
  const involvesFavorite =
    favoriteTeamIds.includes(match.homeTeamId) || favoriteTeamIds.includes(match.awayTeamId);
  const homeTeam = teams.find((t) => t.id === match.homeTeamId);
  const awayTeam = teams.find((t) => t.id === match.awayTeamId);
  // Knockout/continental/confed pueden tener equipos aún sin resolver: sin
  // ambos definidos, la simulación es un no-op en el store, así que se
  // deshabilita el botón en lugar de dejar que falle en silencio.
  const bothTeamsKnown = Boolean(homeTeam && awayTeam);

  const getStageBadge = () => {
    const colors: Record<MatchStage, string> = {
      qualifier: 'bg-black/40 text-grass-soft border border-grass',
      'world-cup': 'bg-black/40 text-gold border border-gold',
      knockout: 'bg-black/40 text-loss border border-loss',
      continental: 'bg-black/40 text-grass-soft border border-grass',
      confederations: 'bg-black/40 text-gold border border-gold',
    };
    const labels: Record<MatchStage, string> = {
      qualifier: 'Clasificatorias',
      'world-cup': 'Mundial · Grupos',
      knockout: 'Mundial · Playoffs',
      continental: 'Continental',
      confederations: 'Confederaciones',
    };

    return (
      <span className={`px-2 py-1 font-arcade text-[10px] uppercase ${colors[stage]}`}>
        {labels[stage]}
      </span>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border-2 cursor-pointer ${
        match.isPlayed
          ? 'bg-grass-dark border-grass hover:bg-grass/20 transition-colors'
          : 'bg-grass-dark border-gold hover:border-led transition-colors'
      }`}
      onClick={onMatchClick}
    >
      <div className="flex-1 w-full sm:w-auto min-w-0">
        {/* Stage & Group Info */}
        <div className="flex items-center gap-2 mb-2 overflow-hidden">
          {getStageBadge()}
          {involvesFavorite && (
            <Star className="w-4 h-4 text-gold fill-gold flex-shrink-0" aria-label="Equipo favorito" />
          )}
          <span className="px-2 py-1 font-arcade text-[10px] text-gold uppercase bg-grass/30 flex-shrink-0">
            J{matchCtx.displayJornada}
          </span>
          <span className="text-xs text-grass-soft truncate">
            {region && `${region} • `}{groupName}
          </span>
        </div>

        {/* Teams */}
        <div className={`flex items-center ${compact ? 'justify-center' : 'justify-between'} gap-2 min-w-0`}>
          {homeTeam && awayTeam ? (
            <>
              <div className="w-full sm:hidden">
                <ScoreBug
                  size="narrow"
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                  homeScore={match.isPlayed ? match.homeScore : null}
                  awayScore={match.isPlayed ? match.awayScore : null}
                />
              </div>
              <div className="hidden sm:block">
                <ScoreBug
                  size="md"
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                  homeScore={match.isPlayed ? match.homeScore : null}
                  awayScore={match.isPlayed ? match.awayScore : null}
                />
              </div>
            </>
          ) : (
            <span className="text-grass-soft text-xs">{match.homeTeamId} vs {match.awayTeamId}</span>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-3 sm:mt-0 sm:ml-4 w-full sm:w-auto">
        {!match.isPlayed && onSimulate && (
          <MatchSimActions
            onSimulate={onSimulate}
            live={{
              matchId: matchCtx.match.id,
              homeTeamId: matchCtx.match.homeTeamId,
              awayTeamId: matchCtx.match.awayTeamId,
              kind: matchCtx.stage,
              groupId: matchCtx.groupId,
            }}
            disabled={disabled || !bothTeamsKnown}
            disabledTitle={
              !bothTeamsKnown ? 'Equipos por definir (falta resolver la ronda anterior)' : undefined
            }
            className="w-full sm:w-auto"
          />
        )}
      </div>
    </motion.div>
  );
}
