import { useEffect, useMemo } from 'react';
import { Trophy, Play, Hammer, ChevronRight, Shield } from 'lucide-react';
import { useSeasonModeStore } from '../../store/useSeasonModeStore';
import { useModeNav } from '../../hooks/useModeNav';
import { useModeStore } from '../../store/useModeStore';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useFavoritesStore } from '../../store/useFavoritesStore';
import { useLiveMatchdayStore, type LiveMatchdayEntry } from '../../store/useLiveMatchdayStore';
import { type MatchResult } from '../../store/useMatchResultsStore';
import { buildMatchTimeline, hashSeed } from '../../core/liveMatch';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { StandingsTable } from '../ui/StandingsTable';
import { CrestManager } from './CrestManager';
import { isLeagueComplete } from '../../core/formats/league';
import { roundLabel } from '../../core/formats/rounds';
import { tieAggregate, type Bracket, type Tie } from '../../core/formats/bracket';
import type {
  GruposEliminacionTournament,
  LigaTournament,
  ModeTournament,
  EliminacionTournament,
} from '../../core/formats/modeTournament';
import { descriptorForMode } from '../../modes/registry';
import type { Competition } from '../../modes/types';
import type { Match, Team } from '../../types';

function teamName(teams: Team[], id: string | null): string {
  if (!id) return '—';
  return teams.find((t) => t.id === id)?.name ?? id;
}

/**
 * Vista de un modo de temporada: sus competiciones del año en curso más el
 * panel de temporada con ascensos/descensos.
 *
 * Hay exactamente TRES paneles, uno por formato canónico. Antes había un panel
 * por competición de la Liga Villamariense; ahora cada competición se renderiza
 * según su `format`, así que un modo nuevo no agrega componentes. La simulación
 * y la persistencia viven en useSeasonModeStore.
 */
