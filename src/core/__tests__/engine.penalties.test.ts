import { describe, it, expect } from 'vitest';
import { simulatePenalties } from '../engine';

// RNG determinístico: consume la secuencia en orden (cíclica).
const mkRng = (seq: number[]) => {
  let i = 0;
  return () => seq[i++ % seq.length];
};

describe('simulatePenalties — muerte matemática', () => {
  it('corta la tanda: local mete siempre, visitante falla siempre → 3-0 (no 5-0)', () => {
    // Llamadas alternadas: local(par), visitante(impar).
    // 0 => convierte (rng < rate); 0.999 => falla.
    const rng = mkRng([0, 0.999]);
    const res = simulatePenalties(90, 10, rng);
    expect(res).toEqual({ homeScore: 3, awayScore: 0 });
  });

  it('nunca produce marcadores imposibles (5-0/5-1/5-2) en 10.000 tandas', () => {
    for (let n = 0; n < 10_000; n++) {
      const { homeScore, awayScore } = simulatePenalties(80, 70);
      const max = Math.max(homeScore, awayScore);
      const min = Math.min(homeScore, awayScore);
      // Siempre hay ganador (no empate final).
      expect(homeScore).not.toBe(awayScore);
      // El caso reportado por el usuario: un lado en 5 y el otro <= 2 es imposible.
      expect(max === 5 && min <= 2).toBe(false);
      // En muerte súbita (max > 5) la diferencia es exactamente 1.
      if (max > 5) expect(max - min).toBe(1);
    }
  });

  it('empate en fase regular → muerte súbita que resuelve por diferencia de 1', () => {
    // 10 llamadas convirtiendo (5-5), luego local mete y visitante falla.
    const rng = mkRng([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.999]);
    const res = simulatePenalties(50, 50, rng);
    expect(res).toEqual({ homeScore: 6, awayScore: 5 });
  });
});
