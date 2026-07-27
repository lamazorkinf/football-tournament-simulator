import type { Team, Group, Match } from '../types';
import type { FixtureLetter } from '../constants/fixtureTemplate';
import { drawPots, generateGroupFixturesFromTemplate } from '../core/formats/groupStage';

/**
 * Sorteo de las clasificatorias: grupos de 5 por región, un equipo por bombo.
 *
 * Desde la unificación de formatos esto es un ADAPTADOR sobre la primitiva de
 * fase de grupos (core/formats/groupStage.ts). Lo único propio que queda acá es
 * la forma del `Group` de las clasificatorias (id, nombre y región ya vienen
 * armados por el llamador) y la plantilla que le corresponde: `fifa-5`, que
 * reparte UN partido por fecha a lo largo de 20 fechas. Ese conteo de fechas es
 * el que indexa todo el calendario del ciclo, así que la plantilla manda.
 */

/**
 * Reparte los equipos de una región en sus grupos.
 *
 * Sin diversidad regional (los equipos de un grupo de clasificatorias son todos
 * de la misma confederación) y sin serpiente: el bombo N va a los grupos en
 * orden. Una región cuyo número de equipos no es múltiplo de 5 deja el último
 * bombo corto (p. ej. 54 equipos → 11 grupos, bombo E con 10 equipos); en ese
 * caso el último grupo queda con menos equipos en vez de romper el sorteo.
 */
export function performDraw(groups: Group[], teams: Team[]): Group[] {
  const byMerit = [...teams].sort((a, b) => b.skill - a.skill).map((t) => t.id);
  const buckets = drawPots(byMerit, { groupCount: groups.length, groupSize: 5 }, { kind: 'pots' });

  return groups.map((group, index) => ({
    ...group,
    teamIds: [...buckets[index].teamIds],
    // groupSize 5 ⇒ la primitiva sólo emite letras A-E, que es FixtureLetter.
    letterAssignments: buckets[index].potLetters as Record<string, FixtureLetter>,
    isDrawComplete: true,
  }));
}

/**
 * Partidos de un grupo de clasificatorias, a partir de la plantilla FIFA de 5.
 *
 * Si el grupo tiene menos de 5 equipos, las letras sobrantes no tienen equipo y
 * esos enfrentamientos se descartan: como la plantilla es el round-robin
 * completo ida y vuelta, quitar una letra deja un round-robin válido.
 */
export function generateGroupMatches(
  groupId: string,
  letterAssignments: Record<string, FixtureLetter>,
): Match[] {
  return generateGroupFixturesFromTemplate(letterAssignments, 'fifa-5', 'qualifier', groupId);
}

/**
 * La tabla inicial de un grupo. Vive en core/scheduler.ts —único motor de
 * tablas del juego— y se reexporta acá porque éste era su hogar histórico.
 */
export { initializeStandings } from '../core/scheduler';
