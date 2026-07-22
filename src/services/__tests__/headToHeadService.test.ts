import { describe, it, expect, beforeEach } from 'vitest';
import { getMatchesBetweenTeams } from '../headToHeadService';
import { useTournamentStore } from '../../store/useTournamentStore';
import type { Cycle } from '../../types';

function cycleWithContinentalMatch(): Cycle {
  const m = { id: 'x', homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 1, isPlayed: true, round: 'final' as const };
  return {
    qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
    worldCup: null,
    continental: {
      isComplete: true,
      brackets: {
        Europe: { region: 'Europe', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: m, thirdPlace: null, byeTeamIds: [] },
        America: { region: 'America', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: null, thirdPlace: null, byeTeamIds: [] },
        Africa: { region: 'Africa', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: null, thirdPlace: null, byeTeamIds: [] },
        Asia: { region: 'Asia', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: null, thirdPlace: null, byeTeamIds: [] },
      },
    },
    confederationsCup: { isComplete: false, groups: [], knockout: { semiFinals: [], thirdPlace: null, final: null } },
  } as unknown as Cycle;
}

describe('getMatchesBetweenTeams — incluye continental/confed', () => {
  beforeEach(() => {
    useTournamentStore.setState({ currentTournament: cycleWithContinentalMatch() });
  });

  it('devuelve el partido continental jugado entre los dos equipos', () => {
    const res = getMatchesBetweenTeams('A', 'B');
    expect(res.map((m) => m.id)).toContain('x');
  });
});
