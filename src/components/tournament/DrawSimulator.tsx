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
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-yellow-500" />
              Simulador de Sorteo del Mundial
            </CardTitle>
            <div className="flex gap-2">
              {!isComplete && (
                <>
                  <Button variant="outline" onClick={onCancel} className="gap-2">
                    Cancelar
                  </Button>
                  <Button variant="secondary" onClick={handleReset} className="gap-2">
                    <RotateCcw className="w-4 h-4" />
                    Reiniciar
                  </Button>
                  <Button
                    variant="primary"
                    onClick={drawNextTeam}
                    disabled={currentPot >= 4 || animatingTeam !== null}
                    className="gap-2"
                  >
                    <Play className="w-4 h-4" />
                    Sortear Siguiente
                  </Button>
                </>
              )}
              {isComplete && (
                <Button variant="primary" onClick={handleComplete} className="gap-2">
                  <Zap className="w-4 h-4" />
                  Finalizar y Guardar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-12 gap-4">
        {/* Left: Pots (40% - 5 columns) */}
        <div className="col-span-5 space-y-3">
          {pots.map((pot, potIdx) => (
            <Card
              key={pot.number}
              className={`transition-all ${
                currentPot === potIdx && !isComplete ? 'ring-2 ring-primary-500 shadow-lg' : ''
              }`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Bombo {pot.number}</span>
                  <span className="text-xs text-gray-500">({pot.teams.length} equipos)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-1 max-h-64 overflow-y-auto">
                  {pot.teams.map((team) => (
                    <motion.div
                      key={team.id}
                      layout
                      initial={{ opacity: 1 }}
                      animate={{
                        opacity: animatingTeam === team.id ? 0.3 : 1,
                        scale: animatingTeam === team.id ? 1.1 : 1,
                      }}
                      className={`flex items-center gap-1 p-1 rounded border ${
                        animatingTeam === team.id
                          ? 'bg-yellow-100 border-yellow-400'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <TeamFlag teamId={team.id} teamName={team.name} flagUrl={team.flag} size={16} />
                      <span className="text-xs truncate flex-1">{team.name}</span>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Right: Groups (60% - 7 columns) */}
        <div className="col-span-7">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Grupos del Mundial</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2">
                {groups.map((group, groupIdx) => {
                  const isCurrentGroup = currentGroup === groupIdx && currentPot < 4 && !isComplete;
                  return (
                    <div
                      key={group.id}
                      className={`border rounded-lg p-2 transition-all ${
                        isCurrentGroup ? 'ring-2 ring-primary-500 bg-primary-50' : 'bg-white'
                      }`}
                    >
                      <h3 className="text-xs font-bold text-center mb-2 text-gray-700">
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
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">
                Bombo {currentPot + 1} de 4 | Grupo {currentGroup + 1} de 16
              </span>
              <div className="flex items-center gap-2">
                <div className="w-48 bg-gray-200 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-primary-600 h-2 transition-all duration-300"
                    style={{
                      width: `${((currentPot * 16 + currentGroup) / 64) * 100}%`,
                    }}
                  ></div>
                </div>
                <span className="text-gray-700 font-semibold">
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
