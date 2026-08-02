import { describe, it, expect } from 'vitest';
import { deriveTableSummary } from '../tableMoves';
import type { TeamStanding } from '../../types';

/** Fila de tabla con un partido jugado, salvo que se pida otra cosa. */
const fila = (teamId: string, over: Partial<TeamStanding> = {}): TeamStanding => ({
  teamId,
  played: 1,
  won: 0,
  drawn: 0,
  lost: 1,
  goalsFor: 0,
  goalsAgainst: 1,
  goalDifference: -1,
  points: 0,
  ...over,
});

/** Tabla a partir de los ids, en orden de posición. */
const tabla = (...ids: string[]) => ids.map((id) => fila(id));

describe('deriveTableSummary', () => {
  it('anuncia al puntero', () => {
    const res = deriveTableSummary(tabla('A', 'B', 'C'), tabla('A', 'B', 'C'));
    expect(res?.leaderTeamId).toBe('A');
  });

  it('avisa cuando el puntero es nuevo', () => {
    const res = deriveTableSummary(tabla('A', 'B', 'C'), tabla('B', 'A', 'C'));
    expect(res?.leaderTeamId).toBe('B');
    expect(res?.leaderIsNew).toBe(true);
  });

  it('el puntero que se sostiene no es nuevo', () => {
    const res = deriveTableSummary(tabla('A', 'B', 'C'), tabla('A', 'C', 'B'));
    expect(res?.leaderIsNew).toBe(false);
  });

  it('reporta subidas y bajadas con posiciones 1-based', () => {
    const res = deriveTableSummary(tabla('A', 'B', 'C'), tabla('C', 'A', 'B'));
    expect(res?.moves).toEqual([
      { teamId: 'C', from: 3, to: 1 },
      { teamId: 'A', from: 1, to: 2 },
      { teamId: 'B', from: 2, to: 3 },
    ]);
  });

  it('ordena por magnitud del salto, de mayor a menor', () => {
    const res = deriveTableSummary(
      tabla('A', 'B', 'C', 'D', 'E'),
      tabla('A', 'E', 'B', 'C', 'D'),
    );
    // E saltó 3 posiciones; B, C y D bajaron 1 cada uno.
    expect(res?.moves[0]).toEqual({ teamId: 'E', from: 5, to: 2 });
  });

  it('corta en el límite pedido', () => {
    const res = deriveTableSummary(
      tabla('A', 'B', 'C', 'D', 'E'),
      tabla('E', 'D', 'C', 'B', 'A'),
      2,
    );
    expect(res?.moves).toHaveLength(2);
  });

  it('quien no se movió no aparece', () => {
    const res = deriveTableSummary(tabla('A', 'B', 'C'), tabla('A', 'C', 'B'));
    expect(res?.moves.map((m) => m.teamId)).toEqual(['C', 'B']);
  });

  it('un equipo que antes no estaba no produce movimiento', () => {
    const res = deriveTableSummary(tabla('A', 'B'), tabla('A', 'NUEVO', 'B'));
    expect(res?.moves.map((m) => m.teamId)).toEqual(['B']);
  });

  it('sin tabla después, no hay resumen', () => {
    expect(deriveTableSummary(tabla('A', 'B'), [])).toBeNull();
  });

  /**
   * LA REGLA DE HONESTIDAD. Antes de la primera fecha nadie jugó: el orden que
   * trae `before` es el de siembra, no una tabla. Reportar "subió del 3º al 1º"
   * contra un orden arbitrario sería inventar, así que se anuncia el puntero y
   * nada más. Si este test se cae porque alguien "arregló" el borde reportando
   * los saltos que ve, la app pasa a mentir en cada fecha 1.
   */
  it('en la primera fecha anuncia al puntero pero no reporta movimientos', () => {
    const sinJugar = ['A', 'B', 'C'].map((id) =>
      fila(id, { played: 0, lost: 0, goalsAgainst: 0, goalDifference: 0 }),
    );
    const res = deriveTableSummary(sinJugar, tabla('C', 'A', 'B'));
    expect(res?.leaderTeamId).toBe('C');
    expect(res?.leaderIsNew).toBe(false);
    expect(res?.moves).toEqual([]);
  });

  /**
   * El complemento de la regla de honestidad: `leaderIsNew: false` sin más era
   * un booleano de dos estados para tres situaciones, así que la vista no podía
   * distinguir "el puntero se sostuvo" de "no había tabla contra la cual
   * sostenerse" y anunciaba continuidad contra un pasado que no existió.
   */
  it('marca que no había tabla previa cuando nadie había jugado', () => {
    const sinJugar = ['A', 'B', 'C'].map((id) =>
      fila(id, { played: 0, lost: 0, goalsAgainst: 0, goalDifference: 0 }),
    );
    expect(deriveTableSummary(sinJugar, tabla('C', 'A', 'B'))?.hadPreviousTable).toBe(false);
  });

  it('marca que sí había tabla previa en una fecha normal', () => {
    expect(deriveTableSummary(tabla('A', 'B', 'C'), tabla('A', 'C', 'B'))?.hadPreviousTable).toBe(
      true,
    );
  });

  /**
   * El escenario completo de la fecha 1 de una liga sembrada: B iba segundo en
   * la siembra y le gana 3-0 a A, C empata con D. B queda puntero sin haberlo
   * sido nunca, así que el resumen no puede decir que "sigue" ni que es "nuevo".
   */
  it('la fecha 1 de una liga sembrada no afirma nada sobre el pasado', () => {
    const siembra = ['A', 'B', 'C', 'D'].map((id) =>
      fila(id, { played: 0, lost: 0, goalsAgainst: 0, goalDifference: 0 }),
    );
    const despues: TeamStanding[] = [
      fila('B', { won: 1, lost: 0, goalsFor: 3, goalsAgainst: 0, goalDifference: 3, points: 3 }),
      fila('C', { drawn: 1, lost: 0, goalsFor: 1, goalsAgainst: 1, goalDifference: 0, points: 1 }),
      fila('D', { drawn: 1, lost: 0, goalsFor: 1, goalsAgainst: 1, goalDifference: 0, points: 1 }),
      fila('A', { goalsAgainst: 3, goalDifference: -3 }),
    ];

    expect(deriveTableSummary(siembra, despues)).toEqual({
      leaderTeamId: 'B',
      leaderIsNew: false,
      hadPreviousTable: false,
      moves: [],
    });
  });
});
