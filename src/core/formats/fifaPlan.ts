import { planWithSources, type BracketPlan } from './bracket';

/**
 * El cuadro de 32 del Mundial, como DATO.
 *
 * Lo que hace especial a este cuadro —y la razón por la que la primitiva de
 * eliminación necesita planes de cruce explícitos— es que sus rondas NO son
 * adyacencia. Cada posición `i` de R32 y la `i+8` salen de los MISMOS dos grupos
 * (p. ej. p0 = A1 vs B2 y p8 = B1 vs A2), así que no pueden emparejarse entre sí:
 * sería una revancha de grupo en octavos. El plan las manda a mitades opuestas y,
 * combinado con los cruces de cuartos, dos equipos del mismo grupo sólo se pueden
 * reencontrar en la final.
 *
 * Vive en su propio módulo —y no adentro de core/knockout.ts— porque cualquier
 * modo puede pedirlo desde su descriptor con `plan: 'fifa-32'`. Es exactamente la
 * forma que tiene que tener la parte "propia" de un formato para que sumar un
 * modo sea configuración: un dato serializable, no una rama de código.
 *
 * Sin `firstMatchday`: los partidos de knockout del Mundial no llevan `matchday`
 * estampado (a diferencia de continental y confed). Estampárselo haría que
 * `getPhaseMatchdayCount(cycle, 'wc-knockout')` deje de dar 0 y el cuadro quedaría
 * bloqueado por calendario.
 */
export const WORLD_CUP_PLAN: BracketPlan = planWithSources(
  32,
  {
    // R16: {A,B} vs {C,D} y su mitad opuesta, etc.
    1: [[0, 1], [8, 9], [2, 3], [10, 11], [4, 5], [12, 13], [6, 7], [14, 15]],
    2: [[0, 4], [2, 6], [1, 5], [3, 7]],
    3: [[0, 1], [2, 3]],
  },
  { thirdPlace: true },
);

/**
 * Orden de slots de R32: 1º de grupo contra 2º de OTRO grupo.
 * A1-B2, C1-D2, … y después B1-A2, D1-C2, …
 */
export const R32_SLOT_ORDER: ReadonlyArray<readonly [number, 'winner' | 'runnerUp']> = [
  [0, 'winner'], [1, 'runnerUp'], [2, 'winner'], [3, 'runnerUp'],
  [4, 'winner'], [5, 'runnerUp'], [6, 'winner'], [7, 'runnerUp'],
  [8, 'winner'], [9, 'runnerUp'], [10, 'winner'], [11, 'runnerUp'],
  [12, 'winner'], [13, 'runnerUp'], [14, 'winner'], [15, 'runnerUp'],
  [1, 'winner'], [0, 'runnerUp'], [3, 'winner'], [2, 'runnerUp'],
  [5, 'winner'], [4, 'runnerUp'], [7, 'winner'], [6, 'runnerUp'],
  [9, 'winner'], [8, 'runnerUp'], [11, 'winner'], [10, 'runnerUp'],
  [13, 'winner'], [12, 'runnerUp'], [15, 'winner'], [14, 'runnerUp'],
] as const;

/**
 * Slots de R32 a partir de los clasificados por grupo (`perGroup[g][0]` = 1º,
 * `[1]` = 2º). Requiere 16 grupos con 2 clasificados cada uno.
 */
export function fifa32Slots(perGroup: string[][]): string[] {
  if (perGroup.length !== 16) {
    throw new Error(`El cuadro fifa-32 requiere 16 grupos, recibió ${perGroup.length}`);
  }
  return R32_SLOT_ORDER.map(([groupIndex, which]) => {
    const slot = perGroup[groupIndex]?.[which === 'winner' ? 0 : 1];
    if (!slot) {
      throw new Error(`Falta el ${which} del grupo ${groupIndex} para armar el cuadro fifa-32`);
    }
    return slot;
  });
}
