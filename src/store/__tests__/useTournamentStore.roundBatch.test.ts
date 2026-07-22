import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useTournamentStore } from '../useTournamentStore';
import type { Cycle, KnockoutMatch, Team } from '../../types';

const teams: Team[] = [
  { id: 'h1', name: 'Home 1', flag: '🏳', region: 'Europe', skill: 90 },
  { id: 'a1', name: 'Away 1', flag: '🏳', region: 'Europe', skill: 85 },
  { id: 'h2', name: 'Home 2', flag: '🏳', region: 'America', skill: 80 },
  { id: 'a2', name: 'Away 2', flag: '🏳', region: 'America', skill: 75 },
];

const ko = (
  id: string,
  round: KnockoutMatch['round'],
  home: string,
  away: string,
  isPlayed = false,
): KnockoutMatch => ({
  id,
  homeTeamId: home,
  awayTeamId: away,
  homeScore: isPlayed ? 1 : null,
  awayScore: isPlayed ? 0 : null,
  isPlayed,
  round,
});

/** Cycle mínimo: solo lo que findMatch/getPhaseMatches recorren. */
function makeCycle(knockout: {
  thirdPlace?: KnockoutMatch | null;
  final?: KnockoutMatch | null;
  semiFinals?: KnockoutMatch[];
}): Cycle {
  const emptyBracket = (region: string) => ({
    region,
    roundOf64: [],
    roundOf32: [],
    roundOf16: [],
    quarterFinals: [],
    semiFinals: [],
    final: null,
    thirdPlace: null,
    byeTeamIds: [],
  });
  return {
    id: 'cycle-1',
    qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
    worldCup: {
      groups: [],
      qualifiedTeamIds: [],
      knockout: {
        roundOf32: [],
        roundOf16: [],
        quarterFinals: [],
        semiFinals: knockout.semiFinals ?? [],
        thirdPlace: knockout.thirdPlace ?? null,
        final: knockout.final ?? null,
      },
    },
    continental: {
      isComplete: true,
      brackets: {
        Europe: emptyBracket('Europe'),
        America: emptyBracket('America'),
        Africa: emptyBracket('Africa'),
        Asia: emptyBracket('Asia'),
      },
    },
    confederationsCup: {
      isComplete: true,
      groups: [],
      knockout: { semiFinals: [], thirdPlace: null, final: null },
    },
    calendar: { phase: 'wc-knockout', matchday: 5 },
  } as unknown as Cycle;
}

function seedState(cycle: Cycle, overrides: Partial<ReturnType<typeof useTournamentStore.getState>> = {}) {
  useTournamentStore.setState({
    teams,
    tournaments: [cycle],
    currentTournamentId: cycle.id,
    currentTournament: cycle,
    isSavingMatch: false,
    isBatchProcessing: false,
    ...overrides,
  });
}

