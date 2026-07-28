import type { Team, KnockoutBracket, KnockoutMatch } from '../../types';
import { useTournamentStore } from '../../store/useTournamentStore';
import { Button } from '../ui/Button';
import { ArrowLeft, Trophy, Medal, Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { ChampionCelebration } from './ChampionCelebration';
import { MatchDetailModal } from './MatchDetailModal';
import { BracketLine } from './BracketLine';
import { TeamFlag } from '../ui/TeamFlag';
import { TeamNameTooltip } from '../ui/TeamNameTooltip';
import { MatchSimActions, JornadaSimActions } from '../ui/SimActions';
import { useState, useRef } from 'react';
import { useMobileAction } from '../../hooks/useMobileAction';
import { useCycleJornada } from '../../hooks/useCycleJornada';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { matchCardVariants, matchContainerVariants } from './animations';
import { showMatchResultToast } from '../ui/MatchResultToast';

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
  disabled?: boolean;
}

const MatchCard = ({ match, teams, onSimulate, onViewDetails, disabled = false }: MatchCardProps) => {
  if (!match) {
    return (
      <motion.div
        variants={matchCardVariants}
        className="bg-grass-dark border-2 border-dashed border-grass p-3 text-center text-grass-soft text-sm min-h-[100px] flex items-center justify-center"
      >
        Por definir
      </motion.div>
    );
  }

  const homeTeam = teams.find((t) => t.id === match.homeTeamId);
  const awayTeam = teams.find((t) => t.id === match.awayTeamId);

  if (!homeTeam || !awayTeam) {
    return (
      <motion.div
        variants={matchCardVariants}
        className="bg-grass-dark border-2 border-dashed border-grass p-3 text-center text-grass-soft text-sm min-h-[100px] flex items-center justify-center"
      >
        Esperando equipos…
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
      {/*
        Bracket columns run 5-up on desktop, too narrow for <ScoreBug>'s
        side-by-side layout. Same visual language applied manually instead
        (dark panel, border-2 border-line, 3-letter codes, text-led scores)
        per Task 11b brief.
      */}
      <div className="bg-grass-dark border-2 border-line overflow-hidden">
      <div className="p-3 space-y-2">
        {/* Home Team */}
        <div
          className={`flex items-center justify-between p-2 ${
            isPlayed ? (homeWon ? 'bg-grass/30' : 'bg-black/20') : 'bg-black/20'
          }`}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <TeamFlag teamId={homeTeam.id} teamName={homeTeam.name} size={24} />
            <TeamNameTooltip teamName={homeTeam.name}>
              <span className={`font-arcade text-[10px] uppercase truncate ${homeWon && isPlayed ? 'text-led' : ''}`}>
                {homeTeam.id}
              </span>
            </TeamNameTooltip>
          </div>
          <div className="font-arcade text-led text-sm tabular-nums min-w-[30px] text-center">
            {match.homeScore !== null ? match.homeScore : '-'}
          </div>
        </div>

        {/* Away Team */}
        <div
          className={`flex items-center justify-between p-2 ${
            isPlayed ? (awayWon ? 'bg-grass/30' : 'bg-black/20') : 'bg-black/20'
          }`}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <TeamFlag teamId={awayTeam.id} teamName={awayTeam.name} size={24} />
            <TeamNameTooltip teamName={awayTeam.name}>
              <span className={`font-arcade text-[10px] uppercase truncate ${awayWon && isPlayed ? 'text-led' : ''}`}>
                {awayTeam.id}
              </span>
            </TeamNameTooltip>
          </div>
          <div className="font-arcade text-led text-sm tabular-nums min-w-[30px] text-center">
            {match.awayScore !== null ? match.awayScore : '-'}
          </div>
        </div>

        {/* Penalties */}
        {match.penalties && (
          <div className="text-xs text-center text-gold bg-black/40 border border-gold py-1">
            Penales: {match.penalties.homeScore} - {match.penalties.awayScore}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {!isPlayed && onSimulate && (
            <MatchSimActions
              onSimulate={() => onSimulate(match.id)}
              live={{
                matchId: match.id,
                homeTeamId: match.homeTeamId,
                awayTeamId: match.awayTeamId,
                kind: 'knockout',
              }}
              disabled={disabled}
              stacked
              className="w-full"
            />
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
              Detalles
            </Button>
          )}
        </div>
      </div>
      </div>
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
  const { simulateKnockoutMatch, isSavingMatch } = useTournamentStore();
  const cycle = useTournamentStore((s) => s.currentTournament);
  const jornadaSim = useCycleJornada(cycle, teams);
  const [showCelebration, setShowCelebration] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<KnockoutMatch | null>(null);
  const bracketRef = useRef<HTMLDivElement>(null);

  const handleSimulate = async (matchId: string) => {
    // Don't allow simulation if another match is being saved
    if (isSavingMatch) {
      toast.warning('Espera a que se guarde el partido anterior');
      return;
    }

    const allMatches = [
      ...knockout.roundOf32,
      ...knockout.roundOf16,
      ...knockout.quarterFinals,
      ...knockout.semiFinals,
      ...(knockout.thirdPlace ? [knockout.thirdPlace] : []),
      ...(knockout.final ? [knockout.final] : []),
    ];

    const match = allMatches.find((m) => m.id === matchId);
    if (!match) return;

    const result = await simulateKnockoutMatch(matchId);
    if (!result) {
      toast.info('No se pudo simular ahora (puede faltar resolver la ronda anterior)');
      return;
    }

    // Las eliminatorias se definen por penales cuando el partido termina
    // empatado: el marcador solo no alcanza para saber quién pasó.
    showMatchResultToast({
      homeName: teams.find((t) => t.id === match.homeTeamId)?.name ?? match.homeTeamId,
      awayName: teams.find((t) => t.id === match.awayTeamId)?.name ?? match.awayTeamId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      penalties: result.penalties,
    });
  };

  // Misma acción que el resto del juego: la jornada en curso, no un partido
  // suelto (los partidos tienen sus propios botones en cada tarjeta).
  useMobileAction({
    label: jornadaSim.isBusy ? 'SIMULANDO…' : '▶ SIMULAR JORNADA',
    onPress: jornadaSim.simulate,
    disabled: !jornadaSim.canSimulate,
  });

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
            Volver
          </Button>
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-gold" />
            <h2 className="font-arcade text-lg text-white text-shadow-retro">Playoffs</h2>
          </div>
        </div>
        {tournamentComplete && (
          <Button
            variant="primary"
            onClick={() => setShowCelebration(true)}
            className="gap-2"
          >
            <Trophy className="w-5 h-5" />
            Ver Campeón
          </Button>
        )}
      </div>

      {/* Progress Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Trophy className="w-8 h-8 text-gold" />
              <div>
                <h3 className="font-arcade text-xs text-white text-shadow-retro uppercase">Progreso de los Playoffs</h3>
                <p className="text-sm text-grass-soft">
                  {(() => {
                    const allMatches = [
                      ...knockout.roundOf32,
                      ...knockout.roundOf16,
                      ...knockout.quarterFinals,
                      ...knockout.semiFinals,
                      ...(knockout.thirdPlace ? [knockout.thirdPlace] : []),
                      ...(knockout.final ? [knockout.final] : []),
                    ];
                    const played = allMatches.filter((m) => m.isPlayed).length;
                    return `${played}/${allMatches.length} partidos completados`;
                  })()}
                </p>
              </div>
            </div>
            {tournamentComplete ? (
              <div className="flex items-center gap-2 px-4 py-2 bg-black/40 border border-gold font-arcade text-[10px] text-gold uppercase blink">
                <Trophy className="w-5 h-5" />
                ¡Campeón coronado!
              </div>
            ) : (
              <JornadaSimActions
                jornadaLabel={jornadaSim.title}
                onSimulate={jornadaSim.simulate}
                onSimulateLive={jornadaSim.simulateLive}
                disabled={!jornadaSim.canSimulate}
                busy={jornadaSim.isBusy}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bracket Grid - Enhanced for Desktop */}
      <div className="hidden lg:block">
        <div className="relative" ref={bracketRef}>
          {/* SVG Connectors (Desktop only) */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} shapeRendering="crispEdges">
            <defs>
              <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style={{ stopColor: '#2fbf5f', stopOpacity: 0.3 }} />
                <stop offset="100%" style={{ stopColor: '#ffd23f', stopOpacity: 0.5 }} />
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
            className="grid grid-cols-5 gap-6 relative"
            style={{ zIndex: 1 }}
            variants={matchContainerVariants}
            initial="hidden"
            animate="visible"
          >
        {/* Round of 32 */}
        <div className="space-y-3">
          <motion.h3
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-arcade text-[10px] text-gold uppercase text-center sticky top-0 bg-grass-dark py-2"
          >
            Dieciseisavos
          </motion.h3>
          <div className="space-y-3">
            {knockout.roundOf32.length > 0 ? (
              knockout.roundOf32.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  teams={teams}
                  onSimulate={handleSimulate}
                  onViewDetails={setSelectedMatch}
                  disabled={isSavingMatch}
                />
              ))
            ) : (
              <div className="text-center text-grass-soft text-sm py-8">
                Completá primero la fase de grupos
              </div>
            )}
          </div>
        </div>

        {/* Round of 16 */}
        <div className="space-y-3">
          <motion.h3
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-arcade text-[10px] text-gold uppercase text-center sticky top-0 bg-grass-dark py-2"
          >
            Octavos
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
                  disabled={isSavingMatch}
                />
              ))
            ) : (
              <div className="text-center text-grass-soft text-sm py-8">
                Completá los Dieciseisavos
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
            className="font-arcade text-[10px] text-gold uppercase text-center sticky top-0 bg-grass-dark py-2"
          >
            Cuartos de Final
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
                  disabled={isSavingMatch}
                />
              ))
            ) : (
              <div className="text-center text-grass-soft text-sm py-8">
                Completá los Octavos
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
            className="font-arcade text-[10px] text-gold uppercase text-center sticky top-0 bg-grass-dark py-2"
          >
            Semifinales
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
                  disabled={isSavingMatch}
                />
              ))
            ) : (
              <div className="text-center text-grass-soft text-sm py-8">
                Completá los Cuartos de Final
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
            className="font-arcade text-[10px] text-gold uppercase text-center sticky top-0 bg-grass-dark py-2"
          >
            Finales
          </motion.h3>
          <div className="space-y-3">
            {/* Third Place */}
            {knockout.thirdPlace && (
              <div>
                <div className="text-xs text-grass-soft mb-1 flex items-center justify-center gap-1">
                  <Medal className="w-3 h-3" />
                  Tercer Puesto
                </div>
                <MatchCard
                  match={knockout.thirdPlace}
                  teams={teams}
                  onSimulate={handleSimulate}
                  onViewDetails={setSelectedMatch}
                  disabled={isSavingMatch}
                />
              </div>
            )}

            {/* Final */}
            {knockout.final ? (
              <div>
                <div className="text-xs text-grass-soft mb-1 flex items-center justify-center gap-1">
                  <Trophy className="w-3 h-3 text-gold" />
                  Final
                </div>
                <MatchCard
                  match={knockout.final}
                  teams={teams}
                  onSimulate={handleSimulate}
                  onViewDetails={setSelectedMatch}
                  disabled={isSavingMatch}
                />
              </div>
            ) : knockout.semiFinals.length === 0 ? (
              <div className="text-center text-grass-soft text-sm py-8">
                Completá las Semifinales
              </div>
            ) : null}
          </div>
        </div>
          </motion.div>
        </div>
      </div>

      {/* Mobile View - Vertical List */}
      <div className="lg:hidden space-y-6">
        {/* Round of 32 */}
        <Card>
          <CardHeader>
            <CardTitle>Dieciseisavos</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {knockout.roundOf32.length > 0 ? (
                knockout.roundOf32.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    teams={teams}
                    onSimulate={handleSimulate}
                    onViewDetails={setSelectedMatch}
                  />
                ))
              ) : (
                <div className="text-center text-grass-soft text-sm py-8">
                  Completá primero la fase de grupos
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Round of 16 */}
        <Card>
          <CardHeader>
            <CardTitle>Octavos</CardTitle>
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
                <div className="text-center text-grass-soft text-sm py-8">
                  Completá los Dieciseisavos
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quarter Finals */}
        <Card>
          <CardHeader>
            <CardTitle>Cuartos de Final</CardTitle>
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
                <div className="text-center text-grass-soft text-sm py-8">
                  Completá los Octavos
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Semi Finals */}
        <Card>
          <CardHeader>
            <CardTitle>Semifinales</CardTitle>
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
                <div className="text-center text-grass-soft text-sm py-8">
                  Completá los Cuartos de Final
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Finals */}
        <Card>
          <CardHeader className="border-gold">
            <CardTitle>Finales</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-4">
              {/* Third Place */}
              {knockout.thirdPlace && (
                <div>
                  <div className="text-xs text-grass-soft mb-2 flex items-center gap-1">
                    <Medal className="w-3 h-3" />
                    Partido por el Tercer Puesto
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
                  <div className="text-xs text-gold font-semibold mb-2 flex items-center gap-1">
                    <Trophy className="w-4 h-4" />
                    Final del Campeonato
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
