import { useMemo } from 'react';
import { useTournamentStore } from '../../store/useTournamentStore';
import {
  getQualifierProgress,
  getWorldCupGroupProgress,
  getKnockoutProgress,
  canAdvanceToWorldCup,
  canAdvanceToKnockout,
} from '../../utils/tournamentProgress';
import { Button } from '../ui/Button';
import {
  CheckCircle2,
  Circle,
  Clock,
  Trophy,
  Award,
  Globe2,
  Zap,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

export function TournamentWizard() {
  const {
    currentTournament,
    advanceToWorldCup,
    advanceToKnockout,
    generateDrawAndFixtures,
  } = useTournamentStore();

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
  const canStartKnockout =
    currentTournament.worldCup &&
    canAdvanceToKnockout(currentTournament.worldCup.groups);

  // Handle action clicks with confirmations
  const handleGenerateDraw = () => {
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

  const handleAdvanceToWorldCup = () => {
    if (
      confirm(
        '¿Avanzar a la fase de Copa del Mundo?\n\nLos 64 equipos clasificados (2 por grupo) se distribuirán en 16 grupos del Mundial.'
      )
    ) {
      advanceToWorldCup();
      toast.success('🏆 ¡Avanzado a Copa del Mundo!');
    }
  };

  const handleAdvanceToKnockout = () => {
    if (
      confirm(
        '¿Generar Dieciseisavos de Final?\n\nLos 32 equipos clasificados (2 por grupo) avanzarán a la fase de eliminación directa.'
      )
    ) {
      advanceToKnockout();
      toast.success('⚡ ¡Dieciseisavos de Final generados!');
    }
  };

  // Determine tournament phase
  const isComplete =
    knockoutProgress?.isComplete && currentTournament.worldCup?.champion;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-8 text-white">
          <div className="flex items-center gap-3 mb-2">
            <Trophy className="w-8 h-8" />
            <h2 className="text-3xl font-bold">Progreso del Torneo</h2>
          </div>
          <p className="text-primary-100">
            Guía paso a paso para completar el torneo
          </p>
        </div>

        {/* Steps */}
        <div className="p-6 space-y-6">
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
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleGenerateDraw}
                  className="gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Generar Sorteo & Fixtures
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
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAdvanceToWorldCup}
                  className="gap-2"
                >
                  <Trophy className="w-4 h-4" />
                  Iniciar Copa del Mundo
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
              className="mt-8 bg-gradient-to-r from-yellow-50 to-yellow-100 border-2 border-yellow-400 rounded-lg p-6 text-center"
            >
              <Trophy className="w-16 h-16 text-yellow-600 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-gray-900 mb-2">
                🏆 ¡Torneo Completado! 🏆
              </h3>
              <p className="text-gray-600">
                El campeón ha sido coronado. ¡Puedes iniciar un nuevo torneo
                cuando estés listo!
              </p>
            </motion.div>
          )}
        </div>
      </div>
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
        return <CheckCircle2 className="w-6 h-6 text-green-600" />;
      case 'in-progress':
        return <Clock className="w-6 h-6 text-primary-600 animate-pulse" />;
      case 'locked':
        return <Circle className="w-6 h-6 text-gray-300" />;
      default:
        return <Circle className="w-6 h-6 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'complete':
        return 'border-green-200 bg-green-50';
      case 'in-progress':
        return 'border-primary-200 bg-primary-50';
      case 'locked':
        return 'border-gray-200 bg-gray-50 opacity-60';
      default:
        return 'border-gray-200 bg-white';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: number * 0.1 }}
      className={`border-2 rounded-lg p-6 transition-all ${getStatusColor()}`}
    >
      <div className="flex items-start gap-4">
        {/* Step number & status */}
        <div className="flex-shrink-0">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white border-2 border-gray-300 font-bold text-gray-700">
            {number}
          </div>
          <div className="flex justify-center mt-2">{getStatusIcon()}</div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="flex items-center gap-2">
              <div className="text-gray-600">{icon}</div>
              <h3 className="text-xl font-bold text-gray-900">{title}</h3>
            </div>
          </div>

          <p className="text-gray-600 mb-4">{description}</p>

          {/* Progress bar */}
          {status !== 'locked' && (
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Progreso</span>
                <span className="font-semibold">{progress}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, delay: number * 0.1 + 0.2 }}
                  className={`h-full ${
                    status === 'complete'
                      ? 'bg-green-600'
                      : 'bg-primary-600'
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
                  <div className="text-gray-500">{stat.label}</div>
                  <div className="font-semibold text-gray-900">
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
    | 'quarter-final'
    | 'semi-final'
    | 'final'
    | 'complete'
): string {
  switch (round) {
    case 'round-of-32':
      return 'Dieciseisavos';
    case 'round-of-16':
      return 'Octavos';
    case 'quarter-final':
      return 'Cuartos';
    case 'semi-final':
      return 'Semifinales';
    case 'final':
      return 'Final';
    case 'complete':
      return 'Completado';
  }
}
