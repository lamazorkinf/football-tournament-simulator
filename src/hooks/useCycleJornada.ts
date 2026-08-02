import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import type { Cycle, MatchdayOutcome, Team } from '../types';
import { useTournamentStore } from '../store/useTournamentStore';
import { useFavoritesStore } from '../store/useFavoritesStore';
import { useMatchResultsStore, type MatchResult } from '../store/useMatchResultsStore';
import { useLiveMatchdayStore, type LiveMatchdayEntry } from '../store/useLiveMatchdayStore';
import { collectAllMatches, type MatchWithContext } from '../components/tournament/matchCenterCollector';
import { isBatchSimulableStage } from '../components/tournament/matchBatchSimulable';
import { buildJornadaResults } from '../components/tournament/jornadaResults';
import { groupIntoJornadas, getCurrentJornada, type JornadaGroup } from '../core/jornada';
import { selectLiveMatches } from '../core/liveSelection';
import { buildMatchTimeline, hashSeed } from '../core/liveMatch';
import { ENERGY_MAX } from '../core/energy';

/**
 * LA JORNADA DEL CICLO MUNDIALISTA, simulable desde cualquier vista.
 *
 * Vivía dentro del Match Center, así que las vistas de fase (continental,
 * confederaciones, playoffs, grupos) sólo ofrecían simular partido por partido:
 * la misma jornada se podía jugar entera en una pantalla y no en la otra. Acá el
 * comportamiento es uno solo y las vistas sólo ponen los botones.
 *
 * La jornada objetivo es siempre la ACTUAL y GLOBAL —la primera del ciclo con
 * algún partido sin jugar—, sin importar filtros ni en qué pantalla estés: el
 * ciclo es estrictamente por fases, así que es la de la fase en juego.
 */
