import { useEffect } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, render } from '@testing-library/react';
import { useLiveMatchPlayback } from '../useLiveMatchPlayback';
import type { LiveTimeline } from '../../core/liveMatch';

const timeline: LiveTimeline = {
  goals: [
    { minute: 10, side: 'home', homeScore: 1, awayScore: 0 },
    { minute: 80, side: 'away', homeScore: 1, awayScore: 1 },
  ],
  finalHomeScore: 1,
  finalAwayScore: 1,
};

const timelineWithPens: LiveTimeline = {
  ...timeline,
  penalties: { homeScore: 5, awayScore: 4 },
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useLiveMatchPlayback', () => {
  it('timeline null → sin correr, marcador 0-0', () => {
    const { result } = renderHook(() => useLiveMatchPlayback(null, 1));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.minute).toBe(0);
    expect(result.current.displayHomeScore).toBe(0);
  });

  it('revela cada gol al llegar su minuto (1x = 1000ms/min)', () => {
    const { result } = renderHook(() => useLiveMatchPlayback(timeline, 1));
    act(() => vi.advanceTimersByTime(10 * 1000));
    expect(result.current.minute).toBe(10);
    expect(result.current.displayHomeScore).toBe(1);
    expect(result.current.displayAwayScore).toBe(0);
    act(() => vi.advanceTimersByTime(70 * 1000));
    expect(result.current.displayAwayScore).toBe(1);
  });

  it('al llegar a 90 sin penales termina en finished', () => {
    const { result } = renderHook(() => useLiveMatchPlayback(timeline, 1));
    act(() => vi.advanceTimersByTime(90 * 1000));
    expect(result.current.minute).toBe(90);
    expect(result.current.phase).toBe('finished');
    expect(result.current.revealedGoals).toHaveLength(2);
  });

  it('con penales: playing → penalties → finished y revela el marcador de penales', () => {
    const { result } = renderHook(() => useLiveMatchPlayback(timelineWithPens, 1));
    act(() => vi.advanceTimersByTime(90 * 1000));
    expect(result.current.phase).toBe('penalties');
    expect(result.current.penalties).toBeUndefined();
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.phase).toBe('finished');
    expect(result.current.penalties).toEqual({ homeScore: 5, awayScore: 4 });
  });

  it('setSpeed acelera el reloj (2x = 500ms/min)', () => {
    const { result } = renderHook(() => useLiveMatchPlayback(timeline, 1));
    act(() => result.current.setSpeed(2));
    act(() => vi.advanceTimersByTime(10 * 500));
    expect(result.current.minute).toBe(10);
  });

  it('skipToEnd revela todo y termina', () => {
    const { result } = renderHook(() => useLiveMatchPlayback(timelineWithPens, 1));
    act(() => result.current.skipToEnd());
    expect(result.current.phase).toBe('finished');
    expect(result.current.minute).toBe(90);
    expect(result.current.revealedGoals).toHaveLength(2);
    expect(result.current.displayHomeScore).toBe(1);
    expect(result.current.displayAwayScore).toBe(1);
    expect(result.current.penalties).toEqual({ homeScore: 5, awayScore: 4 });
  });

  it('en pausa el reloj no avanza y no revela goles nuevos', () => {
    const { result } = renderHook(() => useLiveMatchPlayback(timeline, 1));
    act(() => vi.advanceTimersByTime(5 * 1000));

    act(() => result.current.togglePause());
    expect(result.current.isPaused).toBe(true);
    act(() => vi.advanceTimersByTime(30 * 1000));
    expect(result.current.minute).toBe(5);
    // El gol del minuto 10 no se revela mientras el reloj está frenado.
    expect(result.current.displayHomeScore).toBe(0);

    act(() => result.current.togglePause());
    act(() => vi.advanceTimersByTime(5 * 1000));
    expect(result.current.minute).toBe(10);
    expect(result.current.displayHomeScore).toBe(1);
  });

  it('un timeline nuevo arranca sin pausa', () => {
    const { result, rerender } = renderHook(
      ({ t }: { t: LiveTimeline }) => useLiveMatchPlayback(t, 1),
      { initialProps: { t: timeline } },
    );
    act(() => result.current.togglePause());
    expect(result.current.isPaused).toBe(true);

    rerender({ t: timelineWithPens });
    expect(result.current.isPaused).toBe(false);
    act(() => vi.advanceTimersByTime(5 * 1000));
    expect(result.current.minute).toBe(5);
  });

  it('al cambiar de timeline (sin desmontar) no pinta un frame con spoiler', () => {
    const first: LiveTimeline = {
      goals: [{ minute: 10, side: 'home', homeScore: 1, awayScore: 0 }],
      finalHomeScore: 1,
      finalAwayScore: 0,
    };
    const next: LiveTimeline = {
      goals: [{ minute: 80, side: 'away', homeScore: 0, awayScore: 1 }],
      finalHomeScore: 0,
      finalAwayScore: 1,
    };

    // Registra el estado en CADA commit pintado (efecto sin deps), no solo el
    // asentado: es el frame intermedio donde vivía el bug.
    const commits: { minute: number; revealed: number; home: number; away: number; tlIsNext: boolean }[] = [];
    function Harness({ tl }: { tl: LiveTimeline }) {
      const pb = useLiveMatchPlayback(tl, 1);
      useEffect(() => {
        commits.push({
          minute: pb.minute,
          revealed: pb.revealedGoals.length,
          home: pb.displayHomeScore,
          away: pb.displayAwayScore,
          tlIsNext: tl === next,
        });
      });
      return null;
    }

    const { rerender } = render(<Harness tl={first} />);
    act(() => vi.advanceTimersByTime(90 * 1000)); // el primer partido termina
    commits.length = 0; // solo nos interesan los commits del cambio de timeline
    rerender(<Harness tl={next} />);

    // Ningún commit con el timeline NUEVO puede llevar estado (minuto/goles/marcador) del viejo.
    const spoiler = commits.find(
      (c) => c.tlIsNext && (c.minute > 0 || c.revealed > 0 || c.home > 0 || c.away > 0),
    );
    expect(spoiler).toBeUndefined();
  });

  it('limpia timers al desmontar (no lanza tras unmount)', () => {
    const { unmount } = renderHook(() => useLiveMatchPlayback(timeline, 1));
    unmount();
    expect(() => vi.advanceTimersByTime(90 * 1000)).not.toThrow();
  });
});
