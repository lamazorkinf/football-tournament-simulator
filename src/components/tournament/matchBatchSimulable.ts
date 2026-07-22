import type { MatchStage } from './matchCenterCollector';

/**
 * Etapas que el path de batch "Simular Jornada" puede procesar.
 * Knockout, Continental y Confederaciones se simulan desde su propia vista
 * (cada partido tiene su propio botón "Play" ahí), NO desde el batch de
 * MatchCenter — ese batch solo sabe buscar partidos en
 * `qualifiers`/`worldCup.groups`. Por eso el whitelist explícito: agregar una
 * etapa nueva al colector no debe habilitarla aquí por accidente (blacklist).
 */
export function isBatchSimulableStage(stage: MatchStage): stage is 'qualifier' | 'world-cup' {
  return stage === 'qualifier' || stage === 'world-cup';
}
