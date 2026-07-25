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
 *
 * El otro escenario típico de esta red —la proporción de alargues y penales
 * entre pares parejos— vive en `engine.extraTime.test.ts` ("entre un quinto
 * y un cuarto..."), que ya lo mide con el mismo contexto: no se duplica acá.
 */
describe('calibración del motor', () => {
  beforeEach(() => {
    useConfigStore.getState().resetToDefaults();
  });

  it('un equipo exhausto pierde ventaja pero no deja de ser favorito ante un rival muy inferior', () => {
    // Cota angosta a propósito: es la única red que existe para el oficio
    // (`clutchGain`). Medido con el motor real, 600.000 corridas por punto:
    // oficio 0 → 76,2%, oficio 0,15 (default) → 77,5%, oficio 0,35 → 79,2%.
    // Con 100.000 corridas el desvío estándar de esta proporción es ~0,13
    // puntos, así que [0,768; 0,782] deja al valor por defecto a ~5 desvíos
    // de cada borde (no debería tocarse por ruido) y a las dos regresiones
    // más cercanas —oficio en 0 o en 0,35— a 4,5 y 7,6 desvíos por fuera del
    // rango (se cazan de forma confiable). Lo que esta cota NO caza: mover el
    // oficio a un valor intermedio cercano, como 0,20 (77,8%, cae adentro).
    const runs = 100000;
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

    expect(victorias / runs).toBeGreaterThan(0.768);
    expect(victorias / runs).toBeLessThan(0.782);
  });
});
