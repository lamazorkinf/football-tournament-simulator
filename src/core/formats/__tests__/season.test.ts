import { describe, it, expect } from 'vitest';
import { applyPromotionRelegation } from '../season';

function div(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
}

describe('applyPromotionRelegation — 3 suben / 3 bajan', () => {
  it('los 3 mejores de B suben y los 3 peores de A bajan', () => {
    const A = div('A', 16); // A1 (campeón) .. A16 (último)
    const B = div('B', 16);
    const r = applyPromotionRelegation(A, B, 3);

    expect(r.promoted).toEqual(['B1', 'B2', 'B3']);
    expect(r.relegated).toEqual(['A14', 'A15', 'A16']);
  });

  it('mantiene el tamaño de cada división', () => {
    const r = applyPromotionRelegation(div('A', 16), div('B', 16), 3);
    expect(r.A).toHaveLength(16);
    expect(r.B).toHaveLength(16);
  });

  it('la A siguiente = los que se quedan + los ascendidos; sin descendidos', () => {
    const r = applyPromotionRelegation(div('A', 16), div('B', 16), 3);
    expect(r.A).toContain('B1');
    expect(r.A).not.toContain('A16');
    expect(r.A).not.toContain('A14');
    // Los 13 que se quedan conservan su orden y van primero.
    expect(r.A.slice(0, 13)).toEqual(div('A', 13));
  });

  it('la B siguiente = los que se quedan + los descendidos; sin ascendidos', () => {
    const r = applyPromotionRelegation(div('A', 16), div('B', 16), 3);
    expect(r.B).toContain('A16');
    expect(r.B).not.toContain('B1');
    expect(r.B).not.toContain('B3');
  });

  it('no se pierde ni duplica ningún equipo entre las dos divisiones', () => {
    const A = div('A', 16);
    const B = div('B', 16);
    const r = applyPromotionRelegation(A, B, 3);
    const all = [...r.A, ...r.B].sort();
    expect(all).toEqual([...A, ...B].sort());
    expect(new Set(all).size).toBe(32);
  });

  it('soporta otro count (ej: 2 suben / 2 bajan)', () => {
    const r = applyPromotionRelegation(div('A', 10), div('B', 10), 2);
    expect(r.promoted).toEqual(['B1', 'B2']);
    expect(r.relegated).toEqual(['A9', 'A10']);
  });

  it('rechaza divisiones de distinto tamaño', () => {
    expect(() => applyPromotionRelegation(div('A', 16), div('B', 15), 3)).toThrow();
  });

  it('rechaza count que no cabe', () => {
    expect(() => applyPromotionRelegation(div('A', 4), div('B', 4), 3)).toThrow();
    expect(() => applyPromotionRelegation(div('A', 16), div('B', 16), 0)).toThrow();
  });
});
