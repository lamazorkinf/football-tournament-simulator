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
  /**
   * Skill de cada equipo ANTES de esta jornada. Se pasa capturado y no se lee
   * de `teams` porque, para cuando esta función corre, el store ya aplicó los
   * deltas: el skill de "antes" ya no existe en ningún lado.
   */
  skillBefore: ReadonlyMap<string, number>,
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
      // Sólo del partido recién simulado, misma simetría que `wentToExtraTime`:
      // el mapa se capturó antes de ESTA tanda, así que para un partido que ya
      // estaba jugado (simulado suelto desde el Centro de Partidos) es un
      // snapshot POSTERIOR y la brecha que mide el titular vendría achicada por
      // los deltas de Elo de ese mismo partido.
      homeSkillBefore: outcome ? skillBefore.get(homeTeam.id) : undefined,
      awaySkillBefore: outcome ? skillBefore.get(awayTeam.id) : undefined,
      // Sólo se sabe del partido recién simulado: un partido ya jugado no
      // guarda si fue al alargue.
      wentToExtraTime: outcome ? outcome.extraTime !== undefined : undefined,
    });
  }
  return results;
}
