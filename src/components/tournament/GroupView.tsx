import type { Group, Team, Match } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { StandingsTable } from '../ui/StandingsTable';
import { ScoreBug } from '../ui/ScoreBug';
import { showMatchResultToast } from '../ui/MatchResultToast';
import { MatchSimActions, JornadaSimActions } from '../ui/SimActions';
import { MatchDetailModal } from './MatchDetailModal';
import { ArrowLeft, Info } from 'lucide-react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useCycleJornada } from '../../hooks/useCycleJornada';
import { useState } from 'react';

interface GroupViewProps {
  group: Group;
  teams: Team[];
  onBack: () => void;
}

export function GroupView({ group, teams, onBack }: GroupViewProps) {
  const { simulateMatch } = useTournamentStore();
  const cycle = useTournamentStore((s) => s.currentTournament);
  const jornadaSim = useCycleJornada(cycle, teams);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  const getTeam = (teamId: string) => {
    return teams.find((t) => t.id === teamId);
  };

  const handleSimulateMatch = async (matchId: string) => {
    const match = group.matches.find((m) => m.id === matchId);
    if (!match) return;

    // El marcador sale del retorno de la acción: la prop `group` está congelada
    // en el render anterior (isPlayed === false) y releer el store para buscar
    // el partido actualizado era dar una vuelta larga por el mismo dato.
    const result = await simulateMatch(matchId, group.id, 'qualifier');
    if (!result) return;

    showMatchResultToast({
      homeName: getTeam(match.homeTeamId)?.name ?? match.homeTeamId,
      awayName: getTeam(match.awayTeamId)?.name ?? match.awayTeamId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
    });
  };

  const totalMatches = group.matches.length;
  const playedMatches = group.matches.filter((m) => m.isPlayed).length;
  const isDrawComplete = group.isDrawComplete && group.teamIds.length > 0;

  // Show message if draw hasn't been completed
  if (!isDrawComplete) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={onBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Volver a regiones
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {group.region} - {group.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-12">
            <div className="text-center">
              <p className="font-arcade text-xs text-white text-shadow-retro uppercase mb-2">
                ⚽ Sorteo aún no realizado
              </p>
              <p className="text-sm text-grass-soft">
                Generá el sorteo y los fixtures para asignar equipos a este grupo
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedHomeTeam = selectedMatch ? getTeam(selectedMatch.homeTeamId) : null;
  const selectedAwayTeam = selectedMatch ? getTeam(selectedMatch.awayTeamId) : null;

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

      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Volver a regiones</span>
          <span className="sm:hidden">Volver</span>
        </Button>
        <div className="text-sm text-grass-soft">
          {playedMatches} / {totalMatches} partidos jugados
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {group.region} - {group.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-arcade text-xs text-white text-shadow-retro uppercase">Posiciones</h3>
          </div>
          <StandingsTable
            standings={group.standings}
            teams={teams}
            matches={group.matches}
            highlightQualified={2}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <CardTitle>Partidos</CardTitle>
            <JornadaSimActions
              jornadaLabel={jornadaSim.title}
              onSimulate={jornadaSim.simulate}
              onSimulateLive={jornadaSim.simulateLive}
              disabled={!jornadaSim.canSimulate}
              busy={jornadaSim.isBusy}
              hint="se juega entera, en todos los grupos."
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {group.matches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                getTeam={getTeam}
                groupId={group.id}
                onSimulate={() => handleSimulateMatch(match.id)}
                onViewDetails={() => setSelectedMatch(match)}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface MatchCardProps {
  match: Match;
  getTeam: (teamId: string) => Team | undefined;
  groupId: string;
  onSimulate: () => void;
  onViewDetails: () => void;
}

function MatchCard({ match, getTeam, groupId, onSimulate, onViewDetails }: MatchCardProps) {
  const homeTeam = getTeam(match.homeTeamId);
  const awayTeam = getTeam(match.awayTeamId);
  return (
    <div
      className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-2 transition-colors ${
        match.isPlayed
          ? 'bg-grass-dark border-grass cursor-pointer hover:bg-grass/20'
          : 'bg-grass-dark border-gold hover:border-led'
      }`}
      onClick={match.isPlayed ? onViewDetails : undefined}
    >
      <div className="flex-1 min-w-0">
        {homeTeam && awayTeam ? (
          <ScoreBug
            size="md"
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            homeScore={match.isPlayed ? match.homeScore : null}
            awayScore={match.isPlayed ? match.awayScore : null}
          />
        ) : (
          <span className="text-grass-soft text-xs">
            {match.homeTeamId} vs {match.awayTeamId}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {match.isPlayed ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails();
            }}
            className="gap-1 sm:gap-2"
          >
            <Info className="w-3 h-3" />
            <span className="hidden sm:inline">Detalles</span>
          </Button>
        ) : (
          <MatchSimActions
            onSimulate={onSimulate}
            live={{
              matchId: match.id,
              homeTeamId: match.homeTeamId,
              awayTeamId: match.awayTeamId,
              kind: 'qualifier',
              groupId,
            }}
          />
        )}
      </div>
    </div>
  );
}
