import { toast } from 'sonner';
import { Trophy, Hammer } from 'lucide-react';
import { useSeasonModeStore } from '../../store/useSeasonModeStore';
import { useModeNav } from '../../hooks/useModeNav';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useModeJornada } from '../../hooks/useModeJornada';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { Button } from '../ui/Button';
import { StandingsTable } from '../ui/StandingsTable';
import { MatchSimActions, JornadaSimActions } from '../ui/SimActions';
import { showMatchResultToast } from '../ui/MatchResultToast';
import { CrestManager } from './CrestManager';
import { isLeagueComplete } from '../../core/formats/league';
import { roundLabel } from '../../core/formats/rounds';
import { isLegPlayable, tieAggregate, type Bracket, type Tie } from '../../core/formats/bracket';
import type {
  GruposEliminacionTournament,
  LigaTournament,
  ModeTournament,
  EliminacionTournament,
} from '../../core/formats/modeTournament';
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
export function SeasonModeView({ onNavigate }: { onNavigate?: (view: string) => void } = {}) {
  const { status, year, currentYear, descriptor, tournaments, setActiveTab } =
    useSeasonModeStore();
  // Sólo el año en curso se juega. Los viejos se miran: el store no deja
  // simular, iniciar ni cerrar desde ahí, y acá no se ofrecen los botones.
  const isCurrentSeason = year !== null && year === currentYear;
  // Misma derivación que usa la sidebar: en desktop navega ella, acá la barra de
  // pestañas queda para mobile y las dos no se pueden desincronizar.
  const nav = useModeNav('league');

  // La carga de la temporada NO vive acá: es del modo, no de esta pantalla, y
  // atarla a que monte esta vista fue justamente lo que dejó a los modos de
  // temporada colgados en "Cargando…" cuando el Hub pasó a ser la raíz. La
  // dispara `App.tsx` al volverse activo el modo, valga la vista que valga.

  if (status === 'loading' || status === 'idle') {
    return <Centered>Cargando temporada…</Centered>;
  }
  if (status === 'error') {
    return <Centered>No se pudo cargar el modo. Revisá la conexión.</Centered>;
  }

  const seasonReady = status === 'ready' && tournaments.length > 0;
  const leagues = tournaments.filter((t): t is LigaTournament => t.format === 'liga');

  // Sólo los items que SON pestañas de esta vista: la sección de competición la
  // encabeza el Hub, que es una vista aparte (su `target` no trae `tab`) y no
  // tiene nada que hacer en esta barra.
  const tabs = (nav.sections.find((s) => s.key === 'competition')?.items ?? []).filter(
    (t) => t.target.tab !== undefined,
  );
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

      {/* La portada del modo —"temporada lista para arrancar", "sin equipos
          todavía"— vivía acá, en una pestaña `main`. Ahora es el Hub: él dice en
          qué anda el modo y ofrece la próxima acción, sea empezar la temporada o
          explicar por qué todavía no se puede. Esta vista quedó siendo lo que
          dice su nombre: las competiciones del año. */}
      {seasonReady && activeRun && activeCompetition && (
        <CompetitionPanel run={activeRun} competition={activeCompetition} />
      )}
      {seasonReady && activeTab === 'season' && (
        <SeasonPanel leagues={leagues} onNavigate={onNavigate} />
      )}
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
// Acciones de simulación (las mismas cuatro que en el resto del juego)
// ---------------------------------------------------------------------------

/**
 * Sólo el año en curso se juega: una temporada vieja se mira. El store ya lo
 * garantiza (sus acciones no hacen nada), pero ofrecer botones muertos sería
 * mentirle al usuario.
 */
function useIsCurrentSeason(): boolean {
  return useSeasonModeStore((s) => s.year !== null && s.year === s.currentYear);
}

/**
 * Simular un partido suelto del modo. Sirve igual para una fecha de liga, un
 * partido de grupos y la ida o la vuelta de un cruce: el store rutea solo.
 */
function useSeasonMatchPlay(tournamentId: string) {
  const teams = useTournamentStore((s) => s.teams);
  const busy = useSeasonModeStore((s) => s.busy);
  const playable = useIsCurrentSeason();

  const play = async (match: Match) => {
    const outcome = await useSeasonModeStore.getState().simulateMatch(tournamentId, match.id);
    if (!outcome) {
      toast.info('No se pudo simular este partido ahora');
      return;
    }
    showMatchResultToast({
      homeName: teamName(teams, match.homeTeamId),
      awayName: teamName(teams, match.awayTeamId),
      homeScore: outcome.homeScore,
      awayScore: outcome.awayScore,
      penalties: outcome.penalties,
    });
  };

  return { play, busy, playable };
}

/** Encabezado con las dos acciones de jornada del torneo y su próxima fecha. */
function JornadaCard({
  run,
  competitionName,
  completeLabel,
}: {
  run: ModeTournament;
  competitionName: string;
  completeLabel: string;
}) {
  const { jornada, canSimulate, busy, simulate, simulateLive } = useModeJornada(
    run,
    competitionName,
  );
  const isCurrentSeason = useIsCurrentSeason();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle>{run.name}</CardTitle>
          {!jornada ? (
            <span className="font-arcade text-[10px] text-led uppercase">{completeLabel}</span>
          ) : (
            isCurrentSeason && (
              <JornadaSimActions
                jornadaLabel={jornada.label}
                onSimulate={simulate}
                onSimulateLive={simulateLive}
                disabled={!canSimulate}
                busy={busy}
              />
            )
          )}
        </div>
      </CardHeader>
      {/* Los partidos de una fecha de liga o de grupos no se ven en otro lado;
          los de una jornada de cuadro sí (el cuadro los lista cruce por cruce),
          así que ahí alcanza con las acciones. */}
      {jornada?.matchday !== undefined && (
        <CardContent>
          <FixtureList matches={jornada.matches} tournamentId={run.id} />
        </CardContent>
      )}
    </Card>
  );
}

