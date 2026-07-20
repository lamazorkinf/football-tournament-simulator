import { useState, useEffect } from 'react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { RegionView } from './RegionView';
import { GroupView } from './GroupView';
import { RunnersUpModal } from './RunnersUpModal';
import type { Region, Group } from '../../types';
import { Globe2, Filter, Trophy } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';

interface QualifiersViewProps {
  initialRegion?: string;
  initialGroupId?: string;
}

export function QualifiersView({ initialRegion, initialGroupId }: QualifiersViewProps = {}) {
  const { teams, currentTournament, simulateMatch } = useTournamentStore();
  const [selectedRegion, setSelectedRegion] = useState<Region | 'all'>(
    (initialRegion as Region) || 'all'
  );
  const [selectedGroup, setSelectedGroup] = useState<{
    group: Group;
    region: Region;
  } | null>(null);
  const [showRunnersUpModal, setShowRunnersUpModal] = useState(false);

  // Auto-select group if initialGroupId is provided
  useEffect(() => {
    if (initialGroupId && initialRegion && currentTournament) {
      const groups = currentTournament.qualifiers[initialRegion as Region] || [];
      const group = groups.find((g) => g.id === initialGroupId);
      if (group) {
        setSelectedGroup({ group, region: initialRegion as Region });
      }
    }
  }, [initialGroupId, initialRegion, currentTournament]);

  if (!currentTournament) {
    return (
      <div className="text-center py-12">
        <p className="text-grass-soft">No tournament available</p>
      </div>
    );
  }

  const regions: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

  const handleBack = () => {
    setSelectedGroup(null);
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

  return (
    <div className="space-y-6">
      {/* Header with Filter */}
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Globe2 className="w-8 h-8 text-gold" />
              <div>
                <h2 className="font-arcade text-lg text-white text-shadow-retro">Clasificatorias</h2>
                <p className="text-grass-soft text-sm mt-1">
                  {currentTournament.name}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => setShowRunnersUpModal(true)}
              className="gap-2"
            >
              <Trophy className="w-4 h-4" />
              <span className="hidden sm:inline">Clasificación Segundos Lugares</span>
              <span className="sm:hidden">Segundos</span>
            </Button>
          </div>
        </CardHeader>

        {/* Region Filter */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-3 mb-4">
            <Filter className="w-5 h-5 text-grass-soft" />
            <span className="font-arcade text-[10px] text-gold uppercase">Filtrar por región</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedRegion('all')}
              className={`px-4 py-2 font-arcade text-[10px] uppercase border-2 transition-colors ${
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
                  className={`px-4 py-2 font-arcade text-[10px] uppercase border-2 transition-colors ${
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

      {/* Regions List */}
      <div className="space-y-6">
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
    </div>
  );
}
