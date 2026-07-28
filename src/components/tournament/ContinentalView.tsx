import { useState } from 'react';
import type { Cycle, Team, KnockoutMatch, Region } from '../../types';
import { CYCLE_REGIONS } from '../../core/cycle';
import { isMatchPlayable, phaseYear } from '../../core/calendar';
import { continentalRoundLabel, isContinentalDrawn } from '../../utils/cycleProgress';
import { REGION_LABELS } from '../../utils/regionLabels';
import { useTournamentStore } from '../../store/useTournamentStore';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { ScoreBug } from '../ui/ScoreBug';
import { EmptyState } from '../ui/EmptyState';
import { showMatchResultToast } from '../ui/MatchResultToast';
import { MatchSimActions, JornadaSimActions } from '../ui/SimActions';
import { useCycleJornada } from '../../hooks/useCycleJornada';
import { Trophy, Globe2, Lock } from 'lucide-react';
import { toast } from 'sonner';


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
  onNavigate?: (view: string) => void;
}

export function ContinentalView({ cycle, teams, onNavigate }: ContinentalViewProps) {
  const { simulateContinentalMatch, isSavingMatch } = useTournamentStore();
  const jornadaSim = useCycleJornada(cycle, teams);
  const [region, setRegion] = useState<Region>(CYCLE_REGIONS[0]);

  const getTeam = (id: string) => teams.find((t) => t.id === id);
  const bracket = cycle.continental.brackets[region];

  // Recibe el partido entero (no sólo el id) para poder nombrar a los dos
  // equipos en el aviso sin volver a buscarlo en el bracket.
  const handlePlay = async (match: KnockoutMatch) => {
    if (isSavingMatch) {
      toast.warning('Espera a que se guarde el partido anterior');
      return;
    }
    const result = await simulateContinentalMatch(match.id);
    if (!result) {
      toast.info('No se pudo simular ahora (puede faltar resolver la ronda anterior)');
      return;
    }
    showMatchResultToast({
      homeName: getTeam(match.homeTeamId)?.name ?? match.homeTeamId,
      awayName: getTeam(match.awayTeamId)?.name ?? match.awayTeamId,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      penalties: result.penalties,
    });
  };

  if (!isContinentalDrawn(cycle)) {
    return (
      <EmptyState
        icon={Lock}
        title="Torneos continentales sin sortear"
        description="Sorteá los cuatro torneos continentales desde Progreso para empezar el ciclo."
        action={{ label: 'Ir a Progreso', onClick: () => onNavigate?.('wizard') }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Globe2 className="w-6 h-6 text-gold" />
            <CardTitle>Torneos Continentales {phaseYear('continental', cycle.year)}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <p className="text-grass-soft text-sm">
              Jornada {cycle.calendar.matchday} · {continentalRoundLabel(cycle.calendar.matchday)}
            </p>
            <JornadaSimActions
              jornadaLabel={jornadaSim.title}
              onSimulate={jornadaSim.simulate}
              onSimulateLive={jornadaSim.simulateLive}
              disabled={!jornadaSim.canSimulate}
              busy={jornadaSim.isBusy}
              hint="se juega entera, en las cuatro confederaciones."
            />
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {CYCLE_REGIONS.map((r) => (
              <button
                key={r}
                onClick={() => setRegion(r)}
                // Sin `uppercase`: "América" y "África" son nombres propios y no
                // se pueden reescribir sin acento, y Press Start 2P dibuja las
                // mayúsculas acentuadas a altura de minúscula (se leería AMéRICA).
                className={`px-4 py-2 min-h-11 lg:min-h-0 font-arcade text-[10px] border-2 transition-colors ${
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
  onPlay: (match: KnockoutMatch) => void;
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
  onPlay: (match: KnockoutMatch) => void;
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
        <MatchSimActions
          onSimulate={() => onPlay(match)}
          live={{
            matchId: match.id,
            homeTeamId: match.homeTeamId,
            awayTeamId: match.awayTeamId,
            kind: 'continental',
          }}
          disabled={isSaving}
          stacked
        />
      )}
    </div>
  );
}
