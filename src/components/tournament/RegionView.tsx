import { useState } from 'react';
import type { Region, Group, Team } from '../../types';
import { Card, CardContent } from '../ui/Card';
import { ChevronRight, Globe2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { sortStandings } from '../../core/scheduler';
import { TeamFlag } from '../ui/TeamFlag';
import { GroupDetailModal } from './GroupDetailModal';
import { ViewHeader } from '../ui/ViewHeader';

interface RegionViewProps {
  region: Region;
  groups: Group[];
  teams: Team[];
  onSimulateMatch?: (matchId: string, groupId: string) => void;
}

export function RegionView({ region, groups, teams, onSimulateMatch }: RegionViewProps) {
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  const getTeam = (teamId: string) => teams.find((t) => t.id === teamId);

  // Sort groups by name
  const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      {/* Region Header */}
      <Card className="overflow-hidden mb-6">
        <ViewHeader
          icon={Globe2}
          title={region}
          subtitle={`${groups.length} ${groups.length === 1 ? 'grupo' : 'grupos'} • Top 2 clasifican`}
        />
      </Card>

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
                  className={`transition-all hover:scale-105 ${
                    isComplete ? 'border-led' : 'hover:border-gold'
                  }`}
                >
                  <CardContent className="pt-6">
                    {/* Group Header */}
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-arcade text-sm text-white text-shadow-retro">{group.name}</h3>
                      {isComplete && (
                        <div className="flex items-center gap-1 text-led text-sm font-semibold">
                          ✓ Complete
                        </div>
                      )}
                    </div>

                    {isDrawComplete ? (
                      <>
                        {/* Standings Mini Table */}
                        <div className="space-y-2 mb-4">
                          {sortStandings(group.standings, teams, group.matches).slice(0, 5).map((standing, idx) => {
                            const team = getTeam(standing.teamId);
                            const isQualified = idx < 2;

                            return (
                              <div
                                key={standing.teamId}
                                className={`flex items-center justify-between p-2 ${
                                  isQualified
                                    ? 'bg-grass/30'
                                    : 'bg-black/20'
                                }`}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span
                                    className={`font-arcade text-[10px] w-5 text-center ${
                                      isQualified ? 'text-led' : 'text-grass-soft'
                                    }`}
                                  >
                                    {idx + 1}
                                  </span>
                                  {team && (
                                    <TeamFlag
                                      teamId={team.id}
                                      teamName={team.name}
                                      size={24}
                                    />
                                  )}
                                  <span
                                    className={`text-sm font-medium truncate ${
                                      isQualified ? 'text-led' : 'text-grass-soft'
                                    }`}
                                  >
                                    {team?.name}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 ml-2">
                                  <span className="text-xs text-grass-soft">
                                    {standing.played}P
                                  </span>
                                  <span
                                    className={`font-terminal text-sm tabular-nums min-w-[28px] text-right ${
                                      isQualified ? 'text-led' : 'text-white'
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
                          <div className="flex items-center justify-between text-xs text-grass-soft">
                            <span>Progress</span>
                            <span>
                              {playedMatches}/{totalMatches}
                            </span>
                          </div>
                          <div className="w-full bg-black/40 h-2 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${progress}%` }}
                              transition={{ delay: idx * 0.05 + 0.2, duration: 0.5 }}
                              className={`h-2 ${
                                isComplete ? 'bg-led' : 'bg-gold'
                              }`}
                            />
                          </div>
                        </div>

                        {/* View Details Button */}
                        <div className="mt-4 pt-4 border-t-2 border-grass">
                          <button className="w-full flex items-center justify-between text-led hover:text-white font-medium text-sm transition-colors">
                            <span>View Details</span>
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-sm text-gold italic">
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
          liveKind="qualifier"
          onClose={() => setSelectedGroup(null)}
          onSimulate={onSimulateMatch ? (matchId) => {
            onSimulateMatch(matchId, selectedGroup.id);
          } : undefined}
        />
      )}
    </>
  );
}
