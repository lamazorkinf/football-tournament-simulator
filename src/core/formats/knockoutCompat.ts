import { nanoid } from 'nanoid';
import type { KnockoutMatch } from '../../types';
import type { Tie } from './bracket';

/**
 * Puente entre el tipo del núcleo (`Tie`, de core/formats/bracket.ts) y el tipo
 * de cable y de UI del ciclo mundialista (`KnockoutMatch`).
 *
 * `KnockoutMatch` NO se migra: es lo que persiste matches_new
 * (knockout_round / knockout_position) y lo que consumen KnockoutView,
 * WorldCupGridView y BracketLine. `Tie` es el tipo del núcleo y `KnockoutMatch`
 * su proyección de un solo partido. Gracias a este par, core/knockout.ts,
 * core/continental.ts y core/confederations.ts conservan todas sus firmas y el
 * store de 3056 líneas no se abre.
 */

export interface ToKnockoutOptions {
  /**
   * Estampar `position`. Las implementaciones previas NO la ponían en la final
   * ni en el 3er puesto del Mundial, y `position` se persiste: omitirla acá
   * mantiene el dato idéntico al que ya está guardado.
   */
  includePosition?: boolean;
  /** Estampar `matchday`. El cuadro del Mundial no lo lleva; continental y confed sí. */
  includeMatchday?: boolean;
  /** `stage` a estampar; por defecto el del partido del cruce. */
  stage?: string;
  /** Id a usar. Por defecto se genera con nanoid, como las implementaciones previas. */
  id?: string;
}

/**
 * Proyecta un cruce a un `KnockoutMatch`. Sólo tiene sentido para cruces de un
 * solo partido (`legs: 1`): un cruce a ida y vuelta no se puede representar con
 * un único KnockoutMatch, y por eso la copa villamariense usa `Tie` directo.
 */
export function tieToKnockoutMatch(tie: Tie, o: ToKnockoutOptions = {}): KnockoutMatch {
  const match = tie.matches[0];
  return {
    id: o.id ?? nanoid(),
    homeTeamId: tie.homeTeamId!,
    awayTeamId: tie.awayTeamId!,
    homeScore: match?.homeScore ?? null,
    awayScore: match?.awayScore ?? null,
    isPlayed: match?.isPlayed ?? false,
    stage: o.stage ?? match?.stage ?? 'knockout',
    round: tie.round,
    ...(o.includePosition !== false ? { position: tie.position } : {}),
    ...(o.includeMatchday && match?.matchday !== undefined
      ? { matchday: match.matchday }
      : {}),
    ...(tie.winnerId ? { winnerId: tie.winnerId } : {}),
    ...(tie.loserId ? { loserId: tie.loserId } : {}),
    ...(tie.extraTime !== undefined ? { extraTime: tie.extraTime } : {}),
    ...(tie.penalties ? { penalties: tie.penalties } : {}),
  };
}

/** Proyecta varios cruces, conservando el orden. */
export function tiesToKnockoutMatches(
  ties: Tie[],
  o: ToKnockoutOptions = {},
): KnockoutMatch[] {
  return ties.map((t) => tieToKnockoutMatch(t, o));
}

/** Lee un `KnockoutMatch` como cruce de un solo partido. */
export function knockoutMatchToTie(m: KnockoutMatch): Tie {
  return {
    id: m.id,
    round: m.round,
    position: m.position ?? 0,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    matches: [
      {
        id: m.id,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        isPlayed: m.isPlayed,
        stage: m.stage,
        ...(m.matchday !== undefined ? { matchday: m.matchday } : {}),
      },
    ],
    ...(m.winnerId ? { winnerId: m.winnerId } : {}),
    ...(m.loserId ? { loserId: m.loserId } : {}),
    ...(m.extraTime !== undefined ? { extraTime: m.extraTime } : {}),
    ...(m.penalties ? { penalties: m.penalties } : {}),
  };
}

export function knockoutMatchesToTies(matches: KnockoutMatch[]): Tie[] {
  return matches.map(knockoutMatchToTie);
}
