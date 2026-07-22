import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { Team } from '../../../types';
import { MatchHistory } from '../MatchHistory';
import { matchHistoryService, type MatchHistoryEntry, type MatchPage } from '../../../services/matchHistoryService';
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

    fireEvent.click(loadMore);

    // Página 2 appendeada: 3 en total, botón desaparece (hasMore false).
    await waitFor(() => expect(screen.getAllByText('Eliminatoria')).toHaveLength(3));
    expect(screen.queryByRole('button', { name: /cargar más/i })).toBeNull();
  });
});

describe('MatchHistory — guard de época evita contaminación entre filtros', () => {
  const wc = (id: string, playedAt: string): MatchHistoryEntry => ({
    id, homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 1,
    stage: 'world-cup-group', homeSkillBefore: 80, awaySkillBefore: 70,
    homeSkillAfter: 82, awaySkillAfter: 68, homeSkillChange: 2, awaySkillChange: -2,
    playedAt,
  });

  it('descarta el resultado de una carga vieja si el filtro cambió antes de que resuelva', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(matchHistoryService, 'subscribeToMatches').mockReturnValue(() => {});
    vi.spyOn(matchHistoryService, 'getMatchStatistics').mockResolvedValue({
      totalMatches: 0, totalGoals: 0, averageGoalsPerMatch: 0,
    });

    // Promesa diferida: representa la carga para filter='qualifier' que queda
    // "vieja" porque el usuario cambia de filtro de nuevo antes de que resuelva.
    let resolveStale!: (value: MatchPage) => void;
    const staleDeferred = new Promise<MatchPage>((resolve) => {
      resolveStale = resolve;
    });

    vi.spyOn(matchHistoryService, 'getMatchesPage')
      // 1) carga inicial (filter='all')
      .mockResolvedValueOnce({
        matches: [q('initial', '2026-01-05T00:00:00Z')],
        nextCursor: null,
        hasMore: true,
      })
      // 2) carga disparada al pasar a 'qualifier': queda en vuelo (diferida)
      .mockImplementationOnce(() => staleDeferred)
      // 3) carga disparada al pasar a 'world-cup-group': reemplaza a la anterior
      .mockResolvedValueOnce({
        matches: [wc('fresh', '2026-02-01T00:00:00Z')],
        nextCursor: null,
        hasMore: false,
      });

    render(<MatchHistory teams={teams} />);

    // Carga inicial (filter='all') visible.
    await screen.findByText('Eliminatoria');

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'qualifier' } });
    // Antes de que la carga de 'qualifier' resuelva, el usuario cambia de nuevo
    // de filtro: esto cancela la época de esa carga en vuelo.
    fireEvent.change(select, { target: { value: 'world-cup-group' } });

    // La carga de 'world-cup-group' resuelve y se muestra.
    await waitFor(() => expect(screen.getAllByText('Copa del Mundo - Grupos')).toHaveLength(1));
    expect(screen.queryByText('Eliminatoria')).toBeNull();

    // Ahora resolvemos la promesa vieja (qualifier). Su época ya fue cancelada
    // por el cambio de filtro posterior: no debe pisar la lista actual.
    resolveStale({
      matches: [q('stale', '2026-01-01T00:00:00Z')],
      nextCursor: { playedAt: '2026-01-01T00:00:00Z', id: 'stale' },
      hasMore: true,
    });

    // Damos tiempo a que el microtask de la promesa vieja se procese; la lista
    // debe seguir reflejando solo el filtro actual, sin contaminación.
    await waitFor(() => expect(screen.getAllByText('Copa del Mundo - Grupos')).toHaveLength(1));
    expect(screen.queryByText('Eliminatoria')).toBeNull();
    expect(screen.queryByRole('button', { name: /cargar más/i })).toBeNull();
  });
});
