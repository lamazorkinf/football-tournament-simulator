import { describe, it, expect, beforeEach } from 'vitest';
import { simulateMatch } from '../engine';
import { useConfigStore } from '../../store/useConfigStore';

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
    const ctx = {
      home: { skill: 96, energy: 100 },
      away: { skill: 88, energy: 100 },
      importance: 1.6,
      neutral: true,
    } as const;

    const conOficio = averageScores(ctx);
    useConfigStore.getState().updateFatigue({ clutchGain: 0 });
    const sinOficio = averageScores(ctx);

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
