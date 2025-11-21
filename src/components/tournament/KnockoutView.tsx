import type { Team, KnockoutBracket, KnockoutMatch } from '../../types';
import { useTournamentStore } from '../../store/useTournamentStore';
import { Button } from '../ui/Button';
import { ArrowLeft, Trophy, Medal, Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { ChampionCelebration } from './ChampionCelebration';
import { MatchDetailModal } from './MatchDetailModal';
import { BracketLine } from './BracketLine';
import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { matchCardVariants, matchContainerVariants } from './animations';

interface KnockoutViewProps {
  knockout: KnockoutBracket;
  teams: Team[];
  championId?: string;
  runnerUpId?: string;
  thirdPlaceId?: string;
  fourthPlaceId?: string;
  onBack: () => void;
  onNewTournament?: () => void;
}

interface MatchCardProps {
  match: KnockoutMatch | null;
  teams: Team[];
  onSimulate?: (matchId: string) => void;
  onViewDetails?: (match: KnockoutMatch) => void;
}

const MatchCard = ({ match, teams, onSimulate, onViewDetails }: MatchCardProps) => {
  if (!match) {
    return (
      <motion.div
        variants={matchCardVariants}
        className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-3 text-center text-gray-400 text-sm min-h-[100px] flex items-center justify-center"
      >
        TBD
      </motion.div>
    );
  }

  const homeTeam = teams.find((t) => t.id === match.homeTeamId);
  const awayTeam = teams.find((t) => t.id === match.awayTeamId);

  if (!homeTeam || !awayTeam) {
    return (
      <motion.div
        variants={matchCardVariants}
        className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg p-3 text-center text-gray-400 text-sm min-h-[100px] flex items-center justify-center"
      >
        Awaiting teams...
      </motion.div>
    );
  }

  const isPlayed = match.isPlayed;
  const homeWon = match.winnerId === homeTeam.id;
  const awayWon = match.winnerId === awayTeam.id;

  return (
    <motion.div
      variants={matchCardVariants}
      whileHover="hover"
      className={match.isPlayed && onViewDetails ? 'cursor-pointer' : ''}
      onClick={match.isPlayed && onViewDetails ? () => onViewDetails(match) : undefined}
    >
      <Card className="overflow-hidden">
      <div className="p-3 space-y-2">
        {/* Home Team */}
        <div
          className={`flex items-center justify-between p-2 rounded ${
            isPlayed ? (homeWon ? 'bg-green-50 font-semibold' : 'bg-gray-50') : 'bg-white'
          }`}
        >
          <div className="flex items-center gap-2 flex-1">
            <span className="text-2xl">{homeTeam.flag}</span>
            <span className="text-sm truncate">{homeTeam.name}</span>
          </div>
          <div className="text-lg font-bold min-w-[30px] text-center">
            {match.homeScore !== null ? match.homeScore : '-'}
          </div>
        </div>

        {/* Away Team */}
        <div
          className={`flex items-center justify-between p-2 rounded ${
            isPlayed ? (awayWon ? 'bg-green-50 font-semibold' : 'bg-gray-50') : 'bg-white'
          }`}
        >
          <div className="flex items-center gap-2 flex-1">
            <span className="text-2xl">{awayTeam.flag}</span>
            <span className="text-sm truncate">{awayTeam.name}</span>
          </div>
          <div className="text-lg font-bold min-w-[30px] text-center">
            {match.awayScore !== null ? match.awayScore : '-'}
          </div>
        </div>

        {/* Penalties */}
        {match.penalties && (
          <div className="text-xs text-center text-gray-600 bg-yellow-50 py-1 rounded">
            Penalties: {match.penalties.homeScore} - {match.penalties.awayScore}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {!isPlayed && onSimulate && (
            <Button
              variant="primary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onSimulate(match.id);
              }}
              className="w-full"
            >
              Simulate
            </Button>
          )}
          {isPlayed && onViewDetails && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails(match);
              }}
              className="w-full gap-2"
            >
              <Info className="w-3 h-3" />
              Details
            </Button>
          )}
        </div>
      </div>
      </Card>
    </motion.div>
  );
};

