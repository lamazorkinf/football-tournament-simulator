import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  assembleMatchPage,
  computeWinRate,
  type MatchHistoryEntry,
  matchHistoryService,
} from '../matchHistoryService';
import * as supaLib from '../../lib/supabase';

const entry = (id: string, playedAt: string): MatchHistoryEntry => ({
  id,
  homeTeamId: 'A',
  awayTeamId: 'B',
  homeScore: 1,
  awayScore: 0,
  stage: 'qualifier',
  homeSkillBefore: 80,
  awaySkillBefore: 70,
  homeSkillAfter: 81,
  awaySkillAfter: 69,
  homeSkillChange: 1,
  awaySkillChange: -1,
  playedAt,
});

describe('assembleMatchPage', () => {
  it('página llena ⇒ hasMore + cursor del último', () => {
    const res = assembleMatchPage(
      [entry('a', '2026-01-02T00:00:00Z'), entry('b', '2026-01-01T00:00:00Z')],
      2,
    );
    expect(res.hasMore).toBe(true);
    expect(res.nextCursor).toEqual({ playedAt: '2026-01-01T00:00:00Z', id: 'b' });
    expect(res.matches).toHaveLength(2);
  });

  it('página parcial ⇒ sin cursor', () => {
    const res = assembleMatchPage([entry('a', '2026-01-02T00:00:00Z')], 2);
    expect(res.hasMore).toBe(false);
    expect(res.nextCursor).toBeNull();
  });

  it('página vacía ⇒ sin cursor', () => {
    const res = assembleMatchPage([], 2);
    expect(res.hasMore).toBe(false);
    expect(res.nextCursor).toBeNull();
    expect(res.matches).toEqual([]);
  });
});

describe('computeWinRate', () => {
  it('calcula porcentaje', () => {
    expect(computeWinRate(3, 6)).toBe(50);
  });
  it('0 partidos ⇒ 0 (sin división por cero)', () => {
    expect(computeWinRate(0, 0)).toBe(0);
  });
});

// Fila cruda como la devuelve el RPC (snake_case, mismo shape que match_history).
const dbRow = (id: string, playedAt: string, wentToExtraTime = false) => ({
  id,
  home_team_id: 'A',
  away_team_id: 'B',
  home_score: 1,
  away_score: 0,
  stage: 'qualifier',
  group_name: null,
  region: null,
  tournament_id: null,
  home_skill_before: 80,
  away_skill_before: 70,
  home_skill_after: 81,
  away_skill_after: 69,
  home_skill_change: 1,
  away_skill_change: -1,
  played_at: playedAt,
  metadata: {},
  went_to_extra_time: wentToExtraTime,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getMatchesPage', () => {
  it('mapea filas del RPC y arma el cursor del último', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    const rpc = vi.spyOn(supaLib.supabase as unknown as { rpc: (...a: unknown[]) => unknown }, 'rpc')
      .mockResolvedValue({
        data: [dbRow('a', '2026-01-02T00:00:00Z'), dbRow('b', '2026-01-01T00:00:00Z')],
        error: null,
      } as never);

    const res = await matchHistoryService.getMatchesPage({ pageSize: 2, stage: 'qualifier' });

    expect(rpc).toHaveBeenCalledWith('get_matches_page', {
      p_cursor_played_at: null,
      p_cursor_id: null,
      p_page_size: 2,
      p_stage: 'qualifier',
    });
    expect(res.matches.map((m) => m.id)).toEqual(['a', 'b']);
    expect(res.nextCursor).toEqual({ playedAt: '2026-01-01T00:00:00Z', id: 'b' });
    expect(res.hasMore).toBe(true);
  });

  it('sin Supabase ⇒ página vacía', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(false);
    const res = await matchHistoryService.getMatchesPage({ pageSize: 30 });
    expect(res).toEqual({ matches: [], nextCursor: null, hasMore: false });
  });

  it('mapea went_to_extra_time de la fila cruda a wentToExtraTime', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supaLib.supabase as unknown as { rpc: (...a: unknown[]) => unknown }, 'rpc')
      .mockResolvedValue({
        data: [
          dbRow('extra', '2026-01-02T00:00:00Z', true),
          dbRow('normal', '2026-01-01T00:00:00Z', false),
        ],
        error: null,
      } as never);

    const res = await matchHistoryService.getMatchesPage({ pageSize: 2 });

    expect(res.matches.find((m) => m.id === 'extra')?.wentToExtraTime).toBe(true);
    expect(res.matches.find((m) => m.id === 'normal')?.wentToExtraTime).toBe(false);
  });

  it('pasa el cursor al RPC', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    const rpc = vi.spyOn(supaLib.supabase as unknown as { rpc: (...a: unknown[]) => unknown }, 'rpc')
      .mockResolvedValue({ data: [], error: null } as never);

    await matchHistoryService.getMatchesPage({
      cursor: { playedAt: '2026-01-01T00:00:00Z', id: 'b' },
      pageSize: 10,
    });

    expect(rpc).toHaveBeenCalledWith('get_matches_page', {
      p_cursor_played_at: '2026-01-01T00:00:00Z',
      p_cursor_id: 'b',
      p_page_size: 10,
      p_stage: null,
    });
  });
});

describe('getMatchStatistics', () => {
  it('mapea bigint-como-string a number', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supaLib.supabase as unknown as { rpc: (...a: unknown[]) => unknown }, 'rpc')
      .mockResolvedValue({
        data: [{ total_matches: '1234', total_goals: '3456', avg_goals: 2.8 }],
        error: null,
      } as never);

    const s = await matchHistoryService.getMatchStatistics();
    expect(s).toEqual({ totalMatches: 1234, totalGoals: 3456, averageGoalsPerMatch: 2.8 });
  });

  it('sin Supabase ⇒ ceros', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(false);
    const s = await matchHistoryService.getMatchStatistics();
    expect(s).toEqual({ totalMatches: 0, totalGoals: 0, averageGoalsPerMatch: 0 });
  });
});

describe('getTeamStats', () => {
  it('mapea snake_case → camelCase con Number()', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supaLib.supabase as unknown as { rpc: (...a: unknown[]) => unknown }, 'rpc')
      .mockResolvedValue({
        data: [{
          team_id: 'A', total_matches: '10', wins: '6', draws: '2',
          losses: '2', goals_for: '18', goals_against: '9',
        }],
        error: null,
      } as never);

    const rows = await matchHistoryService.getTeamStats();
    expect(rows).toEqual([{
      teamId: 'A', totalMatches: 10, wins: 6, draws: 2,
      losses: 2, goalsFor: 18, goalsAgainst: 9,
    }]);
  });
});

describe('getRegionStats', () => {
  it('mapea snake_case → camelCase con Number()', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supaLib.supabase as unknown as { rpc: (...a: unknown[]) => unknown }, 'rpc')
      .mockResolvedValue({
        data: [{ region: 'Europe', total_goals: '120', matches_played: '40' }],
        error: null,
      } as never);

    const rows = await matchHistoryService.getRegionStats();
    expect(rows).toEqual([{ region: 'Europe', totalGoals: 120, matchesPlayed: 40 }]);
  });
});
