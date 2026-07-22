import { describe, it, expect, vi } from 'vitest';
import { buildMatchParams, collectPlayedCycleMatches, backfillCycleMatchHistory } from '../cycleMatchHistory';
import type { Cycle, Team } from '../../types';
import * as supa from '../../lib/supabase';
import { matchHistoryService } from '../matchHistoryService';

describe('buildMatchParams', () => {
  it('mapea a CreateMatchHistoryParams con cycleMatchId en metadata y change derivado', () => {
    const p = buildMatchParams({
      homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 1,
      stage: 'continental', region: 'Europe', groupName: 'final',
      cycleMatchId: 'm1', tournamentId: 't1',
      homeSkillBefore: 80, awaySkillBefore: 70, homeSkillAfter: 81, awaySkillAfter: 69,
    });
    expect(p.stage).toBe('continental');
    expect(p.homeSkillChange).toBe(1);
    expect(p.awaySkillChange).toBe(-1);
    expect((p.metadata as { cycleMatchId?: string }).cycleMatchId).toBe('m1');
    expect(p.tournamentId).toBe('t1');
  });
});

const teams: Team[] = [
  { id: 'A', name: 'A', flag: '', region: 'Europe', skill: 80 },
  { id: 'B', name: 'B', flag: '', region: 'Europe', skill: 70 },
];
const played = (id: string) => ({ id, homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 0, isPlayed: true, round: 'final' as const });
const unplayed = (id: string) => ({ id, homeTeamId: 'A', awayTeamId: 'B', homeScore: null, awayScore: null, isPlayed: false, round: 'semi' as const });

const cycle = {
  id: 'cycle-1',
  continental: {
    isComplete: true,
    brackets: {
      Europe: { region: 'Europe', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [unplayed('c-semi')], final: played('c-final'), thirdPlace: null, byeTeamIds: [] },
      America: { region: 'America', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: null, thirdPlace: null, byeTeamIds: [] },
      Africa: { region: 'Africa', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: null, thirdPlace: null, byeTeamIds: [] },
      Asia: { region: 'Asia', roundOf64: [], roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], final: null, thirdPlace: null, byeTeamIds: [] },
    },
  },
  confederationsCup: {
    isComplete: false,
    groups: [{ id: 'g', name: 'Grupo A', teamIds: [], matches: [played('cf-g1')], standings: [] }],
    knockout: { semiFinals: [], thirdPlace: null, final: null },
  },
} as unknown as Cycle;

describe('collectPlayedCycleMatches', () => {
  it('reúne solo los partidos jugados, con el stage correcto', () => {
    const res = collectPlayedCycleMatches(cycle, teams);
    const ids = res.map((p) => (p.metadata as { cycleMatchId?: string }).cycleMatchId).sort();
    expect(ids).toEqual(['c-final', 'cf-g1']);
    expect(res.find((p) => (p.metadata as any).cycleMatchId === 'c-final')!.stage).toBe('continental');
    expect(res.find((p) => (p.metadata as any).cycleMatchId === 'cf-g1')!.stage).toBe('confed-group');
    expect(res.every((p) => p.tournamentId === 'cycle-1')).toBe(true);
  });
});

describe('backfillCycleMatchHistory — idempotencia', () => {
  it('inserta solo los partidos jugados que faltan (por cycleMatchId)', async () => {
    vi.spyOn(supa, 'isSupabaseConfigured').mockReturnValue(true);
    // 'c-final' ya existe; 'cf-g1' falta.
    vi.spyOn(matchHistoryService, 'getExistingCycleMatchIds').mockResolvedValue(new Set(['c-final']));
    const batchSpy = vi.spyOn(matchHistoryService, 'createMatchesBatch').mockResolvedValue([]);

    const inserted = await backfillCycleMatchHistory(cycle, teams);

    expect(inserted).toBe(1);
    expect(batchSpy).toHaveBeenCalledTimes(1);
    const arg = batchSpy.mock.calls[0][0];
    expect(arg.map((p) => (p.metadata as any).cycleMatchId)).toEqual(['cf-g1']);
    vi.restoreAllMocks();
  });

  it('no-op sin Supabase', async () => {
    vi.spyOn(supa, 'isSupabaseConfigured').mockReturnValue(false);
    const inserted = await backfillCycleMatchHistory(cycle, teams);
    expect(inserted).toBe(0);
    vi.restoreAllMocks();
  });
});
