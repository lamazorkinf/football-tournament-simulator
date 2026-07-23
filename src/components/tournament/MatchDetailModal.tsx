import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, TrendingDown, Target, Clock, Users } from 'lucide-react';
import type { Match, Team } from '../../types';
import { TeamFlag } from '../ui/TeamFlag';
import { Button } from '../ui/Button';

interface MatchDetailModalProps {
  match: Match;
  homeTeam: Team;
  awayTeam: Team;
  homeSkillChange?: number;
  awaySkillChange?: number;
  onClose: () => void;
}

export function MatchDetailModal({
  match,
  homeTeam,
  awayTeam,
  homeSkillChange = 0,
  awaySkillChange = 0,
  onClose,
}: MatchDetailModalProps) {
  // Minutos de gol memoizados y ordenados: con Math.random() en el render
  // saltaban a valores distintos en cada re-render y nunca estaban en orden
  // cronológico. La semilla deriva del id del partido para ser estable.
  const goals = useMemo(() => {
    const total = (match.homeScore ?? 0) + (match.awayScore ?? 0);
    let seed = 0;
    for (let i = 0; i < match.id.length; i++) seed = (seed * 31 + match.id.charCodeAt(i)) % 100000;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    return Array.from({ length: total }, (_, idx) => ({
      isHome: idx < (match.homeScore ?? 0),
      minute: Math.floor(rand() * 90) + 1,
    })).sort((a, b) => a.minute - b.minute);
  }, [match.id, match.homeScore, match.awayScore]);

  if (!match.isPlayed) return null;

  const homeWon = (match.homeScore ?? 0) > (match.awayScore ?? 0);
  const draw = match.homeScore === match.awayScore;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
          className="bg-grass-dark border-4 border-line shadow-hard-panel max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="bg-grass border-b-4 border-line text-white p-6 relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1 hover:bg-black/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5" />
              <h2 className="font-arcade text-sm text-white text-shadow-retro">Match Details</h2>
            </div>
            <p className="text-white/70 text-sm">Full Time Result</p>
          </div>

          {/* Score Display */}
          <div className="p-6 bg-night">
            <div className="grid grid-cols-3 gap-4 items-center">
              {/* Home Team */}
              <div className="text-center">
                <TeamFlag
                  teamId={homeTeam.id}
                  teamName={homeTeam.name}
                  size={64}
                />
                <h3 className="font-bold text-lg mt-3 mb-1 text-white">{homeTeam.name}</h3>
                <p className="text-sm text-grass-soft">
                  Skill: {homeTeam.skill.toFixed(1)}
                </p>
              </div>

              {/* Score */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-4 mb-2">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring' }}
                    className={`text-5xl font-terminal tabular-nums ${
                      homeWon ? 'text-led' : draw ? 'text-white' : 'text-grass-soft'
                    }`}
                  >
                    {match.homeScore}
                  </motion.div>
                  <span className="text-2xl text-grass-soft">-</span>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3, type: 'spring' }}
                    className={`text-5xl font-terminal tabular-nums ${
                      !homeWon && !draw ? 'text-led' : draw ? 'text-white' : 'text-grass-soft'
                    }`}
                  >
                    {match.awayScore}
                  </motion.div>
                </div>
                <div className="flex items-center justify-center gap-1 text-sm text-grass-soft">
                  <Clock className="w-4 h-4" />
                  <span>90'</span>
                </div>
              </div>

              {/* Away Team */}
              <div className="text-center">
                <TeamFlag
                  teamId={awayTeam.id}
                  teamName={awayTeam.name}
                  size={64}
                />
                <h3 className="font-bold text-lg mt-3 mb-1 text-white">{awayTeam.name}</h3>
                <p className="text-sm text-grass-soft">
                  Skill: {awayTeam.skill.toFixed(1)}
                </p>
              </div>
            </div>

            {/* Result Badge */}
            <div className="text-center mt-4">
              {homeWon ? (
                <span className="inline-flex items-center gap-1 px-4 py-2 bg-black/40 text-led border border-led font-semibold text-sm">
                  <Users className="w-4 h-4" />
                  {homeTeam.name} wins!
                </span>
              ) : draw ? (
                <span className="inline-flex items-center gap-1 px-4 py-2 bg-black/40 text-grass-soft border border-grass font-semibold text-sm">
                  Draw
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-4 py-2 bg-black/40 text-led border border-led font-semibold text-sm">
                  <Users className="w-4 h-4" />
                  {awayTeam.name} wins!
                </span>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="p-6 space-y-4">
            <h3 className="font-arcade text-[10px] text-gold uppercase mb-3">Match Statistics</h3>

            {/* Skill Changes - Only show if available */}
            {(homeSkillChange !== 0 || awaySkillChange !== 0) && (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-night border-2 border-grass p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-grass-soft">Skill Change</span>
                    {homeSkillChange !== 0 && (
                      homeSkillChange > 0 ? (
                        <TrendingUp className="w-5 h-5 text-led" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-loss" />
                      )
                    )}
                  </div>
                  <p className={`text-2xl font-bold font-terminal tabular-nums ${
                    homeSkillChange > 0 ? 'text-led' : homeSkillChange < 0 ? 'text-loss' : 'text-grass-soft'
                  }`}>
                    {homeSkillChange > 0 ? '+' : ''}{homeSkillChange.toFixed(2)}
                  </p>
                </div>

                <div className="bg-night border-2 border-grass p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-grass-soft">Skill Change</span>
                    {awaySkillChange !== 0 && (
                      awaySkillChange > 0 ? (
                        <TrendingUp className="w-5 h-5 text-led" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-loss" />
                      )
                    )}
                  </div>
                  <p className={`text-2xl font-bold font-terminal tabular-nums ${
                    awaySkillChange > 0 ? 'text-led' : awaySkillChange < 0 ? 'text-loss' : 'text-grass-soft'
                  }`}>
                    {awaySkillChange > 0 ? '+' : ''}{awaySkillChange.toFixed(2)}
                  </p>
                </div>
              </div>
            )}

            {/* Goal Timeline (simulated) */}
            <div className="bg-night p-4">
              <h4 className="font-arcade text-[10px] text-gold uppercase mb-3">Goal Timeline</h4>
              <div className="space-y-2">
                {goals.map((goal, idx) => {
                  const team = goal.isHome ? homeTeam : awayTeam;
                  const minute = goal.minute;

                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + idx * 0.1 }}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span className="font-terminal tabular-nums text-grass-soft w-8">{minute}'</span>
                      <TeamFlag teamId={team.id} teamName={team.name} size={24} />
                      <span className="font-medium text-white">{team.name}</span>
                      <span className="text-grass-soft">⚽</span>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-black/40 border-2 border-gold p-4 text-sm">
              <p className="font-medium mb-1 text-gold">About Skill Changes</p>
              <p className="text-grass-soft">
                Team skills are updated after each match using an ELO-style rating system.
                Winners gain skill points, while losers lose points. The magnitude depends on the
                expected outcome vs. actual result.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t-4 border-grass">
            <Button variant="outline" onClick={onClose} className="w-full">
              Close
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
