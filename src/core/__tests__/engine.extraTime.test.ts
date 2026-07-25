import { describe, it, expect, beforeEach } from 'vitest';
import { simulateMatch, simulateMatchWithPenalties } from '../engine';
import { useConfigStore } from '../../store/useConfigStore';

const ctx = {
  home: { skill: 85, energy: 100 },
  away: { skill: 85, energy: 100 },
  importance: 1.6,
  neutral: true,
} as const;

describe('prórroga', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('un partido que no termina empatado no juega alargue ni penales', () => {
    // Se busca un partido decidido en los 90' (sin extraTime), no cualquier
    // partido con marcador final desparejo: un empate a los 90' resuelto en
    // el alargue también termina desparejo pero SÍ tiene `extraTime`, así
    // que filtrar por `homeScore !== awayScore` sería intermitente (~1 de
    // cada 8 corridas, con esta config de skills 85 vs 85 ~24% empata a los
    // 90' y de esos ~48% se resuelve en el alargue).
    let intentos = 0;
    let decidido = null as ReturnType<typeof simulateMatchWithPenalties> | null;
    while (intentos++ < 200 && !decidido) {
      const r = simulateMatchWithPenalties(ctx);
      if (!r.extraTime) decidido = r;
    }
    expect(decidido).not.toBeNull();
    expect(decidido!.extraTime).toBeUndefined();
    expect(decidido!.penalties).toBeUndefined();
  });

  it('el marcador final incluye los goles del alargue', () => {
    let conAlargue = null as ReturnType<typeof simulateMatchWithPenalties> | null;
    for (let i = 0; i < 5000 && !conAlargue; i++) {
      const r = simulateMatchWithPenalties(ctx);
      if (r.extraTime && (r.extraTime.homeGoals > 0 || r.extraTime.awayGoals > 0)) conAlargue = r;
    }
    expect(conAlargue).not.toBeNull();
    // Si alguien marcó en el alargue, el partido ya no puede quedar empatado
    // salvo que hayan marcado los dos: en cualquier caso el marcador los suma.
    expect(conAlargue!.homeScore).toBeGreaterThanOrEqual(conAlargue!.extraTime!.homeGoals);
    expect(conAlargue!.awayScore).toBeGreaterThanOrEqual(conAlargue!.extraTime!.awayGoals);
  });

  it('sólo hay penales si el alargue también termina empatado', () => {
    for (let i = 0; i < 3000; i++) {
      const r = simulateMatchWithPenalties(ctx);
      if (r.penalties) {
        expect(r.homeScore).toBe(r.awayScore);
        expect(r.extraTime).toBeDefined();
      }
    }
  });

  it('entre un quinto y un cuarto de los partidos parejos va al alargue', () => {
    const runs = 20000;
    let alargues = 0;
    let penales = 0;
    for (let i = 0; i < runs; i++) {
      const r = simulateMatchWithPenalties(ctx);
      if (r.extraTime) alargues++;
      if (r.penalties) penales++;
    }
    // Cifras de Mundial real, medidas en el banco de pruebas del spec.
    expect(alargues / runs).toBeGreaterThan(0.18);
    expect(alargues / runs).toBeLessThan(0.28);
    expect(penales / runs).toBeGreaterThan(0.08);
    expect(penales / runs).toBeLessThan(0.16);
  });

  it('un partido de fase de grupos nunca juega alargue ni penales', () => {
    for (let i = 0; i < 2000; i++) {
      const r = simulateMatch(ctx);
      expect(r.extraTime).toBeUndefined();
    }
  });
});
