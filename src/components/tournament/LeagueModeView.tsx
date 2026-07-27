import { useEffect, useMemo, useState } from 'react';
import { Trophy, Play, Hammer, ChevronRight, Shield } from 'lucide-react';
import { useLeagueModeStore } from '../../store/useLeagueModeStore';
import { useModeStore } from '../../store/useModeStore';
import { useTournamentStore } from '../../store/useTournamentStore';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { StandingsTable } from '../ui/StandingsTable';
import { isLeagueComplete } from '../../core/formats/league';
import type { LeagueTournament, CupTournament } from '../../core/formats/modeTournament';
import type { TwoLeggedTie } from '../../core/formats/cup';
import type { Team } from '../../types';

const ROUND_LABEL: Record<TwoLeggedTie['round'], string> = {
  'round-of-32': '32avos',
  'round-of-16': 'Octavos',
  quarter: 'Cuartos',
  semi: 'Semis',
  final: 'Final',
};

function teamName(teams: Team[], id: string | null): string {
  if (!id) return '—';
  return teams.find((t) => t.id === id)?.name ?? id;
}

/**
 * Vista de un modo de ligas (league-system): dos ligas por división, una copa a
 * doble partido y el panel de temporada con ascensos/descensos. Todo del año en
 * curso. La simulación y persistencia viven en useLeagueModeStore.
 */
