import { useState } from 'react';
import type { WorldCupGroup, Team, Group } from '../../types';
import { Card, CardContent } from '../ui/Card';
import { Trophy, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { sortStandings } from '../../core/scheduler';
import { TeamFlag } from '../ui/TeamFlag';
import { GroupDetailModal } from './GroupDetailModal';

interface WorldCupGridViewProps {
  groups: WorldCupGroup[];
  teams: Team[];
  onSimulateMatch?: (matchId: string, groupId: string) => void;
}

export function WorldCupGridView({ groups, teams, onSimulateMatch }: WorldCupGridViewProps) {
  const [selectedGroup, setSelectedGroup] = useState<WorldCupGroup | null>(null);
  const getTeam = (teamId: string) => teams.find((t) => t.id === teamId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <Trophy className="w-8 h-8 text-gold" />
          <div>
            <h2 className="font-arcade text-lg text-white text-shadow-retro">World Cup Group Stage</h2>
            <p className="text-grass-soft">
              {groups.length} groups • Top 2 from each group advance
            </p>
          </div>
        </div>
      </Card>

      {/* Grid of Groups */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {groups.map((group, idx) => {
          const totalMatches = group.matches.length;
          const playedMatches = group.matches.filter((m) => m.isPlayed).length;
          const progress = totalMatches > 0 ? (playedMatches / totalMatches) * 100 : 0;
          const isComplete = playedMatches === totalMatches;

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
                  className={`transition-colors ${
                    isComplete ? 'border-led' : 'hover:border-gold'
                  }`}
                >
                <CardContent className="pt-6">
                  {/* Group Header */}
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-arcade text-xs text-white text-shadow-retro uppercase">{group.name}</h3>
                    {isComplete && (
                      <div className="flex items-center gap-1 text-led font-arcade text-[10px] uppercase">
                        ✓ Complete
                      </div>
                    )}
                  </div>

                  {/* Standings Mini Table */}
                  <div className="space-y-2 mb-4">
                    {sortStandings(group.standings, teams, group.matches).slice(0, 4).map((standing, idx) => {
                      const team = getTeam(standing.teamId);
                      const isQualified = idx < 2;

                      return (
                        <div
                          key={standing.teamId}
                          className={`flex items-center justify-between p-2 border ${
                            isQualified
                              ? 'bg-grass/30 border-grass'
                              : 'bg-transparent border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span
                              className={`text-xs tabular-nums w-5 text-center ${
                                isQualified ? 'text-led' : 'text-grass-soft'
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
                            <span className="text-sm truncate text-white">
                              {team?.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 ml-2">
                            <span className="text-xs text-grass-soft">
                              {standing.played}P
                            </span>
                            <span className="text-sm font-terminal text-led tabular-nums min-w-[28px] text-right">
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
                      <span className="font-terminal text-led tabular-nums">
                        {playedMatches}/{totalMatches}
                      </span>
                    </div>
                    <div className="w-full bg-night border-2 border-grass h-2 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ delay: idx * 0.05 + 0.2, duration: 0.5 }}
                        className={`h-full ${
                          isComplete ? 'bg-led' : 'bg-grass'
                        }`}
                      />
                    </div>
                  </div>

                  {/* View Details Button */}
                  <div className="mt-4 pt-4 border-t-4 border-grass">
                    <button className="w-full flex items-center justify-between font-arcade text-[10px] uppercase text-gold hover:text-white transition-colors">
                      <span>View Details</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Legend */}
      <Card className="bg-night">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-grass/30 border-2 border-grass"></div>
              <span className="text-grass-soft">Qualified for Knockout</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-night border-2 border-grass"></div>
              <span className="text-grass-soft">Eliminated</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-led font-arcade text-[10px] uppercase">
                ✓ Complete
              </div>
              <span className="text-grass-soft">All matches played</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-terminal text-led tabular-nums">
              {groups.length}
            </div>
            <div className="text-sm text-grass-soft mt-1">Groups</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-terminal text-led tabular-nums">
              {groups.reduce((acc, g) => acc + g.teamIds.length, 0)}
            </div>
            <div className="text-sm text-grass-soft mt-1">Teams</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-terminal text-led tabular-nums">
              {groups.filter((g) => g.matches.every((m) => m.isPlayed)).length}
            </div>
            <div className="text-sm text-grass-soft mt-1">Complete</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-terminal text-gold tabular-nums">
              {groups.filter((g) => g.matches.some((m) => !m.isPlayed)).length}
            </div>
            <div className="text-sm text-grass-soft mt-1">In Progress</div>
          </CardContent>
        </Card>
      </div>

      {/* Group Detail Modal */}
      {selectedGroup && (
        <GroupDetailModal
          group={selectedGroup as Group}
          teams={teams}
          region="Copa del Mundo"
          liveKind="world-cup"
          onClose={() => setSelectedGroup(null)}
          onSimulate={onSimulateMatch ? (matchId) => {
            onSimulateMatch(matchId, selectedGroup.id);
          } : undefined}
        />
      )}
    </div>
  );
}
