import { motion, AnimatePresence } from 'framer-motion';
import { X, Trophy, CheckCircle, XCircle } from 'lucide-react';
import type { Team, Group, Region } from '../../types';
import { Button } from '../ui/Button';
import { TeamFlag } from '../ui/TeamFlag';
import { sortStandings } from '../../core/scheduler';

interface RunnersUpModalProps {
  qualifiers: {
    [key in Region]: Group[];
  };
  teams: Team[];
  onClose: () => void;
}

interface RunnerUpEntry {
  teamId: string;
  team: Team;
  region: Region;
  groupName: string;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export function RunnersUpModal({ qualifiers, teams, onClose }: RunnersUpModalProps) {
  // Get all second-place teams from each group
  const runnersUp: RunnerUpEntry[] = [];

  const regions: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

  regions.forEach((region) => {
    const groups = qualifiers[region] || [];
    groups.forEach((group) => {
      const sortedStandings = sortStandings(group.standings, teams);
      if (sortedStandings.length >= 2) {
        const secondPlace = sortedStandings[1];
        const team = teams.find((t) => t.id === secondPlace.teamId);
        if (team) {
          runnersUp.push({
            teamId: secondPlace.teamId,
            team,
            region,
            groupName: group.name,
            points: secondPlace.points,
            played: secondPlace.played,
            won: secondPlace.won,
            drawn: secondPlace.drawn,
            lost: secondPlace.lost,
            goalsFor: secondPlace.goalsFor,
            goalsAgainst: secondPlace.goalsAgainst,
            goalDifference: secondPlace.goalDifference,
          });
        }
      }
    });
  });

  // Sort runners-up by points, then goal difference, then goals scored
  const sortedRunnersUp = runnersUp.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    return b.goalsFor - a.goalsFor;
  });

  const qualifiedCount = 22;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-lg shadow-xl w-full max-w-6xl my-8"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-600 to-orange-700 text-white p-6 rounded-t-lg relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <Trophy className="w-6 h-6" />
              <div>
                <h2 className="text-2xl font-bold">Clasificación de Segundos Lugares</h2>
                <p className="text-orange-100 text-sm mt-1">
                  Los mejores 22 segundos lugares clasifican al Mundial
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Stats Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="text-sm text-green-700 font-medium">Clasificados</div>
                <div className="text-3xl font-bold text-green-700 mt-1">
                  {Math.min(sortedRunnersUp.length, qualifiedCount)}
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-sm text-red-700 font-medium">Eliminados</div>
                <div className="text-3xl font-bold text-red-700 mt-1">
                  {Math.max(0, sortedRunnersUp.length - qualifiedCount)}
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-sm text-blue-700 font-medium">Total Segundos</div>
                <div className="text-3xl font-bold text-blue-700 mt-1">
                  {sortedRunnersUp.length}
                </div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="text-sm text-purple-700 font-medium">Cupos</div>
                <div className="text-3xl font-bold text-purple-700 mt-1">
                  {qualifiedCount}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-300">
                    <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">
                      Pos
                    </th>
                    <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">
                      Estado
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">
                      Equipo
                    </th>
                    <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">
                      Región
                    </th>
                    <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">
                      Grupo
                    </th>
                    <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">
                      PJ
                    </th>
                    <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">
                      PG
                    </th>
                    <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">
                      PE
                    </th>
                    <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">
                      PP
                    </th>
                    <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">
                      GF
                    </th>
                    <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">
                      GC
                    </th>
                    <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">
                      DG
                    </th>
                    <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">
                      Pts
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRunnersUp.map((entry, index) => {
                    const isQualified = index < qualifiedCount;
                    const isCutoffLine = index === qualifiedCount - 1;

                    return (
                      <motion.tr
                        key={entry.teamId}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${
                          isCutoffLine ? 'border-b-2 border-orange-500' : ''
                        } ${
                          isQualified
                            ? 'bg-green-50/50'
                            : 'bg-red-50/30'
                        }`}
                      >
                        <td className="py-3 px-2">
                          <span
                            className={`text-sm font-bold ${
                              isQualified ? 'text-green-700' : 'text-red-600'
                            }`}
                          >
                            {index + 1}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          {isQualified ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-600" />
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <TeamFlag
                              teamId={entry.team.id}
                              teamName={entry.team.name}
                              flagUrl={entry.team.flag}
                              size={24}
                            />
                            <span className="font-medium text-gray-900 truncate">
                              {entry.team.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <span className="text-sm text-gray-600">{entry.region}</span>
                        </td>
                        <td className="py-3 px-2">
                          <span className="text-sm text-gray-600">{entry.groupName}</span>
                        </td>
                        <td className="text-center py-3 px-2 text-sm text-gray-700">
                          {entry.played}
                        </td>
                        <td className="text-center py-3 px-2 text-sm text-gray-700">
                          {entry.won}
                        </td>
                        <td className="text-center py-3 px-2 text-sm text-gray-700">
                          {entry.drawn}
                        </td>
                        <td className="text-center py-3 px-2 text-sm text-gray-700">
                          {entry.lost}
                        </td>
                        <td className="text-center py-3 px-2 text-sm text-gray-700">
                          {entry.goalsFor}
                        </td>
                        <td className="text-center py-3 px-2 text-sm text-gray-700">
                          {entry.goalsAgainst}
                        </td>
                        <td className="text-center py-3 px-2">
                          <span
                            className={`text-sm font-medium ${
                              entry.goalDifference > 0
                                ? 'text-green-600'
                                : entry.goalDifference < 0
                                ? 'text-red-600'
                                : 'text-gray-700'
                            }`}
                          >
                            {entry.goalDifference > 0 ? '+' : ''}
                            {entry.goalDifference}
                          </span>
                        </td>
                        <td className="text-center py-3 px-2">
                          <span
                            className={`text-sm font-bold ${
                              isQualified ? 'text-green-700' : 'text-red-700'
                            }`}
                          >
                            {entry.points}
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Leyenda</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="text-gray-700">Clasificado al Mundial</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <span className="text-gray-700">Eliminado</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 bg-orange-500"></div>
                  <span className="text-gray-700">Línea de corte (Top 22)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-600">
                    PJ=Jugados, PG=Ganados, PE=Empatados, PP=Perdidos
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <Button variant="outline" onClick={onClose} className="w-full">
              Cerrar
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