export function LeagueModeView() {
  const activeModeId = useModeStore((s) => s.activeModeId);
  const activeMode = useModeStore((s) => s.activeMode());
  const { status, year, tournaments, busy, startSeason } = useLeagueModeStore();

  // (Re)cargar la temporada cada vez que cambia el modo activo.
  useEffect(() => {
    if (activeMode && activeMode.kind === 'league-system') {
      useLeagueModeStore.getState().loadForMode(activeMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModeId]);

  const [tab, setTab] = useState<string>('season');

  if (status === 'loading' || status === 'idle') {
    return <Centered>Cargando temporada…</Centered>;
  }
  if (status === 'error') {
    return <Centered>No se pudo cargar el modo. Revisá la conexión.</Centered>;
  }
  if (status === 'needs-seed') {
    return (
      <Centered>
        <Shield className="w-12 h-12 text-gold mx-auto mb-4" />
        <p className="font-arcade text-sm text-gold mb-3">{activeMode?.name} — sin equipos todavía</p>
        <p className="text-sm text-grass-soft max-w-md">
          Este modo todavía no tiene sus divisiones cargadas. En cuanto se siembren los clubes
          (con su división y skill inicial), vas a poder iniciar la temporada {year} acá.
        </p>
      </Centered>
    );
  }

  // status === 'ready'
  if (tournaments.length === 0) {
    return (
      <Centered>
        <Trophy className="w-12 h-12 text-gold mx-auto mb-4" />
        <p className="font-arcade text-sm text-gold mb-4">Temporada {year} lista para arrancar</p>
        <Button onClick={startSeason} loading={busy} className="gap-2">
          <Play className="w-4 h-4" /> Iniciar temporada {year}
        </Button>
      </Centered>
    );
  }

  const leagues = tournaments.filter((t): t is LeagueTournament => t.format === 'league');
  const cup = tournaments.find((t): t is CupTournament => t.format === 'cup') ?? null;
  const tabs: Array<{ key: string; label: string }> = [
    ...leagues.map((l) => ({ key: `league-${l.division}`, label: `Liga ${l.division}` })),
    ...(cup ? [{ key: 'cup', label: 'Copa' }] : []),
    { key: 'season', label: 'Temporada' },
  ];

  const activeTab = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 font-arcade text-[10px] uppercase border-2 transition-colors ${
              activeTab === t.key
                ? 'bg-grass text-white border-gold'
                : 'bg-grass-dark text-grass-soft border-line hover:bg-grass/40'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {leagues.map(
        (l) => activeTab === `league-${l.division}` && <LeaguePanel key={l.id} league={l} />,
      )}
      {cup && activeTab === 'cup' && <CupPanel cup={cup} />}
      {activeTab === 'season' && <SeasonPanel leagues={leagues} />}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[50vh] flex items-center justify-center px-6 text-center">
      <div>{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LeaguePanel({ league }: { league: LeagueTournament }) {
  const teams = useTournamentStore((s) => s.teams);
  const busy = useLeagueModeStore((s) => s.busy);
  const { simulateLeagueMatchday } = useLeagueModeStore();

  const nextMatchday = useMemo(() => {
    const unplayed = league.state.matches.filter((m) => !m.isPlayed);
    if (unplayed.length === 0) return null;
    return Math.min(...unplayed.map((m) => m.matchday ?? 0));
  }, [league.state.matches]);

  const totalMatchdays = useMemo(
    () => Math.max(0, ...league.state.matches.map((m) => m.matchday ?? 0)),
    [league.state.matches],
  );

  const currentFixtures = league.state.matches.filter((m) => m.matchday === nextMatchday);

  const playAll = async () => {
    for (let md = 1; md <= totalMatchdays; md++) {
      await useLeagueModeStore.getState().simulateLeagueMatchday(league.id, md);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle>Liga {league.division} · {league.name.match(/\d{4}/)?.[0]}</CardTitle>
            <div className="flex gap-2">
              {nextMatchday !== null ? (
                <>
                  <Button size="sm" onClick={() => simulateLeagueMatchday(league.id, nextMatchday)} loading={busy} className="gap-1">
                    <Play className="w-3 h-3" /> Fecha {nextMatchday}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={playAll} loading={busy}>
                    Jugar todo
                  </Button>
                </>
              ) : (
                <span className="font-arcade text-[10px] text-led uppercase">Liga completa ✓</span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <StandingsTable standings={league.state.standings} teams={teams} matches={league.state.matches} highlightQualified={3} />
          <p className="text-[10px] text-grass-soft mt-2 uppercase font-arcade">
            Verde: zona de ascenso (3 primeros)
          </p>
        </CardContent>
      </Card>

      {nextMatchday !== null && (
        <Card>
          <CardHeader>
            <CardTitle>Próxima fecha ({nextMatchday})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {currentFixtures.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex-1 text-right truncate">{teamName(teams, m.homeTeamId)}</span>
                  <span className="px-3 font-terminal text-grass-soft">vs</span>
                  <span className="flex-1 truncate">{teamName(teams, m.awayTeamId)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CupPanel({ cup }: { cup: CupTournament }) {
  const teams = useTournamentStore((s) => s.teams);
  const busy = useLeagueModeStore((s) => s.busy);
  const { simulateCupTie } = useLeagueModeStore();

  const playRound = async (roundTies: TwoLeggedTie[]) => {
    for (const tie of roundTies) {
      if (!tie.winnerId) await useLeagueModeStore.getState().simulateCupTie(cup.id, tie.id);
    }
  };

  return (
    <div className="space-y-6">
      {cup.state.championId && (
        <Card>
          <CardContent>
            <div className="text-center py-4">
              <Trophy className="w-10 h-10 text-gold mx-auto mb-2" />
              <p className="font-arcade text-sm text-gold">Campeón de Copa</p>
              <p className="text-lg text-white mt-1">{teamName(teams, cup.state.championId)}</p>
              <p className="text-xs text-grass-soft mt-1">
                Subcampeón: {teamName(teams, cup.state.runnerUpId ?? null)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {cup.state.rounds.map((round, i) => {
        const pending = round.filter((t) => !t.winnerId && t.homeTeamId && t.awayTeamId);
        return (
          <Card key={i}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{ROUND_LABEL[round[0].round]}</CardTitle>
                {pending.length > 0 && (
                  <Button size="sm" onClick={() => playRound(round)} loading={busy} className="gap-1">
                    <Play className="w-3 h-3" /> Jugar ronda
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {round.map((tie) => (
                  <TieRow key={tie.id} tie={tie} teams={teams} busy={busy} onPlay={() => simulateCupTie(cup.id, tie.id)} />
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function TieRow({ tie, teams, busy, onPlay }: { tie: TwoLeggedTie; teams: Team[]; busy: boolean; onPlay: () => void }) {
  const played = tie.leg1?.isPlayed && tie.leg2?.isPlayed;
  const aggHome = played ? tie.leg1!.homeScore! + tie.leg2!.awayScore! : null;
  const aggAway = played ? tie.leg1!.awayScore! + tie.leg2!.homeScore! : null;

  return (
    <li className="flex items-center gap-2 text-sm border-b border-line/40 pb-2">
      <span className={`flex-1 text-right truncate ${tie.winnerId === tie.homeTeamId ? 'text-gold font-bold' : ''}`}>
        {teamName(teams, tie.homeTeamId)}
      </span>
      <span className="px-2 font-terminal tabular-nums text-grass-soft min-w-[3rem] text-center">
        {played ? `${aggHome}–${aggAway}` : 'vs'}
      </span>
      <span className={`flex-1 truncate ${tie.winnerId === tie.awayTeamId ? 'text-gold font-bold' : ''}`}>
        {teamName(teams, tie.awayTeamId)}
      </span>
      {tie.penalties && (
        <span className="text-[10px] text-grass-soft">(pen {tie.penalties.homeScore}-{tie.penalties.awayScore})</span>
      )}
      {!tie.winnerId && tie.homeTeamId && tie.awayTeamId && (
        <Button size="sm" variant="ghost" onClick={onPlay} loading={busy} className="!px-2">
          <ChevronRight className="w-4 h-4" />
        </Button>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------

function SeasonPanel({ leagues }: { leagues: LeagueTournament[] }) {
  const teams = useTournamentStore((s) => s.teams);
  const { year, busy, closeSeason } = useLeagueModeStore();

  const allComplete = leagues.length === 2 && leagues.every((l) => isLeagueComplete(l.state));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Temporada {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-grass-soft mb-4">
            Al cerrar la temporada, los 3 mejores de cada división ascienden y los 3 peores
            descienden, y arranca la temporada {year !== null ? year + 1 : ''}.
          </p>
          <Button onClick={closeSeason} loading={busy} disabled={!allComplete} className="gap-2">
            <Hammer className="w-4 h-4" /> Cerrar temporada y aplicar ascensos/descensos
          </Button>
          {!allComplete && (
            <p className="text-[10px] text-grass-soft mt-2 uppercase font-arcade">
              Requiere ambas ligas completas
            </p>
          )}
        </CardContent>
      </Card>

      {leagues.map((l) => (
        <Card key={l.id}>
          <CardHeader>
            <CardTitle>Liga {l.division}</CardTitle>
          </CardHeader>
          <CardContent>
            <StandingsTable standings={l.state.standings} teams={teams} matches={l.state.matches} highlightQualified={3} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