export function SeasonModeView() {
  const activeModeId = useModeStore((s) => s.activeModeId);
  const activeMode = useModeStore((s) => s.activeMode());
  const { status, year, currentYear, descriptor, tournaments, busy, startSeason, setActiveTab } =
    useSeasonModeStore();
  // Sólo el año en curso se juega. Los viejos se miran: el store no deja
  // simular, iniciar ni cerrar desde ahí, y acá no se ofrecen los botones.
  const isCurrentSeason = year !== null && year === currentYear;
  // Misma derivación que usa la sidebar: en desktop navega ella, acá la barra de
  // pestañas queda para mobile y las dos no se pueden desincronizar.
  const nav = useModeNav('league');

  // (Re)cargar la temporada cada vez que cambia el modo activo.
  useEffect(() => {
    if (activeMode && descriptorForMode(activeMode).engine === 'season') {
      useSeasonModeStore.getState().loadForMode(activeMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModeId]);

  if (status === 'loading' || status === 'idle') {
    return <Centered>Cargando temporada…</Centered>;
  }
  if (status === 'error') {
    return <Centered>No se pudo cargar el modo. Revisá la conexión.</Centered>;
  }

  const seasonReady = status === 'ready' && tournaments.length > 0;
  const leagues = tournaments.filter((t): t is LigaTournament => t.format === 'liga');

  const tabs = nav.sections.find((s) => s.key === 'competition')?.items ?? [];
  const activeTab = nav.tab;
  const activeRun = tournaments.find((t) => t.competitionId === activeTab) ?? null;
  const activeCompetition = activeRun
    ? descriptor.competitions.find((c) => c.id === activeRun.competitionId)
    : undefined;

  return (
    <div className="space-y-6">
      {!isCurrentSeason && (
        <p className="px-4 py-2 border-2 border-line bg-grass-dark font-arcade text-[9px] text-grass-soft uppercase">
          Temporada {year} · cerrada — sólo lectura
        </p>
      )}

      <div className="flex flex-wrap gap-2 lg:hidden">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.target.tab ?? t.key)}
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

      {activeTab === 'crests' && <CrestManager />}

      {activeTab === 'main' && status === 'needs-seed' && (
        <Centered>
          <Shield className="w-12 h-12 text-gold mx-auto mb-4" />
          <p className="font-arcade text-sm text-gold mb-3">{activeMode?.name} — sin equipos todavía</p>
          <p className="text-sm text-grass-soft max-w-md">
            Este modo todavía no tiene sus divisiones cargadas. En cuanto se siembren los clubes
            (con su división y skill inicial), vas a poder iniciar la temporada {year} acá.
          </p>
        </Centered>
      )}

      {activeTab === 'main' && status === 'ready' && isCurrentSeason && (
        <Centered>
          <Trophy className="w-12 h-12 text-gold mx-auto mb-4" />
          <p className="font-arcade text-sm text-gold mb-4">Temporada {year} lista para arrancar</p>
          <Button onClick={startSeason} loading={busy} className="gap-2">
            <Play className="w-4 h-4" /> Iniciar temporada {year}
          </Button>
        </Centered>
      )}

      {activeTab === 'main' && status === 'ready' && !isCurrentSeason && (
        <Centered>
          <Trophy className="w-12 h-12 text-grass-soft mx-auto mb-4" />
          <p className="font-arcade text-sm text-grass-soft">
            La temporada {year} nunca se jugó
          </p>
        </Centered>
      )}

      {seasonReady && activeRun && activeCompetition && (
        <CompetitionPanel run={activeRun} competition={activeCompetition} />
      )}
      {seasonReady && activeTab === 'season' && <SeasonPanel leagues={leagues} />}
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

/** Un torneo se dibuja según su formato. Tres formatos, tres paneles. */
function CompetitionPanel({
  run,
  competition,
}: {
  run: ModeTournament;
  competition: Competition;
}) {
  if (run.format === 'liga') {
    return <LigaPanel run={run} competition={competition} />;
  }
  if (run.format === 'eliminacion') {
    return <EliminacionPanel run={run} />;
  }
  return <GruposEliminacionPanel run={run} />;
}

// ---------------------------------------------------------------------------
// Formato 1: liga
// ---------------------------------------------------------------------------

function LigaPanel({ run, competition }: { run: LigaTournament; competition: Competition }) {
  const teams = useTournamentStore((s) => s.teams);
  const busy = useSeasonModeStore((s) => s.busy);
  const favoriteTeamIds = useFavoritesStore((s) => s.favoriteTeamIds);
  const openLiveSession = useLiveMatchdayStore((s) => s.openSession);

  const highlightTop = competition.format === 'liga' ? competition.highlightTop : undefined;

  const nextMatchday = useMemo(() => {
    const unplayed = run.state.matches.filter((m) => !m.isPlayed);
    if (unplayed.length === 0) return null;
    return Math.min(...unplayed.map((m) => m.matchday ?? 0));
  }, [run.state.matches]);

  const totalMatchdays = useMemo(
    () => Math.max(0, ...run.state.matches.map((m) => m.matchday ?? 0)),
    [run.state.matches],
  );

  const currentFixtures = run.state.matches.filter((m) => m.matchday === nextMatchday);

  // Juega una fecha y la reproduce en vivo (mismo overlay que el Mundial):
  // commit-then-replay. La fecha se simula/persiste en el store; después se
  // arma el timeline minuto a minuto desde el marcador final (seed = matchId).
  const playFechaLive = async (md: number) => {
    await useSeasonModeStore.getState().simulateMatchday(run.id, md);
    const updated = useSeasonModeStore
      .getState()
      .tournaments.find((t) => t.id === run.id) as LigaTournament | undefined;
    if (!updated) return;
    const played = updated.state.matches.filter(
      (m) => m.matchday === md && m.isPlayed && m.homeScore != null && m.awayScore != null,
    );
    if (played.length === 0) return;

    const favs = new Set(favoriteTeamIds);
    const title = `${competition.name} · Fecha ${md}`;
    const entries: LiveMatchdayEntry[] = played.map((m) => ({
      matchId: m.id,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      timeline: buildMatchTimeline({ homeScore: m.homeScore!, awayScore: m.awayScore!, seed: hashSeed(m.id) }),
      groupName: title,
      isFavorite: favs.has(m.homeTeamId) || favs.has(m.awayTeamId),
      homeEnergy: 100,
      awayEnergy: 100,
      energyHidden: true, // los modos de temporada no modelan energía
    }));
    const allResults: MatchResult[] = played.map((m) => ({
      homeTeam: teamName(teams, m.homeTeamId),
      awayTeam: teamName(teams, m.awayTeamId),
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeScore: m.homeScore!,
      awayScore: m.awayScore!,
      groupName: title,
      isFavorite: favs.has(m.homeTeamId) || favs.has(m.awayTeamId),
    }));
    openLiveSession({ title, entries, allResults, hiddenCount: 0 });
  };

  const playAll = async () => {
    for (let md = 1; md <= totalMatchdays; md++) {
      await useSeasonModeStore.getState().simulateMatchday(run.id, md);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle>{run.name}</CardTitle>
            <div className="flex gap-2">
              {nextMatchday !== null ? (
                <>
                  <Button size="sm" onClick={() => playFechaLive(nextMatchday)} loading={busy} className="gap-1">
                    <Play className="w-3 h-3" /> Fecha {nextMatchday} en vivo
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
          <StandingsTable
            standings={run.state.standings}
            teams={teams}
            matches={run.state.matches}
            highlightQualified={highlightTop}
          />
          {highlightTop !== undefined && (
            <p className="text-[10px] text-grass-soft mt-2 uppercase font-arcade">
              Verde: zona de ascenso ({highlightTop} primeros)
            </p>
          )}
        </CardContent>
      </Card>

      {nextMatchday !== null && (
        <Card>
          <CardHeader>
            <CardTitle>Próxima fecha ({nextMatchday})</CardTitle>
          </CardHeader>
          <CardContent>
            <FixtureList matches={currentFixtures} teams={teams} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FixtureList({ matches, teams }: { matches: Match[]; teams: Team[] }) {
  return (
    <ul className="space-y-2">
      {matches.map((m) => (
        <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="flex-1 text-right truncate">{teamName(teams, m.homeTeamId)}</span>
          <span className="px-3 font-terminal text-grass-soft">vs</span>
          <span className="flex-1 truncate">{teamName(teams, m.awayTeamId)}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Formato 2: grupos + eliminación
// ---------------------------------------------------------------------------

function GruposEliminacionPanel({ run }: { run: GruposEliminacionTournament }) {
  const teams = useTournamentStore((s) => s.teams);
  const busy = useSeasonModeStore((s) => s.busy);

  const nextMatchday = useMemo(() => {
    const unplayed = run.state.groups.groups.flatMap((g) => g.matches).filter((m) => !m.isPlayed);
    if (unplayed.length === 0) return null;
    return Math.min(...unplayed.map((m) => m.matchday ?? 0));
  }, [run.state.groups]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle>{run.name}</CardTitle>
            {nextMatchday !== null && (
              <Button
                size="sm"
                loading={busy}
                className="gap-1"
                onClick={() => useSeasonModeStore.getState().simulateMatchday(run.id, nextMatchday)}
              >
                <Play className="w-3 h-3" /> Jugar fecha {nextMatchday}
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {run.state.groups.groups.map((group) => (
          <Card key={group.id}>
            <CardHeader>
              <CardTitle>{group.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <StandingsTable
                standings={group.standings}
                teams={teams}
                matches={group.matches}
                highlightQualified={run.state.groups.config.qualifiersPerGroup}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {run.state.bracket && <BracketRounds bracket={run.state.bracket} tournamentId={run.id} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formato 3: eliminación
// ---------------------------------------------------------------------------

function EliminacionPanel({ run }: { run: EliminacionTournament }) {
  const teams = useTournamentStore((s) => s.teams);

  return (
    <div className="space-y-6">
      {run.state.championId && (
        <Card>
          <CardContent>
            <div className="text-center py-4">
              <Trophy className="w-10 h-10 text-gold mx-auto mb-2" />
              <p className="font-arcade text-sm text-gold">Campeón · {run.name}</p>
              <p className="text-lg text-white mt-1">{teamName(teams, run.state.championId)}</p>
              <p className="text-xs text-grass-soft mt-1">
                Subcampeón: {teamName(teams, run.state.runnerUpId ?? null)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      <BracketRounds bracket={run.state} tournamentId={run.id} />
    </div>
  );
}

/** Las rondas de un cuadro, con su botón de jugar. Sirve para los formatos 2 y 3. */
function BracketRounds({ bracket, tournamentId }: { bracket: Bracket; tournamentId: string }) {
  const teams = useTournamentStore((s) => s.teams);
  const busy = useSeasonModeStore((s) => s.busy);

  const playRound = async (ties: Tie[]) => {
    for (const tie of ties) {
      if (!tie.winnerId) await useSeasonModeStore.getState().simulateTie(tournamentId, tie.id);
    }
  };

  const rounds = [
    ...bracket.rounds,
    ...(bracket.thirdPlaceTie
      ? [{ round: bracket.thirdPlaceTie.round, ties: [bracket.thirdPlaceTie] }]
      : []),
  ];

  return (
    <>
      {rounds.map((round, i) => {
        const pending = round.ties.filter((t) => !t.winnerId && t.homeTeamId && t.awayTeamId);
        return (
          <Card key={`${round.round}-${i}`}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{roundLabel(round.round)}</CardTitle>
                {pending.length > 0 && (
                  <Button size="sm" onClick={() => playRound(round.ties)} loading={busy} className="gap-1">
                    <Play className="w-3 h-3" /> Jugar ronda
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {round.ties.map((tie) => (
                  <TieRow
                    key={tie.id}
                    tie={tie}
                    teams={teams}
                    busy={busy}
                    onPlay={() => useSeasonModeStore.getState().simulateTie(tournamentId, tie.id)}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}

function TieRow({ tie, teams, busy, onPlay }: { tie: Tie; teams: Team[]; busy: boolean; onPlay: () => void }) {
  const agg = tieAggregate(tie);

  return (
    <li className="flex items-center gap-2 text-sm border-b border-line/40 pb-2">
      <span className={`flex-1 text-right truncate ${tie.winnerId === tie.homeTeamId ? 'text-gold font-bold' : ''}`}>
        {teamName(teams, tie.homeTeamId)}
      </span>
      <span className="px-2 font-terminal tabular-nums text-grass-soft min-w-[3rem] text-center">
        {agg ? `${agg.home}–${agg.away}` : 'vs'}
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
// Panel de temporada (ascensos y descensos)
// ---------------------------------------------------------------------------

function SeasonPanel({ leagues }: { leagues: LigaTournament[] }) {
  const teams = useTournamentStore((s) => s.teams);
  const { year, currentYear, busy, closeSeason, descriptor } = useSeasonModeStore();

  const promotionCount = descriptor.promotion?.count ?? 0;
  const expected = descriptor.divisions.length;
  const allComplete =
    expected > 0 && leagues.length === expected && leagues.every((l) => isLeagueComplete(l.state));
  // Una temporada vieja ya aplicó sus ascensos: volver a cerrarla mandaría el
  // modo para atrás. Se muestran las tablas, no el botón.
  const isCurrentSeason = year !== null && year === currentYear;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Temporada {year}</CardTitle>
        </CardHeader>
        <CardContent>
          {isCurrentSeason ? (
            <>
              <p className="text-sm text-grass-soft mb-4">
                Al cerrar la temporada, los {promotionCount} mejores de cada división ascienden y los{' '}
                {promotionCount} peores descienden, y arranca la temporada{' '}
                {year !== null ? year + 1 : ''}.
              </p>
              <Button onClick={closeSeason} loading={busy} disabled={!allComplete} className="gap-2">
                <Hammer className="w-4 h-4" /> Cerrar temporada y aplicar ascensos/descensos
              </Button>
              {!allComplete && (
                <p className="text-[10px] text-grass-soft mt-2 uppercase font-arcade">
                  Requiere todas las ligas completas
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-grass-soft">
              Temporada cerrada: sus ascensos y descensos ya se aplicaron. La que se está
              jugando es la {currentYear}.
            </p>
          )}
        </CardContent>
      </Card>

      {leagues.map((l) => (
        <Card key={l.id}>
          <CardHeader>
            <CardTitle>{l.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <StandingsTable
              standings={l.state.standings}
              teams={teams}
              matches={l.state.matches}
              highlightQualified={promotionCount}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
