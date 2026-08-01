import { useState, useEffect } from 'react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { phaseYear } from '../../core/calendar';
import { RegionView } from './RegionView';
import { GroupView } from './GroupView';
import { RunnersUpModal } from './RunnersUpModal';
import type { Region, Group } from '../../types';
import { Globe2, Filter, Trophy, Lock } from 'lucide-react';
import { isQualifiersDrawn, getQualifiersDrawStatus } from '../../utils/cycleProgress';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState } from '../ui/EmptyState';
import { ViewHeader } from '../ui/ViewHeader';
import { JornadaSimActions } from '../ui/SimActions';
import { useSwipeNavigation } from '../../hooks/useSwipeNavigation';
import { useCycleJornada } from '../../hooks/useCycleJornada';
import { toast } from 'sonner';

interface QualifiersViewProps {
  initialRegion?: string;
  initialGroupId?: string;
  onNavigate?: (view: string) => void;
}

export function QualifiersView({ initialRegion, initialGroupId, onNavigate }: QualifiersViewProps = {}) {
  const { teams, currentTournament, simulateMatch, generateDrawAndFixtures } = useTournamentStore();
  const jornadaSim = useCycleJornada(currentTournament, teams);
  const [selectedRegion, setSelectedRegion] = useState<Region | 'all'>(
    (initialRegion as Region) || 'all'
  );
  const [selectedGroup, setSelectedGroup] = useState<{
    group: Group;
    region: Region;
  } | null>(null);
  const [showRunnersUpModal, setShowRunnersUpModal] = useState(false);
  const [confirmRedrawQualifiers, setConfirmRedrawQualifiers] = useState(false);

  const regions: Region[] = ['Europe', 'America', 'Africa', 'Asia'];
  const regionOrder: (Region | 'all')[] = ['all', ...regions];
  const regionIndex = regionOrder.indexOf(selectedRegion);
  const swipeHandlers = useSwipeNavigation(
    () => {
      if (regionIndex > 0) setSelectedRegion(regionOrder[regionIndex - 1]);
    },
    () => {
      if (regionIndex < regionOrder.length - 1) setSelectedRegion(regionOrder[regionIndex + 1]);
    }
  );

  // Auto-select group if initialGroupId is provided.
  //
  // Depende SOLO de los identificadores de navegación, no de currentTournament:
  // con éste en las dependencias, cada partido simulado re-ejecutaba
  // setSelectedGroup y reabría el grupo viejo, dejando al usuario atrapado en
  // el detalle. El torneo se lee del store en el momento, sin re-disparar.
  useEffect(() => {
    if (!initialGroupId || !initialRegion) return;
    const tournament = useTournamentStore.getState().currentTournament;
    const groups = tournament?.qualifiers[initialRegion as Region] || [];
    const group = groups.find((g) => g.id === initialGroupId);
    if (group) {
      setSelectedGroup({ group, region: initialRegion as Region });
    }
  }, [initialGroupId, initialRegion]);

  if (!currentTournament) {
    return (
      <EmptyState
        icon={Globe2}
        title="Sin torneo activo"
        description="Creá un torneo desde el selector para ver las clasificatorias."
      />
    );
  }

  // Entre que termina Confederaciones y el sorteo de esta fase, los grupos no
  // existen todavía: sin esto la pantalla mostraba 0/0 sin explicar por qué.
  if (!isQualifiersDrawn(currentTournament)) {
    return (
      <EmptyState
        icon={Lock}
        title="Clasificatorias sin sortear"
        description="Cuando termine la Copa Confederaciones, sorteá las clasificatorias desde el inicio para armar los grupos."
        action={{ label: 'Ir al inicio', onClick: () => onNavigate?.('hub') }}
      />
    );
  }

  const handleBack = () => {
    setSelectedGroup(null);
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

  // If a group is selected, show group detail view
  if (selectedGroup) {
    const updatedGroups = currentTournament.qualifiers[selectedGroup.region] || [];
    const updatedGroup = updatedGroups.find((g) => g.id === selectedGroup.group.id);

    if (updatedGroup) {
      return <GroupView group={updatedGroup} teams={teams} onBack={handleBack} />;
    }
  }

  // Filter regions based on selection
  const filteredRegions = selectedRegion === 'all' ? regions : [selectedRegion];

  // Calculate stats for each region
  const regionStats = regions.map((region) => {
    const groups = currentTournament.qualifiers[region] || [];
    const totalMatches = groups.reduce((sum, g) => sum + g.matches.length, 0);
    const playedMatches = groups.reduce(
      (sum, g) => sum + g.matches.filter((m) => m.isPlayed).length,
      0
    );
    const completedGroups = groups.filter((g) =>
      g.matches.every((m) => m.isPlayed)
    ).length;

    return {
      region,
      groups: groups.length,
      completedGroups,
      totalMatches,
      playedMatches,
      progress: totalMatches > 0 ? Math.round((playedMatches / totalMatches) * 100) : 0,
    };
  });

  const selectedStats = regionStats.find((s) => s.region === selectedRegion);

  // Rehacer solo mientras no se haya jugado nada: con partidos jugados, ni el
  // guard del store lo permite. Mismo criterio que gobernaba el botón en la
  // vieja pantalla de progreso.
  const canRedrawQualifiers = isQualifiersDrawn(currentTournament) && !currentTournament.hasAnyMatchPlayed;

  // Un sorteo a medias (una región entera sin grupos, o grupos sin partidos) se
  // avisa acá, al lado del botón que lo arregla. El aviso vivía en la tarjeta de
  // Clasificatorias de la pantalla de progreso, que se borró junto con ella.
  const drawStatus = getQualifiersDrawStatus(currentTournament);

  return (
    <div className="space-y-6">
      {drawStatus.state === 'partial' && (
        <p className="border-2 border-gold bg-night/60 p-3 text-sm text-gold">
          Sorteo incompleto:{' '}
          {drawStatus.regionsMissing > 0
            ? drawStatus.regionsMissing === 1
              ? 'falta una región entera'
              : `faltan ${drawStatus.regionsMissing} regiones enteras`
            : `faltan partidos en ${drawStatus.groupsMissing} de ${drawStatus.totalGroups} grupos`}
          .{' '}
          {canRedrawQualifiers
            ? 'Rehacé el sorteo para completarlo.'
            : 'No se puede rehacer: ya se jugaron partidos.'}
        </p>
      )}

      {/* Header with Filter */}
      <Card className="overflow-hidden">
        <ViewHeader
          icon={Globe2}
          title={`Clasificatorias ${phaseYear('wc-qualifiers', currentTournament.year)}`}
          subtitle={currentTournament.name}
          actions={
            <>
              {canRedrawQualifiers && (
                <Button variant="danger" size="sm" onClick={() => setConfirmRedrawQualifiers(true)}>
                  Rehacer sorteo
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => setShowRunnersUpModal(true)}
                className="gap-2"
              >
                <Trophy className="w-4 h-4" />
                <span className="hidden sm:inline">Clasificación Segundos Lugares</span>
                <span className="sm:hidden">Segundos</span>
              </Button>
            </>
          }
        />

        {/* Acciones de jornada */}
        <div className="px-6 py-4 border-t-4 border-grass">
          <JornadaSimActions
            jornadaLabel={jornadaSim.title}
            onSimulate={jornadaSim.simulate}
            onSimulateLive={jornadaSim.simulateLive}
            disabled={!jornadaSim.canSimulate}
            busy={jornadaSim.isBusy}
            hint="se juega entera, en las cuatro regiones, sin importar el filtro."
          />
        </div>

        {/* Region Filter */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-3 mb-4">
            <Filter className="w-5 h-5 text-grass-soft" />
            <span className="font-arcade text-[10px] text-gold uppercase">Filtrar por región</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedRegion('all')}
              className={`px-4 py-2 min-h-11 lg:min-h-0 font-arcade text-[10px] uppercase border-2 transition-colors ${
                selectedRegion === 'all'
                  ? 'bg-grass text-white border-line'
                  : 'text-grass-soft border-transparent hover:bg-grass/40'
              }`}
            >
              Todas las regiones
            </button>
            {regions.map((region) => {
              const stats = regionStats.find((s) => s.region === region);
              return (
                <button
                  key={region}
                  onClick={() => setSelectedRegion(region)}
                  className={`px-4 py-2 min-h-11 lg:min-h-0 font-arcade text-[10px] uppercase border-2 transition-colors ${
                    selectedRegion === region
                      ? 'bg-grass text-white border-line'
                      : 'text-grass-soft border-transparent hover:bg-grass/40'
                  }`}
                >
                  {region}
                  {stats && stats.progress > 0 && (
                    <span className="ml-2 opacity-75">
                      {stats.progress}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Region Stats Summary */}
        {selectedRegion !== 'all' && selectedStats && (
          <div className="px-6 py-4 border-t-4 border-grass bg-night">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-grass-soft">Grupos</div>
                <div className="text-2xl font-terminal text-led tabular-nums">
                  {selectedStats.groups}
                </div>
              </div>
              <div>
                <div className="text-sm text-grass-soft">Grupos completados</div>
                <div className="text-2xl font-terminal text-led tabular-nums">
                  {selectedStats.completedGroups}/{selectedStats.groups}
                </div>
              </div>
              <div>
                <div className="text-sm text-grass-soft">Partidos jugados</div>
                <div className="text-2xl font-terminal text-led tabular-nums">
                  {selectedStats.playedMatches}/{selectedStats.totalMatches}
                </div>
              </div>
              <div>
                <div className="text-sm text-grass-soft">Progreso</div>
                <div className="text-2xl font-terminal text-led tabular-nums">
                  {selectedStats.progress}%
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Region indicator: mobile only */}
      <div className="sm:hidden flex items-center justify-center gap-4">
        <button
          onClick={() => regionIndex > 0 && setSelectedRegion(regionOrder[regionIndex - 1])}
          disabled={regionIndex === 0}
          className="min-h-11 min-w-11 flex items-center justify-center text-gold disabled:opacity-30 font-arcade text-sm"
          aria-label="Región anterior"
        >
          ◀
        </button>
        <span className="font-arcade text-[10px] text-gold uppercase min-w-[100px] text-center">
          {selectedRegion === 'all' ? 'Todas' : selectedRegion}
        </span>
        <button
          onClick={() => regionIndex < regionOrder.length - 1 && setSelectedRegion(regionOrder[regionIndex + 1])}
          disabled={regionIndex === regionOrder.length - 1}
          className="min-h-11 min-w-11 flex items-center justify-center text-gold disabled:opacity-30 font-arcade text-sm"
          aria-label="Región siguiente"
        >
          ▶
        </button>
      </div>

      {/* Regions List */}
      <div className="space-y-6 animate-slide-in lg:animate-none" key={selectedRegion} {...swipeHandlers}>
        {filteredRegions.map((region) => {
          const groups = currentTournament.qualifiers[region] || [];
          return (
            <RegionView
              key={region}
              region={region}
              groups={groups}
              teams={teams}
              onSimulateMatch={(matchId, groupId) => {
                simulateMatch(matchId, groupId, 'qualifier');
              }}
            />
          );
        })}
      </div>

      {/* Runners-Up Modal */}
      {showRunnersUpModal && (
        <RunnersUpModal
          qualifiers={currentTournament.qualifiers}
          teams={teams}
          onClose={() => setShowRunnersUpModal(false)}
        />
      )}

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
