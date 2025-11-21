import { useState } from 'react';
import type { Region, Group, Team } from '../../types';
import { Card, CardContent } from '../ui/Card';
import { ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { sortStandings } from '../../core/scheduler';
import { TeamFlag } from '../ui/TeamFlag';
import { GroupDetailModal } from './GroupDetailModal';

interface RegionViewProps {
  region: Region;
  groups: Group[];
  teams: Team[];
  onSimulateMatch?: (matchId: string, groupId: string) => void;
}

export function RegionView({ region, groups, teams, onSimulateMatch }: RegionViewProps) {
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  const getRegionIcon = (region: Region) => {
    const icons: Record<Region, string> = {
      Europe: '🇪🇺',
      America: '🌎',
      Africa: '🌍',
      Asia: '🌏',
    };
    return icons[region];
  };

  const getTeam = (teamId: string) => teams.find((t) => t.id === teamId);

  // Sort groups by name
  const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      {/* Region Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg p-6 shadow-lg mb-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{getRegionIcon(region)}</span>
          <div>
            <h2 className="text-2xl font-bold">{region}</h2>
            <p className="text-primary-100">
              {groups.length} {groups.length === 1 ? 'grupo' : 'grupos'} • Top 2 clasifican
            </p>
          </div>
        </div>
      </div>

      {/* Grid of Groups */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-6">
        {sortedGroups.map((group, idx) => {
          const totalMatches = group.matches.length;
          const playedMatches = group.matches.filter((m) => m.isPlayed).length;
          const progress = totalMatches > 0 ? (playedMatches / totalMatches) * 100 : 0;
          const isComplete = playedMatches === totalMatches;
          const isDrawComplete = group.isDrawComplete && group.teamIds.length > 0;

          return (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
            >
              <div
                className="cursor-pointer"
                onClick={() => setSelectedGroup(group)}
              >
                <Card
                  className={`transition-all hover:shadow-xl hover:scale-105 ${
                    isComplete ? 'border-2 border-green-500' : 'hover:border-primary-400'
                  }`}
                >
                  <CardContent className="pt-6">
                    {/* Group Header */}
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold text-gray-900">{group.name}</h3>
                      {isComplete && (
                        <div className="flex items-center gap-1 text-green-600 text-sm font-semibold">
                          ✓ Complete
                        </div>
                      )}
                    </div>

                    {isDrawComplete ? (
                      <>
                        {/* Standings Mini Table */}
                        <div className="space-y-2 mb-4">
                          {sortStandings(group.standings, teams).slice(0, 5).map((standing, idx) => {
                            const team = getTeam(standing.teamId);
                            const isQualified = idx < 2;

                            return (
                              <div
                                key={standing.teamId}
                                className={`flex items-center justify-between p-2 rounded ${
                                  isQualified
                                    ? 'bg-green-50 border border-green-200'
                                    : 'bg-gray-50'
                                }`}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span
                                    className={`text-xs font-bold w-5 text-center ${
                                      isQualified ? 'text-green-700' : 'text-gray-500'
                                    }`}
                                  >
                                    {idx + 1}
                                  </span>
                                  {team && (
                                    <TeamFlag
                                      teamId={team.id}
                                      teamName={team.name}
                                      flagUrl={team.flag}
                                      size={24}
                                    />
                                  )}
                                  <span
                                    className={`text-sm font-medium truncate ${
                                      isQualified ? 'text-green-900' : 'text-gray-700'
                                    }`}
                                  >
                                    {team?.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 ml-2">
                                  <span className="text-xs text-gray-500">
                                    {standing.played}P
                                  </span>
                                  <span
                                    className={`text-sm font-bold min-w-[28px] text-right ${
                                      isQualified ? 'text-green-700' : 'text-gray-900'
                                    }`}
                                  >
                                    {standing.points}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-xs text-gray-600">
                            <span>Progress</span>
                            <span>
                              {playedMatches}/{totalMatches}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${progress}%` }}
                              transition={{ delay: idx * 0.05 + 0.2, duration: 0.5 }}
                              className={`h-2 rounded-full ${
                                isComplete ? 'bg-green-600' : 'bg-primary-600'
                              }`}
                            />
                          </div>
                        </div>

                        {/* View Details Button */}
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <button className="w-full flex items-center justify-between text-primary-600 hover:text-primary-700 font-medium text-sm transition-colors">
                            <span>View Details</span>
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-sm text-amber-600 italic">
                          Awaiting draw...
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Group Detail Modal */}
      {selectedGroup && (
        <GroupDetailModal
          group={selectedGroup}
          teams={teams}
          region={region}
          onClose={() => setSelectedGroup(null)}
          onSimulate={onSimulateMatch ? (matchId) => {
            onSimulateMatch(matchId, selectedGroup.id);
          } : undefined}
        />
      )}
    </>
  );
}
