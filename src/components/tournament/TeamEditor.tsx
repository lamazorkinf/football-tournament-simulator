import { useState, useMemo } from 'react';
import type { Team, Region } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { TeamFlag } from '../ui/TeamFlag';
import { useTournamentStore } from '../../store/useTournamentStore';
import { teamsService } from '../../services/teamsService';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Search, Edit2, Save, X, Plus, Trash2, RefreshCw } from 'lucide-react';
import { nanoid } from 'nanoid';

const REGIONS: Region[] = [
  'Europe',
  'America',
  'Africa',
  'Asia',
  'Oceania',
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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<{
    name: string;
    flag: string;
    region: Region;
    skill: number;
  }>({ name: '', flag: '', region: 'Europe', skill: 50 });

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
    setEditForm({ skill: team.skill, region: team.region, flag: team.flag });
  };

  const handleSave = (teamId: string) => {
    updateTeam(teamId, editForm);
    setEditingTeam(null);
  };

  const handleCancel = () => {
    setEditingTeam(null);
  };

  const handleCreateTeam = async () => {
    if (!createForm.name.trim() || !createForm.flag.trim()) {
      alert('Please fill in all fields');
      return;
    }

    const newTeam: Team = {
      id: nanoid(6),
      name: createForm.name.trim(),
      flag: createForm.flag.trim(),
      region: createForm.region,
      skill: createForm.skill,
    };

    // Add to local state
    updateTeam(newTeam.id, newTeam);

    // Add to Supabase
    if (isSupabaseConfigured()) {
      try {
        await teamsService.createTeam(newTeam);
      } catch (error) {
        console.error('Error creating team in Supabase:', error);
        alert('Team created locally but failed to sync with database');
      }
    }

    // Reset form and close modal
    setCreateForm({ name: '', flag: '', region: 'Europe', skill: 50 });
    setShowCreateModal(false);
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

    // Remove from local state by updating with empty values will trigger re-render
    // Actually we need a delete action in the store - for now we can filter
    window.location.reload(); // Temporary solution - should add deleteTeam action to store
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
        <CardHeader className="bg-primary-600 text-white rounded-t-lg">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white">Team Editor</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshFromDatabase}
                disabled={isRefreshing}
                className="bg-white text-primary-600 hover:bg-primary-50 border-white gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh from DB'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCreateModal(true)}
                className="bg-white text-primary-600 hover:bg-primary-50 border-white gap-2"
              >
                <Plus className="w-4 h-4" />
                Create Team
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search teams..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value as Region | 'All')}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="All">All Regions ({teams.length})</option>
            {REGIONS.map((region) => (
              <option key={region} value={region}>
                {region} ({teamsByRegion[region] || 0})
              </option>
            ))}
          </select>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 max-h-[500px] overflow-y-auto">
          <div className="space-y-2">
            {filteredTeams.length === 0 ? (
              <p className="text-center text-gray-500 py-8">No teams found</p>
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

        <div className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="font-semibold text-blue-900 mb-1">💡 Tips:</p>
          <ul className="space-y-1 text-blue-800">
            <li>• Skill ratings range from 30 to 100</li>
            <li>• Moving teams between regions will affect group composition</li>
            <li>• Changes take effect immediately but won't affect completed matches</li>
          </ul>
        </div>
      </CardContent>
    </Card>

    {/* Create Team Modal */}
    {showCreateModal && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <Card className="max-w-md w-full">
          <CardHeader className="bg-primary-600 text-white rounded-t-lg">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white">Create New Team</CardTitle>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-white hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Team Name *
              </label>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="e.g., New Zealand"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Flag Emoji *
              </label>
              <input
                type="text"
                value={createForm.flag}
                onChange={(e) => setCreateForm({ ...createForm, flag: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="e.g., 🇳🇿"
                maxLength={4}
              />
              <p className="text-xs text-gray-500 mt-1">
                Use a flag emoji or country code
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
              <select
                value={createForm.region}
                onChange={(e) =>
                  setCreateForm({ ...createForm, region: e.target.value as Region })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {REGIONS.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Skill Rating (30-100)
              </label>
              <input
                type="number"
                min="30"
                max="100"
                value={createForm.skill}
                onChange={(e) =>
                  setCreateForm({ ...createForm, skill: parseInt(e.target.value) || 30 })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="primary"
                onClick={handleCreateTeam}
                className="flex-1 gap-2"
              >
                <Plus className="w-4 h-4" />
                Create Team
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowCreateModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )}
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
      <div className="bg-white border-2 border-primary-500 rounded-lg p-4">
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <TeamFlag teamId={team.id} teamName={team.name} flagUrl={team.flag} size={48} />
            <div className="flex-1">
              <span className="font-semibold text-gray-900">{team.name}</span>
              <span className="text-xs text-gray-500 ml-2">({team.id})</span>
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
              <label className="block text-xs text-gray-600 mb-1">Skill</label>
              <input
                type="number"
                min="30"
                max="100"
                value={editForm.skill}
                onChange={(e) =>
                  onFormChange({ ...editForm, skill: parseInt(e.target.value) || 30 })
                }
                className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Region</label>
              <select
                value={editForm.region}
                onChange={(e) =>
                  onFormChange({ ...editForm, region: e.target.value as Region })
                }
                className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
              >
                {REGIONS.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Flag URL</label>
              <input
                type="url"
                value={editForm.flag}
                onChange={(e) =>
                  onFormChange({ ...editForm, flag: e.target.value })
                }
                placeholder="https://example.com/flag.png"
                className="w-full px-3 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:border-primary-300 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          <TeamFlag teamId={team.id} teamName={team.name} flagUrl={team.flag} size={48} />
          <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
            <span className="font-semibold text-gray-900">{team.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Skill:</span>
              <div className="flex items-center gap-2">
                <div className="w-20 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full"
                    style={{ width: `${team.skill}%` }}
                  />
                </div>
                <span className="font-semibold text-sm w-8">{team.skill}</span>
              </div>
            </div>
            <span className="text-sm text-gray-600">{team.region}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit} className="gap-2">
            <Edit2 className="w-4 h-4" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="gap-2 text-red-600 border-red-300 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