export function useCycleJornada(tournament: Cycle | null, teams: Team[]) {
  const simulateMatchdayBatch = useTournamentStore((s) => s.simulateMatchdayBatch);
  const simulateRoundBatch = useTournamentStore((s) => s.simulateRoundBatch);
  const isSavingMatch = useTournamentStore((s) => s.isSavingMatch);
  const isBatchProcessing = useTournamentStore((s) => s.isBatchProcessing);
  const showResults = useMatchResultsStore((s) => s.showResults);
  const openLiveSession = useLiveMatchdayStore((s) => s.openSession);
  const favoriteTeamIds = useFavoritesStore((s) => s.favoriteTeamIds);

  const allMatches = useMemo(
    () => (tournament ? collectAllMatches(tournament) : []),
    [tournament],
  );
  const jornadaGroups = useMemo(() => groupIntoJornadas(allMatches), [allMatches]);
  const currentJornada = useMemo(() => getCurrentJornada(jornadaGroups), [jornadaGroups]);

  const title = currentJornada ? `${currentJornada.phaseLabel} · ${currentJornada.label}` : '';

  // Partidos jugables de la jornada: sin jugar y con los dos equipos definidos
  // (las eliminatorias tienen cruces "por definir" hasta que cierra la ronda).
  const pending = useMemo(() => {
    if (!currentJornada) return [] as MatchWithContext[];
    const byId = new Map(teams.map((t) => [t.id, t]));
    return currentJornada.matches.filter(
      (m) => !m.match.isPlayed && byId.has(m.match.homeTeamId) && byId.has(m.match.awayTeamId),
    );
  }, [currentJornada, teams]);

  const canSimulate = pending.length > 0 && !isSavingMatch && !isBatchProcessing;

  /**
   * Simula y persiste la jornada, ruteando por familia: grupos →
   * `simulateMatchdayBatch`, eliminatorias/confed → `simulateRoundBatch`. Una
   * jornada es de una sola fase, así que nunca mezcla ambas familias.
   */
  const run = useCallback(
    async (toSimulate: MatchWithContext[]): Promise<MatchdayOutcome[]> => {
      const groupItems = toSimulate.filter((m) => isBatchSimulableStage(m.stage));
      const roundItems = toSimulate.filter((m) => !isBatchSimulableStage(m.stage));
      const outcomes: MatchdayOutcome[] = [];

      if (groupItems.length > 0) {
        outcomes.push(
          ...(await simulateMatchdayBatch(
            groupItems.map((m) => ({
              matchId: m.match.id,
              groupId: m.groupId,
              stage: m.stage === 'qualifier' ? ('qualifier' as const) : ('world-cup' as const),
              groupName: m.groupName,
              region: m.region,
            })),
          )),
        );
      }
      if (roundItems.length > 0) {
        outcomes.push(
          ...(await simulateRoundBatch(
            roundItems.map((m) => ({
              matchId: m.match.id,
              kind: m.stage as 'knockout' | 'continental' | 'confederations',
            })),
          )),
        );
      }
      return outcomes;
    },
    [simulateMatchdayBatch, simulateRoundBatch],
  );

  const results = useCallback(
    (
      jornada: JornadaGroup,
      outcomes: MatchdayOutcome[],
      skillBefore: ReadonlyMap<string, number>,
    ): MatchResult[] =>
      buildJornadaResults(jornada, outcomes, teams, new Set(favoriteTeamIds), skillBefore),
    [teams, favoriteTeamIds],
  );

  /** Guard común de las dos acciones: devuelve los partidos a jugar, o null. */
  const targets = useCallback((): MatchWithContext[] | null => {
    if (!currentJornada || pending.length === 0) {
      toast.info('No hay partidos pendientes para simular');
      return null;
    }
    return pending;
  }, [currentJornada, pending]);

  const simulate = useCallback(async () => {
    const jornada = currentJornada;
    const toSimulate = targets();
    if (!jornada || !toSimulate) return;
    try {
      // Skills PRE-simulación: al volver del await el store ya aplicó los deltas.
      const skillBefore = new Map(teams.map((t) => [t.id, t.skill]));
      const outcomes = await run(toSimulate);
      showResults(results(jornada, outcomes, skillBefore), `${title} — Resultados`);
      toast.success(`${jornada.label} completada — ${outcomes.length} partidos simulados`);
    } catch (error) {
      console.error('Error simulating matchday:', error);
      toast.error('Error al simular la jornada');
    }
  }, [currentJornada, targets, run, results, showResults, title, teams]);

  const simulateLive = useCallback(async () => {
    const jornada = currentJornada;
    const toSimulate = targets();
    if (!jornada || !toSimulate) return;

    // Selección de los que se ven en vivo (tope `LIVE_MATCH_CAP`), con skills
    // PRE-simulación.
    const skillMap = new Map(teams.map((t) => [t.id, t.skill]));
    const favorites = new Set(favoriteTeamIds);
    const chosenIds = new Set(
      selectLiveMatches(
        toSimulate.map((m) => ({
          matchId: m.match.id,
          homeTeamId: m.match.homeTeamId,
          awayTeamId: m.match.awayTeamId,
        })),
        skillMap,
        favorites,
      ).map((s) => s.matchId),
    );

    try {
      // Commit-then-replay: se comprometen TODOS los resultados primero.
      const outcomes = await run(toSimulate);
      const byId = new Map(outcomes.map((o) => [o.matchId, o]));
      const ctxById = new Map(jornada.matches.map((m) => [m.match.id, m]));

      const entries: LiveMatchdayEntry[] = [];
      for (const matchId of chosenIds) {
        const outcome = byId.get(matchId);
        const ctx = ctxById.get(matchId);
        if (!outcome || !ctx) continue; // fue salteado en la simulación
        entries.push({
          matchId,
          homeTeamId: outcome.homeTeamId,
          awayTeamId: outcome.awayTeamId,
          timeline: buildMatchTimeline({
            homeScore: outcome.homeScore,
            awayScore: outcome.awayScore,
            seed: hashSeed(matchId),
            penalties: outcome.penalties,
            extraTime: outcome.extraTime,
          }),
          groupName: ctx.groupName,
          region: ctx.region,
          isFavorite: favorites.has(outcome.homeTeamId) || favorites.has(outcome.awayTeamId),
          // Energía de ENTRADA: la que ya resolvió `buildEnergyContext` al
          // simular (ver `SimulatedMatchOutcome`), no la que queda después del
          // costo del partido.
          homeEnergy: outcome.homeEnergy ?? ENERGY_MAX,
          awayEnergy: outcome.awayEnergy ?? ENERGY_MAX,
        });
      }

      if (entries.length === 0) {
        // No se pudo simular nada (fuera de jornada, etc.): mostrar el resumen.
        showResults(results(jornada, outcomes, skillMap), `${title} — Resultados`);
        return;
      }

      openLiveSession({
        title,
        entries,
        allResults: results(jornada, outcomes, skillMap),
        hiddenCount: outcomes.length - entries.length,
      });
    } catch (error) {
      console.error('Error simulating matchday live:', error);
      toast.error('Error al simular la jornada en vivo');
    }
  }, [
    currentJornada,
    targets,
    run,
    results,
    showResults,
    openLiveSession,
    title,
    teams,
    favoriteTeamIds,
  ]);

  return {
    /** Todas las jornadas del ciclo, en orden (el Match Center las pagina). */
    jornadaGroups,
    currentJornada,
    /** Rótulo `Fase · Jornada` de la jornada actual. */
    title,
    pending,
    canSimulate,
    isBusy: isBatchProcessing,
    simulate,
    simulateLive,
  };
}
