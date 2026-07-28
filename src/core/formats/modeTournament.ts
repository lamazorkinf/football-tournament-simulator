import type { LeagueState } from './league';
import type { Bracket } from './bracket';
import type { GroupStageState } from './groupStage';

/**
 * Torneo de un modo de temporada. A diferencia del ciclo mundialista, se guarda
 * como un único documento JSONB (`mode_tournaments`): todo su estado — fixture,
 * tabla, llave — vive en `state`, atómico y por-modo.
 *
 * El `format` son los TRES formatos canónicos del juego, los mismos que declara
 * el descriptor del modo (`src/modes/types.ts`). La columna guardaba antes
 * `'league' | 'cup'`, que son casos particulares de `'liga'` y `'eliminacion'`;
 * las filas viejas se traducen al leer (`modeTournamentMigration.ts`).
 */

export type ModeTournamentFormat = 'liga' | 'grupos-eliminacion' | 'eliminacion';
export type ModeTournamentStatus = 'in-progress' | 'completed';

/**
 * Versión del documento `state`. v1 = la copa a ida y vuelta con su propia
 * estructura (`{ rounds: TwoLeggedTie[][] }`); v2 = los tres formatos sobre las
 * primitivas unificadas.
 */
export const MODE_TOURNAMENT_SCHEMA_VERSION = 2;

/** Estado de una competición de grupos + eliminación. */
export interface GroupsKnockoutState {
  groups: GroupStageState;
  /** Se sortea recién cuando terminan los grupos. `null` = todavía no, o el
   * formato no tiene cuadro propio (clasificatorias que alimentan a otro). */
  bracket: Bracket | null;
}

interface ModeTournamentBase {
  id: string;
  modeId: string;
  /** Competición del descriptor del modo que corre este torneo. */
  competitionId: string;
  year: number;
  name: string;
  status: ModeTournamentStatus;
  /** Sub-división opcional: 'A' / 'B' para las dos ligas del año. */
  division: string | null;
}

export interface LigaTournament extends ModeTournamentBase {
  format: 'liga';
  state: LeagueState;
}

export interface EliminacionTournament extends ModeTournamentBase {
  format: 'eliminacion';
  state: Bracket;
}

export interface GruposEliminacionTournament extends ModeTournamentBase {
  format: 'grupos-eliminacion';
  state: GroupsKnockoutState;
}

export type ModeTournament =
  | LigaTournament
  | EliminacionTournament
  | GruposEliminacionTournament;

export type ModeTournamentState = LeagueState | Bracket | GroupsKnockoutState;
