import { describe, it, expect, beforeEach, vi } from 'vitest';
import { simulateMatch } from '../engine';
import { useConfigStore } from '../../store/useConfigStore';

// Sin este mock, resetToDefaults() deja armada una escritura real a Supabase
// (mismo proyecto que producción): ver src/store/__tests__/useConfigStore.test.ts.
vi.mock('../../lib/persistSettings', () => ({
  queueSettingsSave: vi.fn(),
  flushSettingsSave: vi.fn(),
}));

/**
 * PRNG mulberry32 sembrado: puro y determinista (mismo algoritmo que el
 * privado de `src/core/liveMatch.ts`, replicado acá porque no se exporta).
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Simula muchas veces y devuelve el promedio de goles de cada lado. */
function averageScores(ctx: Parameters<typeof simulateMatch>[0], runs = 20000) {
  let home = 0;
  let away = 0;
  for (let i = 0; i < runs; i++) {
    const r = simulateMatch(ctx);
    home += r.homeScore;
    away += r.awayScore;
  }
  return { home: home / runs, away: away / runs };
}

describe('simulateMatch con energía', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('un equipo cansado marca menos que el mismo equipo entero', () => {
    const fresco = averageScores({
      home: { skill: 90, energy: 100 },
      away: { skill: 90, energy: 100 },
      importance: 1.6,
      neutral: true,
    });
    const cansado = averageScores({
      home: { skill: 90, energy: 60 },
      away: { skill: 90, energy: 100 },
      importance: 1.6,
      neutral: true,
    });
    expect(cansado.home).toBeLessThan(fresco.home);
    expect(cansado.away).toBeGreaterThan(fresco.away);
  });

  it('dos equipos igual de cansados juegan un partido parejo', () => {
    const { home, away } = averageScores({
      home: { skill: 90, energy: 65 },
      away: { skill: 90, energy: 65 },
      importance: 1.6,
      neutral: true,
    });
    expect(Math.abs(home - away)).toBeLessThan(0.08);
  });

  it('el oficio agranda la ventaja del favorito en un partido exigente', () => {
    // Números aleatorios comunes: la misma semilla en las dos ramas hace que
    // ambas corridas vean la misma secuencia de aleatorios, así el ruido de
    // 20.000 partidos se cancela y sólo queda la señal del oficio. Sin esto,
    // comparar dos corridas independientes de Math.random dejaba un efecto
    // real de ~0,04 contra un desvío de ruido de ~0,0173 (z ≈ 2,3): intermitente.
    const ctx = {
      home: { skill: 96, energy: 100 },
      away: { skill: 88, energy: 100 },
      importance: 1.6,
      neutral: true,
    } as const;

    const conOficio = averageScores({ ...ctx, rng: mulberry32(42) });
    useConfigStore.getState().updateFatigue({ clutchGain: 0 });
    const sinOficio = averageScores({ ...ctx, rng: mulberry32(42) });

    expect(conOficio.home - conOficio.away).toBeGreaterThan(sinOficio.home - sinOficio.away);
  });

  it('la ventaja de local sólo se aplica si el partido no es neutral', () => {
    const local = averageScores({
      home: { skill: 80, energy: 100 },
      away: { skill: 80, energy: 100 },
      importance: 0.75,
      neutral: false,
    });
    expect(local.home).toBeGreaterThan(local.away);
  });

  it('el Elo usa el skill real, no el efectivo: ganar cansado premia igual', () => {
    // Knuth corta cuando el producto cae bajo exp(-λ) ≈ 0,22: un rng de 0,01 ya
    // corta en la primera vuelta, así que los dos lados terminan en 0 goles.
    const rng = () => 0.01;
    const cansado = simulateMatch({
      home: { skill: 90, energy: 60 },
      away: { skill: 70, energy: 100 },
      importance: 1.6,
      neutral: true,
      rng,
    });
    const entero = simulateMatch({
      home: { skill: 90, energy: 100 },
      away: { skill: 70, energy: 100 },
      importance: 1.6,
      neutral: true,
      rng,
    });
    expect(cansado.homeSkillChange).toBeCloseTo(entero.homeSkillChange, 5);
  });
});
