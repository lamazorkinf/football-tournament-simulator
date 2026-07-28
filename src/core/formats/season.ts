/**
 * Motor de temporada: ascensos y descensos entre las divisiones de un modo.
 *
 * Al cerrar la temporada, los `count` mejores de cada división ascienden a la
 * de arriba y los `count` peores descienden a la de abajo, armando la
 * composición del año siguiente. Las entradas son las tablas finales ORDENADAS
 * (mejor → peor).
 *
 * La primitiva es la ESCALERA de N divisiones (`applyPromotionLadder`), no el
 * par: plegar una función de dos divisiones sobre las fronteras consecutivas de
 * una escalera de tres movería a los equipos dos veces (el que baja de la A a
 * la B entraría en la tabla de la B y podría volver a bajar a la C en el mismo
 * cierre). Todos los movimientos se calculan sobre las tablas ORIGINALES y
 * recién después se aplican.
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

/** Movimientos de una frontera entre dos divisiones consecutivas. */
export interface LadderMove {
  /** Suben de la división de abajo a la de arriba. */
  promoted: string[];
  /** Bajan de la división de arriba a la de abajo. */
  relegated: string[];
}

export interface LadderRollover {
  /** Composición del año siguiente, en el mismo orden de divisiones que entró. */
  divisions: string[][];
  /** Un movimiento por frontera: `moves[i]` es entre la división `i` y la `i+1`. */
  moves: LadderMove[];
}

/**
 * Aplica ascensos y descensos sobre una escalera de N divisiones.
 *
 * @param orderedTables  Tablas finales de la 1ª división a la última, cada una
 *                       ordenada de mejor a peor (índice 0 = campeón).
 * @param count          Cuántos suben/bajan por frontera (default 3).
 *
 * Cada división del año siguiente se arma como: los que se quedan (en su orden)
 * + los que suben desde abajo + los que bajan desde arriba.
 */
export function applyPromotionLadder(orderedTables: string[][], count = 3): LadderRollover {
  const n = orderedTables.length;
  if (n < 2) {
    throw new Error(`La escalera necesita al menos 2 divisiones, recibió ${n}`);
  }
  const size = orderedTables[0].length;
  if (orderedTables.some((t) => t.length !== size)) {
    throw new Error(
      `Las divisiones deben tener el mismo tamaño (${orderedTables.map((t) => t.length).join(', ')})`,
    );
  }
  if (count <= 0 || count * 2 > size) {
    throw new Error(
      `count inválido: ${count} ascensos/descensos no caben en divisiones de ${size}`,
    );
  }

  // Todos los movimientos salen de las tablas ORIGINALES: nadie se mueve dos veces.
  const moves: LadderMove[] = [];
  for (let i = 0; i < n - 1; i++) {
    moves.push({
      promoted: orderedTables[i + 1].slice(0, count), // mejores de la de abajo
      relegated: orderedTables[i].slice(size - count), // peores de la de arriba
    });
  }

  const divisions = orderedTables.map((table, i) => {
    const stay = table.slice(
      i > 0 ? count : 0, // los que ascendieron ya no están
      i < n - 1 ? size - count : size, // los que descendieron tampoco
    );
    const fromBelow = i < n - 1 ? moves[i].promoted : [];
    const fromAbove = i > 0 ? moves[i - 1].relegated : [];
    return [...stay, ...fromBelow, ...fromAbove];
  });

  return { divisions, moves };
}

/**
 * Ascensos y descensos entre DOS divisiones: el caso de la escalera de 2, con
 * los nombres `A`/`B` que usa el modo Villamariense.
 *
 * @param divisionAOrdered  Tabla final de la A, de mejor a peor (índice 0 = campeón).
 * @param divisionBOrdered  Tabla final de la B, de mejor a peor.
 * @param count             Cuántos ascienden/descienden (default 3).
 */
export function applyPromotionRelegation(
  divisionAOrdered: string[],
  divisionBOrdered: string[],
  count = 3,
): DivisionRollover {
  const { divisions, moves } = applyPromotionLadder([divisionAOrdered, divisionBOrdered], count);
  return {
    A: divisions[0],
    B: divisions[1],
    promoted: moves[0].promoted,
    relegated: moves[0].relegated,
  };
}
