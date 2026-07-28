import type { Match } from '../../types';
import type { RoundKey } from './rounds';
import { nextPowerOfTwo, standardPlan, type Bracket, type Tie } from './bracket';
import type { ModeTournamentFormat, ModeTournamentState } from './modeTournament';

/**
 * Lectura de documentos `mode_tournaments` viejos.
 *
 * La columna `format` guardaba `'league' | 'cup'` y la copa tenía su propia
 * estructura de llave (`formats/cup.ts`, borrado): rondas de `TwoLeggedTie` con
 * `leg1`/`leg2` como campos sueltos. Ahora los tres formatos corren sobre las
 * primitivas unificadas y un cuadro es un `Bracket`.
 *
 * Nada de esto se re-escribe en la base al leer: la fila se traduce en memoria y
 * se guarda en v2 recién en la próxima escritura del torneo. Así una base sin
 * migrar sigue abriendo, y una migrada no depende de que alguien corriera un
 * backfill.
 */

/** Los `format` que escribía la versión anterior, y su formato canónico. */
const LEGACY_FORMATS: Record<string, ModeTournamentFormat> = {
  league: 'liga',
  cup: 'eliminacion',
};

/** Formato canónico de un valor de la columna, tolerando los legacy. */
export function canonicalFormat(raw: string): ModeTournamentFormat {
  if (raw === 'liga' || raw === 'grupos-eliminacion' || raw === 'eliminacion') return raw;
  const mapped = LEGACY_FORMATS[raw];
  if (!mapped) throw new Error(`Formato de torneo desconocido: "${raw}"`);
  return mapped;
}

/** Un cruce tal como lo guardaba la copa v1. */
export interface LegacyTwoLeggedTie {
  id: string;
  round: RoundKey;
  position: number;
  homeTeamId: string | null;
  awayTeamId: string | null;
  leg1: Match | null;
  leg2: Match | null;
  winnerId?: string;
  loserId?: string;
  extraTime?: boolean;
  penalties?: { homeScore: number; awayScore: number };
}

/** El documento de copa v1. */
export interface LegacyCupState {
  rounds: LegacyTwoLeggedTie[][];
  championId?: string;
  runnerUpId?: string;
}

function legacyTieToTie(legacy: LegacyTwoLeggedTie): Tie {
  // Los dos partidos pasan a ser la lista `matches` en orden ida → vuelta. Un
  // cruce sin rivales definidos no tenía partidos: queda con la lista vacía.
  const matches: Match[] = [legacy.leg1, legacy.leg2].filter((m): m is Match => m !== null);
  return {
    id: legacy.id,
    round: legacy.round,
    position: legacy.position,
    homeTeamId: legacy.homeTeamId,
    awayTeamId: legacy.awayTeamId,
    matches,
    ...(legacy.winnerId !== undefined ? { winnerId: legacy.winnerId } : {}),
    ...(legacy.loserId !== undefined ? { loserId: legacy.loserId } : {}),
    ...(legacy.extraTime !== undefined ? { extraTime: legacy.extraTime } : {}),
    ...(legacy.penalties !== undefined ? { penalties: legacy.penalties } : {}),
  };
}

/**
 * Convierte una copa v1 en un `Bracket`. Los ids de cruce y de partido se
 * conservan tal cual (`cup-<ronda>-<posición>` y sus `-l1`/`-l2`), que es
 * justamente el prefijo que emite la primitiva: un torneo en curso sigue
 * respondiendo a los mismos ids después de migrar.
 */
export function migrateCupStateV1(legacy: LegacyCupState): Bracket {
  const firstRound = legacy.rounds[0] ?? [];
  const size = Math.max(2, nextPowerOfTwo(firstRound.length * 2));

  return {
    id: 'cup',
    idPrefix: 'cup',
    plan: standardPlan(size, { thirdPlace: false }),
    legs: 2,
    neutral: false,
    stage: 'cup',
    rounds: legacy.rounds
      .filter((ties) => ties.length > 0)
      .map((ties) => ({ round: ties[0].round, ties: ties.map(legacyTieToTie) })),
    thirdPlaceTie: null,
    byeTeamIds: [],
    ...(legacy.championId !== undefined ? { championId: legacy.championId } : {}),
    ...(legacy.runnerUpId !== undefined ? { runnerUpId: legacy.runnerUpId } : {}),
  };
}

/**
 * Estado de un torneo listo para usar, sea cual sea la versión con la que se
 * guardó. Sólo la copa v1 necesita traducción: la liga v1 ya era un `LeagueState`.
 */
export function migrateTournamentState(
  format: ModeTournamentFormat,
  schemaVersion: number,
  raw: unknown,
): ModeTournamentState {
  if (format === 'eliminacion' && schemaVersion < 2) {
    return migrateCupStateV1(raw as LegacyCupState);
  }
  return raw as ModeTournamentState;
}
