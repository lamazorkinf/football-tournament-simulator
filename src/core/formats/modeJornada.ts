import type { Match } from '../../types';
import { currentBracketJornada, type Bracket } from './bracket';
import type { ModeTournament } from './modeTournament';

/**
 * LA JORNADA DE UNA COMPETICIÓN DE MODO — el conjunto de partidos que se juegan
 * juntos, sea cual sea el formato.
 *
 * Existe para que la oferta de simulación sea la misma en todos lados: una liga
 * juega su próxima fecha, una fase de grupos la suya y un cuadro juega todas
 * las idas de la ronda (y después todas las vueltas). Siempre partidos, nunca
 * un cruce entero de una: la ida y la vuelta son dos jornadas distintas.
 */
export interface ModeJornada {
  /** Identificador estable dentro del torneo (keys de React, comparaciones). */
  key: string;
  label: string;
  /** Los partidos pendientes de la jornada. */
  matches: Match[];
  /** Fecha del calendario. Sólo en liga y fase de grupos: el cuadro va por ronda. */
  matchday?: number;
}

/** Próxima fecha pendiente de un fixture con jornadas numeradas. */
function matchdayJornada(matches: Match[]): ModeJornada | null {
  const pending = matches.filter((m) => !m.isPlayed);
  if (pending.length === 0) return null;
  const matchday = Math.min(...pending.map((m) => m.matchday ?? 0));
  return {
    key: `md-${matchday}`,
    label: `Fecha ${matchday}`,
    matches: pending.filter((m) => (m.matchday ?? 0) === matchday),
    matchday,
  };
}

function bracketJornada(bracket: Bracket | null): ModeJornada | null {
  if (!bracket) return null;
  const jornada = currentBracketJornada(bracket);
  if (!jornada) return null;
  return {
    key: `${jornada.round}-l${jornada.leg}`,
    label: jornada.label,
    matches: jornada.matches,
  };
}

/** Jornada en curso de un torneo de modo, o `null` si no queda nada por jugar. */
export function currentModeJornada(tournament: ModeTournament): ModeJornada | null {
  if (tournament.format === 'liga') {
    return matchdayJornada(tournament.state.matches);
  }
  if (tournament.format === 'eliminacion') {
    return bracketJornada(tournament.state);
  }
  // Grupos + eliminación: primero se agotan los grupos, después el cuadro.
  return (
    matchdayJornada(tournament.state.groups.groups.flatMap((g) => g.matches)) ??
    bracketJornada(tournament.state.bracket)
  );
}
