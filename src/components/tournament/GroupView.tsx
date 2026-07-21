import type { Group, Team, Match } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { StandingsTable } from '../ui/StandingsTable';
import { ScoreBug } from '../ui/ScoreBug';
import { MatchDetailModal } from './MatchDetailModal';
import { ArrowLeft, Play, Info } from 'lucide-react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { toast } from 'sonner';
import { useState } from 'react';

interface GroupViewProps {
  group: Group;
  teams: Team[];
  onBack: () => void;
}

export function GroupView({ group, teams, onBack }: GroupViewProps) {
  const { simulateMatch } = useTournamentStore();
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  const getTeam = (teamId: string) => {
    return teams.find((t) => t.id === teamId);
  };

  const handleSimulateMatch = async (matchId: string) => {
    const match = group.matches.find((m) => m.id === matchId);
    if (!match) return;

    const homeTeam = getTeam(match.homeTeamId);
    const awayTeam = getTeam(match.awayTeamId);

    // Esperar a que termine: sin await, el toast releía group.matches del render
    // anterior (isPlayed === false) y nunca se mostraba el resultado.
    await simulateMatch(matchId, group.id, 'qualifier');

    // Leer el partido actualizado del store (la prop group está congelada).
    const currentTournament = useTournamentStore.getState().currentTournament;
    const updatedMatch = currentTournament?.qualifiers[group.region]
      ?.find((g) => g.id === group.id)
      ?.matches.find((m) => m.id === matchId);

    if (updatedMatch && updatedMatch.isPlayed) {
      toast.success(
        `Match played! ${homeTeam?.name} ${updatedMatch.homeScore} - ${updatedMatch.awayScore} ${awayTeam?.name}`,
        { duration: 3000 }
      );
    }
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
            Back to Regions
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
                ⚽ Draw not yet completed
              </p>
              <p className="text-sm text-grass-soft">
                Please generate the draw and fixtures to assign teams to this group
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
          <span className="hidden sm:inline">Back to Regions</span>
          <span className="sm:hidden">Back</span>
        </Button>
        <div className="text-sm text-grass-soft">
          {playedMatches} / {totalMatches} matches played
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
            <h3 className="font-arcade text-xs text-white text-shadow-retro uppercase">Standings</h3>
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
          <CardTitle>Matches</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {group.matches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                getTeam={getTeam}
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
  onSimulate: () => void;
  onViewDetails: () => void;
}

function MatchCard({ match, getTeam, onSimulate, onViewDetails }: MatchCardProps) {
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
            <span className="hidden sm:inline">Details</span>
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onSimulate();
            }}
            className="gap-1 sm:gap-2"
          >
            <Play className="w-3 h-3" />
            <span className="hidden sm:inline">Play</span>
          </Button>
        )}
      </div>
    </div>
  );
}
