import { describe, it, expect } from 'vitest';
import {
  ROUND_ORDER,
  isRoundKey,
  nextRoundKey,
  roundKeyForTieCount,
  roundLabel,
  roundLongLabel,
  roundOrderFor,
  stageLabel,
  type RoundKey,
} from '../rounds';

describe('roundKeyForTieCount', () => {
  it('mapea cantidad de cruces a la ronda correspondiente', () => {
    expect(roundKeyForTieCount(64)).toBe('round-of-128');
    expect(roundKeyForTieCount(32)).toBe('round-of-64');
    expect(roundKeyForTieCount(16)).toBe('round-of-32');
    expect(roundKeyForTieCount(8)).toBe('round-of-16');
    expect(roundKeyForTieCount(4)).toBe('quarter');
    expect(roundKeyForTieCount(2)).toBe('semi');
    expect(roundKeyForTieCount(1)).toBe('final');
  });

  it('rechaza cantidades que no son potencia de 2', () => {
    expect(() => roundKeyForTieCount(6)).toThrow();
    expect(() => roundKeyForTieCount(0)).toThrow();
    expect(() => roundKeyForTieCount(-2)).toThrow();
  });

  it('rechaza cuadros más grandes que el rango soportado', () => {
    expect(() => roundKeyForTieCount(128)).toThrow();
  });
});

describe('roundOrderFor', () => {
  it('devuelve las rondas de un cuadro en orden, sin el 3er puesto', () => {
    expect(roundOrderFor(8)).toEqual(['quarter', 'semi', 'final']);
    expect(roundOrderFor(2)).toEqual(['final']);
    expect(roundOrderFor(32)).toEqual(['round-of-32', 'round-of-16', 'quarter', 'semi', 'final']);
    expect(roundOrderFor(64)).not.toContain('third-place');
  });

  it('la cantidad de rondas es log2(size)', () => {
    for (const size of [2, 4, 8, 16, 32, 64, 128]) {
      expect(roundOrderFor(size)).toHaveLength(Math.log2(size));
    }
  });

  it('rechaza tamaños inválidos', () => {
    expect(() => roundOrderFor(1)).toThrow();
    expect(() => roundOrderFor(12)).toThrow();
  });
});

describe('nextRoundKey', () => {
  it('avanza por el orden del cuadro y corta en la final', () => {
    expect(nextRoundKey('round-of-32')).toBe('round-of-16');
    expect(nextRoundKey('quarter')).toBe('semi');
    expect(nextRoundKey('semi')).toBe('final');
    expect(nextRoundKey('final')).toBeNull();
  });

  it('el 3er puesto no tiene ronda siguiente (cuelga de las semis)', () => {
    expect(nextRoundKey('third-place')).toBeNull();
  });

  it('encadena el orden completo sin huecos', () => {
    const walked: RoundKey[] = ['round-of-128'];
    let cur = nextRoundKey('round-of-128');
    while (cur) {
      walked.push(cur);
      cur = nextRoundKey(cur);
    }
    expect(walked).toEqual([...ROUND_ORDER]);
  });
});

describe('isRoundKey', () => {
  it('reconoce las rondas conocidas y rechaza el resto', () => {
    expect(isRoundKey('quarter')).toBe(true);
    expect(isRoundKey('third-place')).toBe(true);
    expect(isRoundKey('cuartos')).toBe(false);
    expect(isRoundKey('')).toBe(false);
  });
});

describe('rótulos', () => {
  it('respeta la convención round-of-N = N equipos', () => {
    // round-of-16 son 16 equipos = 8 cruces = octavos.
    expect(roundLabel('round-of-16')).toBe('Octavos');
    expect(roundLongLabel('round-of-16')).toBe('Octavos de Final');
    // round-of-32 son 32 equipos = 16 cruces = dieciseisavos.
    expect(roundLabel('round-of-32')).toBe('16avos');
    expect(roundLongLabel('round-of-32')).toBe('Dieciseisavos de Final');
  });

  it('cubre todas las rondas en ambas formas', () => {
    const all: RoundKey[] = [...ROUND_ORDER, 'third-place'];
    for (const r of all) {
      expect(roundLabel(r)).toBeTruthy();
      expect(roundLongLabel(r)).toBeTruthy();
    }
  });
});

describe('stageLabel', () => {
  it('cubre las 8 etapas permitidas por la migración 018', () => {
    expect(stageLabel('qualifier')).toBe('Clasificatorias');
    expect(stageLabel('world-cup-group')).toBe('Mundial · Grupos');
    expect(stageLabel('world-cup-knockout')).toBe('Mundial · Playoffs');
    expect(stageLabel('continental')).toBe('Continental');
    expect(stageLabel('confed-group')).toBe('Confederaciones · Grupos');
    expect(stageLabel('confed-knockout')).toBe('Confederaciones · Playoffs');
    // Éste era el bug: 'league' y 'cup' se mostraban crudos.
    expect(stageLabel('league')).toBe('Liga');
    expect(stageLabel('cup')).toBe('Copa');
  });

  it('devuelve crudo un stage desconocido', () => {
    expect(stageLabel('lo-que-sea')).toBe('lo-que-sea');
  });
});
