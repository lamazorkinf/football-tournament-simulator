import type { Cycle, Team, Match, KnockoutMatch, WorldCupGroup } from '../../types';
import { isMatchPlayable } from '../../core/calendar';
import { isConfederationsDrawn } from '../../utils/cycleProgress';
import { useTournamentStore } from '../../store/useTournamentStore';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { StandingsTable } from '../ui/StandingsTable';
import { ScoreBug } from '../ui/ScoreBug';
import { EmptyState } from '../ui/EmptyState';
import { WatchLiveButton } from './WatchLiveButton';
import { Play, Trophy, Award, Lock } from 'lucide-react';
import { toast } from 'sonner';

type MatchWithPenalties = Match & { penalties?: { homeScore: number; awayScore: number } };

interface ConfederationsCupViewProps {
  cycle: Cycle;
  teams: Team[];
  onNavigate?: (view: string) => void;
}

export function ConfederationsCupView({ cycle, teams, onNavigate }: ConfederationsCupViewProps) {
  const { simulateConfederationsMatch, isSavingMatch } = useTournamentStore();
  const getTeam = (id: string) => teams.find((t) => t.id === id);
  const confed = cycle.confederationsCup;

  const handlePlay = async (matchId: string) => {
    if (isSavingMatch) {
      toast.warning('Espera a que se guarde el partido anterior');
      return;
    }
    await simulateConfederationsMatch(matchId);
  };

  if (!isConfederationsDrawn(cycle)) {
    return (
      <EmptyState
        icon={Lock}
        title="Copa Confederaciones bloqueada"
        description="Se desbloquea cuando terminen los cuatro torneos continentales y se conozcan los 8 finalistas."
        action={{ label: 'Ir a Continental', onClick: () => onNavigate?.('continental') }}
      />
    );
  }

  const knockout: { label: string; match: KnockoutMatch | null }[] = [
    ...confed.knockout.semiFinals.map((m, i) => ({ label: `Semifinal ${i + 1}`, match: m })),
    { label: '3er Puesto', match: confed.knockout.thirdPlace },
    { label: 'Final', match: confed.knockout.final },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Award className="w-6 h-6 text-gold" />
            <CardTitle>Copa Confederaciones</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {confed.championId ? (
            <div className="flex items-center gap-2 text-gold font-arcade text-xs">
              <Trophy className="w-5 h-5" />
              Campeón: {getTeam(confed.championId)?.name ?? confed.championId}
            </div>
          ) : (
            <p className="text-grass-soft text-sm">Jornada {cycle.calendar.matchday}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {confed.groups.map((group) => (
          <ConfedGroup
            key={group.id}
            group={group}
            teams={teams}
            cycle={cycle}
            getTeam={getTeam}
            onPlay={handlePlay}
            isSaving={isSavingMatch}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eliminación</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {knockout.map(({ label, match }) => (
              <div key={label} className="space-y-2">
                <h4 className="font-arcade text-[10px] text-gold uppercase">{label}</h4>
                {match ? (
                  <ConfedMatch match={match} cycle={cycle} getTeam={getTeam} onPlay={handlePlay} isSaving={isSavingMatch} />
                ) : (
                  <p className="text-grass-soft text-xs">Pendiente</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ConfedGroupProps {
  group: WorldCupGroup;
  teams: Team[];
  cycle: Cycle;
  getTeam: (id: string) => Team | undefined;
  onPlay: (id: string) => void;
  isSaving: boolean;
}

function ConfedGroup({ group, teams, cycle, getTeam, onPlay, isSaving }: ConfedGroupProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{group.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <StandingsTable standings={group.standings} teams={teams} matches={group.matches} highlightQualified={2} />
        <div className="space-y-2">
          {group.matches.map((m) => (
            <ConfedMatch key={m.id} match={m} cycle={cycle} getTeam={getTeam} onPlay={onPlay} isSaving={isSaving} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface ConfedMatchProps {
  match: MatchWithPenalties;
  cycle: Cycle;
  getTeam: (id: string) => Team | undefined;
  onPlay: (id: string) => void;
  isSaving: boolean;
}

function ConfedMatch({ match, cycle, getTeam, onPlay, isSaving }: ConfedMatchProps) {
  const home = getTeam(match.homeTeamId);
  const away = getTeam(match.awayTeamId);
  const playable = isMatchPlayable(cycle, match.id);
  return (
    <div className="space-y-2">
      {home && away ? (
        <ScoreBug
          size="narrow"
          homeTeam={home}
          awayTeam={away}
          homeScore={match.isPlayed ? match.homeScore : null}
          awayScore={match.isPlayed ? match.awayScore : null}
        />
      ) : (
        <div className="text-grass-soft text-xs text-center">
          {match.homeTeamId} vs {match.awayTeamId}
        </div>
      )}
      {match.penalties && (
        <p className="text-[10px] text-center text-grass-soft">
          Pen. {match.penalties.homeScore}-{match.penalties.awayScore}
        </p>
      )}
      {!match.isPlayed && playable && (
        <div className="space-y-1">
          <Button variant="primary" size="sm" onClick={() => onPlay(match.id)} disabled={isSaving} className="w-full gap-1">
            <Play className="w-3 h-3" /> Play
          </Button>
          <WatchLiveButton
            matchId={match.id}
            homeTeamId={match.homeTeamId}
            awayTeamId={match.awayTeamId}
            kind="confederations"
            disabled={isSaving}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}
