import { useState, useMemo } from 'react';
import type { Team, Region } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { TeamFlag } from '../ui/TeamFlag';
import { useTournamentStore } from '../../store/useTournamentStore';
import { teamsService } from '../../services/teamsService';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Search, Edit2, Save, X, Trash2, RefreshCw } from 'lucide-react';

const REGIONS: Region[] = [
  'Europe',
  'America',
  'Africa',
  'Asia',
];

export function TeamEditor() {
  const { teams, updateTeam, loadTeamsFromDatabase } = useTournamentStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<Region | 'All'>('All');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingTeam, setEditingTeam] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    skill: number;
    region: Region;
    flag: string;
  }>({ skill: 50, region: 'Europe', flag: '' });
  const filteredTeams = useMemo(() => {
    return teams.filter((team) => {
      const matchesSearch =
        team.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        team.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRegion = selectedRegion === 'All' || team.region === selectedRegion;
      return matchesSearch && matchesRegion;
    });
  }, [teams, searchTerm, selectedRegion]);

  const handleEdit = (team: Team) => {
    setEditingTeam(team.id);
    setEditForm({ skill: Math.round(team.skill), region: team.region, flag: team.flag });
  };

  const handleSave = (teamId: string) => {
    // Clampear el skill al rango válido: el input permite escribir cualquier
    // número y podía grabarse un skill fuera de [30, 100].
    const skill = Math.max(30, Math.min(100, Number.isFinite(editForm.skill) ? editForm.skill : 30));
    updateTeam(teamId, { ...editForm, skill });
    setEditingTeam(null);
  };

  const handleCancel = () => {
    setEditingTeam(null);
  };

  const handleDeleteTeam = async (teamId: string, teamName: string) => {
    if (
      !confirm(
        `Are you sure you want to delete ${teamName}? This will remove the team from all groups and cannot be undone.`
      )
    ) {
      return;
    }

    // Delete from Supabase first
    if (isSupabaseConfigured()) {
      try {
        await teamsService.deleteTeam(teamId);
      } catch (error) {
        console.error('Error deleting team from Supabase:', error);
        alert('Failed to delete team from database. Please try again.');
        return;
      }
    }

    // Refrescar la lista de equipos desde la base en vez de recargar la página
    // entera, que descartaba cualquier estado en memoria no persistido.
    try {
      await loadTeamsFromDatabase();
    } catch (error) {
      console.error('Error refreshing teams after delete:', error);
    }
  };

  const teamsByRegion = useMemo(() => {
    const grouped: Record<string, number> = {};
    teams.forEach((team) => {
      grouped[team.region] = (grouped[team.region] || 0) + 1;
    });
    return grouped;
  }, [teams]);

  const handleRefreshFromDatabase = async () => {
    setIsRefreshing(true);
    try {
      await loadTeamsFromDatabase();
      alert('Teams refreshed from database!');
    } catch (error) {
      alert('Error refreshing teams from database');
      console.error(error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="bg-grass text-white">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white">Team Editor</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleRefreshFromDatabase}
                disabled={isRefreshing}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh from DB'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-grass-soft w-5 h-5" />
            <input
              type="text"
              placeholder="Search teams..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-night border-2 border-grass text-white focus:outline-none focus:border-gold"
            />
          </div>

          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value as Region | 'All')}
            className="px-4 py-2 bg-night border-2 border-grass text-white focus:outline-none focus:border-gold"
          >
            <option value="All">All Regions ({teams.length})</option>
            {REGIONS.map((region) => (
              <option key={region} value={region}>
                {region} ({teamsByRegion[region] || 0})
              </option>
            ))}
          </select>
        </div>

        <div className="bg-night border-2 border-grass p-4 max-h-[500px] overflow-y-auto">
          <div className="space-y-2">
            {filteredTeams.length === 0 ? (
              <p className="text-center text-grass-soft py-8">No teams found</p>
            ) : (
              filteredTeams.map((team) => (
                <TeamRow
                  key={team.id}
                  team={team}
                  isEditing={editingTeam === team.id}
                  editForm={editForm}
                  onEdit={() => handleEdit(team)}
                  onSave={() => handleSave(team.id)}
                  onCancel={handleCancel}
                  onDelete={() => handleDeleteTeam(team.id, team.name)}
                  onFormChange={setEditForm}
                />
              ))
            )}
          </div>
        </div>

        <div className="text-sm bg-black/40 border-2 border-gold p-3">
          <p className="font-semibold text-gold mb-1">💡 Tips:</p>
          <ul className="space-y-1 text-grass-soft">
            <li>• Skill ratings range from 30 to 100</li>
            <li>• Moving teams between regions will affect group composition</li>
            <li>• Changes take effect immediately but won't affect completed matches</li>
          </ul>
        </div>
      </CardContent>
    </Card>

    </>
  );
}

