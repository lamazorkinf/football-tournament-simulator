import { motion, AnimatePresence } from 'framer-motion';
import { X, Users } from 'lucide-react';
import type { Group, Team } from '../../types';
import { StandingsTable } from '../ui/StandingsTable';
import { Button } from '../ui/Button';
import { TeamFlag } from '../ui/TeamFlag';
import { ScoreBug } from '../ui/ScoreBug';
import { MatchSimActions } from '../ui/SimActions';
import type { LiveMatchKind } from '../../store/useLiveMatchStore';

interface GroupDetailModalProps {
  group: Group;
  teams: Team[];
  region: string;
  onClose: () => void;
  onSimulate?: (matchId: string) => void;
  liveKind?: LiveMatchKind;
}

export function GroupDetailModal({
  group,
  teams,
  region,
  onClose,
  onSimulate,
  liveKind,
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
      <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/60 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="bg-grass-dark border-4 border-line shadow-hard-panel w-full max-w-4xl my-8"
        >
          {/* Header */}
          <div className="p-6 border-b-4 border-grass relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2.5 lg:p-1 text-grass-soft hover:bg-grass/40 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <Users className="w-6 h-6 text-gold" />
              <div>
                <h2 className="font-arcade text-lg text-white text-shadow-retro">{group.name}</h2>
                <p className="text-grass-soft text-sm mt-1">{region}</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Standings Table */}
            <div>
              <h3 className="font-arcade text-xs text-white text-shadow-retro uppercase mb-3">Tabla de Posiciones</h3>
              <div className="overflow-x-auto">
                <StandingsTable
                  standings={group.standings}
                  teams={teams}
                  matches={group.matches}
                  highlightQualified={2}
                />
              </div>
            </div>

            {/* Matches by Matchday */}
            <div>
              <h3 className="font-arcade text-xs text-white text-shadow-retro uppercase mb-3">Partidos</h3>
              <div className="space-y-4">
                {matchdays.map((matchday) => (
                  <div key={matchday} className="space-y-2">
                    <h4 className="font-arcade text-[10px] text-gold uppercase bg-black/40 px-3 py-1">
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
                            className="bg-grass-dark border-2 border-grass p-3 hover:bg-grass/20 transition-colors"
                          >
                            <div className="sm:hidden space-y-2">
                              <ScoreBug
                                size="narrow"
                                homeTeam={homeTeam}
                                awayTeam={awayTeam}
                                homeScore={match.isPlayed ? match.homeScore : null}
                                awayScore={match.isPlayed ? match.awayScore : null}
                              />
                              {!match.isPlayed && (
                                <MatchSimActions
                                  onSimulate={onSimulate ? () => onSimulate(match.id) : undefined}
                                  live={
                                    liveKind
                                      ? {
                                          matchId: match.id,
                                          homeTeamId: match.homeTeamId,
                                          awayTeamId: match.awayTeamId,
                                          kind: liveKind,
                                          groupId: group.id,
                                        }
                                      : undefined
                                  }
                                  stacked
                                />
                              )}
                            </div>
                            <div className="hidden sm:flex items-center justify-between">
                              {/* Home Team */}
                              <div className={`flex items-center gap-2 flex-1 ${homeWon ? 'text-led' : ''}`}>
                                <TeamFlag
                                  teamId={homeTeam.id}
                                  teamName={homeTeam.name}
                                  size={24}
                                />
                                <span className="text-sm truncate">{homeTeam.name}</span>
                              </div>

                              {/* Score */}
                              <div className="flex items-center gap-3 px-4">
                                {match.isPlayed ? (
                                  <>
                                    <span className={`font-terminal text-lg tabular-nums ${homeWon ? 'text-led' : 'text-white'}`}>
                                      {match.homeScore}
                                    </span>
                                    <span className="text-grass-soft">-</span>
                                    <span className={`font-terminal text-lg tabular-nums ${awayWon ? 'text-led' : 'text-white'}`}>
                                      {match.awayScore}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-sm text-grass-soft">vs</span>
                                )}
                              </div>

                              {/* Away Team */}
                              <div className={`flex items-center gap-2 flex-1 justify-end ${awayWon ? 'text-led' : ''}`}>
                                <span className="text-sm truncate text-right">{awayTeam.name}</span>
                                <TeamFlag
                                  teamId={awayTeam.id}
                                  teamName={awayTeam.name}
                                  size={24}
                                />
                              </div>

                              {/* Acciones del partido */}
                              {!match.isPlayed && (
                                <MatchSimActions
                                  onSimulate={onSimulate ? () => onSimulate(match.id) : undefined}
                                  live={
                                    liveKind
                                      ? {
                                          matchId: match.id,
                                          homeTeamId: match.homeTeamId,
                                          awayTeamId: match.awayTeamId,
                                          kind: liveKind,
                                          groupId: group.id,
                                        }
                                      : undefined
                                  }
                                  className="ml-3 shrink-0"
                                />
                              )}
                            </div>
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
