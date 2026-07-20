import { useMemo, useState } from 'react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useMobileAction } from '../../hooks/useMobileAction';
import {
  getQualifierProgress,
  getWorldCupGroupProgress,
  getKnockoutProgress,
  canAdvanceToWorldCup,
  canAdvanceToKnockout,
} from '../../utils/tournamentProgress';
import { sortStandings, getBestRunnersUp } from '../../core/scheduler';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import {
  CheckCircle2,
  Circle,
  Clock,
  Trophy,
  Award,
  Globe2,
  Zap,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { DrawSimulator } from './DrawSimulator';
import type { WorldCupGroup, Group, Region, Team } from '../../types';

export function TournamentWizard() {
  const {
    currentTournament,
    teams,
    advanceToWorldCup,
    advanceToWorldCupWithManualDraw,
    advanceToKnockout,
    generateDrawAndFixtures,
    regenerateWorldCupDrawAndFixtures,
  } = useTournamentStore();

  const [showDrawSimulator, setShowDrawSimulator] = useState(false);
  const [qualifiedTeamsForDraw, setQualifiedTeamsForDraw] = useState<Team[]>([]);

  const handleGenerateDraw = () => {
    if (!currentTournament) return;
    const hasOriginalSkills = currentTournament.originalSkills &&
      Object.keys(currentTournament.originalSkills).length > 0;

    const message = hasOriginalSkills
      ? '¿Generar sorteo y fixtures para todas las clasificatorias?\n\nEsto asignará equipos a las posiciones y creará todos los partidos.\n\n⚠️ Las habilidades de los equipos se restaurarán a sus valores originales del inicio del torneo.'
      : '¿Generar sorteo y fixtures para todas las clasificatorias?\n\nEsto asignará equipos a las posiciones y creará todos los partidos.';

    if (confirm(message)) {
      generateDrawAndFixtures();
      const successMsg = hasOriginalSkills
        ? '✅ Sorteo generado y habilidades restauradas!'
        : '✅ Sorteo y fixtures generados correctamente';
      toast.success(successMsg);
    }
  };

  useMobileAction(
    currentTournament && !currentTournament.hasAnyMatchPlayed
      ? { label: '▶ PRESS START', onPress: handleGenerateDraw }
      : null
  );

  if (!currentTournament) {
    return null;
  }

  // Calculate progress for each phase
  const qualifierProgress = useMemo(
    () => getQualifierProgress(currentTournament),
    [currentTournament]
  );

  const worldCupProgress = useMemo(() => {
    if (!currentTournament.worldCup) return null;
    return getWorldCupGroupProgress(currentTournament.worldCup.groups);
  }, [currentTournament]);

  const knockoutProgress = useMemo(() => {
    if (!currentTournament.worldCup) return null;
    return getKnockoutProgress(currentTournament.worldCup.knockout);
  }, [currentTournament]);

  // Check if actions are available
  const canGenerateDraw = !currentTournament.hasAnyMatchPlayed;
  const canStartWorldCup = canAdvanceToWorldCup(currentTournament);
  const canRegenerateWorldCup =
    currentTournament.worldCup &&
    !currentTournament.worldCup.groups.some(group =>
      group.matches.some(m => m.isPlayed)
    ) &&
    !currentTournament.worldCup.knockout.roundOf32.some(m => m.isPlayed) &&
    !currentTournament.worldCup.knockout.roundOf16.some(m => m.isPlayed) &&
    !currentTournament.worldCup.knockout.quarterFinals.some(m => m.isPlayed) &&
    !currentTournament.worldCup.knockout.semiFinals.some(m => m.isPlayed) &&
    !currentTournament.worldCup.knockout.thirdPlace?.isPlayed &&
    !currentTournament.worldCup.knockout.final?.isPlayed;
  const canStartKnockout =
    currentTournament.worldCup &&
    canAdvanceToKnockout(currentTournament.worldCup.groups);

  const handleAdvanceToWorldCup = () => {
    if (
      confirm(
        '¿Avanzar a la fase de Copa del Mundo con sorteo AUTOMÁTICO?\n\nLos 64 equipos clasificados (42 primeros + 22 mejores segundos) se distribuirán en 16 grupos del Mundial automáticamente.'
      )
    ) {
      advanceToWorldCup();
      toast.success('🏆 ¡Avanzado a Copa del Mundo con 64 equipos clasificados!');
    }
  };

  const handleManualDraw = () => {
    // Calculate qualified teams (same logic as advanceToWorldCup)
    const qualifiedTeamIds: string[] = [];

    // Collect all groups from all regions
    const allGroups: Group[] = [];
    for (const region in currentTournament.qualifiers) {
      const groups = currentTournament.qualifiers[region as Region];
      allGroups.push(...groups);
    }

    // Get all first-place teams (42 teams from 42 groups)
    for (const region in currentTournament.qualifiers) {
      const groups = currentTournament.qualifiers[region as Region];
      groups.forEach((group) => {
        const sorted = sortStandings(group.standings, teams);
        if (sorted.length > 0) {
          const firstPlace = sorted[0].teamId;
          qualifiedTeamIds.push(firstPlace);
        }
      });
    }

    // Get the 22 best second-place teams across all regions (42 + 22 = 64 total)
    const bestRunnersUp = getBestRunnersUp(allGroups, 22, teams);
    qualifiedTeamIds.push(...bestRunnersUp);

    console.log(`✅ Qualified teams for manual draw: ${qualifiedTeamIds.length} (42 winners + 22 best runners-up)`);

    if (qualifiedTeamIds.length !== 64) {
      toast.error(`Error: Solo ${qualifiedTeamIds.length} equipos clasificados en lugar de 64.`);
      return;
    }

    // Get qualified Team objects with all their data
    const qualifiedTeams = teams.filter((team) => qualifiedTeamIds.includes(team.id));
    setQualifiedTeamsForDraw(qualifiedTeams);
    setShowDrawSimulator(true);
  };

  const handleDrawSimulatorComplete = (groups: WorldCupGroup[]) => {
    console.log('Draw completed with groups:', groups);
    advanceToWorldCupWithManualDraw(groups);
    setShowDrawSimulator(false);
    toast.success('🏆 ¡Sorteo manual completado y guardado exitosamente!');
  };

  const handleDrawSimulatorCancel = () => {
    setShowDrawSimulator(false);
    toast.info('Sorteo manual cancelado');
  };

  const handleRegenerateWorldCupDraw = () => {
    if (
      confirm(
        '¿Regenerar sorteo y fixtures de la Copa del Mundo?\n\nEsto eliminará todos los partidos actuales del Mundial (grupos y playoffs) y creará nuevos grupos con los mismos 64 equipos clasificados.\n\n⚠️ Esta acción NO se puede deshacer.'
      )
    ) {
      regenerateWorldCupDrawAndFixtures();
      toast.success('✅ Sorteo del Mundial regenerado correctamente');
    }
  };

  const handleAdvanceToKnockout = async () => {
    if (
      confirm(
        '¿Generar Dieciseisavos de Final?\n\nLos 32 equipos clasificados (2 por grupo) avanzarán a la fase de eliminación directa.'
      )
    ) {
      await advanceToKnockout();
      toast.success('⚡ ¡Dieciseisavos de Final generados!');
    }
  };

  // Determine tournament phase
  const isComplete =
    knockoutProgress?.isComplete && currentTournament.worldCup?.champion;

  return (
    <div className="max-w-5xl mx-auto">
      <Card className="overflow-hidden">
        {/* Header */}
        <CardHeader>
          <p className="font-arcade text-[10px] text-gold mb-2">SELECT MODE</p>
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="w-8 h-8 text-gold" />
            <h2 className="font-arcade text-base sm:text-xl text-white text-shadow-retro">Progreso del Torneo</h2>
          </div>
          <p className="text-grass-soft">
            Guía paso a paso para completar el torneo
          </p>
        </CardHeader>

        {/* Steps */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Step 1: Qualifiers */}
          <StepCard
            number={1}
            title="Clasificatorias"
            description="Genera fixtures y completa partidos de clasificación"
            icon={<Globe2 className="w-6 h-6" />}
            status={
              qualifierProgress.isComplete
                ? 'complete'
                : qualifierProgress.playedMatches > 0
                ? 'in-progress'
                : 'pending'
            }
            progress={qualifierProgress.percentage}
            stats={[
              {
                label: 'Grupos completados',
                value: `${qualifierProgress.completedGroups}/${qualifierProgress.totalGroups}`,
              },
              {
                label: 'Partidos jugados',
                value: `${qualifierProgress.playedMatches}/${qualifierProgress.totalMatches}`,
              },
            ]}
            actions={
              canGenerateDraw ? (
                <Button size="lg" onClick={handleGenerateDraw} className="hidden lg:inline-flex">
                  ▶ PRESS START
                </Button>
              ) : null
            }
          />

          {/* Step 2: World Cup Groups */}
          <StepCard
            number={2}
            title="Mundial - Fase de Grupos"
            description="64 equipos en 16 grupos compiten por clasificar"
            icon={<Trophy className="w-6 h-6" />}
            status={
              !currentTournament.worldCup
                ? 'locked'
                : worldCupProgress?.isComplete
                ? 'complete'
                : worldCupProgress && worldCupProgress.playedMatches > 0
                ? 'in-progress'
                : 'pending'
            }
            progress={worldCupProgress?.percentage || 0}
            stats={
              worldCupProgress
                ? [
                    {
                      label: 'Grupos completados',
                      value: `${worldCupProgress.completedGroups}/${worldCupProgress.totalGroups}`,
                    },
                    {
                      label: 'Partidos jugados',
                      value: `${worldCupProgress.playedMatches}/${worldCupProgress.totalMatches}`,
                    },
                  ]
                : []
            }
            actions={
              canStartWorldCup ? (
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleAdvanceToWorldCup}
                    className="gap-2"
                  >
                    <Zap className="w-4 h-4" />
                    Sorteo Automático
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleManualDraw}
                    className="gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Sorteo Manual (Simulador)
                  </Button>
                </div>
              ) : canRegenerateWorldCup ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerateWorldCupDraw}
                  className="gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Regenerar Sorteo & Fixtures
                </Button>
              ) : null
            }
          />

          {/* Step 3: Knockout Phase */}
          <StepCard
            number={3}
            title="Playoffs - Eliminación Directa"
            description="Dieciseisavos → Octavos → Cuartos → Semis → Final"
            icon={<Award className="w-6 h-6" />}
            status={
              !currentTournament.worldCup?.knockout ||
              currentTournament.worldCup.knockout.roundOf32.length === 0
                ? 'locked'
                : isComplete
                ? 'complete'
                : 'in-progress'
            }
            progress={knockoutProgress?.percentage || 0}
            stats={
              knockoutProgress
                ? [
                    {
                      label: 'Ronda actual',
                      value: getRoundLabel(knockoutProgress.currentRound),
                    },
                    {
                      label: 'Progreso',
                      value: `${knockoutProgress.percentage}%`,
                    },
                  ]
                : []
            }
            actions={
              canStartKnockout ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAdvanceToKnockout}
                  className="gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Generar Dieciseisavos
                </Button>
              ) : null
            }
          />

          {/* Champion Display */}
          {isComplete && currentTournament.worldCup?.champion && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-8 bg-grass/20 border-4 border-gold shadow-hard-panel p-6 text-center"
            >
              <Trophy className="w-16 h-16 text-gold mx-auto mb-4" />
              <h3 className="font-arcade text-lg text-white text-shadow-retro mb-2">
                🏆 ¡Torneo Completado! 🏆
              </h3>
              <p className="text-grass-soft">
                El campeón ha sido coronado. ¡Puedes iniciar un nuevo torneo
                cuando estés listo!
              </p>
            </motion.div>
          )}
        </div>
      </Card>

      {/* Draw Simulator Modal */}
      <AnimatePresence>
        {showDrawSimulator && canStartWorldCup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-grass-dark border-4 border-line shadow-hard-panel max-w-[95vw] w-full max-h-[95vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <DrawSimulator
                  qualifiedTeams={qualifiedTeamsForDraw}
                  onComplete={handleDrawSimulatorComplete}
                  onCancel={handleDrawSimulatorCancel}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Helper component for step cards
interface StepCardProps {
  number: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  status: 'complete' | 'in-progress' | 'pending' | 'locked';
  progress: number;
  stats: { label: string; value: string }[];
  actions?: React.ReactNode;
}

function StepCard({
  number,
  title,
  description,
  icon,
  status,
  progress,
  stats,
  actions,
}: StepCardProps) {
  const getStatusIcon = () => {
    switch (status) {
      case 'complete':
        return <CheckCircle2 className="w-6 h-6 text-led" />;
      case 'in-progress':
        return <Clock className="w-6 h-6 text-gold blink" />;
      case 'locked':
        return <Circle className="w-6 h-6 text-grass" />;
      default:
        return <Circle className="w-6 h-6 text-grass-soft" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'complete':
        return 'border-line bg-grass/20';
      case 'in-progress':
        return 'border-gold bg-grass/10';
      case 'locked':
        return 'border-grass/40 bg-night opacity-60';
      default:
        return 'border-grass bg-night';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: number * 0.1 }}
      className={`border-2 p-6 transition-all ${getStatusColor()}`}
    >
      <div className="flex items-start gap-4">
        {/* Step number & status */}
        <div className="flex-shrink-0">
          <div className="flex items-center justify-center w-12 h-12 bg-night border-2 border-grass font-terminal text-led text-2xl tabular-nums">
            {number}
          </div>
          <div className="flex justify-center mt-2">{getStatusIcon()}</div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex items-center gap-2">
              <div className="text-grass-soft">{icon}</div>
              <h3 className="font-arcade text-sm text-white text-shadow-retro">{title}</h3>
            </div>
          </div>

          <p className="text-grass-soft mb-4">{description}</p>

          {/* Progress bar */}
          {status !== 'locked' && (
            <div className="mb-4">
              <div className="flex justify-between text-sm text-grass-soft mb-1">
                <span>Progreso</span>
                <span className="text-led font-terminal tabular-nums">{progress}%</span>
              </div>
              <div className="h-3 bg-night border-2 border-grass overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, delay: number * 0.1 + 0.2 }}
                  className={`h-full ${
                    status === 'complete'
                      ? 'bg-led'
                      : 'bg-grass'
                  }`}
                />
              </div>
            </div>
          )}

          {/* Stats */}
          {stats.length > 0 && (
            <div className="grid grid-cols-2 gap-4 mb-4">
              {stats.map((stat, index) => (
                <div key={index} className="text-sm">
                  <div className="text-grass-soft">{stat.label}</div>
                  <div className="text-led font-terminal text-lg tabular-nums">
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          {actions && <div className="mt-4">{actions}</div>}
        </div>
      </div>
    </motion.div>
  );
}

// Helper function to get round labels
function getRoundLabel(
  round:
    | 'round-of-32'
    | 'round-of-16'
    | 'quarter'
    | 'semi'
    | 'final'
    | 'complete'
): string {
  switch (round) {
    case 'round-of-32':
      return 'Dieciseisavos';
    case 'round-of-16':
      return 'Octavos';
    case 'quarter':
      return 'Cuartos';
    case 'semi':
      return 'Semifinales';
    case 'final':
      return 'Final';
    case 'complete':
      return 'Completado';
  }
}
