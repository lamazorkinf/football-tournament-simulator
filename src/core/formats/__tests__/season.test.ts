import { describe, it, expect } from 'vitest';
import { applyPromotionLadder, applyPromotionRelegation } from '../season';

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

describe('applyPromotionLadder — escalera de N divisiones', () => {
  const A = div('A', 16);
  const B = div('B', 16);
  const C = div('C', 16);

  it('con dos divisiones da exactamente lo mismo que el par', () => {
    const ladder = applyPromotionLadder([A, B], 3);
    const pair = applyPromotionRelegation(A, B, 3);
    expect(ladder.divisions[0]).toEqual(pair.A);
    expect(ladder.divisions[1]).toEqual(pair.B);
    expect(ladder.moves[0]).toEqual({ promoted: pair.promoted, relegated: pair.relegated });
  });

  it('nadie se mueve dos veces: el que baja de la A no sigue bajando a la C', () => {
    const { divisions } = applyPromotionLadder([A, B, C], 3);
    // Los peores de la A caen en la B, no en la C.
    expect(divisions[1]).toContain('A16');
    expect(divisions[2]).not.toContain('A16');
    // Y los mejores de la C suben a la B, no a la A.
    expect(divisions[1]).toContain('C1');
    expect(divisions[0]).not.toContain('C1');
  });

  it('la división del medio cede y recibe por los dos lados', () => {
    const { divisions } = applyPromotionLadder([A, B, C], 3);
    const middle = divisions[1];
    expect(middle).toHaveLength(16);
    expect(middle.filter((id) => id.startsWith('A'))).toHaveLength(3); // bajaron
    expect(middle.filter((id) => id.startsWith('C'))).toHaveLength(3); // subieron
    expect(middle.filter((id) => id.startsWith('B'))).toHaveLength(10); // se quedaron
    // Los que se quedan van primero y conservan su orden.
    expect(middle.slice(0, 10)).toEqual(B.slice(3, 13));
  });

  it('conserva tamaños y no pierde ni duplica a nadie', () => {
    const { divisions } = applyPromotionLadder([A, B, C], 3);
    expect(divisions.map((d) => d.length)).toEqual([16, 16, 16]);
    const all = divisions.flat();
    expect(new Set(all).size).toBe(48);
    expect([...all].sort()).toEqual([...A, ...B, ...C].sort());
  });

  it('un movimiento por frontera, no uno por división', () => {
    expect(applyPromotionLadder([A, B, C], 2).moves).toHaveLength(2);
    expect(applyPromotionLadder([A, B, C, div('D', 16)], 2).moves).toHaveLength(3);
  });

  it('rechaza una escalera de una sola división, tamaños desparejos y count imposible', () => {
    expect(() => applyPromotionLadder([A], 3)).toThrow();
    expect(() => applyPromotionLadder([A, div('B', 15)], 3)).toThrow();
    expect(() => applyPromotionLadder([A, B, C], 9)).toThrow();
  });
});
