import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { TeamFlag } from '../ui/TeamFlag';
import { PixelBar } from '../ui/PixelBar';
import { Play, RotateCcw, Zap, Sparkles } from 'lucide-react';
import type { Team, WorldCupGroup } from '../../types';
import { nanoid } from 'nanoid';
import { initializeStandings } from '../../core/scheduler';
import { WORLD_CUP_FIXTURE_TEMPLATE, type WorldCupFixtureLetter } from '../../constants/fixtureTemplate';
import type { Match } from '../../types';

// Custom hook to detect screen size
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = () => setMatches(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [matches, query]);

  return matches;
}

interface DrawSimulatorProps {
  qualifiedTeams: Team[];
  onComplete: (groups: WorldCupGroup[]) => void;
  onCancel: () => void;
}

interface Pot {
  number: number;
  teams: Team[];
  letter: WorldCupFixtureLetter;
}

export function DrawSimulator({ qualifiedTeams, onComplete, onCancel }: DrawSimulatorProps) {
  const [pots, setPots] = useState<Pot[]>([]);
  const [groups, setGroups] = useState<WorldCupGroup[]>([]);
  const [currentPot, setCurrentPot] = useState(0);
  const [currentGroup, setCurrentGroup] = useState(0);
  const [animatingTeam, setAnimatingTeam] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [showAllPots, setShowAllPots] = useState(false);

  // Detect if we're on desktop (lg breakpoint)
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  // Timeouts de la animación del sorteo. Se guardan para poder cancelarlos al
  // reiniciar, cancelar o desmontar: si no, disparaban con closures obsoletas
  // sobre un sorteo ya reiniciado (bombo/grupo corruptos) o hacían setState
  // sobre un componente desmontado.
  const timeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearPendingTimeouts = () => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  };

  useEffect(() => {
    initializeDraw();
    return clearPendingTimeouts;
  }, [qualifiedTeams]);

  // Cleanup final al desmontar.
  useEffect(() => clearPendingTimeouts, []);

  const initializeDraw = () => {
    // Sort teams by skill rating
    const sortedTeams = [...qualifiedTeams].sort((a, b) => b.skill - a.skill);

    // Create 4 pots
    const pot1: Pot = {
      number: 1,
      teams: sortedTeams.slice(0, 16),
      letter: 'A',
    };
    const pot2: Pot = {
      number: 2,
      teams: sortedTeams.slice(16, 32),
      letter: 'B',
    };
    const pot3: Pot = {
      number: 3,
      teams: sortedTeams.slice(32, 48),
      letter: 'C',
    };
    const pot4: Pot = {
      number: 4,
      teams: sortedTeams.slice(48, 64),
      letter: 'D',
    };

    setPots([pot1, pot2, pot3, pot4]);

    // Initialize 16 groups
    const initialGroups: WorldCupGroup[] = [];
    for (let i = 0; i < 16; i++) {
      initialGroups.push({
        id: nanoid(),
        name: `Grupo ${String.fromCharCode(65 + i)}`,
        teamIds: [],
        matches: [],
        standings: [],
        letterAssignments: {},
      });
    }
    setGroups(initialGroups);
    setCurrentPot(0);
    setCurrentGroup(0);
    setIsComplete(false);
  };

  const drawNextTeam = () => {
    // Don't allow drawing if animation is in progress
    if (animatingTeam) {
      return;
    }

    if (currentPot >= 4) {
      finalizeDraw(groups);
      return;
    }

    const pot = pots[currentPot];
    if (!pot || pot.teams.length === 0) {
      // Move to next pot
      const nextPot = currentPot + 1;
      if (nextPot >= 4) {
        // All pots completed
        finalizeDraw(groups);
      } else {
        setCurrentPot(nextPot);
        setCurrentGroup(0);
      }
      return;
    }

    // Random selection from pot
    const randomIndex = Math.floor(Math.random() * pot.teams.length);
    const selectedTeam = pot.teams[randomIndex];

    // Animate the selected team
    setAnimatingTeam(selectedTeam.id);

    const timeout = setTimeout(() => {
      // Actualización inmutable del bombo: copiar en vez de mutar pot.teams,
      // que es un objeto del estado anterior.
      const updatedPots = pots.map((p, idx) =>
        idx === currentPot
          ? { ...p, teams: p.teams.filter((_, i) => i !== randomIndex) }
          : p
      );
      setPots(updatedPots);

      // Actualización inmutable del grupo (nuevos teamIds/letterAssignments).
      const updatedGroups = groups.map((g, idx) =>
        idx === currentGroup
          ? {
              ...g,
              teamIds: [...g.teamIds, selectedTeam.id],
              letterAssignments: { ...g.letterAssignments, [selectedTeam.id]: pot.letter },
            }
          : g
      );
      setGroups(updatedGroups);

      setAnimatingTeam(null);

      // Move to next group
      const nextGroup = currentGroup + 1;
      if (nextGroup >= 16) {
        // All groups have received a team from this pot
        const nextPot = currentPot + 1;
        setCurrentPot(nextPot);
        setCurrentGroup(0);
        if (nextPot >= 4) {
          // Se pasan los grupos recién calculados: finalizeDraw ya no puede leer
          // `groups` de su closure (sería la versión anterior sin el último
          // equipo, antes se salvaba por accidente gracias a la mutación).
          finalizeDraw(updatedGroups);
        }
      } else {
        setCurrentGroup(nextGroup);
      }
    }, 800);

    timeoutsRef.current.push(timeout);
  };

  const finalizeDraw = (sourceGroups: WorldCupGroup[]) => {
    // Generate matches for each group
    const finalGroups = sourceGroups.map((group) => {
      const matches = generateWorldCupGroupMatches(group.teamIds, group.letterAssignments || {});
      return {
        ...group,
        matches,
        standings: initializeStandings(group.teamIds),
      };
    });

    setGroups(finalGroups);
    setIsComplete(true);
  };

  const generateWorldCupGroupMatches = (
    _teamIds: string[],
    letterAssignments: Record<string, WorldCupFixtureLetter>
  ): Match[] => {
    const letterToTeam: Record<WorldCupFixtureLetter, string> = {} as any;
    Object.entries(letterAssignments).forEach(([teamId, letter]) => {
      letterToTeam[letter] = teamId;
    });

    return WORLD_CUP_FIXTURE_TEMPLATE.map((fixture) => ({
      id: nanoid(),
      homeTeamId: letterToTeam[fixture.home],
      awayTeamId: letterToTeam[fixture.away],
      homeScore: null,
      awayScore: null,
      isPlayed: false,
      stage: 'world-cup' as const,
      matchday: fixture.matchday,
    }));
  };

  const handleComplete = () => {
    onComplete(groups);
  };

  const handleReset = () => {
    clearPendingTimeouts();
    initializeDraw();
  };

  const handleCancel = () => {
    clearPendingTimeouts();
    onCancel();
  };

  const getTeam = (teamId: string): Team | undefined => {
    return qualifiedTeams.find((t) => t.id === teamId);
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-gold flex-shrink-0" />
              <span className="truncate">Simulador de Sorteo del Mundial</span>
            </CardTitle>
            <div className="flex gap-2 w-full sm:w-auto">
              {!isComplete && (
                <>
                  <Button variant="outline" onClick={handleCancel} disabled={animatingTeam !== null} className="gap-1 sm:gap-2 flex-1 sm:flex-initial">
                    <span className="hidden sm:inline">Cancelar</span>
                    <span className="sm:hidden">✕</span>
                  </Button>
                  <Button variant="secondary" onClick={handleReset} disabled={animatingTeam !== null} className="gap-1 sm:gap-2 flex-1 sm:flex-initial">
                    <RotateCcw className="w-4 h-4" />
                    <span className="hidden sm:inline">Reiniciar</span>
                  </Button>
                  <Button
                    variant="primary"
                    onClick={drawNextTeam}
                    disabled={currentPot >= 4 || animatingTeam !== null}
                    className="gap-1 sm:gap-2 flex-1 sm:flex-initial"
                  >
                    <Play className="w-4 h-4" />
                    <span className="hidden sm:inline">Sortear Siguiente</span>
                    <span className="sm:hidden">Sortear</span>
                  </Button>
                </>
              )}
              {isComplete && (
                <Button variant="primary" onClick={handleComplete} className="gap-2 w-full sm:w-auto">
                  <Zap className="w-4 h-4" />
                  Finalizar y Guardar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Content - Responsive Layout */}
      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-4">
        {/* Pots Section */}
        <div className="lg:col-span-5 space-y-3">
          {/* Mobile: Show only current pot with toggle */}
          <div className="lg:hidden">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">
                Bombo Actual: {currentPot + 1} de 4
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAllPots(!showAllPots)}
                className="text-xs"
              >
                {showAllPots ? 'Ocultar todos' : 'Ver todos'}
              </Button>
            </div>
          </div>

          {/* Desktop: Show all pots | Mobile: Current or All based on toggle */}
          {pots.map((pot, potIdx) => {
            // On mobile, only show current pot unless showAllPots is true
            const shouldShow = isDesktop || showAllPots || potIdx === currentPot;
            if (!shouldShow) return null;

            return (
              <Card
                key={pot.number}
                className={`transition-all ${
                  currentPot === potIdx && !isComplete ? 'border-gold' : ''
                }`}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm sm:text-base flex items-center justify-between">
                    <span>Bombo {pot.number}</span>
                    <span className="text-xs sm:text-sm text-grass-soft">({pot.teams.length} equipos)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-1 max-h-64 overflow-y-auto">
                    {pot.teams.map((team) => (
                      <motion.div
                        key={team.id}
                        layout
                        initial={{ opacity: 1 }}
                        animate={{
                          opacity: animatingTeam === team.id ? 0.3 : 1,
                          scale: animatingTeam === team.id ? 1.1 : 1,
                        }}
                        className={`flex items-center gap-1 p-1.5 sm:p-2 border-2 ${
                          animatingTeam === team.id
                            ? 'bg-gold/20 border-gold'
                            : 'bg-night border-grass'
                        }`}
                      >
                        <TeamFlag teamId={team.id} teamName={team.name} flagUrl={team.flag} size={24} />
                        <span className="text-xs sm:text-sm truncate flex-1">{team.name}</span>
                      </motion.div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Groups Section */}
        <div className="lg:col-span-7">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm sm:text-base">Grupos del Mundial</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {groups.map((group, groupIdx) => {
                  const isCurrentGroup = currentGroup === groupIdx && currentPot < 4 && !isComplete;
                  return (
                    <div
                      key={group.id}
                      className={`border-2 p-2 sm:p-3 transition-all ${
                        isCurrentGroup ? 'border-gold bg-grass/30' : 'border-grass bg-grass-dark'
                      }`}
                    >
                      <h3 className="text-sm sm:text-base font-bold text-center mb-2 text-white">
                        {group.name.replace('Grupo ', '')}
                      </h3>
                      <div className="space-y-1">
                        {group.teamIds.map((teamId) => {
                          const team = getTeam(teamId);
                          if (!team) return null;
                          return (
                            <AnimatePresence key={teamId}>
                              <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="flex items-center gap-1 bg-night p-1"
                              >
                                <TeamFlag
                                  teamId={team.id}
                                  teamName={team.name}
                                  flagUrl={team.flag}
                                  size={16}
                                />
                                <span className="text-xs truncate flex-1">{team.name}</span>
                              </motion.div>
                            </AnimatePresence>
                          );
                        })}
                        {/* Empty slots */}
                        {Array.from({ length: 4 - group.teamIds.length }).map((_, idx) => (
                          <div key={`empty-${idx}`} className="h-6 bg-night border border-dashed border-grass"></div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Progress indicator */}
      {!isComplete && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {/* Mobile: Circular progress + text */}
              <div className="flex items-center justify-between sm:justify-start gap-4">
                {/* Circular Progress */}
                <div className="relative w-16 h-16 sm:w-12 sm:h-12">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    {/* Background circle */}
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke="var(--color-grass)"
                      strokeWidth="8"
                    />
                    {/* Progress circle */}
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke="var(--color-gold)"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 45}`}
                      strokeDashoffset={`${2 * Math.PI * 45 * (1 - ((currentPot * 16 + currentGroup) / 64))}`}
                      className="transition-all duration-300"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs sm:text-[10px] font-bold text-white font-terminal tabular-nums">
                      {Math.round(((currentPot * 16 + currentGroup) / 64) * 100)}%
                    </span>
                  </div>
                </div>

                {/* Text Info */}
                <div className="flex flex-col">
                  <span className="text-sm sm:text-xs font-semibold text-white">
                    Bombo {currentPot + 1} de 4
                  </span>
                  <span className="text-xs text-grass-soft">
                    Grupo {currentGroup + 1} de 16
                  </span>
                </div>
              </div>

              {/* Desktop: Progress bar */}
              <div className="hidden sm:flex items-center gap-3 flex-1 max-w-md">
                <div className="flex-1">
                  <PixelBar value={currentPot * 16 + currentGroup} max={64} color="gold" />
                </div>
                <span className="text-sm text-white font-semibold font-terminal tabular-nums whitespace-nowrap">
                  {currentPot * 16 + currentGroup} / 64
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isComplete && (
        <Card className="bg-black/40 border-led">
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-led font-semibold">✅ Sorteo Completado</p>
              <p className="text-sm text-grass-soft mt-1">
                Click en "Finalizar y Guardar" para guardar los grupos y generar los partidos
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
