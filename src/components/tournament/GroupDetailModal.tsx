import { motion, AnimatePresence } from 'framer-motion';
import { X, Users } from 'lucide-react';
import type { Group, Team } from '../../types';
import { StandingsTable } from '../ui/StandingsTable';
import { Button } from '../ui/Button';
import { TeamFlag } from '../ui/TeamFlag';

interface GroupDetailModalProps {
  group: Group;
  teams: Team[];
  region: string;
  onClose: () => void;
  onSimulate?: (matchId: string) => void;
}

export function GroupDetailModal({
  group,
  teams,
  region,
  onClose,
  onSimulate,
}: GroupDetailModalProps) {
  // Group matches by matchday
  const matchesByMatchday = group.matches.reduce((acc, match) => {
    const matchday = match.matchday || 1;
    if (!acc[matchday]) {
      acc[matchday] = [];
    }
    acc[matchday].push(match);
    return acc;
  }, {} as Record<number, typeof group.matches>);

  const matchdays = Object.keys(matchesByMatchday)
    .map(Number)
    .sort((a, b) => a - b);

  const getTeam = (teamId: string) => teams.find((t) => t.id === teamId);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-lg shadow-xl w-full max-w-4xl my-8"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white p-6 rounded-t-lg relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6" />
              <div>
                <h2 className="text-2xl font-bold">{group.name}</h2>
                <p className="text-primary-100 text-sm mt-1">{region}</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Standings Table */}
            <div>
              <h3 className="font-semibold text-lg text-gray-900 mb-3">Tabla de Posiciones</h3>
              <div className="overflow-x-auto">
                <StandingsTable
                  standings={group.standings}
                  teams={teams}
                  highlightQualified={2}
                />
              </div>
            </div>

            {/* Matches by Matchday */}
            <div>
              <h3 className="font-semibold text-lg text-gray-900 mb-3">Partidos</h3>
              <div className="space-y-4">
                {matchdays.map((matchday) => (
                  <div key={matchday} className="space-y-2">
                    <h4 className="text-sm font-medium text-gray-700 bg-gray-100 px-3 py-1 rounded">
                      Jornada {matchday}
                    </h4>
                    <div className="space-y-2">
                      {matchesByMatchday[matchday].map((match) => {
                        const homeTeam = getTeam(match.homeTeamId);
                        const awayTeam = getTeam(match.awayTeamId);

                        if (!homeTeam || !awayTeam) return null;

                        const homeWon = match.isPlayed && match.homeScore! > match.awayScore!;
                        const awayWon = match.isPlayed && match.awayScore! > match.homeScore!;

                        return (
                          <div
                            key={match.id}
                            className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3 hover:shadow-sm transition-shadow"
                          >
                            {/* Home Team */}
                            <div className={`flex items-center gap-2 flex-1 ${homeWon ? 'font-semibold' : ''}`}>
                              <TeamFlag
                                teamId={homeTeam.id}
                                teamName={homeTeam.name}
                                flagUrl={homeTeam.flag}
                                size={24}
                              />
                              <span className="text-sm truncate">{homeTeam.name}</span>
                            </div>

                            {/* Score */}
                            <div className="flex items-center gap-3 px-4">
                              {match.isPlayed ? (
                                <>
                                  <span className={`text-lg font-bold ${homeWon ? 'text-green-600' : 'text-gray-700'}`}>
                                    {match.homeScore}
                                  </span>
                                  <span className="text-gray-400">-</span>
                                  <span className={`text-lg font-bold ${awayWon ? 'text-green-600' : 'text-gray-700'}`}>
                                    {match.awayScore}
                                  </span>
                                </>
                              ) : (
                                <span className="text-sm text-gray-400">vs</span>
                              )}
                            </div>

                            {/* Away Team */}
                            <div className={`flex items-center gap-2 flex-1 justify-end ${awayWon ? 'font-semibold' : ''}`}>
                              <span className="text-sm truncate text-right">{awayTeam.name}</span>
                              <TeamFlag
                                teamId={awayTeam.id}
                                teamName={awayTeam.name}
                                flagUrl={awayTeam.flag}
                                size={24}
                              />
                            </div>

                            {/* Simulate Button */}
                            {!match.isPlayed && onSimulate && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSimulate(match.id);
                                }}
                                className="ml-3 shrink-0"
                              >
                                Simular
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
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
