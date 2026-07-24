/**
 * Selección de los partidos que se muestran en la "jornada en vivo".
 * Puro y sin dependencias de React/stores para poder testearlo aislado.
 */

/** Máximo de partidos visibles simultáneamente en la grilla en vivo. */
export const LIVE_MATCH_CAP = 20;

export interface SelectableMatch {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
}

/**
 * Elige hasta `cap` partidos para la grilla en vivo:
 * 1. Los partidos con algún equipo favorito entran primero, rankeados por
 *    suma de skill de ambos equipos (si los favoritos generan más de `cap`
 *    partidos, quedan los `cap` de mayor suma).
 * 2. Los cupos restantes se completan con los no-favoritos de mayor suma.
 * Skill desconocido cuenta como 0. Desempate determinístico por matchId.
 */
export function selectLiveMatches<T extends SelectableMatch>(
  matches: T[],
  skillByTeamId: ReadonlyMap<string, number>,
  favoriteTeamIds: ReadonlySet<string>,
  cap: number = LIVE_MATCH_CAP,
): T[] {
  const skillSum = (m: SelectableMatch) =>
    (skillByTeamId.get(m.homeTeamId) ?? 0) + (skillByTeamId.get(m.awayTeamId) ?? 0);
  const isFavorite = (m: SelectableMatch) =>
    favoriteTeamIds.has(m.homeTeamId) || favoriteTeamIds.has(m.awayTeamId);
  const bySkillDesc = (a: T, b: T) =>
    skillSum(b) - skillSum(a) || a.matchId.localeCompare(b.matchId);

  const favorites = matches.filter(isFavorite).sort(bySkillDesc);
  const rest = matches.filter((m) => !isFavorite(m)).sort(bySkillDesc);

  return [...favorites, ...rest].slice(0, Math.max(0, cap));
}
