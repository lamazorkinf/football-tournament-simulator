/**
 * Motor de temporada para un modo de ligas con dos divisiones y ascensos/
 * descensos (ej: Liga Villamariense, División A y B de 16 equipos, 3 y 3).
 *
 * Al cerrar la temporada: los `count` mejores de B ascienden y los `count`
 * peores de A descienden, armando la composición de divisiones del año
 * siguiente. Las entradas son las tablas finales ORDENADAS (mejor → peor).
 */

export interface DivisionRollover {
  /** División A del año siguiente (mismos N equipos: se van los que bajan, entran los que suben). */
  A: string[];
  /** División B del año siguiente. */
  B: string[];
  /** Equipos que ascendieron (mejores de B). */
  promoted: string[];
  /** Equipos que descendieron (peores de A). */
  relegated: string[];
}

/**
 * Aplica ascensos y descensos entre dos divisiones.
 *
 * @param divisionAOrdered  Tabla final de la A, de mejor a peor (índice 0 = campeón).
 * @param divisionBOrdered  Tabla final de la B, de mejor a peor.
 * @param count             Cuántos ascienden/descienden (default 3).
 *
 * La A del año siguiente conserva a los que se quedan (en su orden) y suma a los
 * ascendidos al final; la B conserva a los suyos y suma a los descendidos.
 */
export function applyPromotionRelegation(
  divisionAOrdered: string[],
  divisionBOrdered: string[],
  count = 3,
): DivisionRollover {
  if (divisionAOrdered.length !== divisionBOrdered.length) {
    throw new Error(
      `Las divisiones deben tener el mismo tamaño (A=${divisionAOrdered.length}, B=${divisionBOrdered.length})`,
    );
  }
  if (count <= 0 || count * 2 > divisionAOrdered.length) {
    throw new Error(
      `count inválido: ${count} ascensos/descensos no caben en divisiones de ${divisionAOrdered.length}`,
    );
  }

  const relegated = divisionAOrdered.slice(divisionAOrdered.length - count); // peores de A
  const promoted = divisionBOrdered.slice(0, count); // mejores de B

  const stayA = divisionAOrdered.slice(0, divisionAOrdered.length - count);
  const stayB = divisionBOrdered.slice(count);

  return {
    A: [...stayA, ...promoted],
    B: [...stayB, ...relegated],
    promoted,
    relegated,
  };
}
