import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { toHeadlineMatch, useRecentHeadlines } from '../useRecentHeadlines';
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

describe('useRecentHeadlines — filas reconstruidas por el backfill', () => {
  /**
   * EL ESCENARIO. Bolivia le ganó 2-1 a Brasil en la Copa América con los dos en
   * 70 y el insert best-effort se perdió. Dos años después el backfill reinserta
   * la fila con `played_at = now()` y el skill de HOY (55 y 90) en las dos
   * columnas de "antes", con los dos cambios en 0. La brecha de 35 es fabricada
   * y no puede titular BATACAZO.
   */
  const delBackfill = (over: Partial<MatchHistoryEntry> = {}): MatchHistoryEntry => ({
    id: 'backfill-1',
    homeTeamId: 'bol',
    awayTeamId: 'bra',
    homeScore: 2,
    awayScore: 1,
    stage: 'continental',
    homeSkillBefore: 55,
    awaySkillBefore: 90,
    homeSkillAfter: 55,
    awaySkillAfter: 90,
    homeSkillChange: 0,
    awaySkillChange: 0,
    playedAt: '2028-01-01T00:00:00Z',
    ...over,
  });

  it('los dos deltas en cero marcan la fila como reconstruida', () => {
    expect(toHeadlineMatch(delBackfill()).skillsReconstructed).toBe(true);
    expect(toHeadlineMatch(batacazo()).skillsReconstructed).toBe(false);
  });

  it('una fila del backfill no titula BATACAZO', async () => {
    vi.spyOn(matchHistoryService, 'getMatchesPage').mockResolvedValue(page([delBackfill()]));
    const { result } = renderHook(() => useRecentHeadlines());
    await flush();

    expect(result.current).toEqual([]);
  });

  it('una fila del backfill no titula AGUANTE', async () => {
    vi.spyOn(matchHistoryService, 'getMatchesPage')
      .mockResolvedValue(page([delBackfill({ homeScore: 1, awayScore: 1 })]));
    const { result } = renderHook(() => useRecentHeadlines());
    await flush();

    expect(result.current).toEqual([]);
  });

  /** La diferencia de gol es real aun cuando los skills se hayan fabricado. */
  it('una fila del backfill sí titula GOLEADA', async () => {
    vi.spyOn(matchHistoryService, 'getMatchesPage')
      .mockResolvedValue(page([delBackfill({ homeScore: 5, awayScore: 0 })]));
    const { result } = renderHook(() => useRecentHeadlines());
    await flush();

    expect(result.current[0].kind).toBe('rout');
  });
});

describe('useRecentHeadlines — cambio de modo', () => {
  /**
   * EL ESCENARIO. Parado en selecciones con la portada llena, se elige la Liga
   * Villamariense. Antes, el estado sobrevivía al switch (`ModeSelector` no
   * remonta nada) y la portada seguía mostrando "BATACAZO — Islandia 2 - 1
   * Brasil" durante los 300 ms del debounce más el round trip, ya con el pool de
   * equipos rotado: los nombres caían al id crudo sobre el Hub del otro modo.
   */
  it('la portada se vacía en el MISMO render, sin esperar la consulta', async () => {
    vi.spyOn(matchHistoryService, 'getMatchesPage').mockResolvedValue(page([batacazo()]));
    const { result } = renderHook(() => useRecentHeadlines());
    await flush();
    expect(result.current).toHaveLength(1);

    // Cambio de modo: ni un tick de timers, como en el render inmediato del switch.
    act(() => {
      useModeStore.setState({ activeModeId: 'selecciones' });
    });

    expect(result.current).toEqual([]);
  });

  it('los titulares del modo nuevo aparecen cuando resuelve su consulta', async () => {
    const spy = vi.spyOn(matchHistoryService, 'getMatchesPage')
      .mockResolvedValue(page([batacazo()]));
    const { result } = renderHook(() => useRecentHeadlines());
    await flush();

    act(() => {
      useModeStore.setState({ activeModeId: 'selecciones' });
    });
    await flush();

    expect(spy).toHaveBeenLastCalledWith({ modeId: 'selecciones', pageSize: 80 });
    expect(result.current).toHaveLength(1);
  });
});

describe('useRecentHeadlines — habilitado', () => {
  /**
   * EL ESCENARIO. Octavos del Mundial: `simulateRoundBatch` es secuencial y cada
   * llave espera dos round trips, o sea más de un debounce entre incrementos de
   * la revisión. Con el hook siempre encendido eso eran 16 páginas de 80 filas
   * peleándole la conexión a los writes, con el Hub desmontado.
   */
  it('deshabilitado no consulta, ni siquiera al cambiar la revisión', async () => {
    const spy = vi.spyOn(matchHistoryService, 'getMatchesPage').mockResolvedValue(page([]));
    renderHook(() => useRecentHeadlines(false));
    await flush();
    expect(spy).not.toHaveBeenCalled();

    for (let i = 0; i < 16; i++) {
      act(() => {
        useHistoryRevisionStore.getState().bump();
      });
      await flush();
    }

    expect(spy).not.toHaveBeenCalled();
  });

  /**
   * Ir a otra vista y volver no puede parpadear: lo cacheado se muestra al toque
   * y la consulta del re-encendido lo refresca 300 ms después.
   */
  it('apagar y volver a prender conserva lo que ya tenía y refresca', async () => {
    const spy = vi.spyOn(matchHistoryService, 'getMatchesPage')
      .mockResolvedValue(page([batacazo()]));
    const { result, rerender } = renderHook(({ on }) => useRecentHeadlines(on), {
      initialProps: { on: true },
    });
    await flush();
    expect(result.current).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(1);

    rerender({ on: false });
    await flush();
    expect(result.current).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(1);

    rerender({ on: true });
    await flush();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.current).toHaveLength(1);
  });
});
