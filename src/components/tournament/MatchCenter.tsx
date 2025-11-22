import { useState, useMemo } from 'react';
import type { Tournament, Team, Match, Region } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { TeamFlag } from '../ui/TeamFlag';
import { TeamNameTooltip } from '../ui/TeamNameTooltip';
import { MatchDetailModal } from './MatchDetailModal';
import { MatchPreview } from './MatchPreview';
import { Play, Filter, Clock, CheckCircle, Calendar, Zap, RefreshCw, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { useTournamentStore } from '../../store/useTournamentStore';
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
  const { simulateMatch, resetCurrentTournamentMatches, generateDrawAndFixtures, isSavingMatch } = useTournamentStore();
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

  const handleSimulateNext = () => {
    if (unplayedMatches.length === 0) {
      toast.info('No unplayed matches available');
      return;
    }

    const nextMatch = unplayedMatches[0];
    handleSimulateMatch(nextMatch);
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

    const loadingToast = toast.loading(`Simulando ${matchdayMatches.length} partidos...`);

    try {
      // Simulate all matches sequentially to ensure proper saving
      for (const matchWithContext of matchdayMatches) {
        const { match, stage, groupId } = matchWithContext;
        if (stage !== 'knockout') {
          await simulateMatch(match.id, groupId, stage === 'qualifier' ? 'qualifier' : 'world-cup');
        }
      }

      // Get updated state after all simulations complete
      const currentTournament = useTournamentStore.getState().currentTournament;
      if (!currentTournament) return;

      // Collect results for summary
      const results: { home: string; away: string; homeScore: number; awayScore: number }[] = [];

      matchdayMatches.forEach((matchWithContext) => {
        const { match, stage, groupId } = matchWithContext;
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
            home: homeTeam.name,
            away: awayTeam.name,
            homeScore: updatedMatch.homeScore ?? 0,
            awayScore: updatedMatch.awayScore ?? 0,
          });
        }
      });

      toast.dismiss(loadingToast);

      // Show success summary
      toast.success(
        <div>
          <div className="font-bold mb-2">✅ Jornada {currentMatchday} Completada</div>
          <div className="text-xs space-y-1 max-h-48 overflow-y-auto">
            {results.slice(0, 5).map((r, idx) => (
              <div key={idx} className="flex justify-between gap-2">
                <span className="truncate">{r.home}</span>
                <span className="font-bold">{r.homeScore}-{r.awayScore}</span>
                <span className="truncate">{r.away}</span>
              </div>
            ))}
            {results.length > 5 && (
              <div className="text-gray-500 italic">+ {results.length - 5} partidos más</div>
            )}
          </div>
        </div>,
        { duration: 7000 }
      );
    } catch (error) {
      console.error('Error simulating matchday:', error);
      toast.dismiss(loadingToast);
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
                <p className="text-sm text-gray-600">Total Matches</p>
                <p className="text-3xl font-bold text-gray-900">{totalMatches}</p>
              </div>
              <Calendar className="w-10 h-10 text-primary-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Completed</p>
                <p className="text-3xl font-bold text-green-600">{totalPlayed}</p>
              </div>
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Remaining</p>
                <p className="text-3xl font-bold text-orange-600">{totalMatches - totalPlayed}</p>
              </div>
              <Clock className="w-10 h-10 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Quick Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between min-w-0">
            <div className="flex flex-wrap gap-3 items-center w-full lg:w-auto">
              <Filter className="w-5 h-5 text-gray-600 flex-shrink-0" />

              {/* Region Filter */}
              <select
                value={selectedRegion}
                onChange={(e) => setSelectedRegion(e.target.value as Region | 'all')}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 max-w-full truncate"
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
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 max-w-full truncate"
              >
                <option value="all">All Stages</option>
                <option value="qualifier">Qualifiers</option>
                <option value="world-cup">World Cup</option>
                <option value="knockout">Knockout</option>
              </select>

              {/* Matchday Pagination */}
              {availableMatchdays.length > 0 && (
                <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-2 py-1">
                  <button
                    onClick={handlePrevMatchday}
                    disabled={selectedMatchday === 'all' || selectedMatchday === availableMatchdays[0]}
                    className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Previous Matchday"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-medium min-w-[80px] text-center">
                    {selectedMatchday === 'all' ? 'All J.' : `Jornada ${selectedMatchday}`}
                  </span>
                  <button
                    onClick={handleNextMatchday}
                    disabled={selectedMatchday === availableMatchdays[availableMatchdays.length - 1]}
                    className="p-1 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                onClick={handleSimulateNext}
                disabled={unplayedMatches.length === 0 || isSavingMatch}
                className="gap-2"
              >
                <Zap className="w-4 h-4" />
                <span className="hidden sm:inline">{isSavingMatch ? 'Guardando...' : 'Simulate Next'}</span>
                <span className="sm:hidden">{isSavingMatch ? '...' : 'Next'}</span>
              </Button>

              <Button
                variant="secondary"
                onClick={handleSimulateMatchday}
                disabled={unplayedMatches.length === 0 || isSavingMatch}
                className="gap-2"
                title="Simular toda la jornada actual"
              >
                <Play className="w-4 h-4" />
                <span className="hidden sm:inline">Simular Jornada</span>
                <span className="sm:hidden">Jornada</span>
              </Button>

              {/* Danger action: Reset tournament */}
              {totalPlayed > 0 && (
                <Button
                  variant="outline"
                  onClick={handleResetTournamentMatches}
                  className="gap-2 border-red-300 text-red-700 hover:bg-red-50 hover:border-red-400"
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
              <Clock className="w-5 h-5 text-orange-600 flex-shrink-0" />
              <span className="truncate">Próximos Partidos ({unplayedMatches.length})</span>
              {selectedMatchday !== 'all' && (
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-800 flex-shrink-0">
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
              <div className="text-center text-gray-500 py-12">
                <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
                <p className="text-lg font-semibold">Sin partidos próximos</p>
                <p className="text-sm">Todos los partidos han sido jugados</p>
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
                    <Eye className="w-5 h-5 text-primary-600 flex-shrink-0" />
                    <span className="truncate">Preview del Próximo Partido</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-auto">
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
                  <div className="text-center text-gray-500 py-12">
                    <Eye className="w-16 h-16 mx-auto mb-4 text-gray-400" />
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
                className="fixed inset-4 bg-white rounded-lg shadow-xl z-50 overflow-auto lg:hidden"
              >
                <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
                  <h3 className="font-bold text-lg">Preview del Partido</h3>
                  <button
                    onClick={() => setShowMobilePreview(false)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <CheckCircle className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4">
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
      qualifier: 'bg-blue-100 text-blue-800',
      'world-cup': 'bg-purple-100 text-purple-800',
      knockout: 'bg-red-100 text-red-800',
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[stage]}`}>
        {stage === 'qualifier' ? 'Qualifier' : stage === 'world-cup' ? 'World Cup' : 'Knockout'}
      </span>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-lg border cursor-pointer ${
        match.isPlayed
          ? 'bg-gray-50 border-gray-200 hover:shadow-md transition-all'
          : 'bg-white border-primary-200 hover:border-primary-400 transition-colors'
      }`}
      onClick={onMatchClick}
    >
      <div className="flex-1 w-full sm:w-auto min-w-0">
        {/* Stage & Group Info */}
        <div className="flex items-center gap-2 mb-2 overflow-hidden">
          {getStageBadge()}
          {match.matchday && (
            <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 flex-shrink-0">
              J{match.matchday}
            </span>
          )}
          <span className="text-xs text-gray-600 truncate">
            {region && `${region} • `}{groupName}
          </span>
        </div>

        {/* Teams */}
        {compact ? (
          // Compact mode: only flags and scores with tooltips on tap/click
          <div className="flex items-center justify-center gap-2 min-w-0">
            {homeTeam && (
              <TeamNameTooltip teamName={homeTeam.name} position="top">
                <TeamFlag teamId={homeTeam.id} teamName={homeTeam.name} flagUrl={homeTeam.flag} size={24} />
              </TeamNameTooltip>
            )}
            {match.isPlayed ? (
              <div className="flex items-center gap-1.5 font-bold text-base flex-shrink-0">
                <span className="text-gray-900">{match.homeScore}</span>
                <span className="text-gray-400">-</span>
                <span className="text-gray-900">{match.awayScore}</span>
              </div>
            ) : (
              <span className="text-gray-400 font-medium text-xs flex-shrink-0">vs</span>
            )}
            {awayTeam && (
              <TeamNameTooltip teamName={awayTeam.name} position="top">
                <TeamFlag teamId={awayTeam.id} teamName={awayTeam.name} flagUrl={awayTeam.flag} size={24} />
              </TeamNameTooltip>
            )}
          </div>
        ) : (
          // Normal mode: flags + names
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              {homeTeam && <TeamFlag teamId={homeTeam.id} teamName={homeTeam.name} flagUrl={homeTeam.flag} size={32} />}
              <span className="font-medium text-sm sm:text-base truncate">
                {homeTeam?.name || match.homeTeamId}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {match.isPlayed ? (
                <div className="flex items-center gap-2 font-bold text-lg">
                  <span className="text-gray-900">{match.homeScore}</span>
                  <span className="text-gray-400">-</span>
                  <span className="text-gray-900">{match.awayScore}</span>
                </div>
              ) : (
                <span className="text-gray-400 font-medium text-sm">vs</span>
              )}
            </div>

            <div className="flex items-center gap-3 flex-1 justify-end">
              <span className="font-medium text-sm sm:text-base text-right truncate">
                {awayTeam?.name || match.awayTeamId}
              </span>
              {awayTeam && <TeamFlag teamId={awayTeam.id} teamName={awayTeam.name} flagUrl={awayTeam.flag} size={32} />}
            </div>
          </div>
        )}
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
