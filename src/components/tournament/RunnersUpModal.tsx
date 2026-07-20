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
      <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/80 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="bg-grass-dark border-4 border-line shadow-hard-panel w-full max-w-6xl my-8"
        >
          {/* Header */}
          <div className="border-b-4 border-grass p-6 relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1 text-grass-soft hover:bg-grass/40 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <Trophy className="w-6 h-6 text-gold" />
              <div>
                <h2 className="font-arcade text-xs text-gold uppercase">
                  Clasificación de Segundos Lugares
                </h2>
                <p className="text-grass-soft text-sm mt-1">
                  Los mejores 22 segundos lugares clasifican al Mundial
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Stats Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-black/40 border-2 border-line p-4">
                <div className="text-sm text-led font-medium">Clasificados</div>
                <div className="text-3xl font-terminal text-led tabular-nums mt-1">
                  {Math.min(sortedRunnersUp.length, qualifiedCount)}
                </div>
              </div>
              <div className="bg-black/40 border-2 border-loss p-4">
                <div className="text-sm text-loss font-medium">Eliminados</div>
                <div className="text-3xl font-terminal text-loss tabular-nums mt-1">
                  {Math.max(0, sortedRunnersUp.length - qualifiedCount)}
                </div>
              </div>
              <div className="bg-black/40 border-2 border-grass p-4">
                <div className="text-sm text-grass-soft font-medium">Total Segundos</div>
                <div className="text-3xl font-terminal text-white tabular-nums mt-1">
                  {sortedRunnersUp.length}
                </div>
              </div>
              <div className="bg-black/40 border-2 border-gold p-4">
                <div className="text-sm text-gold font-medium">Cupos</div>
                <div className="text-3xl font-terminal text-gold tabular-nums mt-1">
                  {qualifiedCount}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-grass">
                    <th className="text-left py-3 px-2 font-arcade text-[10px] text-gold uppercase">
                      Pos
                    </th>
                    <th className="text-left py-3 px-2 font-arcade text-[10px] text-gold uppercase">
                      Estado
                    </th>
                    <th className="text-left py-3 px-4 font-arcade text-[10px] text-gold uppercase">
                      Equipo
                    </th>
                    <th className="text-left py-3 px-2 font-arcade text-[10px] text-gold uppercase">
                      Región
                    </th>
                    <th className="text-left py-3 px-2 font-arcade text-[10px] text-gold uppercase">
                      Grupo
                    </th>
                    <th className="text-center py-3 px-2 font-arcade text-[10px] text-gold uppercase">
                      PJ
                    </th>
                    <th className="text-center py-3 px-2 font-arcade text-[10px] text-gold uppercase">
                      PG
                    </th>
                    <th className="text-center py-3 px-2 font-arcade text-[10px] text-gold uppercase">
                      PE
                    </th>
                    <th className="text-center py-3 px-2 font-arcade text-[10px] text-gold uppercase">
                      PP
                    </th>
                    <th className="text-center py-3 px-2 font-arcade text-[10px] text-gold uppercase">
                      GF
                    </th>
                    <th className="text-center py-3 px-2 font-arcade text-[10px] text-gold uppercase">
                      GC
                    </th>
                    <th className="text-center py-3 px-2 font-arcade text-[10px] text-gold uppercase">
                      DG
                    </th>
                    <th className="text-center py-3 px-2 font-arcade text-[10px] text-gold uppercase">
                      Pts
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-grass">
                  {sortedRunnersUp.map((entry, index) => {
                    const isQualified = index < qualifiedCount;
                    const isCutoffLine = index === qualifiedCount - 1;

                    return (
                      <motion.tr
                        key={entry.teamId}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className={`hover:bg-grass/40 transition-colors ${
                          isCutoffLine ? 'border-b-2 border-gold' : ''
                        } ${
                          isQualified ? 'bg-led/10' : 'bg-loss/10'
                        }`}
                      >
                        <td className="py-3 px-2">
                          <span
                            className={`text-sm font-bold ${
                              isQualified ? 'text-led' : 'text-loss'
                            }`}
                          >
                            {index + 1}
                          </span>
                        </td>
                        <td className="py-3 px-2">
                          {isQualified ? (
                            <CheckCircle className="w-5 h-5 text-led" />
                          ) : (
                            <XCircle className="w-5 h-5 text-loss" />
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
                            <span className="text-white truncate">
                              {entry.team.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-2">
                          <span className="text-sm text-grass-soft">{entry.region}</span>
                        </td>
                        <td className="py-3 px-2">
                          <span className="text-sm text-grass-soft">{entry.groupName}</span>
                        </td>
                        <td className="text-center py-3 px-2 text-sm text-grass-soft tabular-nums">
                          {entry.played}
                        </td>
                        <td className="text-center py-3 px-2 text-sm text-grass-soft tabular-nums">
                          {entry.won}
                        </td>
                        <td className="text-center py-3 px-2 text-sm text-grass-soft tabular-nums">
                          {entry.drawn}
                        </td>
                        <td className="text-center py-3 px-2 text-sm text-grass-soft tabular-nums">
                          {entry.lost}
                        </td>
                        <td className="text-center py-3 px-2 text-sm text-grass-soft tabular-nums">
                          {entry.goalsFor}
                        </td>
                        <td className="text-center py-3 px-2 text-sm text-grass-soft tabular-nums">
                          {entry.goalsAgainst}
                        </td>
                        <td className="text-center py-3 px-2">
                          <span
                            className={`text-sm font-medium tabular-nums ${
                              entry.goalDifference > 0
                                ? 'text-led'
                                : entry.goalDifference < 0
                                ? 'text-loss'
                                : 'text-grass-soft'
                            }`}
                          >
                            {entry.goalDifference > 0 ? '+' : ''}
                            {entry.goalDifference}
                          </span>
                        </td>
                        <td className="text-center py-3 px-2">
                          <span
                            className={`text-sm font-bold tabular-nums ${
                              isQualified ? 'text-led' : 'text-loss'
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
            <div className="mt-6 p-4 bg-night border-2 border-grass">
              <h4 className="font-arcade text-[10px] text-gold uppercase mb-3">Leyenda</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-led" />
                  <span className="text-grass-soft">Clasificado al Mundial</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-loss" />
                  <span className="text-grass-soft">Eliminado</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-1 bg-gold"></div>
                  <span className="text-grass-soft">Línea de corte (Top 22)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-terminal text-grass-soft">
                    PJ=Jugados, PG=Ganados, PE=Empatados, PP=Perdidos
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t-4 border-grass">
            <Button variant="outline" onClick={onClose} className="w-full">
              Cerrar
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
