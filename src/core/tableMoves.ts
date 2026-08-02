import type { TeamStanding } from '../types';

/**
 * QUÉ CAMBIÓ EN LA TABLA — la quinta derivación pura del proyecto, al lado de
 * `core/headlines.ts` (qué pasó) y las tres de `modes/`. Contesta la otra
 * pregunta de un resumen de fecha: además de los resultados, qué se movió.
 *
 * Sin React y sin stores: recibe dos tablas ya calculadas y devuelve el diff.
 */

export interface TableMove {
  teamId: string;
  /** Posiciones 1-based dentro de la tabla. */
  from: number;
  to: number;
}

export interface TableSummary {
  leaderTeamId: string;
  /** El puntero cambió en esta fecha. */
  leaderIsNew: boolean;
  /**
   * Antes de esta fecha ya había una tabla: alguien había jugado. En `false`
   * —la primera fecha de una liga— el orden de antes era el de siembra, así que
   * `leaderIsNew: false` NO significa que el puntero se haya sostenido: no
   * había puntero. Sin este tercer estado la pantalla afirma una continuidad
   * contra un pasado que no existió.
   */
  hadPreviousTable: boolean;
  /** Los que más se movieron, de mayor a menor salto. Puede venir vacío. */
  moves: TableMove[];
}

/**
 * El resumen con los nombres ya resueltos, que es lo que dibuja la pantalla.
 * Misma división que `Headline` / `HeadlineView`: la derivación habla de ids y
 * quien tiene el pool de equipos los traduce.
 */
export interface TableSummaryView extends TableSummary {
  leaderTeamName: string;
  moves: Array<TableMove & { teamName: string }>;
}

/** Cuántos movimientos entran en el resumen. */
export const TABLE_MOVES_LIMIT = 3;

/**
 * @param before Tabla ANTES de la fecha, ordenada por posición.
 * @param after Tabla DESPUÉS, ordenada por posición. `recalcLeagueStandings` ya
 *   las devuelve ordenadas, así que la posición es el índice + 1.
 */
export function deriveTableSummary(
  before: TeamStanding[],
  after: TeamStanding[],
  limit: number = TABLE_MOVES_LIMIT,
): TableSummary | null {
  const leader = after[0];
  if (!leader) return null;

  // LA REGLA DE HONESTIDAD. Si nadie había jugado, no había tabla: ese orden es
  // el de siembra. Decir "subió del 14º al 3º" contra un orden arbitrario sería
  // inventar, así que se anuncia el puntero y nada más.
  const hadTable = before.some((s) => s.played > 0);
  if (!hadTable) {
    return {
      leaderTeamId: leader.teamId,
      leaderIsNew: false,
      hadPreviousTable: false,
      moves: [],
    };
  }

  const positionBefore = new Map(before.map((s, i) => [s.teamId, i + 1]));
  const moves: TableMove[] = [];
  after.forEach((s, i) => {
    const from = positionBefore.get(s.teamId);
    // Un equipo que antes no estaba no se movió: apareció.
    if (from === undefined) return;
    const to = i + 1;
    if (from !== to) moves.push({ teamId: s.teamId, from, to });
  });

  moves.sort(
    (a, b) =>
      Math.abs(b.from - b.to) - Math.abs(a.from - a.to) ||
      // A igual salto, primero el que quedó más arriba en la tabla nueva.
      a.to - b.to ||
      // Último desempate para que el orden sea determinista.
      a.teamId.localeCompare(b.teamId),
  );

  return {
    leaderTeamId: leader.teamId,
    leaderIsNew: before[0]?.teamId !== leader.teamId,
    hadPreviousTable: true,
    moves: moves.slice(0, limit),
  };
}
