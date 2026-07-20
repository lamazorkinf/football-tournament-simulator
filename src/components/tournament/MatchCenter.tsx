import { useState, useMemo } from 'react';
import type { Tournament, Team, Match, Region } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { ScoreBug } from '../ui/ScoreBug';
import { MatchDetailModal } from './MatchDetailModal';
import { MatchPreview } from './MatchPreview';
import { Play, Filter, Clock, CheckCircle, Calendar, RefreshCw, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useMatchResultsStore } from '../../store/useMatchResultsStore';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface MatchCenterProps {
  tournament: Tournament;
  teams: Team[];
  onNavigate?: (view: string, options?: { region?: Region; groupId?: string }) => void;
}

type MatchStage = 'qualifier' | 'world-cup' | 'knockout';
type MatchWithContext = {
  match: Match;
  stage: MatchStage;
  groupId: string;
  groupName: string;
  region?: Region;
};

export function MatchCenter({ tournament, teams }: MatchCenterProps) {
  const { simulateMatch, simulateMatchdayBatch, resetCurrentTournamentMatches, generateDrawAndFixtures, isSavingMatch, isBatchProcessing } = useTournamentStore();
  const { showResults } = useMatchResultsStore();
  const [selectedRegion, setSelectedRegion] = useState<Region | 'all'>('all');
  const [selectedStage, setSelectedStage] = useState<MatchStage | 'all'>('all');
  const [selectedMatch, setSelectedMatch] = useState<MatchWithContext | null>(null);
  const [selectedMatchday, setSelectedMatchday] = useState<number | 'all'>('all');
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  // Collect all matches from all sources
  const allMatches = useMemo(() => {
    const matches: MatchWithContext[] = [];

    // Qualifier matches
    Object.entries(tournament.qualifiers).forEach(([region, groups]) => {
      groups.forEach((group) => {
        group.matches.forEach((match) => {
          matches.push({
            match,
            stage: 'qualifier',
            groupId: group.id,
            groupName: group.name,
            region: region as Region,
          });
        });
      });
    });

    // World Cup group matches
    if (tournament.worldCup) {
      tournament.worldCup.groups.forEach((group) => {
        group.matches.forEach((match) => {
          matches.push({
            match,
            stage: 'world-cup',
            groupId: group.id,
            groupName: group.name,
          });
        });
      });

      // Knockout matches
      const knockoutMatches = [
        ...tournament.worldCup.knockout.roundOf16,
        ...tournament.worldCup.knockout.quarterFinals,
        ...tournament.worldCup.knockout.semiFinals,
        ...(tournament.worldCup.knockout.thirdPlace ? [tournament.worldCup.knockout.thirdPlace] : []),
        ...(tournament.worldCup.knockout.final ? [tournament.worldCup.knockout.final] : []),
      ];

      knockoutMatches.forEach((match) => {
        matches.push({
          match,
          stage: 'knockout',
          groupId: 'knockout',
          groupName: match.round || 'Knockout',
        });
      });
    }

    return matches;
  }, [tournament]);

  // Get all available matchdays
  const availableMatchdays = useMemo(() => {
    const matchdays = new Set<number>();
    allMatches.forEach((m) => {
      if (m.match.matchday) {
        matchdays.add(m.match.matchday);
      }
    });
    return Array.from(matchdays).sort((a, b) => a - b);
  }, [allMatches]);

  // Filter and sort matches by matchday for global interleaved ordering
  const filteredMatches = useMemo(() => {
    const filtered = allMatches.filter((m) => {
      const regionMatch = selectedRegion === 'all' || m.region === selectedRegion;
      const stageMatch = selectedStage === 'all' || m.stage === selectedStage;
      const matchdayMatch = selectedMatchday === 'all' || m.match.matchday === selectedMatchday;
      return regionMatch && stageMatch && matchdayMatch;
    });

    // Sort by matchday to create interleaved ordering across all groups
    // Primary: matchday (1-20), Secondary: group name for consistency
    return filtered.sort((a, b) => {
      const matchdayA = a.match.matchday ?? 999;
      const matchdayB = b.match.matchday ?? 999;

      if (matchdayA !== matchdayB) {
        return matchdayA - matchdayB;
      }

      // If same matchday, sort by group name
      return a.groupName.localeCompare(b.groupName);
    });
  }, [allMatches, selectedRegion, selectedStage, selectedMatchday]);

  // Separate played and unplayed for display
  const unplayedMatches = filteredMatches.filter((m) => !m.match.isPlayed);

  const totalMatches = allMatches.length;
  const totalPlayed = allMatches.filter((m) => m.match.isPlayed).length;

  const handleSimulateMatch = async (matchWithContext: MatchWithContext) => {
    const { match, stage, groupId } = matchWithContext;

    if (stage === 'knockout') {
      toast.info('Knockout matches must be simulated from Knockout view');
      return;
    }

    // Don't allow simulation if another match is being saved
    if (isSavingMatch) {
      toast.warning('Espera a que se guarde el partido anterior');
      return;
    }

    const homeTeam = getTeam(match.homeTeamId);
    const awayTeam = getTeam(match.awayTeamId);

    // Simulate the match and WAIT for it to complete
    await simulateMatch(match.id, groupId, stage === 'qualifier' ? 'qualifier' : 'world-cup');

    // Get the updated match after simulation completes
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

    // Show result toast with the actual scores
    toast.success(
      <div className="flex items-center gap-3">
        <span>⚽</span>
        <div className="flex items-center gap-2">
          {homeTeam && <span className="font-semibold">{homeTeam.name}</span>}
          <span className="font-bold text-lg px-2">{updatedMatch.homeScore} - {updatedMatch.awayScore}</span>
          {awayTeam && <span className="font-semibold">{awayTeam.name}</span>}
        </div>
      </div>,
      { duration: 5000 }
    );
  };

  const handleSimulateMatchday = async () => {
    // Determine current matchday (first unplayed matchday)
    const currentMatchday = unplayedMatches.length > 0 ? unplayedMatches[0].match.matchday : null;

    if (!currentMatchday) {
      toast.info('No hay partidos pendientes para simular');
      return;
    }

    // Filter matches for current matchday that are not played
    const matchdayMatches = unplayedMatches.filter(m => m.match.matchday === currentMatchday);

    if (matchdayMatches.length === 0) {
      toast.info('No hay partidos pendientes en esta jornada');
      return;
    }

    // Show confirmation dialog
    const confirmed = confirm(
      `⚽ Simular Jornada Completa\n\n` +
      `Jornada: ${currentMatchday}\n` +
      `Partidos a simular: ${matchdayMatches.length}\n\n` +
      `¿Deseas simular todos los partidos de esta jornada?`
    );

    if (!confirmed) return;

    try {
      // Prepare batch data
      const batchMatches = matchdayMatches
        .filter(m => m.stage !== 'knockout')
        .map(m => ({
          matchId: m.match.id,
          groupId: m.groupId,
          stage: m.stage === 'qualifier' ? 'qualifier' as const : 'world-cup' as const,
          groupName: m.groupName,
          region: m.region,
        }));

      // Simulate all matches in batch
      await simulateMatchdayBatch(batchMatches);

      // Get updated state after all simulations complete
      const currentTournament = useTournamentStore.getState().currentTournament;
      if (!currentTournament) return;

      // Collect results for modal
      const results: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number; stage: string; groupName?: string }[] = [];

      matchdayMatches.forEach((matchWithContext) => {
        const { match, stage, groupId, groupName } = matchWithContext;
        const homeTeam = getTeam(match.homeTeamId);
        const awayTeam = getTeam(match.awayTeamId);

        // Find updated match
        let updatedMatch = match;
        if (stage === 'qualifier' && matchWithContext.region) {
          const group = currentTournament.qualifiers[matchWithContext.region]?.find(g => g.id === groupId);
          updatedMatch = group?.matches.find(m => m.id === match.id) || match;
        } else if (stage === 'world-cup') {
          const group = currentTournament.worldCup?.groups.find(g => g.id === groupId);
          updatedMatch = group?.matches.find(m => m.id === match.id) || match;
        }

        if (homeTeam && awayTeam) {
          results.push({
            homeTeam: homeTeam.name,
            awayTeam: awayTeam.name,
            homeScore: updatedMatch.homeScore ?? 0,
            awayScore: updatedMatch.awayScore ?? 0,
            stage: stage === 'qualifier' ? 'Eliminatorias' : 'Copa Mundial',
            groupName: groupName,
          });
        }
      });

      // Show results modal
      showResults(results, `Jornada ${currentMatchday} - Resultados`);

      // Show success toast
      toast.success(`✅ Jornada ${currentMatchday} completada - ${results.length} partidos simulados`);
    } catch (error) {
      console.error('Error simulating matchday:', error);
      toast.error('Error al simular la jornada');
    }
  };

  const handleMatchClick = () => {
    // Open modal on mobile, do nothing on desktop
    if (window.innerWidth < 1024) {
      setShowMobilePreview(true);
    }
  };

  const handlePrevMatchday = () => {
    if (selectedMatchday === 'all') {
      if (availableMatchdays.length > 0) {
        setSelectedMatchday(availableMatchdays[availableMatchdays.length - 1]);
      }
    } else {
      const currentIndex = availableMatchdays.indexOf(selectedMatchday);
      if (currentIndex > 0) {
        setSelectedMatchday(availableMatchdays[currentIndex - 1]);
      }
    }
  };

  const handleNextMatchday = () => {
    if (selectedMatchday === 'all') {
      if (availableMatchdays.length > 0) {
        setSelectedMatchday(availableMatchdays[0]);
      }
    } else {
      const currentIndex = availableMatchdays.indexOf(selectedMatchday);
      if (currentIndex < availableMatchdays.length - 1) {
        setSelectedMatchday(availableMatchdays[currentIndex + 1]);
      } else {
        setSelectedMatchday('all');
      }
    }
  };

  const handleResetTournamentMatches = async () => {
    // Count how many matches have been played
    const playedMatchesCount = allMatches.filter((m) => m.match.isPlayed).length;

    if (playedMatchesCount === 0) {
      toast.info('No hay partidos jugados para resetear');
      return;
    }

    // Show confirmation dialog with detailed warning
    const confirmed = confirm(
      `⚠️ ADVERTENCIA: Regeneración de Fixture\n\n` +
      `Esta acción eliminará:\n` +
      `• ${playedMatchesCount} partido(s) jugado(s)\n` +
      `• Todo el historial de este torneo\n` +
      `• Todos los fixtures actuales\n` +
      `• La fase de Copa del Mundo (si existe)\n\n` +
      `Las habilidades de los equipos se mantendrán.\n\n` +
      `¿Estás seguro de que quieres continuar?`
    );

    if (!confirmed) return;

    // Second confirmation for extra safety
    const doubleConfirmed = confirm(
      `⚠️ ÚLTIMA CONFIRMACIÓN\n\n` +
      `Esta acción NO se puede deshacer.\n` +
      `Se perderán ${playedMatchesCount} partidos y todo el progreso del torneo.\n\n` +
      `¿Realmente deseas continuar?`
    );

    if (!doubleConfirmed) return;

    const loadingToast = toast.loading('Reseteando torneo...');

    try {
      // Reset matches and tournament data
      await resetCurrentTournamentMatches();

      // Regenerate draw and fixtures
      generateDrawAndFixtures();

      toast.dismiss(loadingToast);
      toast.success('✅ Torneo reseteado y fixture regenerado correctamente');
    } catch (error) {
      console.error('Error resetting tournament:', error);
      toast.dismiss(loadingToast);
      toast.error('❌ Error al resetear el torneo');
    }
  };

  const getTeam = (teamId: string) => teams.find((t) => t.id === teamId);

  const regions: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

  return (
    <div className="space-y-6">
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

      {/* Header Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-grass-soft">Total Matches</p>
                <p className="text-3xl font-terminal text-led tabular-nums">{totalMatches}</p>
              </div>
              <Calendar className="w-10 h-10 text-gold" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-grass-soft">Completed</p>
                <p className="text-3xl font-terminal text-led tabular-nums">{totalPlayed}</p>
              </div>
              <CheckCircle className="w-10 h-10 text-led" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-grass-soft">Remaining</p>
                <p className="text-3xl font-terminal text-gold tabular-nums">{totalMatches - totalPlayed}</p>
              </div>
              <Clock className="w-10 h-10 text-gold" />
            </div>
          </CardContent>
        </Card>
      </div>

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
                className="px-3 py-2 bg-night border-2 border-grass text-sm text-white focus:outline-none focus:border-gold max-w-full truncate"
              >
                <option value="all">All Regions</option>
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
                className="px-3 py-2 bg-night border-2 border-grass text-sm text-white focus:outline-none focus:border-gold max-w-full truncate"
              >
                <option value="all">All Stages</option>
                <option value="qualifier">Qualifiers</option>
                <option value="world-cup">World Cup</option>
                <option value="knockout">Knockout</option>
              </select>

              {/* Matchday Pagination */}
              {availableMatchdays.length > 0 && (
                <div className="flex items-center gap-2 border-2 border-grass px-2 py-1">
                  <button
                    onClick={handlePrevMatchday}
                    disabled={selectedMatchday === 'all' || selectedMatchday === availableMatchdays[0]}
                    className="p-1 text-grass-soft hover:bg-grass/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Previous Matchday"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-arcade text-[10px] text-gold uppercase min-w-[80px] text-center">
                    {selectedMatchday === 'all' ? 'All J.' : `Jornada ${selectedMatchday}`}
                  </span>
                  <button
                    onClick={handleNextMatchday}
                    disabled={selectedMatchday === availableMatchdays[availableMatchdays.length - 1]}
                    className="p-1 text-grass-soft hover:bg-grass/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Next Matchday"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={handleSimulateMatchday}
                disabled={unplayedMatches.length === 0 || isSavingMatch || isBatchProcessing}
                className="gap-2"
                title="Simular toda la jornada actual"
              >
                <Play className="w-4 h-4" />
                <span className="hidden sm:inline">{isBatchProcessing ? 'Simulando...' : 'Simular Jornada'}</span>
                <span className="sm:hidden">{isBatchProcessing ? '...' : 'Jornada'}</span>
              </Button>

              {/* Danger action: Reset tournament */}
              {totalPlayed > 0 && (
                <Button
                  variant="outline"
                  onClick={handleResetTournamentMatches}
                  className="gap-2 border-loss text-loss hover:bg-loss/20"
                  title="Regenerar fixture completo (elimina todos los partidos jugados)"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span className="hidden sm:inline">Regenerar Fixture</span>
                  <span className="sm:hidden">Regenerar</span>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Two Column Layout: Upcoming vs Preview (60%-40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] gap-6">
        {/* Left Column: Upcoming Matches (60%) */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 flex-wrap min-w-0">
              <Clock className="w-5 h-5 text-gold flex-shrink-0" />
              <span className="truncate">Próximos Partidos ({unplayedMatches.length})</span>
              {selectedMatchday !== 'all' && (
                <span className="px-2 py-1 font-arcade text-[10px] text-gold uppercase bg-grass/30 flex-shrink-0">
                  J{selectedMatchday}
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
                    onMatchClick={handleMatchClick}
                    index={idx}
                    compact={true}
                    disabled={isSavingMatch}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center text-grass-soft py-12">
                <CheckCircle className="w-16 h-16 mx-auto mb-4 text-led" />
                <p className="text-lg font-arcade text-xs text-white text-shadow-retro uppercase">Sin partidos próximos</p>
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

            return homeTeam && awayTeam && group ? (
              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 flex-wrap min-w-0">
                    <Eye className="w-5 h-5 text-gold flex-shrink-0" />
                    <span className="truncate">Preview del Próximo Partido</span>
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
                  <MatchPreview
                    homeTeam={homeTeam}
                    awayTeam={awayTeam}
                    group={group}
                    teams={teams}
                  />
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
        {showMobilePreview && unplayedMatches.length > 0 && (() => {
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

          return homeTeam && awayTeam && group ? (
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
                  <h3 className="font-arcade text-sm text-white text-shadow-retro">Preview del Partido</h3>
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
                  <MatchPreview
                    homeTeam={homeTeam}
                    awayTeam={awayTeam}
                    group={group}
                    teams={teams}
                  />
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
  compact?: boolean; // Compact mode for recent matches (flags only, no names)
  disabled?: boolean; // Disable the play button
}

function MatchRow({ matchCtx, teams, onSimulate, onMatchClick, index, compact = false, disabled = false }: MatchRowProps) {
  const { match, stage, groupName, region } = matchCtx;
  const homeTeam = teams.find((t) => t.id === match.homeTeamId);
  const awayTeam = teams.find((t) => t.id === match.awayTeamId);

  const getStageBadge = () => {
    const colors = {
      qualifier: 'bg-black/40 text-grass-soft border border-grass',
      'world-cup': 'bg-black/40 text-gold border border-gold',
      knockout: 'bg-black/40 text-loss border border-loss',
    };

    return (
      <span className={`px-2 py-1 font-arcade text-[10px] uppercase ${colors[stage]}`}>
        {stage === 'qualifier' ? 'Qualifier' : stage === 'world-cup' ? 'World Cup' : 'Knockout'}
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
          {match.matchday && (
            <span className="px-2 py-1 font-arcade text-[10px] text-gold uppercase bg-grass/30 flex-shrink-0">
              J{match.matchday}
            </span>
          )}
          <span className="text-xs text-grass-soft truncate">
            {region && `${region} • `}{groupName}
          </span>
        </div>

        {/* Teams */}
        <div className={`flex items-center ${compact ? 'justify-center' : 'justify-between'} gap-2 min-w-0`}>
          {homeTeam && awayTeam ? (
            <ScoreBug
              size="md"
              homeTeam={homeTeam}
              awayTeam={awayTeam}
              homeScore={match.isPlayed ? match.homeScore : null}
              awayScore={match.isPlayed ? match.awayScore : null}
            />
          ) : (
            <span className="text-grass-soft text-xs">{match.homeTeamId} vs {match.awayTeamId}</span>
          )}
        </div>
      </div>

      {/* Action Button */}
      <div className="mt-3 sm:mt-0 sm:ml-4 w-full sm:w-auto">
        {!match.isPlayed && onSimulate ? (
          <Button
            variant="primary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onSimulate();
            }}
            disabled={disabled}
            className="gap-2 w-full sm:w-auto"
          >
            <Play className="w-3 h-3" />
            {disabled ? '...' : 'Play'}
          </Button>
        ) : null}
      </div>
    </motion.div>
  );
}
