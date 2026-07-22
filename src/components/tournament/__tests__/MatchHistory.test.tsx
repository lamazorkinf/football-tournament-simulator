import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { Team } from '../../../types';
import { MatchHistory } from '../MatchHistory';
import { matchHistoryService, type MatchHistoryEntry } from '../../../services/matchHistoryService';
import * as supaLib from '../../../lib/supabase';

const teams: Team[] = [
  { id: 'A', name: 'Local', flag: '🏠', region: 'Europe', skill: 80 },
  { id: 'B', name: 'Visita', flag: '✈️', region: 'Asia', skill: 75 },
];

const q = (id: string, playedAt: string): MatchHistoryEntry => ({
  id, homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 0,
  stage: 'qualifier', homeSkillBefore: 80, awaySkillBefore: 70,
  homeSkillAfter: 81, awaySkillAfter: 69, homeSkillChange: 1, awaySkillChange: -1,
  playedAt,
});

afterEach(() => vi.restoreAllMocks());

describe('MatchHistory — paginación "Cargar más"', () => {
  it('carga la primera página y appendea al pedir más', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(matchHistoryService, 'subscribeToMatches').mockReturnValue(() => {});
    vi.spyOn(matchHistoryService, 'getMatchStatistics').mockResolvedValue({
      totalMatches: 3, totalGoals: 5, averageGoalsPerMatch: 1.67,
    });
    vi.spyOn(matchHistoryService, 'getMatchesPage')
      .mockResolvedValueOnce({
        matches: [q('a', '2026-01-03T00:00:00Z'), q('b', '2026-01-02T00:00:00Z')],
        nextCursor: { playedAt: '2026-01-02T00:00:00Z', id: 'b' },
        hasMore: true,
      })
      .mockResolvedValueOnce({
        matches: [q('c', '2026-01-01T00:00:00Z')],
        nextCursor: null,
        hasMore: false,
      });

    render(<MatchHistory teams={teams} />);

    // Página 1: 2 partidos qualifier + botón "Cargar más".
    const loadMore = await screen.findByRole('button', { name: /cargar más/i });
    expect(screen.getAllByText('Eliminatoria')).toHaveLength(2);

    loadMore.click();

    // Página 2 appendeada: 3 en total, botón desaparece (hasMore false).
    await waitFor(() => expect(screen.getAllByText('Eliminatoria')).toHaveLength(3));
    expect(screen.queryByRole('button', { name: /cargar más/i })).toBeNull();
  });
});
