import { useState } from 'react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { Trophy, Award, Users, Zap, RefreshCw } from 'lucide-react';
import { WorldCupGridView } from './WorldCupGridView';
import { KnockoutView } from './KnockoutView';
import { areGroupsComplete } from '../../core/knockout';
import { toast } from 'sonner';
import { Button } from '../ui/Button';

type WorldCupTab = 'groups' | 'playoffs';

export function WorldCupViewEnhanced() {
  const { currentTournament, teams, advanceToKnockout, regenerateKnockoutStage, simulateMatch } = useTournamentStore();
  const [activeTab, setActiveTab] = useState<WorldCupTab>('groups');

  if (!currentTournament) {
    return null;
  }

  // Fallback cuando no hay datos del Mundial
  if (!currentTournament.worldCup) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 px-6 py-6 text-white">
            <div className="flex items-center gap-3">
              <Trophy className="w-8 h-8" />
              <div>
                <h2 className="text-2xl font-bold">Copa del Mundo</h2>
                <p className="text-yellow-100 text-sm mt-1">
                  {currentTournament.name}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Coming Soon Message */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trophy className="w-10 h-10 text-yellow-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">
              Próximamente
            </h3>
            <p className="text-gray-600 mb-6">
              La fase de Copa del Mundo estará disponible una vez que se completen
              las clasificatorias regionales y se genere el sorteo del Mundial.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Paso siguiente:</strong> Completa todos los partidos de las
                clasificatorias y luego avanza a la Copa del Mundo desde la pestaña
                "Progreso".
              </p>
            </div>
          </div>
        </div>
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
    if (
      !confirm(
        '¿Generar Dieciseisavos de Final?\n\nLos 32 equipos clasificados (2 por grupo) avanzarán a la fase de eliminación directa.'
      )
    ) {
      return;
    }
    await advanceToKnockout();
    toast.success('⚡ ¡Dieciseisavos de Final generados!');
    setActiveTab('playoffs');
  };

  const handleRegenerateKnockout = async () => {
    if (
      !confirm(
        '¿Regenerar Playoffs?\n\nSe eliminarán todos los partidos de playoffs (no jugados) y se volverán a generar los cruces basándose en las posiciones actuales de la fase de grupos.'
      )
    ) {
      return;
    }
    await regenerateKnockoutStage();
    toast.success('✅ ¡Playoffs regenerados correctamente!');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 px-6 py-6 text-white">
          <div className="flex items-center gap-3">
            <Trophy className="w-8 h-8" />
            <div>
              <h2 className="text-2xl font-bold">Copa del Mundo</h2>
              <p className="text-yellow-100 text-sm mt-1">
                {currentTournament.name}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex">
            <button
              onClick={() => setActiveTab('groups')}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors border-b-2 ${
                activeTab === 'groups'
                  ? 'border-yellow-600 text-yellow-600 bg-yellow-50'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Users className="w-5 h-5" />
              <span>Fase de Grupos</span>
              {groupsProgress > 0 && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    activeTab === 'groups'
                      ? 'bg-yellow-200 text-yellow-800'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {groupsProgress}%
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('playoffs')}
              disabled={!knockoutStarted}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors border-b-2 ${
                activeTab === 'playoffs'
                  ? 'border-yellow-600 text-yellow-600 bg-yellow-50'
                  : knockoutStarted
                  ? 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  : 'border-transparent text-gray-400 cursor-not-allowed'
              }`}
            >
              <Award className="w-5 h-5" />
              <span>Playoffs</span>
              {knockoutStarted && knockoutProgress > 0 && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    activeTab === 'playoffs'
                      ? 'bg-yellow-200 text-yellow-800'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {knockoutProgress}%
                </span>
              )}
              {!knockoutStarted && (
                <span className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">
                  Bloqueado
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tab Content Stats */}
        {activeTab === 'groups' && (
          <div className="p-6 bg-gray-50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <div className="text-sm text-gray-600">Grupos</div>
                <div className="text-2xl font-bold text-gray-900">
                  {worldCup.groups.length}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Grupos completados</div>
                <div className="text-2xl font-bold text-gray-900">
                  {completedGroups}/{worldCup.groups.length}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Partidos jugados</div>
                <div className="text-2xl font-bold text-gray-900">
                  {playedGroupMatches}/{totalGroupMatches}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Progreso</div>
                <div className="text-2xl font-bold text-yellow-600">
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
          <div className="p-6 bg-gray-50">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div>
                <div className="text-sm text-gray-600">Partidos totales</div>
                <div className="text-2xl font-bold text-gray-900">
                  {totalKnockoutMatches}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Partidos jugados</div>
                <div className="text-2xl font-bold text-gray-900">
                  {playedKnockoutMatches}/{totalKnockoutMatches}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Progreso</div>
                <div className="text-2xl font-bold text-yellow-600">
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
      </div>

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
            onBack={() => {}}
            onNewTournament={undefined}
          />
        )}
      </div>
    </div>
  );
}
