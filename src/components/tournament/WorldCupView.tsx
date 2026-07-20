import type { WorldCupGroup, Team, KnockoutBracket, Match } from '../../types';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { StandingsTable } from '../ui/StandingsTable';
import { TeamFlag } from '../ui/TeamFlag';
import { MatchDetailModal } from './MatchDetailModal';
import { WorldCupGridView } from './WorldCupGridView';
import { ArrowLeft, Play, Trophy, Award, Info, Grid, List } from 'lucide-react';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useState } from 'react';
import { KnockoutView } from './KnockoutView';
import { areGroupsComplete } from '../../core/knockout';
import { toast } from 'sonner';

interface WorldCupViewProps {
  groups: WorldCupGroup[];
  knockout: KnockoutBracket;
  championId?: string;
  runnerUpId?: string;
  thirdPlaceId?: string;
  fourthPlaceId?: string;
  teams: Team[];
  onBack: () => void;
  onNewTournament?: () => void;
}

export function WorldCupView({
  groups,
  knockout,
  championId,
  runnerUpId,
  thirdPlaceId,
  fourthPlaceId,
  teams,
  onBack,
  onNewTournament,
}: WorldCupViewProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showKnockout, setShowKnockout] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { advanceToKnockout, simulateMatch } = useTournamentStore();

  const selectedGroup = selectedGroupId
    ? groups.find((g) => g.id === selectedGroupId)
    : null;

  const groupsComplete = areGroupsComplete(groups);
  const knockoutStarted = knockout.roundOf16.length > 0;

  if (showKnockout) {
    return (
      <KnockoutView
        knockout={knockout}
        teams={teams}
        championId={championId}
        runnerUpId={runnerUpId}
        thirdPlaceId={thirdPlaceId}
        fourthPlaceId={fourthPlaceId}
        onBack={() => setShowKnockout(false)}
        onNewTournament={onNewTournament}
      />
    );
  }

  if (selectedGroup) {
    return (
      <WorldCupGroupDetail
        group={selectedGroup}
        teams={teams}
        onBack={() => setSelectedGroupId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back to Qualifiers</span>
          <span className="sm:hidden">Back</span>
        </Button>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 border-2 border-grass p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 flex items-center gap-2 text-sm transition-colors ${
                viewMode === 'grid'
                  ? 'bg-gold text-night'
                  : 'text-grass-soft hover:bg-grass/40'
              }`}
            >
              <Grid className="w-4 h-4" />
              <span className="hidden sm:inline">Grid</span>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 flex items-center gap-2 text-sm transition-colors ${
                viewMode === 'list'
                  ? 'bg-gold text-night'
                  : 'text-grass-soft hover:bg-grass/40'
              }`}
            >
              <List className="w-4 h-4" />
              <span className="hidden sm:inline">List</span>
            </button>
          </div>

          {knockoutStarted && (
            <Button
              variant="primary"
              onClick={() => setShowKnockout(true)}
              className="gap-2"
            >
              <Award className="w-4 h-4" />
              <span className="hidden sm:inline">View Knockout Stage</span>
              <span className="sm:hidden">Knockout</span>
            </Button>
          )}
        </div>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' ? (
        <WorldCupGridView
          groups={groups}
          teams={teams}
          onSimulateMatch={(matchId, groupId) => {
            simulateMatch(matchId, groupId, 'world-cup');
          }}
        />
      ) : (
        <>
          {/* List View - Original */}
          <div className="bg-grass border-4 border-line shadow-hard-panel text-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Trophy className="w-8 h-8" />
                  <h2 className="font-arcade text-lg text-white text-shadow-retro">FIFA World Cup</h2>
                </div>
                <p className="text-white/70">
                  {groups.reduce((acc, g) => acc + g.teamIds.length, 0)} teams competing in {groups.length} groups
                </p>
              </div>
              {groupsComplete && !knockoutStarted && (
                <Button
                  variant="primary"
                  onClick={advanceToKnockout}
                  className="gap-2"
                >
                  <Award className="w-5 h-5" />
                  Advance to Knockout
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {groups.map((group) => {
              const totalMatches = group.matches.length;
              const playedMatches = group.matches.filter((m) => m.isPlayed).length;
              const progress = totalMatches > 0 ? (playedMatches / totalMatches) * 100 : 0;

              return (
                <div
                  key={group.id}
                  className="border-2 border-grass p-4 hover:border-gold transition-all cursor-pointer bg-grass-dark"
                  onClick={() => setSelectedGroupId(group.id)}
                >
                  <h3 className="font-bold text-xl mb-3 text-white">{group.name}</h3>

                  <div className="space-y-2 mb-3">
                    {group.standings.slice(0, 4).map((standing, idx) => {
                      const team = teams.find((t) => t.id === standing.teamId);
                      return (
                        <div
                          key={standing.teamId}
                          className={`flex items-center justify-between text-sm ${
                            idx < 2 ? 'font-semibold text-led' : 'text-grass-soft'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className="w-4 text-center">{idx + 1}</span>
                            <span>{team?.flag}</span>
                            <span className="truncate">{team?.name}</span>
                          </span>
                          <span>{standing.points} pts</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="w-full bg-black/40 border border-grass h-2 mb-2">
                    <div
                      className="bg-gold h-2 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <p className="text-xs text-grass-soft text-center">
                    {playedMatches} / {totalMatches} matches
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

interface WorldCupGroupDetailProps {
  group: WorldCupGroup;
  teams: Team[];
  onBack: () => void;
}

function WorldCupGroupDetail({ group, teams, onBack }: WorldCupGroupDetailProps) {
  const { simulateMatch } = useTournamentStore();
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  const getTeam = (teamId: string) => {
    return teams.find((t) => t.id === teamId);
  };

  const handleSimulateMatch = (matchId: string) => {
    const match = group.matches.find((m: Match) => m.id === matchId);
    if (!match) return;

    const homeTeam = getTeam(match.homeTeamId);
    const awayTeam = getTeam(match.awayTeamId);

    simulateMatch(matchId, group.id, 'world-cup');

    const updatedMatch = group.matches.find((m: Match) => m.id === matchId);
    if (updatedMatch && updatedMatch.isPlayed) {
      toast.success(
        `⚽ ${homeTeam?.name} ${updatedMatch.homeScore} - ${updatedMatch.awayScore} ${awayTeam?.name}`,
        { duration: 3000 }
      );
    }
  };

  const totalMatches = group.matches.length;
  const playedMatches = group.matches.filter((m: Match) => m.isPlayed).length;

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
          <span className="hidden sm:inline">Back to Groups</span>
          <span className="sm:hidden">Back</span>
        </Button>
        <div className="text-sm text-grass-soft">
          {playedMatches} / {totalMatches} matches played
        </div>
      </div>

      <Card>
        <CardHeader className="bg-grass">
          <CardTitle className="text-white flex items-center gap-2">
            <Trophy className="w-6 h-6" />
            World Cup - {group.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Standings</h3>
          </div>
          <StandingsTable
            standings={group.standings}
            teams={teams}
            highlightQualified={2}
          />
          <p className="text-xs text-grass-soft mt-2">
            * Top 2 teams advance to knockout stage
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Matches</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {group.matches.map((match: Match) => (
              <div
                key={match.id}
                className={`flex items-center justify-between p-4 border-2 ${
                  match.isPlayed
                    ? 'bg-grass-dark border-grass cursor-pointer hover:bg-grass/20 transition-colors'
                    : 'bg-grass-dark border-gold hover:border-led transition-colors'
                }`}
                onClick={match.isPlayed ? () => setSelectedMatch(match) : undefined}
              >
                <div className="flex-1 flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    {(() => {
                      const homeTeam = getTeam(match.homeTeamId);
                      return homeTeam ? <TeamFlag teamId={homeTeam.id} teamName={homeTeam.name} flagUrl={homeTeam.flag} size={32} /> : null;
                    })()}
                    <span className="font-medium text-sm sm:text-base">
                      {getTeam(match.homeTeamId)?.name || match.homeTeamId}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 mx-4">
                    {match.isPlayed ? (
                      <div className="flex items-center gap-3 font-bold text-lg font-terminal tabular-nums">
                        <span className="text-white">{match.homeScore}</span>
                        <span className="text-grass-soft">-</span>
                        <span className="text-white">{match.awayScore}</span>
                      </div>
                    ) : (
                      <span className="text-grass-soft font-medium">vs</span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 flex-1 justify-end">
                    <span className="font-medium text-sm sm:text-base text-right">
                      {getTeam(match.awayTeamId)?.name || match.awayTeamId}
                    </span>
                    {(() => {
                      const awayTeam = getTeam(match.awayTeamId);
                      return awayTeam ? <TeamFlag teamId={awayTeam.id} teamName={awayTeam.name} flagUrl={awayTeam.flag} size={32} /> : null;
                    })()}
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {match.isPlayed ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMatch(match);
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
                        handleSimulateMatch(match.id);
                      }}
                      className="gap-2"
                    >
                      <Play className="w-3 h-3" />
                      <span className="hidden sm:inline">Play</span>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
