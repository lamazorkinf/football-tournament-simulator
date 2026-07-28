import type { Cycle } from '../types';
import type { View } from '../types/view';
import { isConfederationsDrawn, isContinentalDrawn } from '../utils/cycleProgress';

/**
 * Lo que el ciclo mundialista tiene y ningún otro motor: un calendario de 4
 * años con fases que se desbloquean en orden, y dos pantallas de maquinaria
 * (Progreso y Centro de Partidos) que no son competiciones.
 *
 * La navegación general (`modes/nav.ts`) es la misma para todos los modos; esto
 * es lo que el motor `national-cycle` le aporta. Aislarlo acá es lo que permite
 * que `nav.ts` no tenga una sola rama por tipo de modo.
 */

/**
 * A qué vista de la app corresponde cada competición del ciclo. El motor de 4
 * años tiene una pantalla escrita a mano por fase, así que su navegación es
 * fija: una competición nueva en un modo `national-cycle` no tiene dónde
 * dibujarse (para eso está el motor de temporada, que sí es genérico).
 */
export const NATIONAL_COMPETITION_VIEW: Record<string, View> = {
  continental: 'continental',
  confederations: 'confederations',
  qualifiers: 'qualifiers',
  'world-cup': 'worldcup',
};

/**
 * Fases del ciclo todavía no desbloqueadas. Se marcan con candado pero siguen
 * navegables: entrar lleva al EmptyState que explica cómo desbloquearlas.
 */
export function lockedViewsForCycle(cycle: Cycle | null): View[] {
  if (!cycle) return [];
  const locked: View[] = [];
  if (!isContinentalDrawn(cycle)) locked.push('continental');
  if (!isConfederationsDrawn(cycle)) locked.push('confederations');
  if (!cycle.confederationsCup.isComplete) locked.push('qualifiers');
  if (!cycle.worldCup) locked.push('worldcup');
  return locked;
}
