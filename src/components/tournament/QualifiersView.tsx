import { useState, useEffect } from 'react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { RegionView } from './RegionView';
import { GroupView } from './GroupView';
import type { Region, Group } from '../../types';
import { Globe2, Filter } from 'lucide-react';

interface QualifiersViewProps {
  initialRegion?: string;
  initialGroupId?: string;
}

export function QualifiersView({ initialRegion, initialGroupId }: QualifiersViewProps = {}) {
  const { teams, currentTournament } = useTournamentStore();
  const [selectedRegion, setSelectedRegion] = useState<Region | 'all'>(
    (initialRegion as Region) || 'all'
  );
  const [selectedGroup, setSelectedGroup] = useState<{
    group: Group;
    region: Region;
  } | null>(null);

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
        <p className="text-gray-600">No tournament available</p>
      </div>
    );
  }

  const regions: Region[] = ['Europe', 'America', 'Africa', 'Asia', 'Oceania'];

  const handleGroupClick = (groupId: string, region: Region) => {
    const groups = currentTournament.qualifiers[region] || [];
    const group = groups.find((g) => g.id === groupId);
    if (group) {
      setSelectedGroup({ group, region });
    }
  };

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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe2 className="w-8 h-8" />
              <div>
                <h2 className="text-2xl font-bold">Clasificatorias</h2>
                <p className="text-blue-100 text-sm mt-1">
                  {currentTournament.name}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Region Filter */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3 mb-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <span className="font-medium text-gray-700">Filtrar por región</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedRegion('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedRegion === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    selectedRegion === region
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {region}
                  {stats && stats.progress > 0 && (
                    <span className="ml-2 text-xs opacity-75">
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
          <div className="p-6 bg-gray-50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-600">Grupos</div>
                <div className="text-2xl font-bold text-gray-900">
                  {selectedStats.groups}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Grupos completados</div>
                <div className="text-2xl font-bold text-gray-900">
                  {selectedStats.completedGroups}/{selectedStats.groups}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Partidos jugados</div>
                <div className="text-2xl font-bold text-gray-900">
                  {selectedStats.playedMatches}/{selectedStats.totalMatches}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Progreso</div>
                <div className="text-2xl font-bold text-blue-600">
                  {selectedStats.progress}%
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Regions List */}
      <div className="space-y-6">
        {filteredRegions.map((region) => {
          const groups = currentTournament.qualifiers[region] || [];
          return (
            <RegionView
              key={region}
              region={region}
              groups={groups}
              onGroupClick={(groupId) => handleGroupClick(groupId, region)}
            />
          );
        })}
      </div>
    </div>
  );
}
