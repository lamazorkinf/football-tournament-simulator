import { describe, it, expect } from 'vitest';
import { collectAllMatches } from '../matchCenterCollector';
import type { Cycle } from '../../../types';

// Cycle mínimo: solo lo que el colector recorre. `as unknown as Cycle`
// para no construir el objeto entero.
function makeCycle(): Cycle {
  const played = (id: string) => ({
    id, homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 0,
    isPlayed: true, round: 'final' as const,
  });
  return {
    qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
    worldCup: null,
    continental: {
      isComplete: true,
      brackets: {
        Europe: {
          region: 'Europe', roundOf64: [], roundOf32: [], roundOf16: [],
          quarterFinals: [], semiFinals: [], final: played('cont-final'),
          thirdPlace: null, byeTeamIds: [],
        },
        America: { region: 'America', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: null, thirdPlace: null, byeTeamIds: [] },
        Africa: { region: 'Africa', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: null, thirdPlace: null, byeTeamIds: [] },
        Asia: { region: 'Asia', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: null, thirdPlace: null, byeTeamIds: [] },
      },
    },
    confederationsCup: {
      isComplete: true,
      groups: [{ id: 'cg1', name: 'Grupo A', teamIds: [], matches: [played('confg-1')], standings: [] }],
      knockout: { semiFinals: [], thirdPlace: null, final: played('confko-final') },
    },
  } as unknown as Cycle;
}

describe('collectAllMatches — continental/confed', () => {
  it('incluye el partido continental con stage y región', () => {
    const res = collectAllMatches(makeCycle());
    const cont = res.find((m) => m.match.id === 'cont-final');
    expect(cont).toBeDefined();
    expect(cont!.stage).toBe('continental');
    expect(cont!.region).toBe('Europe');
  });

  it('incluye grupos y knockout de confederaciones bajo stage "confederations"', () => {
    const res = collectAllMatches(makeCycle());
    const grp = res.find((m) => m.match.id === 'confg-1');
    const ko = res.find((m) => m.match.id === 'confko-final');
    expect(grp?.stage).toBe('confederations');
    expect(ko?.stage).toBe('confederations');
  });

  it('estampa displayJornada en cada partido recolectado', () => {
    const res = collectAllMatches(makeCycle());
    expect(res.length).toBeGreaterThan(0);
    res.forEach((m) => expect(typeof m.displayJornada).toBe('number'));
  });
});
