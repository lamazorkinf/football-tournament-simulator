import { describe, it, expect } from 'vitest';
import {
  drawCupFirstRound,
  resolveTie,
  tieAggregate,
  generateNextCupRound,
  isRoundResolved,
  roundKeyForTieCount,
  type TwoLeggedTie,
} from '../cup';

/** RNG determinista (LCG) para sorteos reproducibles en test. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const A = Array.from({ length: 16 }, (_, i) => `A${i + 1}`);
const B = Array.from({ length: 16 }, (_, i) => `B${i + 1}`);

/** Marca los dos partidos de un cruce con un resultado dado (sin penales). */
function playTie(tie: TwoLeggedTie, l1h: number, l1a: number, l2h: number, l2a: number): TwoLeggedTie {
  return {
    ...tie,
    leg1: { ...tie.leg1!, homeScore: l1h, awayScore: l1a, isPlayed: true },
    leg2: { ...tie.leg2!, homeScore: l2h, awayScore: l2a, isPlayed: true },
  };
}

describe('drawCupFirstRound — restricción A-vs-B', () => {
  it('arma 16 cruces, cada uno con un equipo de A y uno de B', () => {
    const ties = drawCupFirstRound(A, B, seededRng(42));
    expect(ties).toHaveLength(16);
    const setA = new Set(A);
    const setB = new Set(B);
    for (const t of ties) {
      const teams = [t.homeTeamId!, t.awayTeamId!];
      const fromA = teams.filter((x) => setA.has(x));
      const fromB = teams.filter((x) => setB.has(x));
      expect(fromA).toHaveLength(1);
      expect(fromB).toHaveLength(1);
    }
  });

  it('usa los 32 equipos exactamente una vez', () => {
    const ties = drawCupFirstRound(A, B, seededRng(7));
    const used = ties.flatMap((t) => [t.homeTeamId!, t.awayTeamId!]);
    expect(new Set(used).size).toBe(32);
    expect(used).toHaveLength(32);
  });

  it('la ronda inicial de 16 cruces es round-of-32', () => {
    const ties = drawCupFirstRound(A, B, seededRng(1));
    expect(ties.every((t) => t.round === 'round-of-32')).toBe(true);
    expect(roundKeyForTieCount(16)).toBe('round-of-32');
  });

  it('genera cruces distintos según la semilla', () => {
    const a = drawCupFirstRound(A, B, seededRng(1)).map((t) => `${t.homeTeamId}-${t.awayTeamId}`);
    const b = drawCupFirstRound(A, B, seededRng(999)).map((t) => `${t.homeTeamId}-${t.awayTeamId}`);
    expect(a).not.toEqual(b);
  });

  it('rechaza divisiones de distinto tamaño', () => {
    expect(() => drawCupFirstRound(A, B.slice(0, 15))).toThrow();
  });
});

describe('resolveTie — global sin gol de visitante', () => {
  const base: TwoLeggedTie = {
    id: 'cup-round-of-32-0',
    round: 'round-of-32',
    position: 0,
    homeTeamId: 'A1',
    awayTeamId: 'B1',
    leg1: { id: 'l1', homeTeamId: 'A1', awayTeamId: 'B1', homeScore: null, awayScore: null, isPlayed: false, stage: 'cup', matchday: 1 },
    leg2: { id: 'l2', homeTeamId: 'B1', awayTeamId: 'A1', homeScore: null, awayScore: null, isPlayed: false, stage: 'cup', matchday: 2 },
  };

  it('gana el de mayor global (local de la ida)', () => {
    // A1: ida 2-0 local, vuelta 0-1 visitante → global 3-0.
    const t = resolveTie(playTie(base, 2, 0, 1, 0));
    expect(tieAggregate(playTie(base, 2, 0, 1, 0))).toEqual({ home: 2, away: 1 });
    expect(t.winnerId).toBe('A1');
    expect(t.loserId).toBe('B1');
  });

  it('gana el visitante de la ida si tiene mejor global', () => {
    // A1 local: ida 0-1, vuelta (B1 local) 2-0 → global A1=0+0=0, B1=1+2=3.
    const t = resolveTie(playTie(base, 0, 1, 2, 0));
    expect(t.winnerId).toBe('B1');
  });

  it('NO hay ventaja de gol de visitante: 1-2 y 1-2 es empate global', () => {
    // A1 local ida 1-2; vuelta B1 local 1-2 → global A1 = 1+2 = 3, B1 = 2+1 = 3.
    const played = playTie(base, 1, 2, 1, 2);
    expect(tieAggregate(played)).toEqual({ home: 3, away: 3 });
    // Sin penales cargados, no se puede definir.
    expect(resolveTie(played).winnerId).toBeUndefined();
  });

  it('empate global: definen los penales', () => {
    const played = { ...playTie(base, 1, 1, 1, 1), penalties: { homeScore: 4, awayScore: 5 }, extraTime: true };
    const t = resolveTie(played);
    // Penales 4-5 desde homeTeamId (A1) → gana B1.
    expect(t.winnerId).toBe('B1');
    expect(t.loserId).toBe('A1');
  });

  it('no resuelve si falta jugar un partido', () => {
    const half = { ...base, leg1: { ...base.leg1!, homeScore: 1, awayScore: 0, isPlayed: true } };
    expect(resolveTie(half).winnerId).toBeUndefined();
    expect(tieAggregate(half)).toBeNull();
  });
});

describe('generateNextCupRound', () => {
  function resolvedRoundOf32(): TwoLeggedTie[] {
    // 16 cruces resueltos: gana siempre el homeTeamId.
    return Array.from({ length: 16 }, (_, i) => {
      const tie: TwoLeggedTie = {
        id: `cup-round-of-32-${i}`,
        round: 'round-of-32',
        position: i,
        homeTeamId: `W${i}`,
        awayTeamId: `L${i}`,
        leg1: null,
        leg2: null,
        winnerId: `W${i}`,
        loserId: `L${i}`,
      };
      return tie;
    });
  }

  it('empareja ganadores consecutivos y baja de ronda', () => {
    const next = generateNextCupRound(resolvedRoundOf32());
    expect(next).not.toBeNull();
    expect(next).toHaveLength(8);
    expect(next!.every((t) => t.round === 'round-of-16')).toBe(true);
    expect(next![0].homeTeamId).toBe('W0');
    expect(next![0].awayTeamId).toBe('W1');
    expect(next![7].homeTeamId).toBe('W14');
    expect(next![7].awayTeamId).toBe('W15');
  });

  it('no arma ronda si la actual no está resuelta', () => {
    const unresolved = resolvedRoundOf32();
    delete unresolved[3].winnerId;
    expect(isRoundResolved(unresolved)).toBe(false);
    expect(generateNextCupRound(unresolved)).toBeNull();
  });

  it('después de la final no hay ronda siguiente', () => {
    const final: TwoLeggedTie[] = [
      { id: 'cup-final-0', round: 'final', position: 0, homeTeamId: 'W0', awayTeamId: 'W1', leg1: null, leg2: null, winnerId: 'W0', loserId: 'W1' },
    ];
    expect(generateNextCupRound(final)).toBeNull();
  });
});
