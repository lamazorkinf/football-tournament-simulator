import { useState } from 'react';
import type { Team, Region } from '../../types';
import { Search, X } from 'lucide-react';
import { TeamFlag } from '../ui/TeamFlag';

interface TeamSelectorProps {
  teams: Team[];
  selectedTeam: Team | null;
  onSelectTeam: (team: Team | null) => void;
  excludeTeamId?: string;
}

export function TeamSelector({
  teams,
  selectedTeam,
  onSelectTeam,
  excludeTeamId,
}: TeamSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<Region | 'all'>('all');

  // Filter teams
  const filteredTeams = teams.filter((team) => {
    if (excludeTeamId && team.id === excludeTeamId) return false;

    const matchesSearch = team.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRegion = selectedRegion === 'all' || team.region === selectedRegion;

    return matchesSearch && matchesRegion;
  });

  // Sort by skill descending
  const sortedTeams = [...filteredTeams].sort((a, b) => b.skill - a.skill);

  const regions: Array<Region | 'all'> = ['all', 'Europe', 'America', 'Africa', 'Asia', 'Oceania'];

  if (selectedTeam) {
    return (
      <div className="border-2 border-primary-500 rounded-lg p-4 bg-primary-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TeamFlag
              teamId={selectedTeam.id}
              teamName={selectedTeam.name}
              flagUrl={selectedTeam.flag}
              size={48}
            />
            <div>
              <h4 className="font-bold text-gray-900">{selectedTeam.name}</h4>
              <p className="text-sm text-gray-600">{selectedTeam.region}</p>
              <p className="text-xs text-primary-700 font-semibold mt-1">
                Skill: {selectedTeam.skill}
              </p>
            </div>
          </div>
          <button
            onClick={() => onSelectTeam(null)}
            className="p-2 hover:bg-primary-200 rounded-full transition-colors"
            title="Deseleccionar"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar equipo..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* Region Filter */}
      <div className="flex flex-wrap gap-2">
        {regions.map((region) => (
          <button
            key={region}
            onClick={() => setSelectedRegion(region)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              selectedRegion === region
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {region === 'all' ? 'Todas' : region}
          </button>
        ))}
      </div>

      {/* Team List */}
      <div className="border border-gray-300 rounded-lg max-h-96 overflow-y-auto">
        {sortedTeams.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {sortedTeams.map((team) => (
              <button
                key={team.id}
                onClick={() => onSelectTeam(team)}
                className="w-full p-3 hover:bg-gray-50 transition-colors text-left flex items-center gap-3"
              >
                <TeamFlag
                  teamId={team.id}
                  teamName={team.name}
                  flagUrl={team.flag}
                  size={32}
                />
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900 truncate">{team.name}</h4>
                  <p className="text-xs text-gray-600">{team.region}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-primary-700">{team.skill}</div>
                  <div className="text-xs text-gray-500">Skill</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <p>No se encontraron equipos</p>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500 text-center">
        {sortedTeams.length} {sortedTeams.length === 1 ? 'equipo disponible' : 'equipos disponibles'}
      </p>
    </div>
  );
}
