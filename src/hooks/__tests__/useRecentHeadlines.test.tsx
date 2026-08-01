import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRecentHeadlines } from '../useRecentHeadlines';
import { matchHistoryService, type MatchHistoryEntry } from '../../services/matchHistoryService';
import { useModeStore } from '../../store/useModeStore';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useHistoryRevisionStore } from '../../store/useHistoryRevisionStore';

/** Fila de historial que produce un batacazo de A sobre B. */
const batacazo = (over: Partial<MatchHistoryEntry> = {}): MatchHistoryEntry => ({
  id: 'm1',
  homeTeamId: 'A',
  awayTeamId: 'B',
  homeScore: 2,
  awayScore: 0,
  stage: 'league',
  homeSkillBefore: 55,
  awaySkillBefore: 90,
  homeSkillAfter: 56,
  awaySkillAfter: 89,
  homeSkillChange: 1,
  awaySkillChange: -1,
  playedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const page = (matches: MatchHistoryEntry[]) => ({ matches, nextCursor: null, hasMore: false });

beforeEach(() => {
  vi.useFakeTimers();
  useModeStore.setState({ activeModeId: 'villamariense' });
  useTournamentStore.setState({
    teams: [
      { id: 'A', name: 'Ben Hur', flag: '', skill: 55 },
      { id: 'B', name: 'Alumni', flag: '', skill: 90 },
    ],
  });
  useHistoryRevisionStore.setState({ revision: 0 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Corre el debounce y deja que la promesa del servicio se resuelva. */
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
}

describe('useRecentHeadlines', () => {
  it('consulta la ventana del modo activo', async () => {
    const spy = vi.spyOn(matchHistoryService, 'getMatchesPage').mockResolvedValue(page([]));
    renderHook(() => useRecentHeadlines());
    await flush();

    expect(spy).toHaveBeenCalledWith({ modeId: 'villamariense', pageSize: 80 });
  });

  it('devuelve los titulares con los nombres resueltos', async () => {
    vi.spyOn(matchHistoryService, 'getMatchesPage').mockResolvedValue(page([batacazo()]));
    const { result } = renderHook(() => useRecentHeadlines());
    await flush();

    expect(result.current).toHaveLength(1);
    expect(result.current[0].kind).toBe('upset');
    expect(result.current[0].homeTeamName).toBe('Ben Hur');
    expect(result.current[0].awayTeamName).toBe('Alumni');
  });

  it('un equipo que no está en el pool cae a su id', async () => {
    vi.spyOn(matchHistoryService, 'getMatchesPage')
      .mockResolvedValue(page([batacazo({ awayTeamId: 'FANTASMA' })]));
    const { result } = renderHook(() => useRecentHeadlines());
    await flush();

    expect(result.current[0].awayTeamName).toBe('FANTASMA');
  });

  it('los penales viajan desde metadata', async () => {
    vi.spyOn(matchHistoryService, 'getMatchesPage').mockResolvedValue(
      page([
        batacazo({
          homeScore: 1,
          awayScore: 1,
          homeSkillBefore: 80,
          awaySkillBefore: 80,
          stage: 'cup',
          metadata: { penalties: { homeScore: 4, awayScore: 2 } },
        }),
      ]),
    );
    const { result } = renderHook(() => useRecentHeadlines());
    await flush();

    expect(result.current[0].label).toBe('PENALES');
  });

  /** El bloque es decoración: un fallo de red no puede romper el Hub. */
  it('un error del servicio deja lista vacía sin propagar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(matchHistoryService, 'getMatchesPage').mockRejectedValue(new Error('sin red'));
    const { result } = renderHook(() => useRecentHeadlines());
    await flush();

    expect(result.current).toEqual([]);
  });

  it('un cambio de revisión vuelve a consultar', async () => {
    const spy = vi.spyOn(matchHistoryService, 'getMatchesPage').mockResolvedValue(page([]));
    renderHook(() => useRecentHeadlines());
    await flush();
    expect(spy).toHaveBeenCalledTimes(1);

    act(() => {
      useHistoryRevisionStore.getState().bump();
    });
    await flush();

    expect(spy).toHaveBeenCalledTimes(2);
  });

  /**
   * Una fecha de temporada persiste partido por partido: diez `createMatch` en
   * paralelo son diez bumps, pero no en el mismo tick — cada `INSERT` resuelve
   * en su propio momento. Por eso los bumps de este test van espaciados por
   * menos que `HEADLINES_DEBOUNCE_MS` (no todos dentro de un mismo `act()`
   * síncrono, que el auto-batching de React ya colapsaría en un solo
   * re-render sin que el debounce entre en juego). Sin debounce, cada bump
   * dispararía su propia consulta.
   */
  it('diez bumps seguidos hacen una sola consulta', async () => {
    const spy = vi.spyOn(matchHistoryService, 'getMatchesPage').mockResolvedValue(page([]));
    renderHook(() => useRecentHeadlines());
    await flush();
    expect(spy).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 10; i++) {
      act(() => {
        useHistoryRevisionStore.getState().bump();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
    }
    await flush();

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
