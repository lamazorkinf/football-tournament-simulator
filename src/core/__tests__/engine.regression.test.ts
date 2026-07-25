import { describe, it, expect, beforeEach, vi } from 'vitest';
import { simulateMatchWithPenalties } from '../engine';
import { useConfigStore } from '../../store/useConfigStore';

// Sin este mock, resetToDefaults() deja armada una escritura real a Supabase
// (mismo proyecto que producción): el hallazgo Critical de la revisión de
// esta misma tarea. Ver src/store/__tests__/useConfigStore.test.ts.
vi.mock('../../lib/persistSettings', () => ({
  queueSettingsSave: vi.fn(),
  flushSettingsSave: vi.fn(),
}));

/**
 * Red de seguridad de la calibración. Si alguien mueve una constante del motor
 * sin querer, esto lo caza antes de que se note jugando 40 torneos.
 * Los rangos salen del banco de pruebas del spec y son anchos a propósito.
 */
describe('calibración del motor', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('los partidos de eliminación directa entre pares van al alargue y a penales en la proporción esperada', () => {
    const runs = 30000;
    let alargues = 0;
    let penales = 0;

    for (let i = 0; i < runs; i++) {
      const r = simulateMatchWithPenalties({
        home: { skill: 85, energy: 100 },
        away: { skill: 85, energy: 100 },
        importance: 1.6,
        neutral: true,
      });
      if (r.extraTime) alargues++;
      if (r.penalties) penales++;
    }

    expect(alargues / runs).toBeGreaterThan(0.18);
    expect(alargues / runs).toBeLessThan(0.28);
    expect(penales / runs).toBeGreaterThan(0.08);
    expect(penales / runs).toBeLessThan(0.16);
  });

  it('un equipo exhausto pierde ventaja pero no deja de ser favorito ante un rival muy inferior', () => {
    const runs = 20000;
    let victorias = 0;

    for (let i = 0; i < runs; i++) {
      const r = simulateMatchWithPenalties({
        home: { skill: 94.8, energy: 60 },
        away: { skill: 60, energy: 100 },
        importance: 1.6,
        neutral: true,
      });
      const gana = r.homeScore > r.awayScore || (!!r.penalties && r.penalties.homeScore > r.penalties.awayScore);
      if (gana) victorias++;
    }

    // Medido en 79,2%: el cansancio le cuesta, pero el oficio no se lo compensa
    // (con la fórmula aditiva descartada, este caso daba MÁS que sin fatiga).
    expect(victorias / runs).toBeGreaterThan(0.72);
    expect(victorias / runs).toBeLessThan(0.86);
  });
});
