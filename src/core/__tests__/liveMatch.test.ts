import { describe, it, expect } from 'vitest';
import { buildMatchTimeline, hashSeed, scoreAtMinute } from '../liveMatch';

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
    const tl = buildMatchTimeline({ homeScore: 0, awayScore: 0, seed: 123 });
    expect(tl.goals).toEqual([]);
    expect(tl.finalHomeScore).toBe(0);
    expect(tl.finalAwayScore).toBe(0);
  });

  it('el total y el conteo por lado coinciden con el marcador', () => {
    const tl = buildMatchTimeline({ homeScore: 3, awayScore: 2, seed: hashSeed('m') });
    expect(tl.goals).toHaveLength(5);
    expect(tl.goals.filter((g) => g.side === 'home')).toHaveLength(3);
    expect(tl.goals.filter((g) => g.side === 'away')).toHaveLength(2);
    expect(tl.finalHomeScore).toBe(3);
    expect(tl.finalAwayScore).toBe(2);
  });

  it('todos los minutos están en [1, 90] y ordenados ascendente', () => {
    const tl = buildMatchTimeline({ homeScore: 4, awayScore: 4, seed: hashSeed('x') });
    for (const g of tl.goals) {
      expect(g.minute).toBeGreaterThanOrEqual(1);
      expect(g.minute).toBeLessThanOrEqual(90);
    }
    const minutes = tl.goals.map((g) => g.minute);
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b));
  });

  it('el marcador acumulado del último evento coincide con el final', () => {
    const tl = buildMatchTimeline({ homeScore: 2, awayScore: 3, seed: hashSeed('y') });
    const last = tl.goals[tl.goals.length - 1];
    expect(last.homeScore).toBe(2);
    expect(last.awayScore).toBe(3);
  });

  it('es determinista para la misma (marcador, seed)', () => {
    const a = buildMatchTimeline({ homeScore: 3, awayScore: 1, seed: 999 });
    const b = buildMatchTimeline({ homeScore: 3, awayScore: 1, seed: 999 });
    expect(a).toEqual(b);
  });

  it('pasa las penales sin tocarlas', () => {
    const tl = buildMatchTimeline({
      homeScore: 1,
      awayScore: 1,
      seed: 5,
      penalties: { homeScore: 4, awayScore: 3 },
    });
    expect(tl.penalties).toEqual({ homeScore: 4, awayScore: 3 });
  });

  it('con rng inyectado ubica los goles en minutos calculables', () => {
    // rng=0 → minute = 1 + floor(0*90) = 1 para todos
    const tl = buildMatchTimeline({ homeScore: 1, awayScore: 1, seed: 0, rng: seqRng([0, 0]) });
    expect(tl.goals.map((g) => g.minute)).toEqual([1, 1]);
    // tie-break estable: el gol local (encolado primero) va antes que el visitante
    expect(tl.goals[0].side).toBe('home');
    expect(tl.goals[1].side).toBe('away');
  });

  it('sin alargue, hasExtraTime queda en false', () => {
    const tl = buildMatchTimeline({ homeScore: 2, awayScore: 1, seed: hashSeed('sin-et') });
    expect(tl.hasExtraTime).toBe(false);
  });
});

describe('timeline con alargue', () => {
  it('los goles del alargue caen entre el 91 y el 120', () => {
    const timeline = buildMatchTimeline({
      homeScore: 2,
      awayScore: 1,
      seed: hashSeed('m1'),
      extraTime: { homeGoals: 1, awayGoals: 0 },
    });

    expect(timeline.hasExtraTime).toBe(true);
    const tardios = timeline.goals.filter((g) => g.minute > 90);
    expect(tardios).toHaveLength(1);
    expect(tardios[0].minute).toBeLessThanOrEqual(120);
    expect(tardios[0].side).toBe('home');
  });

  it('los goles de los 90 minutos siguen cayendo antes del 91', () => {
    const timeline = buildMatchTimeline({
      homeScore: 3,
      awayScore: 2,
      seed: hashSeed('m2'),
      extraTime: { homeGoals: 1, awayGoals: 1 },
    });
    const regulares = timeline.goals.filter((g) => g.minute <= 90);
    expect(regulares).toHaveLength(3); // 5 goles totales − 2 del alargue
  });

  it('sin alargue el partido termina a los 90', () => {
    const timeline = buildMatchTimeline({ homeScore: 1, awayScore: 0, seed: hashSeed('m3') });
    expect(timeline.hasExtraTime).toBe(false);
    expect(timeline.goals.every((g) => g.minute <= 90)).toBe(true);
  });

  it('el marcador acumulado sigue siendo coherente cruzando el minuto 90', () => {
    const timeline = buildMatchTimeline({
      homeScore: 2,
      awayScore: 2,
      seed: hashSeed('m4'),
      extraTime: { homeGoals: 1, awayGoals: 1 },
    });
    const ultimo = timeline.goals[timeline.goals.length - 1];
    expect(ultimo.homeScore).toBe(2);
    expect(ultimo.awayScore).toBe(2);
  });
});

describe('scoreAtMinute', () => {
  const tl = {
    goals: [
      { minute: 10, side: 'home' as const, homeScore: 1, awayScore: 0 },
      { minute: 40, side: 'away' as const, homeScore: 1, awayScore: 1 },
      { minute: 88, side: 'home' as const, homeScore: 2, awayScore: 1 },
    ],
    finalHomeScore: 2,
    finalAwayScore: 1,
    hasExtraTime: false,
  };

  it('antes del primer gol devuelve 0-0 sin último minuto', () => {
    expect(scoreAtMinute(tl, 0)).toMatchObject({ homeScore: 0, awayScore: 0, lastGoalMinute: null });
    expect(scoreAtMinute(tl, 9)).toMatchObject({ homeScore: 0, awayScore: 0, lastGoalMinute: null });
  });

  it('en un minuto intermedio acumula solo los goles revelados', () => {
    expect(scoreAtMinute(tl, 10)).toMatchObject({ homeScore: 1, awayScore: 0, lastGoalMinute: 10 });
    expect(scoreAtMinute(tl, 87)).toMatchObject({ homeScore: 1, awayScore: 1, lastGoalMinute: 40 });
  });

  it('a los 90 coincide con el marcador final del timeline', () => {
    expect(scoreAtMinute(tl, 90)).toMatchObject({ homeScore: 2, awayScore: 1, lastGoalMinute: 88 });
  });

  it('separa los minutos de los goles revelados por equipo', () => {
    expect(scoreAtMinute(tl, 90).homeGoalMinutes).toEqual([10, 88]);
    expect(scoreAtMinute(tl, 90).awayGoalMinutes).toEqual([40]);
    expect(scoreAtMinute(tl, 45).homeGoalMinutes).toEqual([10]);
    expect(scoreAtMinute(tl, 45).awayGoalMinutes).toEqual([40]);
  });

  it('informa de qué lado fue el último gol revelado', () => {
    expect(scoreAtMinute(tl, 5).lastGoalSide).toBeNull();
    expect(scoreAtMinute(tl, 45).lastGoalSide).toBe('away');
    expect(scoreAtMinute(tl, 90).lastGoalSide).toBe('home');
  });

  it('es consistente con cualquier timeline generado', () => {
    const generated = buildMatchTimeline({ homeScore: 3, awayScore: 2, seed: hashSeed('consistencia') });
    const at90 = scoreAtMinute(generated, 90);
    expect(at90.homeScore).toBe(generated.finalHomeScore);
    expect(at90.awayScore).toBe(generated.finalAwayScore);
  });
});
