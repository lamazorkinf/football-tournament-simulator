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

  // Normaliza para búsqueda insensible a acentos: sin esto, "curacao" o
  // "sao tome" no encontraban a Curaçao ni a São Tomé.
  const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const normalizedQuery = normalize(searchQuery);

  // Filter teams
  const filteredTeams = teams.filter((team) => {
    if (excludeTeamId && team.id === excludeTeamId) return false;

    const matchesSearch = normalize(team.name).includes(normalizedQuery);
    const matchesRegion = selectedRegion === 'all' || team.region === selectedRegion;

    return matchesSearch && matchesRegion;
  });

  // Sort by skill descending
  const sortedTeams = [...filteredTeams].sort((a, b) => b.skill - a.skill);

  const regions: Array<Region | 'all'> = ['all', 'Europe', 'America', 'Africa', 'Asia'];

  if (selectedTeam) {
    return (
      <div className="border-2 border-gold bg-black/40 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TeamFlag
              teamId={selectedTeam.id}
              teamName={selectedTeam.name}
              size={48}
            />
            <div>
              <h4 className="font-bold text-white">{selectedTeam.name}</h4>
              <p className="text-sm text-grass-soft">{selectedTeam.region}</p>
              <p className="text-xs text-gold font-semibold mt-1">
                Skill: {Math.round(selectedTeam.skill)}
              </p>
            </div>
          </div>
          <button
            onClick={() => onSelectTeam(null)}
            className="p-2 text-grass-soft hover:bg-grass/40 transition-colors"
            title="Deseleccionar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-grass-soft" />
        <input
          type="text"
          placeholder="Buscar equipo..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-night border-2 border-grass text-white placeholder:text-grass-soft focus:outline-none focus:border-gold"
        />
      </div>

      {/* Region Filter */}
      <div className="flex flex-wrap gap-2">
        {regions.map((region) => (
          <button
            key={region}
            onClick={() => setSelectedRegion(region)}
            className={`px-3 py-1 text-xs font-medium border-2 transition-colors ${
              selectedRegion === region
                ? 'bg-gold text-night border-gold'
                : 'bg-black/40 text-grass-soft border-grass hover:bg-grass/40'
            }`}
          >
            {region === 'all' ? 'Todas' : region}
          </button>
        ))}
      </div>

      {/* Team List */}
      <div className="border-2 border-grass max-h-96 overflow-y-auto bg-night">
        {sortedTeams.length > 0 ? (
          <div className="divide-y-2 divide-grass">
            {sortedTeams.map((team) => (
              <button
                key={team.id}
                onClick={() => onSelectTeam(team)}
                className="w-full p-3 hover:bg-grass/40 transition-colors text-left flex items-center gap-3"
              >
                <TeamFlag
                  teamId={team.id}
                  teamName={team.name}
                  size={32}
                />
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-white truncate">{team.name}</h4>
                  <p className="text-xs text-grass-soft">{team.region}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-gold font-terminal tabular-nums">{Math.round(team.skill)}</div>
                  <div className="text-xs text-grass-soft">Skill</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-grass-soft">
            <p>No se encontraron equipos</p>
          </div>
        )}
      </div>

      <p className="text-xs text-grass-soft text-center">
        {sortedTeams.length} {sortedTeams.length === 1 ? 'equipo disponible' : 'equipos disponibles'}
      </p>
    </div>
  );
}
