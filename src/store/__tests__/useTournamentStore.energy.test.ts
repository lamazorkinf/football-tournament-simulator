import { describe, it, expect, beforeEach } from 'vitest';
import { applyEnergyAfterMatch, buildEnergyContext } from '../useTournamentStore';
import { DEFAULT_FATIGUE, commitEnergy } from '../../core/energy';
import { useConfigStore } from '../../store/useConfigStore';
import type { Cycle } from '../../types';

const cfg = DEFAULT_FATIGUE;

const cycleWith = (energy?: Cycle['energy']) => ({ energy }) as Cycle;

describe('buildEnergyContext', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('sin estado previo, los dos equipos entran llenos', () => {
    const ctx = buildEnergyContext(cycleWith(), 'world-cup-group', undefined, 1, 'bel', 'arg');
    expect(ctx.homeEnergy).toBe(100);
    expect(ctx.awayEnergy).toBe(100);
    expect(ctx.matchdayIndex).toBe(1);
    expect(ctx.scope).toBe('world-cup');
  });

  it('arrastra el desgaste de la fase de grupos al knockout del Mundial', () => {
    const energy = commitEnergy(undefined, 'world-cup', 3, [{ teamId: 'bel', energy: 80 }], cfg);
    const ctx = buildEnergyContext(cycleWith(energy), 'world-cup-knockout', 'round-of-32', undefined, 'bel', 'arg');
    // R32 es la jornada 4 del Mundial: una jornada de recuperación desde la 3.
    expect(ctx.matchdayIndex).toBe(4);
    expect(ctx.homeEnergy).toBeCloseTo(84, 5);
    expect(ctx.awayEnergy).toBe(100);
  });

  it('empezar otro torneo devuelve a todos al 100%', () => {
    const energy = commitEnergy(undefined, 'continental', 6, [{ teamId: 'bel', energy: 61 }], cfg);
    const ctx = buildEnergyContext(cycleWith(energy), 'world-cup-group', undefined, 1, 'bel', 'arg');
    expect(ctx.homeEnergy).toBe(100);
  });
});

describe('applyEnergyAfterMatch', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('un partido con alargue y penales desgasta más que uno tranquilo', () => {
    const common = {
      scope: 'world-cup' as const,
      matchdayIndex: 4,
      importance: 1.6,
      home: { teamId: 'bel', skill: 96, energy: 100 },
      away: { teamId: 'arg', skill: 90, energy: 100 },
    };

    const tranquilo = applyEnergyAfterMatch(undefined, {
      ...common,
      tight: false,
      extraTime: false,
      penalties: false,
    });
    const durisimo = applyEnergyAfterMatch(undefined, {
      ...common,
      tight: true,
      extraTime: true,
      penalties: true,
    });

    expect(durisimo.byTeam.bel.value).toBeLessThan(tranquilo.byTeam.bel.value);
    expect(durisimo.byTeam.bel.lastMatchdayIndex).toBe(4);
  });

  it('el equipo de menos skill paga más caro el mismo partido', () => {
    const state = applyEnergyAfterMatch(undefined, {
      scope: 'world-cup',
      matchdayIndex: 4,
      importance: 1.6,
      home: { teamId: 'grande', skill: 96, energy: 100 },
      away: { teamId: 'chico', skill: 60, energy: 100 },
      tight: true,
      extraTime: false,
      penalties: false,
    });
    expect(state.byTeam.chico.value).toBeLessThan(state.byTeam.grande.value);
  });
});
