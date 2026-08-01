import { useState } from 'react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { Trophy, Award, Users, Zap, RefreshCw, Lock, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { WorldCupGridView } from './WorldCupGridView';
import { KnockoutView } from './KnockoutView';
import { DrawSimulator } from './DrawSimulator';
import { areGroupsComplete } from '../../core/knockout';
import { sortStandings, getBestRunnersUp } from '../../core/scheduler';
import { canAdvanceToWorldCup } from '../../utils/tournamentProgress';
import { toast } from 'sonner';
import { Button } from '../ui/Button';
import { Card, CardContent } from '../ui/Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { JornadaSimActions } from '../ui/SimActions';
import { Tabs } from '../ui/Tabs';
import { ViewHeader } from '../ui/ViewHeader';
import { useCycleJornada } from '../../hooks/useCycleJornada';
import type { WorldCupGroup, Group, Region, Team } from '../../types';

type WorldCupTab = 'groups' | 'playoffs';

interface WorldCupViewEnhancedProps {
  onNavigate?: (view: string) => void;
}

export function WorldCupViewEnhanced({ onNavigate }: WorldCupViewEnhancedProps = {}) {
  const {
    currentTournament,
    teams,
    advanceToKnockout,
    advanceToWorldCupWithManualDraw,
    regenerateWorldCupDrawAndFixtures,
    regenerateKnockoutStage,
    simulateMatch,
  } = useTournamentStore();
  const jornadaSim = useCycleJornada(currentTournament, teams);
  const [activeTab, setActiveTab] = useState<WorldCupTab>('groups');
  const [confirmRegenKnockout, setConfirmRegenKnockout] = useState(false);
  const [showDrawSimulator, setShowDrawSimulator] = useState(false);
  const [qualifiedTeamsForDraw, setQualifiedTeamsForDraw] = useState<Team[]>([]);
  const [confirmRegenWorldCup, setConfirmRegenWorldCup] = useState(false);

  if (!currentTournament) {
    return null;
  }

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

  // Fallback cuando no hay datos del Mundial
  if (!currentTournament.worldCup) {
    // Mismo guard que habilita "▶ AVANZAR AL MUNDIAL" en el Hub: clasificatorias
    // completas y Mundial todavía sin crear. Sin esto, el botón de sorteo
    // manual quedaría visible incluso con las clasificatorias a medio jugar.
    const canStartWorldCup = canAdvanceToWorldCup(currentTournament);
    return (
      <div className="space-y-6">
        {/* Header */}
        <Card className="overflow-hidden">
          <ViewHeader
            icon={Trophy}
            title="Copa del Mundo"
            subtitle={currentTournament.name}
          />
        </Card>

        {/* Coming Soon Message */}
        <Card>
          <div className="p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 bg-grass/30 border-2 border-grass flex items-center justify-center mx-auto mb-6">
                <Trophy className="w-10 h-10 text-gold" />
              </div>
              <h3 className="font-arcade text-sm text-white text-shadow-retro uppercase mb-3">
                En camino
              </h3>
              <p className="text-grass-soft mb-6">
                La fase de Copa del Mundo estará disponible una vez que se completen
                las clasificatorias regionales y se genere el sorteo del Mundial.
              </p>
              {canStartWorldCup ? (
                // Con las clasificatorias completas, el "Paso siguiente" de abajo
                // (que manda de vuelta al Inicio) ya no aplica: acá mismo se
                // puede armar el sorteo a mano.
                <Button variant="secondary" size="sm" onClick={handleManualDraw} className="gap-2">
                  <Sparkles className="w-4 h-4" />
                  Sorteo Manual (Simulador)
                </Button>
              ) : (
                <div className="bg-grass/30 border-2 border-grass p-4">
                  <p className="text-sm text-white">
                    <strong className="text-gold">Paso siguiente:</strong> Completá todos los partidos de las
                    clasificatorias y después avanzá a la Copa del Mundo desde Inicio.
                  </p>
                </div>
              )}
            </div>
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

  const { worldCup } = currentTournament;
  const groupsComplete = areGroupsComplete(worldCup.groups);
  const knockoutStarted = worldCup.knockout.roundOf32.length > 0;

  // Calculate groups stats
  const totalGroupMatches = worldCup.groups.reduce(
    (sum, g) => sum + g.matches.length,
    0
  );
  const playedGroupMatches = worldCup.groups.reduce(
    (sum, g) => sum + g.matches.filter((m) => m.isPlayed).length,
    0
  );
  const completedGroups = worldCup.groups.filter((g) =>
    g.matches.every((m) => m.isPlayed)
  ).length;
  const groupsProgress =
    totalGroupMatches > 0
      ? Math.round((playedGroupMatches / totalGroupMatches) * 100)
      : 0;

  // Calculate knockout stats
  const allKnockoutMatches = [
    ...worldCup.knockout.roundOf32,
    ...worldCup.knockout.roundOf16,
    ...worldCup.knockout.quarterFinals,
    ...worldCup.knockout.semiFinals,
    ...(worldCup.knockout.thirdPlace ? [worldCup.knockout.thirdPlace] : []),
    ...(worldCup.knockout.final ? [worldCup.knockout.final] : []),
  ];
  const totalKnockoutMatches = allKnockoutMatches.length;
  const playedKnockoutMatches = allKnockoutMatches.filter(
    (m) => m.isPlayed
  ).length;
  const knockoutProgress =
    totalKnockoutMatches > 0
      ? Math.round((playedKnockoutMatches / totalKnockoutMatches) * 100)
      : 0;

  const handleAdvanceToKnockout = async () => {
    const completed = await advanceToKnockout();
    // El store ya avisó el motivo del rechazo con su propio toast: sin esto,
    // el usuario veía ese aviso seguido de un "generados" contradictorio y la
    // pestaña igual saltaba a Playoffs aunque no hubiera nada nuevo ahí.
    if (!completed) return;
    toast.success('Dieciseisavos de final generados');
    setActiveTab('playoffs');
  };

  const handleRegenerateKnockout = () => setConfirmRegenKnockout(true);

  // Regenerar sólo mientras el Mundial no tenga ningún partido jugado, ni de
  // grupos ni de playoffs: con algo jugado, volver a sortear borraría
  // resultados reales. Ya no hace falta el `currentTournament.worldCup &&` que
  // llevaba adelante en la vieja pantalla de progreso: acá abajo del fallback
  // de arriba, `worldCup` ya está garantizado.
  const canRegenerateWorldCup =
    !worldCup.groups.some(group => group.matches.some(m => m.isPlayed)) &&
    !worldCup.knockout.roundOf32.some(m => m.isPlayed) &&
    !worldCup.knockout.roundOf16.some(m => m.isPlayed) &&
    !worldCup.knockout.quarterFinals.some(m => m.isPlayed) &&
    !worldCup.knockout.semiFinals.some(m => m.isPlayed) &&
    !worldCup.knockout.thirdPlace?.isPlayed &&
    !worldCup.knockout.final?.isPlayed;

  const handleRegenerateWorldCupDraw = () => setConfirmRegenWorldCup(true);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="overflow-hidden">
        <ViewHeader
          icon={Trophy}
          title="Copa del Mundo"
          subtitle={currentTournament.name}
        />

        {/* Tabs */}
        <Tabs
          items={[
            {
              id: 'groups',
              label: groupsProgress > 0 ? `Grupos ${groupsProgress}%` : 'Grupos',
              icon: Users,
            },
            {
              id: 'playoffs',
              label: knockoutStarted
                ? knockoutProgress > 0
                  ? `Playoffs ${knockoutProgress}%`
                  : 'Playoffs'
                : 'Playoffs (bloqueado)',
              icon: Award,
            },
          ]}
          value={activeTab}
          onChange={(id) => setActiveTab(id as WorldCupTab)}
        />

        {/* Tab Content Stats */}
        {activeTab === 'groups' && (
          <div className="p-6 bg-night">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <div className="text-sm text-grass-soft">Grupos</div>
                <div className="text-2xl font-terminal text-led tabular-nums">
                  {worldCup.groups.length}
                </div>
              </div>
              <div>
                <div className="text-sm text-grass-soft">Grupos completados</div>
                <div className="text-2xl font-terminal text-led tabular-nums">
                  {completedGroups}/{worldCup.groups.length}
                </div>
              </div>
              <div>
                <div className="text-sm text-grass-soft">Partidos jugados</div>
                <div className="text-2xl font-terminal text-led tabular-nums">
                  {playedGroupMatches}/{totalGroupMatches}
                </div>
              </div>
              <div>
                <div className="text-sm text-grass-soft">Progreso</div>
                <div className="text-2xl font-terminal text-gold tabular-nums">
                  {groupsProgress}%
                </div>
              </div>
            </div>

            {/* Acciones de jornada (mientras queden partidos de grupos) */}
            {!groupsComplete && (
              <JornadaSimActions
                jornadaLabel={jornadaSim.title}
                onSimulate={jornadaSim.simulate}
                onSimulateLive={jornadaSim.simulateLive}
                disabled={!jornadaSim.canSimulate}
                busy={jornadaSim.isBusy}
                hint="se juega entera, en los ocho grupos."
              />
            )}

            {/* Regenerate World Cup Draw Button - Only show if no matches played */}
            {canRegenerateWorldCup && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerateWorldCupDraw}
                className="gap-2"
              >
                <Zap className="w-4 h-4" />
                Regenerar Sorteo & Fixtures
              </Button>
            )}

            {/* Advance to Knockout Button */}
            {groupsComplete && !knockoutStarted && (
              <Button
                variant="primary"
                size="lg"
                onClick={handleAdvanceToKnockout}
                className="gap-2 w-full sm:w-auto"
              >
                <Zap className="w-5 h-5" />
                Generar Dieciseisavos de Final
              </Button>
            )}
          </div>
        )}

        {activeTab === 'playoffs' && knockoutStarted && (
          <div className="p-6 bg-night">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div>
                <div className="text-sm text-grass-soft">Partidos totales</div>
                <div className="text-2xl font-terminal text-led tabular-nums">
                  {totalKnockoutMatches}
                </div>
              </div>
              <div>
                <div className="text-sm text-grass-soft">Partidos jugados</div>
                <div className="text-2xl font-terminal text-led tabular-nums">
                  {playedKnockoutMatches}/{totalKnockoutMatches}
                </div>
              </div>
              <div>
                <div className="text-sm text-grass-soft">Progreso</div>
                <div className="text-2xl font-terminal text-gold tabular-nums">
                  {knockoutProgress}%
                </div>
              </div>
            </div>

            {/* Regenerate Knockout Button - Only show if no matches played */}
            {knockoutStarted && playedKnockoutMatches === 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerateKnockout}
                className="gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Regenerar Playoffs
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* Content */}
      <div>
        {activeTab === 'groups' && (
          <WorldCupGridView
            groups={worldCup.groups}
            teams={teams}
            onSimulateMatch={(matchId, groupId) => {
              simulateMatch(matchId, groupId, 'world-cup');
            }}
          />
        )}

        {activeTab === 'playoffs' && knockoutStarted && (
          <KnockoutView
            knockout={worldCup.knockout}
            teams={teams}
            championId={worldCup.champion}
            runnerUpId={worldCup.runnerUp}
            thirdPlaceId={worldCup.thirdPlace}
            fourthPlaceId={worldCup.fourthPlace}
            onBack={() => setActiveTab('groups')}
            onNewTournament={onNavigate ? () => onNavigate('hub') : undefined}
          />
        )}

        {activeTab === 'playoffs' && !knockoutStarted && (
          <Card>
            <CardContent className="pt-6">
              <EmptyState
                icon={Lock}
                title="Playoffs sin generar"
                description="Terminá la fase de grupos y generá los dieciseisavos desde ahí: no se crean solos."
                action={{ label: 'Ver fase de grupos', onClick: () => setActiveTab('groups') }}
              />
            </CardContent>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={confirmRegenKnockout}
        onOpenChange={setConfirmRegenKnockout}
        variant="danger"
        title="Regenerar playoffs"
        confirmLabel="Regenerar"
        description={
          <>
            <p>Se eliminan todos los partidos de playoffs no jugados y se vuelven a generar los cruces según las posiciones actuales de la fase de grupos.</p>
            <p>Esta acción no se puede deshacer.</p>
          </>
        }
        onConfirm={async () => {
          const completed = await regenerateKnockoutStage();
          // El store ya avisó el motivo del rechazo con su propio toast.
          // Lanzar acá (en vez de sólo retornar) es lo que hace que
          // ConfirmDialog deje el diálogo abierto en vez de cerrarlo como si
          // la acción destructiva hubiera funcionado.
          if (!completed) throw new Error('No se pudieron regenerar los playoffs.');
          toast.success('Playoffs regenerados');
        }}
      />

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
          const completed = await regenerateWorldCupDrawAndFixtures();
          // El store ya avisó el motivo del rechazo con su propio toast.
          // Lanzar acá (en vez de sólo retornar) es lo que hace que
          // ConfirmDialog deje el diálogo abierto en vez de cerrarlo como si
          // la acción destructiva hubiera funcionado — mismo patrón que
          // handleRedrawQualifiers en QualifiersView. Los errores de base que
          // el store relanza (borrado o guardado fallidos) llegan tal cual:
          // no hace falta atraparlos acá.
          if (!completed) throw new Error('No se pudo regenerar el sorteo del Mundial.');
          toast.success('Sorteo del Mundial regenerado');
        }}
      />
    </div>
  );
}
