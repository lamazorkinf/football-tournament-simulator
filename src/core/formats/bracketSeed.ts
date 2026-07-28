/**
 * Sorteos de cuadro propios de un modo: convierten una lista de entrantes en el
 * ORDEN DE SLOTS de la primera ronda, que después alimenta
 * `createBracket({ seed: { kind: 'explicit' } })`.
 *
 * Viven acá y no dentro de la primitiva a propósito. El emparejamiento de un
 * cuadro es siempre el mismo (slots consecutivos 2m / 2m+1); lo que cambia de un
 * modo a otro es QUIÉN cae en cada slot, y ésa es justamente la parte que un
 * modo nuevo aporta como configuración. Dejarla afuera es lo que permite sumar
 * un sorteo sin tocar `bracket.ts`.
 *
 * Las siembras genéricas —por mérito y al azar— no necesitan nada de esto: ya
 * son estrategias de la primitiva (`{ kind: 'seeded' }` y `{ kind: 'random' }`).
 *
 * Convención: el array devuelto se lee de a pares. `slots[2m]` juega la ida de
 * local contra `slots[2m+1]`.
 */

/** Baraja una copia con Fisher-Yates. `rng` inyectable para tests. */
function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Sorteo cruzado entre dos divisiones: cada equipo de la primera enfrenta SÍ o SÍ
 * a uno de la segunda (la copa villamariense). Se barajan las dos y se emparejan
 * una a una; la localía de la ida se sortea por cruce. Requiere |a| === |b|.
 */
export function crossDivisionSlots(
  divisionA: string[],
  divisionB: string[],
  rng: () => number = Math.random,
): string[] {
  if (divisionA.length !== divisionB.length) {
    throw new Error(
      `El sorteo cruzado requiere divisiones del mismo tamaño (A=${divisionA.length}, B=${divisionB.length})`,
    );
  }
  const shuffledA = shuffle(divisionA, rng);
  const shuffledB = shuffle(divisionB, rng);

  const slots: string[] = [];
  for (let i = 0; i < shuffledA.length; i++) {
    const a = shuffledA[i];
    const b = shuffledB[i];
    // Localía de la ida al azar entre los dos.
    const homeIsA = rng() < 0.5;
    slots.push(homeIsA ? a : b, homeIsA ? b : a);
  }
  return slots;
}
