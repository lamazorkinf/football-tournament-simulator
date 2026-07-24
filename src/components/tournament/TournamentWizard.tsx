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
import {
  getContinentalProgress,
  getConfederationsProgress,
  canDrawContinental,
  canDrawConfederations,
  canAdvanceToQualifiers,
  canDrawQualifiers,
  isContinentalDrawn,
  isConfederationsDrawn,
  continentalRoundLabel,
  confedRoundLabel,
  getQualifiersDrawStatus,
  isQualifiersDrawn,
} from '../../utils/cycleProgress';
import { sortStandings, getBestRunnersUp } from '../../core/scheduler';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';
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

export function TournamentWizard({ onNavigate }: { onNavigate?: (view: string) => void }) {
  const {
    currentTournament,
    teams,
    advanceToWorldCup,
    advanceToWorldCupWithManualDraw,
    advanceToKnockout,
    generateDrawAndFixtures,
    regenerateWorldCupDrawAndFixtures,
    drawContinental,
    drawConfederations,
    advanceToQualifiers,
  } = useTournamentStore();

  const [showDrawSimulator, setShowDrawSimulator] = useState(false);
  const [qualifiedTeamsForDraw, setQualifiedTeamsForDraw] = useState<Team[]>([]);
  const [confirmRegenWorldCup, setConfirmRegenWorldCup] = useState(false);
  const [confirmRedrawQualifiers, setConfirmRedrawQualifiers] = useState(false);

  const handleGenerateDraw = async () => {
    if (!currentTournament) return;
    const hasOriginalSkills = currentTournament.originalSkills &&
      Object.keys(currentTournament.originalSkills).length > 0;

    // await: sin esto el toast de éxito se mostraba de inmediato, aunque el
    // sorteo aún no hubiera terminado (o hubiera fallado).
    const completed = await generateDrawAndFixtures();
    // Si no se completó, el store ya avisó el motivo con su propio toast: acá
    // no hay diálogo que dejar abierto, así que alcanza con no festejar.
    if (!completed) return;

    toast.success(
      hasOriginalSkills
        ? 'Sorteo generado — habilidades en la base de este Mundial'
        : 'Sorteo y fixtures generados'
    );
  };

  const handleRedrawQualifiers = async () => {
    const completed = await generateDrawAndFixtures({ force: true });
    // El store ya avisó el motivo del fallo con su propio toast. Lanzar acá
    // (en vez de sólo retornar) es lo que hace que ConfirmDialog deje el
    // diálogo abierto en vez de cerrarlo como si la acción destructiva
    // hubiera funcionado.
    if (!completed) throw new Error('No se pudo rehacer el sorteo de clasificatorias.');
    toast.success('Sorteo de clasificatorias rehecho');
  };

  const handleDrawContinental = () => {
    const completed = drawContinental();
    // El store ya avisó el motivo del rechazo con su propio toast: si no se
    // completó, no hay nada que festejar ni a dónde navegar.
    if (!completed) return;
    toast.success('Torneos continentales sorteados');
    onNavigate?.('continental');
  };

  const handleDrawConfederations = () => {
    const completed = drawConfederations();
    if (!completed) return;
    toast.success('Copa Confederaciones sorteada');
    onNavigate?.('confederations');
  };

  const handleAdvanceToQualifiers = () => {
    advanceToQualifiers();
    toast.success('Fase de Clasificatorias habilitada');
    onNavigate?.('qualifiers');
  };

  const mobileAction = (() => {
    if (!currentTournament) return null;
    const c = currentTournament;
    if (canDrawContinental(c)) return { label: '▶ SORTEAR CONTINENTAL', onPress: handleDrawContinental };
    if (c.calendar.phase === 'continental' && !c.continental.isComplete) {
      return { label: '▶ JUGAR CONTINENTAL', onPress: () => onNavigate?.('continental') };
    }
    if (canDrawConfederations(c)) return { label: '▶ SORTEAR CONFED', onPress: handleDrawConfederations };
    if (c.calendar.phase === 'confed' && !c.confederationsCup.isComplete) {
      return { label: '▶ JUGAR CONFED', onPress: () => onNavigate?.('confederations') };
    }
    if (canAdvanceToQualifiers(c)) return { label: '▶ IR A CLASIFICATORIAS', onPress: handleAdvanceToQualifiers };
    // EMPEZAR solo si los fixtures aún no existen; el helper es el mismo que
    // usa el StepCard y el guard del store.
    const qualFixturesExist = isQualifiersDrawn(c);
    if (canDrawQualifiers(c) && !qualFixturesExist) return { label: '▶ EMPEZAR', onPress: handleGenerateDraw };
    if (qualFixturesExist && c.calendar.phase === 'wc-qualifiers' && !getQualifierProgress(c).isComplete) {
      return { label: '▶ JUGAR CLASIFICATORIAS', onPress: () => onNavigate?.('qualifiers') };
    }
    return null;
  })();
  useMobileAction(mobileAction);

  // Los useMemo deben ir ANTES de cualquier return condicional: si no, cuando
  // currentTournament pasa de null a existente cambia la cantidad de hooks
  // ejecutados y React lanza "Rendered more hooks than during the previous
  // render". Por eso son tolerantes a currentTournament nulo.
  const qualifierProgress = useMemo(
    () => (currentTournament ? getQualifierProgress(currentTournament) : null),
    [currentTournament]
  );

  // Una sola fuente para "¿ya hay fixtures?": antes la condición estaba escrita
  // dos veces (botón móvil y botón de escritorio) con formas distintas, que es
  // justamente cómo se cuela un re-sorteo.
  const qualifiersDrawStatus = useMemo(
    () => (currentTournament ? getQualifiersDrawStatus(currentTournament) : null),
    [currentTournament]
  );

  const worldCupProgress = useMemo(() => {
    if (!currentTournament?.worldCup) return null;
    return getWorldCupGroupProgress(currentTournament.worldCup.groups);
  }, [currentTournament]);

  const knockoutProgress = useMemo(() => {
    if (!currentTournament?.worldCup) return null;
    return getKnockoutProgress(currentTournament.worldCup.knockout);
  }, [currentTournament]);

  if (!currentTournament || !qualifierProgress) {
    return null;
  }

  const continentalProgress = getContinentalProgress(currentTournament);
  const confederationsProgress = getConfederationsProgress(currentTournament);
  const canDrawCont = canDrawContinental(currentTournament);
  const canDrawConfed = canDrawConfederations(currentTournament);
  const canAdvanceQual = canAdvanceToQualifiers(currentTournament);

  // Check if actions are available
  const canGenerateDraw = canDrawQualifiers(currentTournament);
  const qualifiersDrawn = isQualifiersDrawn(currentTournament);
  const qualifiersPartial = qualifiersDrawStatus?.state === 'partial';
  // Rehacer solo mientras no se haya jugado nada: con partidos jugados, ni el
  // guard del store lo permite.
  const canRedrawQualifiers = qualifiersDrawn && !currentTournament.hasAnyMatchPlayed;
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
  // Solo mientras los dieciseisavos NO estén generados: sin este guard el
  // botón "Generar Dieciseisavos" queda visible para siempre (incluso con el
  // torneo terminado) y permite re-generar la ronda. Una vez generado, el
  // fallback "Ver / Jugar" toma el relevo; con el torneo completo, ninguno.
  const canStartKnockout =
    currentTournament.worldCup &&
    currentTournament.worldCup.knockout.roundOf32.length === 0 &&
    canAdvanceToKnockout(currentTournament.worldCup.groups);

  const handleAdvanceToWorldCup = async () => {
    // await: advanceToWorldCup es async — sin esto el toast de éxito se
    // mostraba antes de que el avance terminara (o fallara).
    const completed = await advanceToWorldCup();
    // El store ya avisó el motivo del rechazo con su propio toast.
    if (!completed) return;
    toast.success('Avanzado a Copa del Mundo con 64 equipos clasificados');
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
        const sorted = sortStandings(group.standings, teams, group.matches);
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
    const completed = advanceToWorldCupWithManualDraw(groups);
    // Si el guard rechaza (p. ej. el Mundial ya se sorteó mientras el
    // simulador estaba abierto), el store ya avisó el motivo con su propio
    // toast. Acá no hay que descartar el sorteo manual que el usuario armó a
    // mano: el simulador se queda abierto en vez de cerrarse como si hubiera
    // funcionado.
    if (!completed) return;
    setShowDrawSimulator(false);
    toast.success('🏆 ¡Sorteo manual completado y guardado exitosamente!');
  };

  const handleDrawSimulatorCancel = () => {
    setShowDrawSimulator(false);
    toast.info('Sorteo manual cancelado');
  };

  const handleRegenerateWorldCupDraw = () => setConfirmRegenWorldCup(true);

  const handleAdvanceToKnockout = async () => {
    const completed = await advanceToKnockout();
    if (!completed) return;
    toast.success('Dieciseisavos de final generados');
  };

  // Determine tournament phase
  const isComplete =
    knockoutProgress?.isComplete && currentTournament.worldCup?.champion;

  // Con campeón coronado el torneo está terminado: la barra debe leer 100%
  // aunque `getKnockoutProgress` calcule menos por huecos en la llave (p. ej.
  // una copia legacy de la DB a la que le faltan filas de rondas intermedias).
  // Sin esto se veía "88% + ¡Torneo Completado!" a la vez.
  const knockoutPercentage = isComplete ? 100 : knockoutProgress?.percentage ?? 0;

  return (
    <div className="max-w-5xl mx-auto">
      <Card className="overflow-hidden">
        {/* Header */}
        <CardHeader>
          <p className="font-arcade text-[10px] text-gold mb-2">MODO DE JUEGO</p>
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
          {/* Step 1: Torneos Continentales */}
          <StepCard
            number={1}
            title="Torneos Continentales"
            description="Eliminación directa por confederación (R64 → Final)"
            icon={<Globe2 className="w-6 h-6" />}
            status={
              continentalProgress.isComplete
                ? 'complete'
                : continentalProgress.playedMatches > 0
                ? 'in-progress'
                : 'pending'
            }
            progress={continentalProgress.percentage}
            stats={[
              { label: 'Partidos jugados', value: `${continentalProgress.playedMatches}/${continentalProgress.totalMatches}` },
              { label: 'Fase', value: continentalRoundLabel(currentTournament.calendar.matchday) },
            ]}
            actions={
              canDrawCont ? (
                <Button variant="primary" size="sm" onClick={handleDrawContinental} className="gap-2">
                  <Sparkles className="w-4 h-4" />
                  Sortear Continentales
                </Button>
              ) : isContinentalDrawn(currentTournament) && !continentalProgress.isComplete ? (
                <Button variant="secondary" size="sm" onClick={() => onNavigate?.('continental')} className="gap-2">
                  <Globe2 className="w-4 h-4" />
                  Ver / Jugar
                </Button>
              ) : null
            }
          />

          {/* Step 2: Copa Confederaciones */}
          <StepCard
            number={2}
            title="Copa Confederaciones"
            description="8 finalistas · 2 grupos → semis → final + 3º"
            icon={<Award className="w-6 h-6" />}
            status={
              !currentTournament.continental.isComplete
                ? 'locked'
                : confederationsProgress.isComplete
                ? 'complete'
                : confederationsProgress.playedMatches > 0
                ? 'in-progress'
                : 'pending'
            }
            progress={confederationsProgress.percentage}
            stats={
              currentTournament.continental.isComplete
                ? [
                    { label: 'Partidos jugados', value: `${confederationsProgress.playedMatches}/${confederationsProgress.totalMatches}` },
                    { label: 'Fase', value: confedRoundLabel(currentTournament.calendar.matchday) },
                  ]
                : []
            }
            actions={
              canDrawConfed ? (
                <Button variant="primary" size="sm" onClick={handleDrawConfederations} className="gap-2">
                  <Sparkles className="w-4 h-4" />
                  Sortear Confederaciones
                </Button>
              ) : isConfederationsDrawn(currentTournament) && !confederationsProgress.isComplete ? (
                <Button variant="secondary" size="sm" onClick={() => onNavigate?.('confederations')} className="gap-2">
                  <Award className="w-4 h-4" />
                  Ver / Jugar
                </Button>
              ) : null
            }
          />

          {/* Step 3: Qualifiers */}
          <StepCard
            number={3}
            title="Clasificatorias"
            description="Genera fixtures y completa partidos de clasificación"
            icon={<Globe2 className="w-6 h-6" />}
            status={
              !currentTournament.confederationsCup.isComplete
                ? 'locked'
                : qualifierProgress.isComplete
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
            notice={
              qualifiersDrawStatus?.state === 'partial' ? (
                <>
                  Sorteo incompleto:{' '}
                  {qualifiersDrawStatus.regionsMissing > 0
                    ? qualifiersDrawStatus.regionsMissing === 1
                      ? 'falta una región entera'
                      : `faltan ${qualifiersDrawStatus.regionsMissing} regiones enteras`
                    : `faltan partidos en ${qualifiersDrawStatus.groupsMissing} de ${qualifiersDrawStatus.totalGroups} grupos`}
                  .{' '}
                  {canRedrawQualifiers
                    ? 'Rehacé el sorteo para completarlo.'
                    : 'No se puede rehacer: ya se jugaron partidos.'}
                </>
              ) : undefined
            }
            actions={
              canAdvanceQual ? (
                <Button variant="primary" size="lg" onClick={handleAdvanceToQualifiers} className="gap-2">
                  ⚽ Ir a Clasificatorias
                </Button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {canGenerateDraw && !qualifiersDrawn && (
                    // EMPEZAR solo para la GENERACIÓN inicial. Una vez sorteado,
                    // el store rechaza esta acción sin `force`.
                    <Button size="lg" onClick={handleGenerateDraw} className="hidden lg:inline-flex">
                      ▶ EMPEZAR
                    </Button>
                  )}
                  {qualifiersDrawn && !qualifierProgress.isComplete && (
                    <Button variant="secondary" size="sm" onClick={() => onNavigate?.('qualifiers')} className="gap-2">
                      <Globe2 className="w-4 h-4" />
                      Ver / Jugar
                    </Button>
                  )}
                  {canRedrawQualifiers && (
                    <Button
                      variant={qualifiersPartial ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => setConfirmRedrawQualifiers(true)}
                    >
                      Rehacer sorteo
                    </Button>
                  )}
                </div>
              )
            }
          />

          {/* Step 4: World Cup Groups */}
          <StepCard
            number={4}
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
              ) : worldCupProgress && worldCupProgress.playedMatches > 0 && !worldCupProgress.isComplete ? (
                <Button variant="secondary" size="sm" onClick={() => onNavigate?.('worldcup')} className="gap-2">
                  <Trophy className="w-4 h-4" />
                  Ver / Jugar
                </Button>
              ) : null
            }
          />

          {/* Step 5: Knockout Phase */}
          <StepCard
            number={5}
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
            progress={knockoutPercentage}
            stats={
              knockoutProgress
                ? [
                    {
                      label: 'Ronda actual',
                      value: isComplete
                        ? getRoundLabel('complete')
                        : getRoundLabel(knockoutProgress.currentRound),
                    },
                    {
                      label: 'Progreso',
                      value: `${knockoutPercentage}%`,
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
              ) : currentTournament.worldCup?.knockout &&
                currentTournament.worldCup.knockout.roundOf32.length > 0 &&
                !isComplete ? (
                <Button variant="secondary" size="sm" onClick={() => onNavigate?.('worldcup')} className="gap-2">
                  <Award className="w-4 h-4" />
                  Ver / Jugar
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

      <ConfirmDialog
        open={confirmRegenWorldCup}
        onOpenChange={setConfirmRegenWorldCup}
        variant="danger"
        title="Regenerar sorteo del Mundial"
        confirmLabel="Regenerar"
        description={
          <>
            <p>Se eliminan todos los partidos actuales del Mundial (grupos y playoffs) y se crean grupos nuevos con los mismos 64 equipos clasificados.</p>
            <p>Esta acción no se puede deshacer.</p>
          </>
        }
        onConfirm={async () => {
          await regenerateWorldCupDrawAndFixtures();
          toast.success('Sorteo del Mundial regenerado');
        }}
      />

      <ConfirmDialog
        open={confirmRedrawQualifiers}
        onOpenChange={setConfirmRedrawQualifiers}
        variant="danger"
        title="Rehacer sorteo de clasificatorias"
        confirmLabel="Rehacer"
        description={
          <>
            <p>Se eliminan todos los grupos y partidos actuales de las clasificatorias y se sortean de nuevo desde cero.</p>
            <p>Esta acción no se puede deshacer.</p>
          </>
        }
        onConfirm={handleRedrawQualifiers}
      />
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
  notice?: React.ReactNode;
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
  notice,
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

          {notice && (
            <div className="mb-4 border-2 border-gold bg-night/60 p-3 text-sm text-gold">
              {notice}
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
