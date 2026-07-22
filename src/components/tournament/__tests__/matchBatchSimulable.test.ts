import { describe, it, expect } from 'vitest';
import { isBatchSimulableStage } from '../matchBatchSimulable';
import type { MatchStage } from '../matchCenterCollector';

// Regresión: el batch "Simular Jornada" de MatchCenter solo sabe buscar
// partidos en `qualifiers`/`worldCup.groups` (ver simulateMatchdayBatch en el
// store, tipado a 'qualifier' | 'world-cup'). Antes el filtro del batch era
// un blacklist (`stage !== 'knockout'`), así que al agregar continental/confed
// al colector (Task 3) esos partidos se colaban al batch: no se encontraban
// en worldCup.groups, se saltaban en silencio, y el modal de resultados igual
// mostraba un fabricado "0-0 Copa Mundial" con un toast de éxito falso.
describe('isBatchSimulableStage', () => {
  it('acepta qualifier y world-cup', () => {
    expect(isBatchSimulableStage('qualifier')).toBe(true);
    expect(isBatchSimulableStage('world-cup')).toBe(true);
  });

  it('rechaza knockout, continental y confederations', () => {
    expect(isBatchSimulableStage('knockout')).toBe(false);
    expect(isBatchSimulableStage('continental')).toBe(false);
    expect(isBatchSimulableStage('confederations')).toBe(false);
  });

  it('cubre exhaustivamente todas las MatchStage sin dejar ninguna sin decidir', () => {
    const allStages: MatchStage[] = ['qualifier', 'world-cup', 'knockout', 'continental', 'confederations'];
    const simulable = allStages.filter(isBatchSimulableStage);
    expect(simulable.sort()).toEqual(['qualifier', 'world-cup']);
  });
});