interface TeamRowProps {
  team: Team;
  isEditing: boolean;
  editForm: { skill: number; region: Region; flag: string };
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onFormChange: (form: { skill: number; region: Region; flag: string }) => void;
}

function TeamRow({
  team,
  isEditing,
  editForm,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onFormChange,
}: TeamRowProps) {
  if (isEditing) {
    return (
      <div className="bg-grass-dark border-2 border-gold p-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <TeamFlag teamId={team.id} teamName={team.name} flagUrl={team.flag} size={48} />
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-white">{team.name}</span>
              <span className="text-xs text-grass-soft ml-2">({team.id})</span>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={onSave} className="gap-1">
                <Save className="w-4 h-4" />
                Save
              </Button>
              <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-grass-soft mb-1">Skill</label>
              <input
                type="number"
                min="30"
                max="100"
                value={editForm.skill}
                onChange={(e) => {
                  // No convertir 0/vacío en 30 al vuelo: se deja el valor crudo
                  // (0 si no es número) y el rango se valida al guardar.
                  const parsed = parseInt(e.target.value, 10);
                  onFormChange({ ...editForm, skill: Number.isNaN(parsed) ? 0 : parsed });
                }}
                className="w-full px-3 py-1 bg-night border-2 border-grass text-white focus:outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-xs text-grass-soft mb-1">Region</label>
              <select
                value={editForm.region}
                onChange={(e) =>
                  onFormChange({ ...editForm, region: e.target.value as Region })
                }
                className="w-full px-3 py-1 bg-night border-2 border-grass text-white focus:outline-none focus:border-gold"
              >
                {REGIONS.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-grass-soft mb-1">Flag URL</label>
              <input
                type="url"
                value={editForm.flag}
                onChange={(e) =>
                  onFormChange({ ...editForm, flag: e.target.value })
                }
                placeholder="https://example.com/flag.png"
                className="w-full px-3 py-1 bg-night border-2 border-grass text-white focus:outline-none focus:border-gold text-sm"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-grass-dark border-2 border-grass hover:border-gold p-4 transition-colors">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <TeamFlag teamId={team.id} teamName={team.name} flagUrl={team.flag} size={48} />
          <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-3 gap-1 md:gap-3">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="font-semibold text-white truncate">{team.name}</span>
              <span className="text-sm text-grass-soft md:hidden">{team.region}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-grass-soft">Skill:</span>
              <div className="flex items-center gap-2">
                <div className="w-20 bg-black/40 border border-grass h-2">
                  <div
                    className="bg-gold h-2"
                    style={{ width: `${team.skill}%` }}
                  />
                </div>
                <span className="font-semibold text-sm w-8 text-gold font-terminal tabular-nums">{Math.round(team.skill)}</span>
              </div>
            </div>
            <span className="text-sm text-grass-soft hidden md:block">{team.region}</span>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={onEdit} className="gap-2 flex-1 sm:flex-none">
            <Edit2 className="w-4 h-4" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="gap-2 text-loss border-loss hover:bg-loss/20"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

