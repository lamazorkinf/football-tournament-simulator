import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLiveMatchdayPlayback } from '../useLiveMatchdayPlayback';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useLiveMatchdayPlayback', () => {
  it('sin sesión el reloj no corre', () => {
    const { result } = renderHook(() => useLiveMatchdayPlayback(null, false, false));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.minute).toBe(0);
    expect(result.current.phase).toBe('playing');
  });

  it('avanza 1 minuto por segundo a 1x y termina a los 90 sin penales', () => {
    const { result } = renderHook(() => useLiveMatchdayPlayback('j1', false, false));
    act(() => vi.advanceTimersByTime(10 * 1000));
    expect(result.current.minute).toBe(10);
    act(() => vi.advanceTimersByTime(80 * 1000));
    expect(result.current.minute).toBe(90);
    expect(result.current.phase).toBe('finished');
    expect(result.current.penaltiesRevealed).toBe(true);
  });

  it('con penales pasa por la fase penalties antes de finished', () => {
    const { result } = renderHook(() => useLiveMatchdayPlayback('j1', true, false));
    act(() => vi.advanceTimersByTime(90 * 1000));
    expect(result.current.phase).toBe('penalties');
    expect(result.current.penaltiesRevealed).toBe(false);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.phase).toBe('finished');
    expect(result.current.penaltiesRevealed).toBe(true);
  });

  it('setSpeed acelera el reloj compartido (4x = 250ms/min)', () => {
    const { result } = renderHook(() => useLiveMatchdayPlayback('j1', false, false));
    act(() => result.current.setSpeed(4));
    act(() => vi.advanceTimersByTime(10 * 250));
    expect(result.current.minute).toBe(10);
  });

  it('skipToEnd salta a 90 con penales revelados', () => {
    const { result } = renderHook(() => useLiveMatchdayPlayback('j1', true, false));
    act(() => result.current.skipToEnd());
    expect(result.current.minute).toBe(90);
    expect(result.current.phase).toBe('finished');
    expect(result.current.penaltiesRevealed).toBe(true);
  });

  it('al cambiar de sesión el reloj se resetea', () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string | null }) => useLiveMatchdayPlayback(key, false, false),
      { initialProps: { key: 'j1' as string | null } },
    );
    act(() => vi.advanceTimersByTime(90 * 1000));
    expect(result.current.phase).toBe('finished');

    rerender({ key: 'j2' });
    expect(result.current.minute).toBe(0);
    expect(result.current.phase).toBe('playing');
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.minute).toBe(5);
  });

  it('en pausa el reloj no avanza, y al reanudar sigue donde estaba', () => {
    const { result } = renderHook(() => useLiveMatchdayPlayback('j1', false, false));
    act(() => vi.advanceTimersByTime(20 * 1000));
    expect(result.current.minute).toBe(20);

    act(() => result.current.togglePause());
    expect(result.current.isPaused).toBe(true);
    act(() => vi.advanceTimersByTime(30 * 1000));
    expect(result.current.minute).toBe(20);

    act(() => result.current.togglePause());
    expect(result.current.isPaused).toBe(false);
    act(() => vi.advanceTimersByTime(5 * 1000));
    expect(result.current.minute).toBe(25);
  });

  it('la pausa también frena el suspenso de los penales', () => {
    const { result } = renderHook(() => useLiveMatchdayPlayback('j1', true, false));
    act(() => vi.advanceTimersByTime(90 * 1000));
    expect(result.current.phase).toBe('penalties');

    act(() => result.current.togglePause());
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.phase).toBe('penalties');
    expect(result.current.penaltiesRevealed).toBe(false);

    act(() => result.current.togglePause());
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.phase).toBe('finished');
  });

  it('saltar al final desde la pausa termina la jornada', () => {
    const { result } = renderHook(() => useLiveMatchdayPlayback('j1', true, false));
    act(() => result.current.togglePause());
    act(() => result.current.skipToEnd());

    expect(result.current.phase).toBe('finished');
    expect(result.current.minute).toBe(90);
    expect(result.current.isPaused).toBe(false);
  });

  it('una sesión nueva arranca sin pausa', () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string | null }) => useLiveMatchdayPlayback(key, false, false),
      { initialProps: { key: 'j1' as string | null } },
    );
    act(() => result.current.togglePause());
    expect(result.current.isPaused).toBe(true);

    rerender({ key: 'j2' });
    expect(result.current.isPaused).toBe(false);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.minute).toBe(5);
  });

  it('limpia timers al desmontar', () => {
    const { unmount } = renderHook(() => useLiveMatchdayPlayback('j1', true, false));
    unmount();
    expect(() => vi.advanceTimersByTime(120 * 1000)).not.toThrow();
  });

  describe('con alargue en algún partido de la grilla', () => {
    it('el reloj compartido sigue del 90 al 120 antes de terminar sin penales', () => {
      const { result } = renderHook(() => useLiveMatchdayPlayback('j1', false, true));
      act(() => vi.advanceTimersByTime(90 * 1000));
      // A los 90' la grilla sigue en juego: hay al menos un partido en alargue.
      expect(result.current.minute).toBe(90);
      expect(result.current.phase).toBe('playing');

      act(() => vi.advanceTimersByTime(30 * 1000));
      expect(result.current.minute).toBe(120);
      expect(result.current.phase).toBe('finished');
      expect(result.current.penaltiesRevealed).toBe(true);
    });

    it('con alargue y penales, la fase penalties arranca recién en el 120', () => {
      const { result } = renderHook(() => useLiveMatchdayPlayback('j1', true, true));
      act(() => vi.advanceTimersByTime(90 * 1000));
      expect(result.current.phase).toBe('playing');

      act(() => vi.advanceTimersByTime(30 * 1000)); // minuto 120
      expect(result.current.phase).toBe('penalties');
      expect(result.current.penaltiesRevealed).toBe(false);

      act(() => vi.advanceTimersByTime(2000));
      expect(result.current.phase).toBe('finished');
      expect(result.current.penaltiesRevealed).toBe(true);
    });

    it('skipToEnd con alargue salta al 120', () => {
      const { result } = renderHook(() => useLiveMatchdayPlayback('j1', false, true));
      act(() => result.current.skipToEnd());
      expect(result.current.minute).toBe(120);
      expect(result.current.phase).toBe('finished');
    });

    it('sin alargue en ningún partido, el reloj sigue terminando a los 90', () => {
      const { result } = renderHook(() => useLiveMatchdayPlayback('j1', false, false));
      act(() => vi.advanceTimersByTime(90 * 1000));
      expect(result.current.minute).toBe(90);
      expect(result.current.phase).toBe('finished');
    });
  });
});
