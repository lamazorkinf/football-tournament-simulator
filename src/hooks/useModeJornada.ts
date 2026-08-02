import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import type { MatchdayOutcome, Team, TeamStanding } from '../types';
import type { ModeTournament } from '../core/formats/modeTournament';
import { currentModeJornada } from '../core/formats/modeJornada';
import { useSeasonModeStore } from '../store/useSeasonModeStore';
import { useTournamentStore } from '../store/useTournamentStore';
import { useFavoritesStore } from '../store/useFavoritesStore';
import { useMatchResultsStore, type MatchResult } from '../store/useMatchResultsStore';
import { useLiveMatchdayStore, type LiveMatchdayEntry } from '../store/useLiveMatchdayStore';
import { selectLiveMatches } from '../core/liveSelection';
import { buildMatchTimeline, hashSeed } from '../core/liveMatch';
import { recalcLeagueStandings } from '../core/formats/league';
import { deriveTableSummary, type TableSummaryView } from '../core/tableMoves';

/**
 * LA JORNADA DE UN MODO DE TEMPORADA, con la misma oferta que el ciclo
 * mundialista: simularla entera o verla en vivo (ver `useCycleJornada`, el
 * gemelo del otro motor). Acá "jornada" es lo que devuelve `currentModeJornada`:
 * la próxima fecha de una liga o de una fase de grupos, o todas las idas —y
 * después todas las vueltas— de la ronda en curso de un cuadro.
 */
export function useModeJornada(run: ModeTournament | null, competitionName: string) {
  const teams = useTournamentStore((s) => s.teams);
  const busy = useSeasonModeStore((s) => s.busy);
  const favoriteTeamIds = useFavoritesStore((s) => s.favoriteTeamIds);
  const showResults = useMatchResultsStore((s) => s.showResults);
  const openLiveSession = useLiveMatchdayStore((s) => s.openSession);

  const jornada = useMemo(() => (run ? currentModeJornada(run) : null), [run]);
  const title = jornada ? `${competitionName} · ${jornada.label}` : competitionName;
  const canSimulate = Boolean(run && jornada && !busy);

  const teamName = useCallback(
    (id: string) => teams.find((t: Team) => t.id === id)?.name ?? id,
    [teams],
  );

  const toResults = useCallback(
    (
      outcomes: MatchdayOutcome[],
      skillBefore: ReadonlyMap<string, number>,
    ): MatchResult[] => {
      const favorites = new Set(favoriteTeamIds);
      return outcomes.map((o) => ({
        homeTeam: teamName(o.homeTeamId),
        awayTeam: teamName(o.awayTeamId),
        homeTeamId: o.homeTeamId,
        awayTeamId: o.awayTeamId,
        homeScore: o.homeScore,
        awayScore: o.awayScore,
        groupName: title,
        isFavorite: favorites.has(o.homeTeamId) || favorites.has(o.awayTeamId),
        homeSkillBefore: skillBefore.get(o.homeTeamId),
        awaySkillBefore: skillBefore.get(o.awayTeamId),
        wentToExtraTime: o.extraTime !== undefined,
        ...(o.penalties ? { penalties: o.penalties } : {}),
      }));
    },
    [favoriteTeamIds, teamName, title],
  );

  /** La tabla de una liga; vacía para cualquier otro formato. */
  const standingsOf = useCallback(
    (t: ModeTournament | null | undefined): TeamStanding[] =>
      t && t.format === 'liga' ? recalcLeagueStandings(t.state) : [],
    [],
  );

  /**
   * El resumen de la tabla, con los nombres ya resueltos. Sólo para ligas: una
   * copa no tiene tabla, y una fase de grupos tiene muchas.
   *
   * Relee el torneo del store en vez de usar el `run` de la clausura: la
   * simulación lo reemplazó por una versión nueva.
   */
  const buildTable = useCallback(
    (before: TeamStanding[]): TableSummaryView | undefined => {
      if (!run || run.format !== 'liga') return undefined;
      const updated = useSeasonModeStore.getState().tournaments.find((t) => t.id === run.id);
      const summary = deriveTableSummary(before, standingsOf(updated));
      if (!summary) return undefined;
      return {
        ...summary,
        leaderTeamName: teamName(summary.leaderTeamId),
        moves: summary.moves.map((m) => ({ ...m, teamName: teamName(m.teamId) })),
      };
    },
    [run, standingsOf, teamName],
  );

  const simulate = useCallback(async () => {
    if (!run || !jornada) {
      toast.info('No hay partidos pendientes para simular');
      return;
    }
    // Se capturan ANTES de simular: después, el store ya aplicó los deltas de
    // Elo y ya escribió los partidos en la tabla de posiciones.
    const skillBefore = new Map(teams.map((t: Team) => [t.id, t.skill]));
    const standingsBefore = standingsOf(run);

    const outcomes = await useSeasonModeStore.getState().simulateJornada(run.id);
    if (outcomes.length === 0) {
      toast.info('No se pudo simular la jornada');
      return;
    }
    showResults(
      toResults(outcomes, skillBefore),
      `${title} — Resultados`,
      buildTable(standingsBefore),
    );
    toast.success(`${jornada.label} completada — ${outcomes.length} partidos simulados`);
  }, [run, jornada, teams, standingsOf, showResults, toResults, buildTable, title]);

  const simulateLive = useCallback(async () => {
    if (!run || !jornada) {
      toast.info('No hay partidos pendientes para simular');
      return;
    }
    // Se capturan ANTES de simular: después, el store ya aplicó los deltas de
    // Elo y ya escribió los partidos en la tabla de posiciones.
    const skillMap = new Map(teams.map((t: Team) => [t.id, t.skill]));
    const standingsBefore = standingsOf(run);

    // Commit-then-replay: se comprometen todos los resultados y después se
    // reproducen minuto a minuto desde el marcador final (seed = matchId).
    const outcomes = await useSeasonModeStore.getState().simulateJornada(run.id);
    if (outcomes.length === 0) {
      toast.info('No se pudo simular la jornada');
      return;
    }

    const favorites = new Set(favoriteTeamIds);
    const chosen = selectLiveMatches(outcomes, skillMap, favorites);
    const entries: LiveMatchdayEntry[] = chosen.map((o) => ({
      matchId: o.matchId,
      homeTeamId: o.homeTeamId,
      awayTeamId: o.awayTeamId,
      timeline: buildMatchTimeline({
        homeScore: o.homeScore,
        awayScore: o.awayScore,
        seed: hashSeed(o.matchId),
        penalties: o.penalties,
        extraTime: o.extraTime,
      }),
      groupName: jornada.label,
      isFavorite: favorites.has(o.homeTeamId) || favorites.has(o.awayTeamId),
      homeEnergy: 100,
      awayEnergy: 100,
      energyHidden: true, // los modos de temporada no modelan energía
    }));

    openLiveSession({
      title,
      entries,
      allResults: toResults(outcomes, skillMap),
      hiddenCount: outcomes.length - entries.length,
      table: buildTable(standingsBefore),
    });
  }, [
    run,
    jornada,
    favoriteTeamIds,
    teams,
    standingsOf,
    openLiveSession,
    toResults,
    buildTable,
    title,
  ]);

  return { jornada, title, canSimulate, busy, simulate, simulateLive };
}
