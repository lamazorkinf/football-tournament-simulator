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
          className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 text-white p-6 rounded-t-lg relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5" />
              <h2 className="text-xl font-bold">Match Details</h2>
            </div>
            <p className="text-primary-100 text-sm">Full Time Result</p>
          </div>

          {/* Score Display */}
          <div className="p-6 bg-gray-50">
            <div className="grid grid-cols-3 gap-4 items-center">
              {/* Home Team */}
              <div className="text-center">
                <TeamFlag
                  teamId={homeTeam.id}
                  teamName={homeTeam.name}
                  flagUrl={homeTeam.flag}
                  size={64}
                />
                <h3 className="font-bold text-lg mt-3 mb-1">{homeTeam.name}</h3>
                <p className="text-sm text-gray-600">
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
                    className={`text-5xl font-bold ${
                      homeWon ? 'text-green-600' : draw ? 'text-gray-700' : 'text-gray-400'
                    }`}
                  >
                    {match.homeScore}
                  </motion.div>
                  <span className="text-2xl text-gray-400">-</span>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3, type: 'spring' }}
                    className={`text-5xl font-bold ${
                      !homeWon && !draw ? 'text-green-600' : draw ? 'text-gray-700' : 'text-gray-400'
                    }`}
                  >
                    {match.awayScore}
                  </motion.div>
                </div>
                <div className="flex items-center justify-center gap-1 text-sm text-gray-600">
                  <Clock className="w-4 h-4" />
                  <span>90'</span>
                </div>
              </div>

              {/* Away Team */}
              <div className="text-center">
                <TeamFlag
                  teamId={awayTeam.id}
                  teamName={awayTeam.name}
                  flagUrl={awayTeam.flag}
                  size={64}
                />
                <h3 className="font-bold text-lg mt-3 mb-1">{awayTeam.name}</h3>
                <p className="text-sm text-gray-600">
                  Skill: {awayTeam.skill.toFixed(1)}
                </p>
              </div>
            </div>

            {/* Result Badge */}
            <div className="text-center mt-4">
              {homeWon ? (
                <span className="inline-flex items-center gap-1 px-4 py-2 bg-green-100 text-green-800 rounded-full font-semibold text-sm">
                  <Users className="w-4 h-4" />
                  {homeTeam.name} wins!
                </span>
              ) : draw ? (
                <span className="inline-flex items-center gap-1 px-4 py-2 bg-gray-100 text-gray-800 rounded-full font-semibold text-sm">
                  Draw
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-4 py-2 bg-green-100 text-green-800 rounded-full font-semibold text-sm">
                  <Users className="w-4 h-4" />
                  {awayTeam.name} wins!
                </span>
              )}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="p-6 space-y-4">
            <h3 className="font-semibold text-gray-900 mb-3">Match Statistics</h3>

            {/* Skill Changes - Only show if available */}
            {(homeSkillChange !== 0 || awaySkillChange !== 0) && (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">Skill Change</span>
                    {homeSkillChange !== 0 && (
                      homeSkillChange > 0 ? (
                        <TrendingUp className="w-5 h-5 text-green-600" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-red-600" />
                      )
                    )}
                  </div>
                  <p className={`text-2xl font-bold ${
                    homeSkillChange > 0 ? 'text-green-600' : homeSkillChange < 0 ? 'text-red-600' : 'text-gray-400'
                  }`}>
                    {homeSkillChange > 0 ? '+' : ''}{homeSkillChange.toFixed(2)}
                  </p>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">Skill Change</span>
                    {awaySkillChange !== 0 && (
                      awaySkillChange > 0 ? (
                        <TrendingUp className="w-5 h-5 text-green-600" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-red-600" />
                      )
                    )}
                  </div>
                  <p className={`text-2xl font-bold ${
                    awaySkillChange > 0 ? 'text-green-600' : awaySkillChange < 0 ? 'text-red-600' : 'text-gray-400'
                  }`}>
                    {awaySkillChange > 0 ? '+' : ''}{awaySkillChange.toFixed(2)}
                  </p>
                </div>
              </div>
            )}

            {/* Goal Timeline (simulated) */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-3">Goal Timeline</h4>
              <div className="space-y-2">
                {Array.from({ length: (match.homeScore ?? 0) + (match.awayScore ?? 0) }).map((_, idx) => {
                  const isHome = idx < (match.homeScore ?? 0);
                  const team = isHome ? homeTeam : awayTeam;
                  const minute = Math.floor(Math.random() * 90) + 1;

                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.4 + idx * 0.1 }}
                      className="flex items-center gap-3 text-sm"
                    >
                      <span className="font-mono text-gray-500 w-8">{minute}'</span>
                      <TeamFlag teamId={team.id} teamName={team.name} flagUrl={team.flag} size={24} />
                      <span className="font-medium text-gray-900">{team.name}</span>
                      <span className="text-gray-500">⚽</span>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
              <p className="font-medium mb-1">About Skill Changes</p>
              <p className="text-blue-800">
                Team skills are updated after each match using an ELO-style rating system.
                Winners gain skill points, while losers lose points. The magnitude depends on the
                expected outcome vs. actual result.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <Button variant="outline" onClick={onClose} className="w-full">
              Close
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