export const KnockoutView = ({
  knockout,
  teams,
  championId,
  runnerUpId,
  thirdPlaceId,
  fourthPlaceId,
  onBack,
  onNewTournament,
}: KnockoutViewProps) => {
  const { simulateKnockoutMatch } = useTournamentStore();
  const [showCelebration, setShowCelebration] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<KnockoutMatch | null>(null);
  const bracketRef = useRef<HTMLDivElement>(null);
  const [, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  // Update viewport width on resize
  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSimulate = (matchId: string) => {
    const allMatches = [
      ...knockout.roundOf16,
      ...knockout.quarterFinals,
      ...knockout.semiFinals,
      ...(knockout.thirdPlace ? [knockout.thirdPlace] : []),
      ...(knockout.final ? [knockout.final] : []),
    ];

    const match = allMatches.find((m) => m.id === matchId);
    if (!match) return;

    simulateKnockoutMatch(matchId);

    toast.success(
      `🏆 Knockout match played!`,
      { duration: 2000 }
    );
  };

  const tournamentComplete = championId && runnerUpId;

  const selectedHomeTeam = selectedMatch ? teams.find((t) => t.id === selectedMatch.homeTeamId) : null;
  const selectedAwayTeam = selectedMatch ? teams.find((t) => t.id === selectedMatch.awayTeamId) : null;

  // Show celebration when tournament is complete
  if (tournamentComplete && showCelebration && onNewTournament) {
    return (
      <ChampionCelebration
        championId={championId}
        runnerUpId={runnerUpId}
        thirdPlaceId={thirdPlaceId}
        fourthPlaceId={fourthPlaceId}
        teams={teams}
        onNewTournament={onNewTournament}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Match Detail Modal */}
      {selectedMatch && selectedHomeTeam && selectedAwayTeam && (
        <MatchDetailModal
          match={selectedMatch}
          homeTeam={selectedHomeTeam}
          awayTeam={selectedAwayTeam}
          onClose={() => setSelectedMatch(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary-600" />
            <h2 className="text-2xl font-bold text-gray-900">Knockout Stage</h2>
          </div>
        </div>
        {tournamentComplete && (
          <Button
            variant="primary"
            onClick={() => setShowCelebration(true)}
            className="gap-2 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700"
          >
            <Trophy className="w-5 h-5" />
            View Champion
          </Button>
        )}
      </div>

      {/* Progress Info */}
      <Card className="bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Trophy className="w-8 h-8 text-yellow-600" />
              <div>
                <h3 className="font-bold text-gray-900">Knockout Stage Progress</h3>
                <p className="text-sm text-gray-600">
                  {(() => {
                    const allMatches = [
                      ...knockout.roundOf16,
                      ...knockout.quarterFinals,
                      ...knockout.semiFinals,
                      ...(knockout.thirdPlace ? [knockout.thirdPlace] : []),
                      ...(knockout.final ? [knockout.final] : []),
                    ];
                    const played = allMatches.filter((m) => m.isPlayed).length;
                    return `${played}/${allMatches.length} matches completed`;
                  })()}
                </p>
              </div>
            </div>
            {tournamentComplete && (
              <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-full font-semibold">
                <Trophy className="w-5 h-5" />
                Champion Crowned!
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bracket Grid - Enhanced for Desktop */}
      <div className="hidden lg:block">
        <div className="relative" ref={bracketRef}>
          {/* SVG Connectors (Desktop only) */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
            <defs>
              <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style={{ stopColor: '#10b981', stopOpacity: 0.3 }} />
                <stop offset="100%" style={{ stopColor: '#3b82f6', stopOpacity: 0.5 }} />
              </linearGradient>
            </defs>

            {/* R16 to QF Lines */}
            {knockout.roundOf16.length === 8 && knockout.quarterFinals.length > 0 && (
              <>
                {[0, 1, 2, 3].map((qfIndex) => {
                  const r16Index1 = qfIndex * 2;
                  const r16Index2 = qfIndex * 2 + 1;
                  const match1 = knockout.roundOf16[r16Index1];
                  const match2 = knockout.roundOf16[r16Index2];
                  const qfMatch = knockout.quarterFinals[qfIndex];

                  if (!match1?.isPlayed || !match2?.isPlayed) return null;

                  const y1 = 80 + r16Index1 * 180 + 60; // card center
                  const y2 = 80 + r16Index2 * 180 + 60;
                  const yMid = (y1 + y2) / 2;
                  const x1 = 380; // right edge of R16 column
                  const x2 = 460; // left edge of QF column

                  return (
                    <g key={`r16-qf-${qfIndex}`}>
                      <BracketLine x1={x1} y1={y1} x2={x2} y2={yMid} delay={qfIndex * 0.2} highlighted={qfMatch?.isPlayed} />
                      <BracketLine x1={x1} y1={y2} x2={x2} y2={yMid} delay={qfIndex * 0.2 + 0.1} highlighted={qfMatch?.isPlayed} />
                    </g>
                  );
                })}
              </>
            )}

            {/* QF to SF Lines */}
            {knockout.quarterFinals.length === 4 && knockout.semiFinals.length > 0 && (
              <>
                {[0, 1].map((sfIndex) => {
                  const qfIndex1 = sfIndex * 2;
                  const qfIndex2 = sfIndex * 2 + 1;
                  const match1 = knockout.quarterFinals[qfIndex1];
                  const match2 = knockout.quarterFinals[qfIndex2];
                  const sfMatch = knockout.semiFinals[sfIndex];

                  if (!match1?.isPlayed || !match2?.isPlayed) return null;

                  const y1 = 80 + qfIndex1 * 360 + 60;
                  const y2 = 80 + qfIndex2 * 360 + 60;
                  const yMid = (y1 + y2) / 2;
                  const x1 = 840;
                  const x2 = 920;

                  return (
                    <g key={`qf-sf-${sfIndex}`}>
                      <BracketLine x1={x1} y1={y1} x2={x2} y2={yMid} delay={0.8 + sfIndex * 0.2} highlighted={sfMatch?.isPlayed} />
                      <BracketLine x1={x1} y1={y2} x2={x2} y2={yMid} delay={0.9 + sfIndex * 0.2} highlighted={sfMatch?.isPlayed} />
                    </g>
                  );
                })}
              </>
            )}

            {/* SF to Final Lines */}
            {knockout.semiFinals.length === 2 && knockout.final && (
              <>
                {[0, 1].map((sfIndex) => {
                  const match = knockout.semiFinals[sfIndex];
                  if (!match?.isPlayed) return null;

                  const y = 80 + sfIndex * 720 + 60;
                  const yFinal = 440;
                  const x1 = 1300;
                  const x2 = 1380;

                  return (
                    <BracketLine
                      key={`sf-final-${sfIndex}`}
                      x1={x1}
                      y1={y}
                      x2={x2}
                      y2={yFinal}
                      delay={1.2 + sfIndex * 0.1}
                      highlighted={knockout.final?.isPlayed}
                    />
                  );
                })}
              </>
            )}
          </svg>

          <motion.div
            className="grid grid-cols-4 gap-6 relative"
            style={{ zIndex: 1 }}
            variants={matchContainerVariants}
            initial="hidden"
            animate="visible"
          >
        {/* Round of 16 */}
        <div className="space-y-3">
          <motion.h3
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm font-semibold text-gray-700 text-center sticky top-0 bg-gray-50 py-2 rounded"
          >
            Round of 16
          </motion.h3>
          <div className="space-y-3">
            {knockout.roundOf16.length > 0 ? (
              knockout.roundOf16.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  teams={teams}
                  onSimulate={handleSimulate}
                  onViewDetails={setSelectedMatch}
                />
              ))
            ) : (
              <div className="text-center text-gray-400 text-sm py-8">
                Complete group stage first
              </div>
            )}
          </div>
        </div>

        {/* Quarter Finals */}
        <div className="space-y-3">
          <motion.h3
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-sm font-semibold text-gray-700 text-center sticky top-0 bg-gray-50 py-2 rounded"
          >
            Quarter Finals
          </motion.h3>
          <div className="space-y-3">
            {knockout.quarterFinals.length > 0 ? (
              knockout.quarterFinals.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  teams={teams}
                  onSimulate={handleSimulate}
                  onViewDetails={setSelectedMatch}
                />
              ))
            ) : (
              <div className="text-center text-gray-400 text-sm py-8">
                Complete Round of 16
              </div>
            )}
          </div>
        </div>

        {/* Semi Finals */}
        <div className="space-y-3">
          <motion.h3
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-sm font-semibold text-gray-700 text-center sticky top-0 bg-gray-50 py-2 rounded"
          >
            Semi Finals
          </motion.h3>
          <div className="space-y-3">
            {knockout.semiFinals.length > 0 ? (
              knockout.semiFinals.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  teams={teams}
                  onSimulate={handleSimulate}
                  onViewDetails={setSelectedMatch}
                />
              ))
            ) : (
              <div className="text-center text-gray-400 text-sm py-8">
                Complete Quarter Finals
              </div>
            )}
          </div>
        </div>

        {/* Final & Third Place */}
        <div className="space-y-3">
          <motion.h3
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="text-sm font-semibold text-gray-700 text-center sticky top-0 bg-gray-50 py-2 rounded"
          >
            Finals
          </motion.h3>
          <div className="space-y-3">
            {/* Third Place */}
            {knockout.thirdPlace && (
              <div>
                <div className="text-xs text-gray-500 mb-1 flex items-center justify-center gap-1">
                  <Medal className="w-3 h-3" />
                  Third Place
                </div>
                <MatchCard
                  match={knockout.thirdPlace}
                  teams={teams}
                  onSimulate={handleSimulate}
                  onViewDetails={setSelectedMatch}
                />
              </div>
            )}

            {/* Final */}
            {knockout.final ? (
              <div>
                <div className="text-xs text-gray-500 mb-1 flex items-center justify-center gap-1">
                  <Trophy className="w-3 h-3 text-yellow-600" />
                  Final
                </div>
                <MatchCard
                  match={knockout.final}
                  teams={teams}
                  onSimulate={handleSimulate}
                  onViewDetails={setSelectedMatch}
                />
              </div>
            ) : knockout.semiFinals.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-8">
                Complete Semi Finals
              </div>
            ) : null}
          </div>
        </div>
          </motion.div>
        </div>
      </div>

      {/* Mobile View - Vertical List */}
      <div className="lg:hidden space-y-6">
        {/* Round of 16 */}
        <Card>
          <CardHeader className="bg-primary-600 text-white">
            <CardTitle className="text-white text-sm">Round of 16</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {knockout.roundOf16.length > 0 ? (
                knockout.roundOf16.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    teams={teams}
                    onSimulate={handleSimulate}
                    onViewDetails={setSelectedMatch}
                  />
                ))
              ) : (
                <div className="text-center text-gray-400 text-sm py-8">
                  Complete group stage first
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quarter Finals */}
        <Card>
          <CardHeader className="bg-primary-600 text-white">
            <CardTitle className="text-white text-sm">Quarter Finals</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {knockout.quarterFinals.length > 0 ? (
                knockout.quarterFinals.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    teams={teams}
                    onSimulate={handleSimulate}
                    onViewDetails={setSelectedMatch}
                  />
                ))
              ) : (
                <div className="text-center text-gray-400 text-sm py-8">
                  Complete Round of 16
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Semi Finals */}
        <Card>
          <CardHeader className="bg-primary-600 text-white">
            <CardTitle className="text-white text-sm">Semi Finals</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {knockout.semiFinals.length > 0 ? (
                knockout.semiFinals.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    teams={teams}
                    onSimulate={handleSimulate}
                    onViewDetails={setSelectedMatch}
                  />
                ))
              ) : (
                <div className="text-center text-gray-400 text-sm py-8">
                  Complete Quarter Finals
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Finals */}
        <Card>
          <CardHeader className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white">
            <CardTitle className="text-white text-sm">Finals</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-4">
              {/* Third Place */}
              {knockout.thirdPlace && (
                <div>
                  <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                    <Medal className="w-3 h-3" />
                    Third Place Match
                  </div>
                  <MatchCard
                    match={knockout.thirdPlace}
                    teams={teams}
                    onSimulate={handleSimulate}
                    onViewDetails={setSelectedMatch}
                  />
                </div>
              )}

              {/* Final */}
              {knockout.final && (
                <div>
                  <div className="text-xs text-yellow-600 font-semibold mb-2 flex items-center gap-1">
                    <Trophy className="w-4 h-4" />
                    Championship Final
                  </div>
                  <MatchCard
                    match={knockout.final}
                    teams={teams}
                    onSimulate={handleSimulate}
                    onViewDetails={setSelectedMatch}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
