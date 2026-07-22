import { useState } from 'react';
import type { Cycle, Team, KnockoutMatch, Region } from '../../types';
import { CYCLE_REGIONS } from '../../core/cycle';
import { isMatchPlayable } from '../../core/calendar';
import { continentalRoundLabel } from '../../utils/cycleProgress';
import { useTournamentStore } from '../../store/useTournamentStore';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { ScoreBug } from '../ui/ScoreBug';
import { Play, Trophy, Globe2 } from 'lucide-react';
import { toast } from 'sonner';

const REGION_LABELS: Record<Region, string> = {
  Europe: 'Europa', America: 'América', Africa: 'África', Asia: 'Asia',
};

const ROUND_KEYS: { key: 'roundOf64' | 'roundOf32' | 'roundOf16' | 'quarterFinals' | 'semiFinals'; label: string }[] = [
  { key: 'roundOf64', label: 'R64' },
  { key: 'roundOf32', label: 'R32' },
  { key: 'roundOf16', label: 'R16' },
  { key: 'quarterFinals', label: 'CUARTOS' },
  { key: 'semiFinals', label: 'SEMIS' },
];

interface ContinentalViewProps {
  cycle: Cycle;
  teams: Team[];
}

export function ContinentalView({ cycle, teams }: ContinentalViewProps) {
  const { simulateContinentalMatch, isSavingMatch } = useTournamentStore();
  const [region, setRegion] = useState<Region>(CYCLE_REGIONS[0]);

  const getTeam = (id: string) => teams.find((t) => t.id === id);
  const bracket = cycle.continental.brackets[region];

  const handlePlay = async (matchId: string) => {
    if (isSavingMatch) {
      toast.warning('Espera a que se guarde el partido anterior');
      return;
    }
    await simulateContinentalMatch(matchId);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Globe2 className="w-6 h-6 text-gold" />
            <CardTitle>Torneos Continentales</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-grass-soft text-sm">
            Jornada {cycle.calendar.matchday} · {continentalRoundLabel(cycle.calendar.matchday)}
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {CYCLE_REGIONS.map((r) => (
              <button
                key={r}
                onClick={() => setRegion(r)}
                className={`px-4 py-2 min-h-11 lg:min-h-0 font-arcade text-[10px] uppercase border-2 transition-colors ${
                  region === r
                    ? 'bg-grass text-white border-line'
                    : 'text-grass-soft border-grass hover:bg-grass/40 hover:text-white'
                }`}
              >
                {REGION_LABELS[r]}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{REGION_LABELS[region]}</CardTitle>
        </CardHeader>
        <CardContent>
          {bracket.championId && (
            <div className="mb-4 flex items-center gap-2 text-gold font-arcade text-xs">
              <Trophy className="w-5 h-5" />
              Campeón: {getTeam(bracket.championId)?.name ?? bracket.championId}
            </div>
          )}
          {bracket.thirdPlaceId && (
            <div className="mb-4 flex items-center gap-2 text-grass-soft font-arcade text-xs">
              <Trophy className="w-4 h-4" />
              3º: {getTeam(bracket.thirdPlaceId)?.name ?? bracket.thirdPlaceId}
            </div>
          )}

          <div className="overflow-x-auto">
            <div className="flex gap-4 min-w-max pb-2">
              {ROUND_KEYS.map(({ key, label }) => (
                <RoundColumn
                  key={key}
                  label={label}
                  matches={bracket[key]}
                  cycle={cycle}
                  getTeam={getTeam}
                  onPlay={handlePlay}
                  isSaving={isSavingMatch}
                />
              ))}
              <RoundColumn
                label="FINAL"
                matches={bracket.final ? [bracket.final] : []}
                cycle={cycle}
                getTeam={getTeam}
                onPlay={handlePlay}
                isSaving={isSavingMatch}
              />
              <RoundColumn
                label="3ER PUESTO"
                matches={bracket.thirdPlace ? [bracket.thirdPlace] : []}
                cycle={cycle}
                getTeam={getTeam}
                onPlay={handlePlay}
                isSaving={isSavingMatch}
              />
            </div>
          </div>

          {bracket.byeTeamIds.length > 0 && (
            <div className="mt-4 text-xs text-grass-soft">
              <span className="font-arcade text-[10px] uppercase">Byes a R32:</span>{' '}
              {bracket.byeTeamIds.map((id) => getTeam(id)?.id.toUpperCase() ?? id).join(' · ')}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface RoundColumnProps {
  label: string;
  matches: KnockoutMatch[];
  cycle: Cycle;
  getTeam: (id: string) => Team | undefined;
  onPlay: (id: string) => void;
  isSaving: boolean;
}

function RoundColumn({ label, matches, cycle, getTeam, onPlay, isSaving }: RoundColumnProps) {
  return (
    <div className="flex flex-col gap-3 w-64 flex-shrink-0">
      <h4 className="font-arcade text-[10px] text-gold uppercase text-center">{label}</h4>
      {matches.length === 0 ? (
        <p className="text-center text-grass-soft text-xs">—</p>
      ) : (
        matches.map((m) => (
          <BracketMatch key={m.id} match={m} cycle={cycle} getTeam={getTeam} onPlay={onPlay} isSaving={isSaving} />
        ))
      )}
    </div>
  );
}

interface BracketMatchProps {
  match: KnockoutMatch;
  cycle: Cycle;
  getTeam: (id: string) => Team | undefined;
  onPlay: (id: string) => void;
  isSaving: boolean;
}

function BracketMatch({ match, cycle, getTeam, onPlay, isSaving }: BracketMatchProps) {
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
        <Button variant="primary" size="sm" onClick={() => onPlay(match.id)} disabled={isSaving} className="w-full gap-1">
          <Play className="w-3 h-3" /> Play
        </Button>
      )}
    </div>
  );
}
