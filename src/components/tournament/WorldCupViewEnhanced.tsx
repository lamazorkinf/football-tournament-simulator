import { useState } from 'react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { Trophy, Award, Users, Zap, RefreshCw } from 'lucide-react';
import { WorldCupGridView } from './WorldCupGridView';
import { KnockoutView } from './KnockoutView';
import { areGroupsComplete } from '../../core/knockout';
import { toast } from 'sonner';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';

type WorldCupTab = 'groups' | 'playoffs';

interface WorldCupViewEnhancedProps {
  onNavigate?: (view: string) => void;
}

export function WorldCupViewEnhanced({ onNavigate }: WorldCupViewEnhancedProps = {}) {
  const { currentTournament, teams, advanceToKnockout, regenerateKnockoutStage, simulateMatch } = useTournamentStore();
  const [activeTab, setActiveTab] = useState<WorldCupTab>('groups');
  const [confirmRegenKnockout, setConfirmRegenKnockout] = useState(false);

  if (!currentTournament) {
    return null;
  }

  // Fallback cuando no hay datos del Mundial
  if (!currentTournament.worldCup) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Trophy className="w-8 h-8 text-gold" />
              <div>
                <h2 className="font-arcade text-lg text-white text-shadow-retro">Copa del Mundo</h2>
                <p className="text-grass-soft text-sm mt-1">
                  {currentTournament.name}
                </p>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Coming Soon Message */}
        <Card>
          <div className="p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 bg-grass/30 border-2 border-grass flex items-center justify-center mx-auto mb-6">
                <Trophy className="w-10 h-10 text-gold" />
              </div>
              <h3 className="font-arcade text-sm text-white text-shadow-retro uppercase mb-3">
                Próximamente
              </h3>
              <p className="text-grass-soft mb-6">
                La fase de Copa del Mundo estará disponible una vez que se completen
                las clasificatorias regionales y se genere el sorteo del Mundial.
              </p>
              <div className="bg-grass/30 border-2 border-grass p-4">
                <p className="text-sm text-white">
                  <strong className="text-gold">Paso siguiente:</strong> Completa todos los partidos de las
                  clasificatorias y luego avanza a la Copa del Mundo desde la pestaña
                  "Progreso".
                </p>
              </div>
            </div>
          </div>
        </Card>
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
    await advanceToKnockout();
    toast.success('Dieciseisavos de final generados');
    setActiveTab('playoffs');
  };

  const handleRegenerateKnockout = () => setConfirmRegenKnockout(true);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8 text-gold" />
            <div>
              <h2 className="font-arcade text-lg text-white text-shadow-retro">Copa del Mundo</h2>
              <p className="text-grass-soft text-sm mt-1">
                {currentTournament.name}
              </p>
            </div>
          </div>
        </CardHeader>

        {/* Tabs */}
        <div className="flex border-b-4 border-grass">
          <button
            onClick={() => setActiveTab('groups')}
            className={`flex items-center gap-2 px-6 py-4 font-arcade text-[10px] uppercase border-b-4 transition-colors ${
              activeTab === 'groups'
                ? 'border-gold text-gold bg-grass/30'
                : 'border-transparent text-grass-soft hover:text-white hover:bg-grass/40'
            }`}
          >
            <Users className="w-5 h-5" />
            <span>Fase de Grupos</span>
            {groupsProgress > 0 && (
              <span className="px-2 py-0.5 font-arcade text-[10px] bg-black/40 border border-gold text-gold">
                {groupsProgress}%
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('playoffs')}
            disabled={!knockoutStarted}
            className={`flex items-center gap-2 px-6 py-4 font-arcade text-[10px] uppercase border-b-4 transition-colors ${
              activeTab === 'playoffs'
                ? 'border-gold text-gold bg-grass/30'
                : knockoutStarted
                ? 'border-transparent text-grass-soft hover:text-white hover:bg-grass/40'
                : 'border-transparent text-grass-soft/40 cursor-not-allowed'
            }`}
          >
            <Award className="w-5 h-5" />
            <span>Playoffs</span>
            {knockoutStarted && knockoutProgress > 0 && (
              <span className="px-2 py-0.5 font-arcade text-[10px] bg-black/40 border border-gold text-gold">
                {knockoutProgress}%
              </span>
            )}
            {!knockoutStarted && (
              <span className="px-2 py-0.5 font-arcade text-[10px] bg-black/40 border border-grass-soft text-grass-soft uppercase">
                Bloqueado
              </span>
            )}
          </button>
        </div>

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
            onNewTournament={onNavigate ? () => onNavigate('wizard') : undefined}
          />
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
          await regenerateKnockoutStage();
          toast.success('Playoffs regenerados');
        }}
      />
    </div>
  );
}
