import type { KnockoutMatch, MatchdayOutcome, Team } from '../../types';
import type { JornadaGroup } from '../../core/jornada';
import type { MatchResult } from '../../store/useMatchResultsStore';

/**
 * Resumen COMPLETO de una jornada: los outcomes recién simulados más los
 * partidos que ya estaban jugados (para no perderlos del resumen). Marca los
 * partidos de equipos favoritos; el modal los muestra primero.
 */
export function buildJornadaResults(
  jornada: JornadaGroup,
  outcomes: MatchdayOutcome[],
  teams: Team[],
  favoriteTeamIds: ReadonlySet<string>,
): MatchResult[] {
  const byId = new Map(outcomes.map((o) => [o.matchId, o]));
  const getTeam = (teamId: string) => teams.find((t) => t.id === teamId);
  const results: MatchResult[] = [];

  for (const ctx of jornada.matches) {
    const outcome = byId.get(ctx.match.id);
    const played = ctx.match.isPlayed;
    if (!outcome && !played) continue; // no jugado y no simulado ahora
    const homeTeam = getTeam(ctx.match.homeTeamId);
    const awayTeam = getTeam(ctx.match.awayTeamId);
    if (!homeTeam || !awayTeam) continue;
    // Los penales del partido recién simulado vienen en el outcome; los de un
    // partido ya jugado quedaron guardados en el KnockoutMatch.
    const penalties = outcome
      ? outcome.penalties
      : (ctx.match as KnockoutMatch).penalties;
    results.push({
      homeTeam: homeTeam.name,
      awayTeam: awayTeam.name,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeScore: outcome ? outcome.homeScore : ctx.match.homeScore ?? 0,
      awayScore: outcome ? outcome.awayScore : ctx.match.awayScore ?? 0,
      groupName: ctx.groupName,
      region: ctx.region,
      isFavorite: favoriteTeamIds.has(homeTeam.id) || favoriteTeamIds.has(awayTeam.id),
      penalties,
    });
  }
  return results;
}
