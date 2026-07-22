import { describe, it, expect } from 'vitest';
import { buildMatchTimeline, hashSeed } from '../liveMatch';

// rng determinista que devuelve valores de una secuencia (cicla si se agota)
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('hashSeed', () => {
  it('es determinista para el mismo string', () => {
    expect(hashSeed('match-1')).toBe(hashSeed('match-1'));
  });
  it('difiere para strings distintos', () => {
    expect(hashSeed('match-1')).not.toBe(hashSeed('match-2'));
  });
});

describe('buildMatchTimeline', () => {
  it('0-0 produce timeline vacío', () => {
    const tl = buildMatchTimeline(0, 0, 123);
    expect(tl.goals).toEqual([]);
    expect(tl.finalHomeScore).toBe(0);
    expect(tl.finalAwayScore).toBe(0);
  });

  it('el total y el conteo por lado coinciden con el marcador', () => {
    const tl = buildMatchTimeline(3, 2, hashSeed('m'));
    expect(tl.goals).toHaveLength(5);
    expect(tl.goals.filter((g) => g.side === 'home')).toHaveLength(3);
    expect(tl.goals.filter((g) => g.side === 'away')).toHaveLength(2);
    expect(tl.finalHomeScore).toBe(3);
    expect(tl.finalAwayScore).toBe(2);
  });

  it('todos los minutos están en [1, 90] y ordenados ascendente', () => {
    const tl = buildMatchTimeline(4, 4, hashSeed('x'));
    for (const g of tl.goals) {
      expect(g.minute).toBeGreaterThanOrEqual(1);
      expect(g.minute).toBeLessThanOrEqual(90);
    }
    const minutes = tl.goals.map((g) => g.minute);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
  });

  it('el marcador acumulado del último evento coincide con el final', () => {
    const tl = buildMatchTimeline(2, 3, hashSeed('y'));
    const last = tl.goals[tl.goals.length - 1];
    expect(last.homeScore).toBe(2);
    expect(last.awayScore).toBe(3);
  });

  it('es determinista para la misma (marcador, seed)', () => {
    const a = buildMatchTimeline(3, 1, 999);
    const b = buildMatchTimeline(3, 1, 999);
    expect(a).toEqual(b);
  });

  it('pasa las penales sin tocarlas', () => {
    const tl = buildMatchTimeline(1, 1, 5, { homeScore: 4, awayScore: 3 });
    expect(tl.penalties).toEqual({ homeScore: 4, awayScore: 3 });
  });

  it('con rng inyectado ubica los goles en minutos calculables', () => {
    // rng=0 → minute = 1 + floor(0*90) = 1 para todos
    const tl = buildMatchTimeline(1, 1, 0, undefined, seqRng([0, 0]));
    expect(tl.goals.map((g) => g.minute)).toEqual([1, 1]);
    // tie-break estable: el gol local (encolado primero) va antes que el visitante
    expect(tl.goals[0].side).toBe('home');
    expect(tl.goals[1].side).toBe('away');
  });
});
