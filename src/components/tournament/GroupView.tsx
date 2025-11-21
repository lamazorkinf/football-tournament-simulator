import type { Group, Team, Match } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { StandingsTable } from '../ui/StandingsTable';
import { TeamFlag } from '../ui/TeamFlag';
import { MatchDetailModal } from './MatchDetailModal';
import { ArrowLeft, Play, PlayCircle, Info } from 'lucide-react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { toast } from 'sonner';
import { useState } from 'react';

interface GroupViewProps {
  group: Group;
  teams: Team[];
  onBack: () => void;
}

export function GroupView({ group, teams, onBack }: GroupViewProps) {
  const { simulateMatch, simulateAllGroupMatches } = useTournamentStore();
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  const getTeam = (teamId: string) => {
    return teams.find((t) => t.id === teamId);
  };

  const handleSimulateMatch = (matchId: string) => {
    const match = group.matches.find((m) => m.id === matchId);
    if (!match) return;

    const homeTeam = getTeam(match.homeTeamId);
    const awayTeam = getTeam(match.awayTeamId);

    simulateMatch(matchId, group.id, 'qualifier');

    // Show toast with result
    const updatedMatch = group.matches.find((m) => m.id === matchId);
    if (updatedMatch && updatedMatch.isPlayed) {
      toast.success(
        `Match played! ${homeTeam?.name} ${updatedMatch.homeScore} - ${updatedMatch.awayScore} ${awayTeam?.name}`,
        { duration: 3000 }
      );
    }
  };

  const handleSimulateAll = () => {
    const unplayedCount = group.matches.filter((m) => !m.isPlayed).length;

    if (unplayedCount === 0) {
      toast.info('All matches have been played');
      return;
    }

    if (unplayedCount > 5) {
      if (!confirm(`This will simulate ${unplayedCount} matches. Continue?`)) {
        return;
      }
    }

    simulateAllGroupMatches(group.id, 'qualifier');
    toast.success(`Simulated ${unplayedCount} matches!`);
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
          <CardHeader className="bg-primary-600 text-white rounded-t-lg">
            <CardTitle className="text-white">
              {group.region} - {group.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="py-12">
            <div className="text-center">
              <p className="text-lg text-gray-600 mb-2">⚽ Draw not yet completed</p>
              <p className="text-sm text-gray-500">
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
        <div className="text-sm text-gray-600">
          {playedMatches} / {totalMatches} matches played
        </div>
      </div>

      <Card>
        <CardHeader className="bg-primary-600 text-white rounded-t-lg">
          <CardTitle className="text-white">
            {group.region} - {group.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Standings</h3>
            {playedMatches < totalMatches && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleSimulateAll}
                className="gap-2"
              >
                <PlayCircle className="w-4 h-4" />
                Simulate All Matches
              </Button>
            )}
          </div>
          <StandingsTable
            standings={group.standings}
            teams={teams}
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
      className={`flex items-center justify-between p-4 rounded-lg border ${
        match.isPlayed
          ? 'bg-gray-50 border-gray-200 cursor-pointer hover:shadow-md transition-all'
          : 'bg-white border-primary-200 hover:border-primary-400 transition-colors'
      }`}
      onClick={match.isPlayed ? onViewDetails : undefined}
    >
      <div className="flex-1 flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1">
          {homeTeam && <TeamFlag teamId={homeTeam.id} teamName={homeTeam.name} flagUrl={homeTeam.flag} size={32} />}
          <span className="font-medium text-sm sm:text-base">
            {homeTeam?.name || match.homeTeamId}
          </span>
        </div>

        <div className="flex items-center gap-4 mx-4">
          {match.isPlayed ? (
            <div className="flex items-center gap-3 font-bold text-lg">
              <span className="text-gray-900">{match.homeScore}</span>
              <span className="text-gray-400">-</span>
              <span className="text-gray-900">{match.awayScore}</span>
            </div>
          ) : (
            <span className="text-gray-400 font-medium">vs</span>
          )}
        </div>

        <div className="flex items-center gap-3 flex-1 justify-end">
          <span className="font-medium text-sm sm:text-base text-right">
            {awayTeam?.name || match.awayTeamId}
          </span>
          {awayTeam && <TeamFlag teamId={awayTeam.id} teamName={awayTeam.name} flagUrl={awayTeam.flag} size={32} />}
        </div>
      </div>

      <div className="flex items-center gap-2 ml-4">
        {match.isPlayed ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails();
            }}
            className="gap-2"
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
            className="gap-2"
          >
            <Play className="w-3 h-3" />
            <span className="hidden sm:inline">Play</span>
          </Button>
        )}
      </div>
    </div>
  );
}