/** Los partidos de la jornada, cada uno con sus dos acciones. */
function FixtureList({ matches, tournamentId }: { matches: Match[]; tournamentId: string }) {
  const teams = useTournamentStore((s) => s.teams);
  const { play, busy, playable } = useSeasonMatchPlay(tournamentId);

  return (
    <ul className="space-y-2">
      {matches.map((m) => (
        <li
          key={m.id}
          className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm border-b border-line/40 pb-2 last:border-b-0"
        >
          <span className="flex-1 text-right truncate">{teamName(teams, m.homeTeamId)}</span>
          <span className="px-3 font-terminal text-grass-soft text-center">vs</span>
          <span className="flex-1 truncate">{teamName(teams, m.awayTeamId)}</span>
          {playable && (
            <MatchSimActions
              onSimulate={() => play(m)}
              live={{
                matchId: m.id,
                homeTeamId: m.homeTeamId,
                awayTeamId: m.awayTeamId,
                kind: 'season',
                tournamentId,
              }}
              disabled={busy}
              className="sm:flex-shrink-0"
            />
          )}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Formato 1: liga
// ---------------------------------------------------------------------------

function LigaPanel({ run, competition }: { run: LigaTournament; competition: Competition }) {
  const teams = useTournamentStore((s) => s.teams);
  const highlightTop = competition.format === 'liga' ? competition.highlightTop : undefined;

  return (
    <div className="space-y-6">
      <JornadaCard run={run} competitionName={competition.name} completeLabel="Liga completa ✓" />

      <Card>
        <CardHeader>
          <CardTitle>Posiciones</CardTitle>
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formato 2: grupos + eliminación
// ---------------------------------------------------------------------------

function GruposEliminacionPanel({ run }: { run: GruposEliminacionTournament }) {
  const teams = useTournamentStore((s) => s.teams);

  return (
    <div className="space-y-6">
      <JornadaCard run={run} competitionName={run.name} completeLabel="Torneo completo ✓" />

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
      <JornadaCard run={run} competitionName={run.name} completeLabel="Copa completa ✓" />

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

/** Las rondas de un cuadro, cruce por cruce. Sirve para los formatos 2 y 3. */
function BracketRounds({ bracket, tournamentId }: { bracket: Bracket; tournamentId: string }) {
  const teams = useTournamentStore((s) => s.teams);

  const rounds = [
    ...bracket.rounds,
    ...(bracket.thirdPlaceTie
      ? [{ round: bracket.thirdPlaceTie.round, ties: [bracket.thirdPlaceTie] }]
      : []),
  ];

  return (
    <>
      {rounds.map((round, i) => (
        <Card key={`${round.round}-${i}`}>
          <CardHeader>
            <CardTitle>{roundLabel(round.round)}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {round.ties.map((tie) => (
                <TieRow key={tie.id} tie={tie} teams={teams} tournamentId={tournamentId} />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

/**
 * Un cruce: el global arriba y sus partidos abajo, cada uno con sus acciones.
 *
 * La ida y la vuelta se juegan por separado —son dos jornadas distintas—, así
 * que cada partido tiene su propio botón y la vuelta recién se habilita cuando
 * la ida está jugada (`isLegPlayable`).
 */
function TieRow({
  tie,
  teams,
  tournamentId,
}: {
  tie: Tie;
  teams: Team[];
  tournamentId: string;
}) {
  const agg = tieAggregate(tie);
  const { play, busy, playable: seasonPlayable } = useSeasonMatchPlay(tournamentId);
  const twoLegged = tie.matches.length === 2;

  return (
    <li className="space-y-2 border-b border-line/40 pb-3 last:border-b-0">
      <div className="flex items-center gap-2 text-sm">
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
          <span className="text-[10px] text-grass-soft">
            (pen {tie.penalties.homeScore}-{tie.penalties.awayScore})
          </span>
        )}
      </div>

      {tie.matches.map((m, i) => {
        const legPlayable = isLegPlayable(tie, m.id);
        return (
          <div
            key={m.id}
            className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-grass-soft"
          >
            {twoLegged && (
              <span className="font-arcade text-[9px] uppercase text-gold w-14 flex-shrink-0">
                {i === 0 ? 'Ida' : 'Vuelta'}
              </span>
            )}
            <span className="flex-1 text-right truncate">{teamName(teams, m.homeTeamId)}</span>
            <span className="px-2 font-terminal tabular-nums min-w-[3rem] text-center">
              {m.isPlayed ? `${m.homeScore}–${m.awayScore}` : 'vs'}
            </span>
            <span className="flex-1 truncate">{teamName(teams, m.awayTeamId)}</span>
            {!m.isPlayed && seasonPlayable && (
              <MatchSimActions
                onSimulate={() => play(m)}
                live={{
                  matchId: m.id,
                  homeTeamId: m.homeTeamId,
                  awayTeamId: m.awayTeamId,
                  kind: 'season',
                  tournamentId,
                }}
                disabled={busy || !legPlayable}
                disabledTitle={!legPlayable ? 'Primero se juega la ida' : undefined}
                className="sm:flex-shrink-0"
              />
            )}
          </div>
        );
      })}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Panel de temporada (ascensos y descensos)
// ---------------------------------------------------------------------------

function SeasonPanel({
  leagues,
  onNavigate,
}: {
  leagues: LigaTournament[];
  onNavigate?: (view: string) => void;
}) {
  const teams = useTournamentStore((s) => s.teams);
  const { year, currentYear, busy, closeSeason, descriptor } = useSeasonModeStore();

  const promotionCount = descriptor.promotion?.count ?? 0;
  const expected = descriptor.divisions.length;
  const allComplete =
    expected > 0 && leagues.length === expected && leagues.every((l) => isLeagueComplete(l.state));
  // Una temporada vieja ya aplicó sus ascensos: volver a cerrarla mandaría el
  // modo para atrás. Se muestran las tablas, no el botón.
  const isCurrentSeason = year !== null && year === currentYear;

  /**
   * Cerrar avanza el año y recarga el modo sin torneos: esta vista se queda sin
   * competiciones que mostrar y el usuario terminaría mirando la única pestaña
   * que sobrevive (Escudos). Al inicio, que es donde vive "▶ EMPEZAR TEMPORADA"
   * del año nuevo.
   *
   * Se navega sólo si el año efectivamente avanzó: `closeSeason` no devuelve
   * nada y tiene varios guards que la abortan en silencio (temporada vieja,
   * ligas sin terminar, fallo de red), y en esos casos no hay adónde ir.
   */
  const handleCloseSeason = async () => {
    const before = useSeasonModeStore.getState().year;
    await closeSeason();
    if (useSeasonModeStore.getState().year !== before) onNavigate?.('hub');
  };

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
              <Button
                onClick={handleCloseSeason}
                loading={busy}
                disabled={!allComplete}
                className="gap-2"
              >
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
