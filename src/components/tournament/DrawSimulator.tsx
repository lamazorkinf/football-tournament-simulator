import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { TeamFlag } from '../ui/TeamFlag';
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

  useEffect(() => {
    initializeDraw();
  }, [qualifiedTeams]);

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
      finalizeDraw();
      return;
    }

    const pot = pots[currentPot];
    if (!pot || pot.teams.length === 0) {
      // Move to next pot
      const nextPot = currentPot + 1;
      if (nextPot >= 4) {
        // All pots completed
        finalizeDraw();
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

    setTimeout(() => {
      // Remove team from pot
      const updatedPots = [...pots];
      updatedPots[currentPot].teams = pot.teams.filter((_, idx) => idx !== randomIndex);
      setPots(updatedPots);

      // Add team to current group
      const updatedGroups = [...groups];
      updatedGroups[currentGroup].teamIds.push(selectedTeam.id);
      updatedGroups[currentGroup].letterAssignments![selectedTeam.id] = pot.letter;
      setGroups(updatedGroups);

      setAnimatingTeam(null);

      // Move to next group
      const nextGroup = currentGroup + 1;
      if (nextGroup >= 16) {
        // All groups have received a team from this pot
        const nextPot = currentPot + 1;
        if (nextPot >= 4) {
          // All pots completed, finalize the draw
          setCurrentPot(nextPot);
          setCurrentGroup(0);
          setTimeout(() => {
            finalizeDraw();
          }, 100);
        } else {
          // Move to next pot
          setCurrentPot(nextPot);
          setCurrentGroup(0);
        }
      } else {
        setCurrentGroup(nextGroup);
      }
    }, 800);
  };

  const finalizeDraw = () => {
    // Generate matches for each group
    const finalGroups = groups.map((group) => {
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
    initializeDraw();
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
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-500 flex-shrink-0" />
              <span className="truncate">Simulador de Sorteo del Mundial</span>
            </CardTitle>
            <div className="flex gap-2 w-full sm:w-auto">
              {!isComplete && (
                <>
                  <Button variant="outline" onClick={onCancel} className="gap-1 sm:gap-2 flex-1 sm:flex-initial">
                    <span className="hidden sm:inline">Cancelar</span>
                    <span className="sm:hidden">✕</span>
                  </Button>
                  <Button variant="secondary" onClick={handleReset} className="gap-1 sm:gap-2 flex-1 sm:flex-initial">
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
              <h2 className="text-sm font-semibold text-gray-700">
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
                  currentPot === potIdx && !isComplete ? 'ring-2 ring-primary-500 shadow-lg' : ''
                }`}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm sm:text-base flex items-center justify-between">
                    <span>Bombo {pot.number}</span>
                    <span className="text-xs sm:text-sm text-gray-500">({pot.teams.length} equipos)</span>
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
                        className={`flex items-center gap-1 p-1.5 sm:p-2 rounded border ${
                          animatingTeam === team.id
                            ? 'bg-yellow-100 border-yellow-400'
                            : 'bg-gray-50 border-gray-200'
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
                      className={`border rounded-lg p-2 sm:p-3 transition-all ${
                        isCurrentGroup ? 'ring-2 ring-primary-500 bg-primary-50' : 'bg-white'
                      }`}
                    >
                      <h3 className="text-sm sm:text-base font-bold text-center mb-2 text-gray-700">
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
                                className="flex items-center gap-1 bg-gray-50 rounded p-1"
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
                          <div key={`empty-${idx}`} className="h-6 bg-gray-100 rounded border border-dashed border-gray-300"></div>
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
                      stroke="#e5e7eb"
                      strokeWidth="8"
                    />
                    {/* Progress circle */}
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 45}`}
                      strokeDashoffset={`${2 * Math.PI * 45 * (1 - ((currentPot * 16 + currentGroup) / 64))}`}
                      className="transition-all duration-300"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs sm:text-[10px] font-bold text-gray-700">
                      {Math.round(((currentPot * 16 + currentGroup) / 64) * 100)}%
                    </span>
                  </div>
                </div>

                {/* Text Info */}
                <div className="flex flex-col">
                  <span className="text-sm sm:text-xs font-semibold text-gray-700">
                    Bombo {currentPot + 1} de 4
                  </span>
                  <span className="text-xs text-gray-500">
                    Grupo {currentGroup + 1} de 16
                  </span>
                </div>
              </div>

              {/* Desktop: Progress bar */}
              <div className="hidden sm:flex items-center gap-3 flex-1 max-w-md">
                <div className="flex-1 bg-gray-200 h-3 rounded-full overflow-hidden">
                  <div
                    className="bg-primary-600 h-3 transition-all duration-300 rounded-full"
                    style={{
                      width: `${((currentPot * 16 + currentGroup) / 64) * 100}%`,
                    }}
                  ></div>
                </div>
                <span className="text-sm text-gray-700 font-semibold whitespace-nowrap">
                  {currentPot * 16 + currentGroup} / 64
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {isComplete && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4">
            <div className="text-center">
              <p className="text-green-800 font-semibold">✅ Sorteo Completado</p>
              <p className="text-sm text-green-700 mt-1">
                Click en "Finalizar y Guardar" para guardar los grupos y generar los partidos
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