describe('simulateRoundBatch', () => {
  beforeEach(() => {
    useTournamentStore.setState({ isSavingMatch: false, isBatchProcessing: false });
  });

  it('simula secuencialmente y devuelve outcomes con los ids de los equipos', async () => {
    const cycle = makeCycle({ semiFinals: [ko('s1', 'semi', 'h1', 'a1'), ko('s2', 'semi', 'h2', 'a2')] });
    const spy = vi.fn(async (matchId: string) =>
      matchId === 's1'
        ? { homeScore: 2, awayScore: 1 }
        : { homeScore: 0, awayScore: 0, penalties: { homeScore: 4, awayScore: 3 } },
    );
    seedState(cycle, { simulateKnockoutMatch: spy });

    const outcomes = await useTournamentStore.getState().simulateRoundBatch([
      { matchId: 's1', kind: 'knockout' },
      { matchId: 's2', kind: 'knockout' },
    ]);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(outcomes).toEqual([
      { matchId: 's1', homeTeamId: 'h1', awayTeamId: 'a1', homeScore: 2, awayScore: 1 },
      {
        matchId: 's2',
        homeTeamId: 'h2',
        awayTeamId: 'a2',
        homeScore: 0,
        awayScore: 0,
        penalties: { homeScore: 4, awayScore: 3 },
      },
    ]);
    expect(useTournamentStore.getState().isBatchProcessing).toBe(false);
  });

  it('juega el 3er puesto antes que la final aunque lleguen al revés', async () => {
    const cycle = makeCycle({
      thirdPlace: ko('third', 'third-place', 'h2', 'a2'),
      final: ko('final', 'final', 'h1', 'a1'),
    });
    const order: string[] = [];
    const spy = vi.fn(async (matchId: string) => {
      order.push(matchId);
      return { homeScore: 1, awayScore: 0 };
    });
    seedState(cycle, { simulateKnockoutMatch: spy });

    await useTournamentStore.getState().simulateRoundBatch([
      { matchId: 'final', kind: 'knockout' },
      { matchId: 'third', kind: 'knockout' },
    ]);

    expect(order).toEqual(['third', 'final']);
  });

  it('saltea partidos ya jugados o con resultado null sin abortar el resto', async () => {
    const cycle = makeCycle({
      semiFinals: [ko('played', 'semi', 'h1', 'a1', true), ko('nullres', 'semi', 'h2', 'a2'), ko('ok', 'semi', 'h1', 'a2')],
    });
    const spy = vi.fn(async (matchId: string) =>
      matchId === 'nullres' ? null : { homeScore: 3, awayScore: 2 },
    );
    seedState(cycle, { simulateKnockoutMatch: spy });

    const outcomes = await useTournamentStore.getState().simulateRoundBatch([
      { matchId: 'played', kind: 'knockout' },
      { matchId: 'nullres', kind: 'knockout' },
      { matchId: 'ok', kind: 'knockout' },
      { matchId: 'missing', kind: 'knockout' },
    ]);

    // El ya jugado y el inexistente ni se intentan; el null se descarta.
    expect(spy).toHaveBeenCalledTimes(2);
    expect(outcomes.map((o) => o.matchId)).toEqual(['ok']);
    expect(useTournamentStore.getState().isBatchProcessing).toBe(false);
  });

  it('con otro batch en curso devuelve vacío sin simular', async () => {
    const cycle = makeCycle({ semiFinals: [ko('s1', 'semi', 'h1', 'a1')] });
    const spy = vi.fn(async () => ({ homeScore: 1, awayScore: 0 }));
    seedState(cycle, { simulateKnockoutMatch: spy, isBatchProcessing: true });

    const outcomes = await useTournamentStore
      .getState()
      .simulateRoundBatch([{ matchId: 's1', kind: 'knockout' }]);

    expect(outcomes).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    // El guard de entrada no debe pisar el flag del batch ajeno.
    expect(useTournamentStore.getState().isBatchProcessing).toBe(true);
  });

  it('rutea por kind a la acción correspondiente', async () => {
    const cycle = makeCycle({ semiFinals: [ko('s1', 'semi', 'h1', 'a1')] });
    // El partido continental/confed se busca igual vía getPhaseMatches; acá
    // basta verificar el ruteo con un partido de wc-knockout y kinds distintos.
    const knockoutSpy = vi.fn(async () => ({ homeScore: 1, awayScore: 0 }));
    const continentalSpy = vi.fn(async () => ({ homeScore: 2, awayScore: 0 }));
    const confedSpy = vi.fn(async () => ({ homeScore: 3, awayScore: 0 }));
    seedState(cycle, {
      simulateKnockoutMatch: knockoutSpy,
      simulateContinentalMatch: continentalSpy,
      simulateConfederationsMatch: confedSpy,
    });

    await useTournamentStore.getState().simulateRoundBatch([{ matchId: 's1', kind: 'continental' }]);
    expect(continentalSpy).toHaveBeenCalledWith('s1');
    expect(knockoutSpy).not.toHaveBeenCalled();

    await useTournamentStore.getState().simulateRoundBatch([{ matchId: 's1', kind: 'confederations' }]);
    expect(confedSpy).toHaveBeenCalledWith('s1');
  });
});
