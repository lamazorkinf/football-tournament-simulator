import { describe, it, expect } from 'vitest';
import { reconstructCycle, serializeCycleState, toCycle } from '../cycle';
import { DEFAULT_FATIGUE, commitEnergy } from '../energy';
import type { Tournament } from '../../types';

const cfg = DEFAULT_FATIGUE;

const baseTournament = (): Tournament => ({
  id: 't1',
  name: 'Mundial 2030',
  year: 2030,
  qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
  worldCup: null,
  isQualifiersComplete: false,
  hasAnyMatchPlayed: false,
});

describe('energía en el estado del ciclo', () => {
  it('un ciclo nuevo no arrastra energía', () => {
    expect(toCycle(baseTournament()).energy).toBeUndefined();
  });

  it('la energía sobrevive el ida y vuelta por el JSONB', () => {
    const cycle = {
      ...toCycle(baseTournament()),
      energy: commitEnergy(undefined, 'world-cup', 4, [{ teamId: 'bel', energy: 72 }], cfg),
    };
    const payload = serializeCycleState(cycle);
    const restored = reconstructCycle(baseTournament(), payload);

    expect(restored.energy?.scope).toBe('world-cup');
    expect(restored.energy?.byTeam.bel).toEqual({ value: 72, lastMatchdayIndex: 4 });
  });

  it('un documento guardado antes de esta feature se lee sin energía', () => {
    const payload = serializeCycleState(toCycle(baseTournament()));
    // Simula un documento legacy: la clave directamente no existe.
    delete (payload as { energy?: unknown }).energy;

    const restored = reconstructCycle(baseTournament(), payload);
    expect(restored.energy).toBeUndefined();
  });

  it('un torneo legacy sin cycle_state tampoco rompe', () => {
    expect(reconstructCycle(baseTournament(), null).energy).toBeUndefined();
  });
});
