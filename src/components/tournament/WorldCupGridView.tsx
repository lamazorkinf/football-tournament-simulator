import type { WorldCupGroup, Team } from '../../types';
import { Card, CardContent } from '../ui/Card';
import { Trophy, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface WorldCupGridViewProps {
  groups: WorldCupGroup[];
  teams: Team[];
  onGroupClick: (groupId: string) => void;
}

export function WorldCupGridView({ groups, teams, onGroupClick }: WorldCupGridViewProps) {
  const getTeam = (teamId: string) => teams.find((t) => t.id === teamId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white rounded-lg p-6 shadow-lg">
        <div className="flex items-center gap-3">
          <Trophy className="w-8 h-8" />
          <div>
            <h2 className="text-2xl font-bold">World Cup Group Stage</h2>
            <p className="text-primary-100">
              {groups.length} groups • Top 2 from each group advance
            </p>
          </div>
        </div>
      </div>

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
                onClick={() => onGroupClick(group.id)}
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

                  {/* Standings Mini Table */}
                  <div className="space-y-2 mb-4">
                    {group.standings.slice(0, 4).map((standing, idx) => {
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
                            <span className="text-xl flex-shrink-0">{team?.flag}</span>
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
                </CardContent>
              </Card>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Legend */}
      <Card className="bg-gray-50">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-50 border border-green-200 rounded"></div>
              <span className="text-gray-700">Qualified for Knockout</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-50 border border-gray-200 rounded"></div>
              <span className="text-gray-700">Eliminated</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-green-600 text-xs font-semibold">
                ✓ Complete
              </div>
              <span className="text-gray-700">All matches played</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-primary-600">
              {groups.length}
            </div>
            <div className="text-sm text-gray-600 mt-1">Groups</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-primary-600">
              {groups.reduce((acc, g) => acc + g.teamIds.length, 0)}
            </div>
            <div className="text-sm text-gray-600 mt-1">Teams</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-green-600">
              {groups.filter((g) => g.matches.every((m) => m.isPlayed)).length}
            </div>
            <div className="text-sm text-gray-600 mt-1">Complete</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-orange-600">
              {groups.filter((g) => g.matches.some((m) => !m.isPlayed)).length}
            </div>
            <div className="text-sm text-gray-600 mt-1">In Progress</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
