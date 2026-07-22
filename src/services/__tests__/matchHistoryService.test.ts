import { describe, it, expect } from 'vitest';
import {
  assembleMatchPage,
  computeWinRate,
  type MatchHistoryEntry,
} from '../matchHistoryService';

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
