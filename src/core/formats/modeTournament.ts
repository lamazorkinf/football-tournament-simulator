import type { LeagueState } from './league';
import type { CupState } from './cup';

/**
 * Torneo de un modo de ligas (league-system). A diferencia del ciclo
 * mundialista, se guarda como un único documento JSONB (`mode_tournaments`):
 * todo su estado — fixture, tabla, llave — vive en `state`, atómico y por-modo.
 */

export type ModeTournamentFormat = 'league' | 'cup';
export type ModeTournamentStatus = 'in-progress' | 'completed';

interface ModeTournamentBase {
  id: string;
  modeId: string;
  year: number;
  name: string;
  status: ModeTournamentStatus;
  /** Sub-división opcional: 'A' / 'B' para las dos ligas del año. */
  division: string | null;
}

export interface LeagueTournament extends ModeTournamentBase {
  format: 'league';
  state: LeagueState;
}

export interface CupTournament extends ModeTournamentBase {
  format: 'cup';
  state: CupState;
}

export type ModeTournament = LeagueTournament | CupTournament;
