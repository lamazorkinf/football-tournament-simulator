import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  advanceBracket,
  createBracket,
  currentBracketJornada,
  isLegPlayable,
  isBracketComplete,
  isRoundResolved,
  nextPowerOfTwo,
  planWithSources,
  recordBracketMatch,
  resolveTie,
  seedSlots,
  standardPlan,
  tieAggregate,
  type Bracket,
  type Tie,
} from '../bracket';

afterEach(() => {
  vi.restoreAllMocks();
});

/** PRNG determinista (mulberry32), el mismo del test dorado. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Resuelve una ronda entera con victoria del local, para medir estructura. */
function playRoundHomeWins(bracket: Bracket): Bracket {
  const round = bracket.rounds[bracket.rounds.length - 1];
  let next = bracket;
  for (const tie of round.ties) {
    for (const m of tie.matches) {
      next = recordBracketMatch(next, m.id, { homeScore: 1, awayScore: 0 });
    }
  }
  return next;
}

function shapes(bracket: Bracket, roundIndex: number) {
  return bracket.rounds[roundIndex].ties.map((t) => ({
    round: t.round,
    position: t.position,
    home: t.homeTeamId,
    away: t.awayTeamId,
    matchday: t.matches[0]?.matchday ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Planes
// ---------------------------------------------------------------------------

describe('standardPlan', () => {
  it('arma las rondas de un cuadro completo, de la primera a la final', () => {
    const plan = standardPlan(32);
    expect(plan.rounds.map((r) => r.round)).toEqual([
      'round-of-32', 'round-of-16', 'quarter', 'semi', 'final',
    ]);
    expect(plan.rounds.map((r) => r.tieCount)).toEqual([16, 8, 4, 2, 1]);
  });

  it('sin firstMatchday no estampa jornada (el caso del Mundial)', () => {
    expect(standardPlan(32).rounds.every((r) => r.matchday === undefined)).toBe(true);
  });

  it('con firstMatchday numera correlativo y el 3er puesto comparte la de la final', () => {
    const plan = standardPlan(64, { thirdPlace: true, firstMatchday: 1 });
    expect(plan.rounds.map((r) => r.matchday)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(plan.thirdPlaceMatchday).toBe(6);
  });

  it('rechaza tamaños que no son potencia de 2', () => {
    expect(() => standardPlan(12)).toThrow();
    expect(() => standardPlan(1)).toThrow();
  });
});

describe('seedSlots y nextPowerOfTwo', () => {
  it('seedSlots(8) da la siembra estándar', () => {
    expect(seedSlots(8)).toEqual([0, 7, 3, 4, 1, 6, 2, 5]);
  });

  it('las semillas 1 y 2 sólo pueden cruzarse en la final', () => {
    for (const size of [4, 8, 16, 32, 64]) {
      const slots = seedSlots(size);
      const posOf = (seed: number) => slots.indexOf(seed);
      // Mitades opuestas del cuadro.
      expect(posOf(0) < size / 2).not.toBe(posOf(1) < size / 2);
    }
  });

  it('nextPowerOfTwo redondea hacia arriba', () => {
    expect(nextPowerOfTwo(55)).toBe(64);
    expect(nextPowerOfTwo(64)).toBe(64);
    expect(nextPowerOfTwo(3)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Equivalencia con los dorados: Mundial
// ---------------------------------------------------------------------------

describe('equivalencia · cuadro del Mundial', () => {
  /** Cruces de R32 del Mundial: A1-B2, C1-D2, … B1-A2, D1-C2, … */
  const WC_SLOTS = [
    'A1', 'B2', 'C1', 'D2', 'E1', 'F2', 'G1', 'H2',
    'I1', 'J2', 'K1', 'L2', 'M1', 'N2', 'O1', 'P2',
    'B1', 'A2', 'D1', 'C2', 'F1', 'E2', 'H1', 'G2',
    'J1', 'I2', 'L1', 'K2', 'N1', 'M2', 'P1', 'O2',
  ];

  /**
   * El plan del Mundial: R16 y cuartos NO son adyacencia. Las tablas salen
   * tal cual de core/knockout.ts.
   */
  const FIFA_32_PLAN = planWithSources(
    32,
    {
      1: [[0, 1], [8, 9], [2, 3], [10, 11], [4, 5], [12, 13], [6, 7], [14, 15]],
      2: [[0, 4], [2, 6], [1, 5], [3, 7]],
      3: [[0, 1], [2, 3]],
    },
    { thirdPlace: true },
  );

  function playWorldCup(): Bracket {
    let b = createBracket({
      entrants: WC_SLOTS,
      legs: 1,
      neutral: true,
      stage: 'world-cup-knockout',
      idPrefix: 'wc',
      plan: FIFA_32_PLAN,
      seed: { kind: 'explicit' },
    });
    for (let i = 0; i < 5; i++) {
      b = advanceBracket(playRoundHomeWins(b));
    }
    return b;
  }

  it('R32 reproduce los 16 cruces del dorado', () => {
    const b = playWorldCup();
    expect(shapes(b, 0)).toEqual([
      { round: 'round-of-32', position: 0, home: 'A1', away: 'B2', matchday: null },
      { round: 'round-of-32', position: 1, home: 'C1', away: 'D2', matchday: null },
      { round: 'round-of-32', position: 2, home: 'E1', away: 'F2', matchday: null },
      { round: 'round-of-32', position: 3, home: 'G1', away: 'H2', matchday: null },
      { round: 'round-of-32', position: 4, home: 'I1', away: 'J2', matchday: null },
      { round: 'round-of-32', position: 5, home: 'K1', away: 'L2', matchday: null },
      { round: 'round-of-32', position: 6, home: 'M1', away: 'N2', matchday: null },
      { round: 'round-of-32', position: 7, home: 'O1', away: 'P2', matchday: null },
      { round: 'round-of-32', position: 8, home: 'B1', away: 'A2', matchday: null },
      { round: 'round-of-32', position: 9, home: 'D1', away: 'C2', matchday: null },
      { round: 'round-of-32', position: 10, home: 'F1', away: 'E2', matchday: null },
      { round: 'round-of-32', position: 11, home: 'H1', away: 'G2', matchday: null },
      { round: 'round-of-32', position: 12, home: 'J1', away: 'I2', matchday: null },
      { round: 'round-of-32', position: 13, home: 'L1', away: 'K2', matchday: null },
      { round: 'round-of-32', position: 14, home: 'N1', away: 'M2', matchday: null },
      { round: 'round-of-32', position: 15, home: 'P1', away: 'O2', matchday: null },
    ]);
  });

  it('R16 y cuartos reproducen los cruces NO adyacentes del dorado', () => {
    const b = playWorldCup();
    expect(shapes(b, 1)).toEqual([
      { round: 'round-of-16', position: 0, home: 'A1', away: 'C1', matchday: null },
      { round: 'round-of-16', position: 1, home: 'B1', away: 'D1', matchday: null },
      { round: 'round-of-16', position: 2, home: 'E1', away: 'G1', matchday: null },
      { round: 'round-of-16', position: 3, home: 'F1', away: 'H1', matchday: null },
      { round: 'round-of-16', position: 4, home: 'I1', away: 'K1', matchday: null },
      { round: 'round-of-16', position: 5, home: 'J1', away: 'L1', matchday: null },
      { round: 'round-of-16', position: 6, home: 'M1', away: 'O1', matchday: null },
      { round: 'round-of-16', position: 7, home: 'N1', away: 'P1', matchday: null },
    ]);
    expect(shapes(b, 2)).toEqual([
      { round: 'quarter', position: 0, home: 'A1', away: 'I1', matchday: null },
      { round: 'quarter', position: 1, home: 'E1', away: 'M1', matchday: null },
      { round: 'quarter', position: 2, home: 'B1', away: 'J1', matchday: null },
      { round: 'quarter', position: 3, home: 'F1', away: 'N1', matchday: null },
    ]);
  });

  it('semis, 3er puesto, final y campeón coinciden con el dorado', () => {
    const b = playWorldCup();
    expect(shapes(b, 3)).toEqual([
      { round: 'semi', position: 0, home: 'A1', away: 'E1', matchday: null },
      { round: 'semi', position: 1, home: 'B1', away: 'F1', matchday: null },
    ]);
    expect(shapes(b, 4)).toEqual([
      { round: 'final', position: 0, home: 'A1', away: 'B1', matchday: null },
    ]);
    expect(b.thirdPlaceTie?.homeTeamId).toBe('E1');
    expect(b.thirdPlaceTie?.awayTeamId).toBe('F1');
    expect(b.championId).toBe('A1');
    expect(b.runnerUpId).toBe('B1');
  });

  it('dos equipos del mismo grupo sólo se reencuentran en la final', () => {
    const b = playWorldCup();
    const groupOf = (id: string) => id[0];
    for (const r of b.rounds.slice(1, 4)) {
      for (const t of r.ties) {
        expect(groupOf(t.homeTeamId!)).not.toBe(groupOf(t.awayTeamId!));
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Equivalencia con los dorados: continental (byes + re-siembra)
// ---------------------------------------------------------------------------

describe('equivalencia · cuadro continental', () => {
  function entrantsBySkill(n: number) {
    return Array.from({ length: n }, (_, i) => `T${String(i + 1).padStart(2, '0')}`);
  }

  function playContinental(teamCount: number, seed: number) {
    const byeCount = 64 - teamCount;
    let b = createBracket({
      entrants: entrantsBySkill(teamCount),
      legs: 1,
      neutral: true,
      stage: 'continental',
      idPrefix: 'cont',
      plan: standardPlan(64, { thirdPlace: true, firstMatchday: 1, byeJoin: 'reseed' }),
      seed: { kind: 'pots', rng: seededRandom(seed) },
      byeCount,
    });
    for (let i = 0; i < 6; i++) {
      b = advanceBracket(playRoundHomeWins(b));
    }
    return b;
  }

  it('55 equipos: 9 byes por skill y 23 cruces en R64, jornada 1', () => {
    const b = playContinental(55, 12345);
    expect(b.byeTeamIds).toEqual([
      'T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09',
    ]);
    expect(b.rounds[0].ties).toHaveLength(23);
    expect(b.rounds[0].ties.map((t) => t.homeTeamId)).toEqual([
      'T10', 'T11', 'T12', 'T13', 'T14', 'T15', 'T16', 'T17', 'T18', 'T19', 'T20', 'T21',
      'T22', 'T23', 'T24', 'T25', 'T26', 'T27', 'T28', 'T29', 'T30', 'T31', 'T32',
    ]);
    const bottom = new Set(Array.from({ length: 23 }, (_, i) => `T${33 + i}`));
    expect(b.rounds[0].ties.every((t) => bottom.has(t.awayTeamId!))).toBe(true);
    expect(b.rounds[0].ties.every((t, i) => t.position === i)).toBe(true);
    expect(b.rounds[0].ties.every((t) => t.matches[0].matchday === 1)).toBe(true);
  });

  it('R32 re-siembra byes + ganadores por seedSlots(32), igual que el dorado', () => {
    const b = playContinental(55, 12345);
    expect(shapes(b, 1)).toEqual([
      { round: 'round-of-32', position: 0, home: 'T01', away: 'T32', matchday: 2 },
      { round: 'round-of-32', position: 1, home: 'T16', away: 'T17', matchday: 2 },
      { round: 'round-of-32', position: 2, home: 'T08', away: 'T25', matchday: 2 },
      { round: 'round-of-32', position: 3, home: 'T09', away: 'T24', matchday: 2 },
      { round: 'round-of-32', position: 4, home: 'T04', away: 'T29', matchday: 2 },
      { round: 'round-of-32', position: 5, home: 'T13', away: 'T20', matchday: 2 },
      { round: 'round-of-32', position: 6, home: 'T05', away: 'T28', matchday: 2 },
      { round: 'round-of-32', position: 7, home: 'T12', away: 'T21', matchday: 2 },
      { round: 'round-of-32', position: 8, home: 'T02', away: 'T31', matchday: 2 },
      { round: 'round-of-32', position: 9, home: 'T15', away: 'T18', matchday: 2 },
      { round: 'round-of-32', position: 10, home: 'T07', away: 'T26', matchday: 2 },
      { round: 'round-of-32', position: 11, home: 'T10', away: 'T23', matchday: 2 },
      { round: 'round-of-32', position: 12, home: 'T03', away: 'T30', matchday: 2 },
      { round: 'round-of-32', position: 13, home: 'T14', away: 'T19', matchday: 2 },
      { round: 'round-of-32', position: 14, home: 'T06', away: 'T27', matchday: 2 },
      { round: 'round-of-32', position: 15, home: 'T11', away: 'T22', matchday: 2 },
    ]);
  });

  it('de R16 en adelante es adyacencia, con jornadas 3-6', () => {
    const b = playContinental(55, 12345);
    expect(shapes(b, 2)).toEqual([
      { round: 'round-of-16', position: 0, home: 'T01', away: 'T16', matchday: 3 },
      { round: 'round-of-16', position: 1, home: 'T08', away: 'T09', matchday: 3 },
      { round: 'round-of-16', position: 2, home: 'T04', away: 'T13', matchday: 3 },
      { round: 'round-of-16', position: 3, home: 'T05', away: 'T12', matchday: 3 },
      { round: 'round-of-16', position: 4, home: 'T02', away: 'T15', matchday: 3 },
      { round: 'round-of-16', position: 5, home: 'T07', away: 'T10', matchday: 3 },
      { round: 'round-of-16', position: 6, home: 'T03', away: 'T14', matchday: 3 },
      { round: 'round-of-16', position: 7, home: 'T06', away: 'T11', matchday: 3 },
    ]);
    expect(shapes(b, 3)).toEqual([
      { round: 'quarter', position: 0, home: 'T01', away: 'T08', matchday: 4 },
      { round: 'quarter', position: 1, home: 'T04', away: 'T05', matchday: 4 },
      { round: 'quarter', position: 2, home: 'T02', away: 'T07', matchday: 4 },
      { round: 'quarter', position: 3, home: 'T03', away: 'T06', matchday: 4 },
    ]);
    expect(shapes(b, 4)).toEqual([
      { round: 'semi', position: 0, home: 'T01', away: 'T04', matchday: 5 },
      { round: 'semi', position: 1, home: 'T02', away: 'T03', matchday: 5 },
    ]);
    expect(shapes(b, 5)).toEqual([
      { round: 'final', position: 0, home: 'T01', away: 'T02', matchday: 6 },
    ]);
    expect(b.thirdPlaceTie?.homeTeamId).toBe('T04');
    expect(b.thirdPlaceTie?.awayTeamId).toBe('T03');
    expect(b.thirdPlaceTie?.matches[0].matchday).toBe(6);
  });

  it('64 equipos: sin byes, 32 cruces en R64 y 16 en R32', () => {
    const b = playContinental(64, 777);
    expect(b.byeTeamIds).toEqual([]);
    expect(b.rounds[0].ties).toHaveLength(32);
    expect(b.rounds[1].ties).toHaveLength(16);
  });

  it('ningún equipo aparece dos veces en la misma ronda', () => {
    const b = playContinental(55, 999);
    for (const r of b.rounds) {
      const ids = r.ties.flatMap((t) => [t.homeTeamId!, t.awayTeamId!]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

// ---------------------------------------------------------------------------
// Equivalencia con los dorados: Copa Confederaciones
// ---------------------------------------------------------------------------

describe('equivalencia · Copa Confederaciones', () => {
  it('semis cruzadas en jornada 4; final y 3er puesto en la 5', () => {
    // 1ºA-2ºB y 1ºB-2ºA sale del ORDEN de los entrantes, no de una regla nueva.
    let b = createBracket({
      entrants: ['A1', 'B2', 'B1', 'A2'],
      legs: 1,
      neutral: true,
      stage: 'confed-knockout',
      idPrefix: 'confed',
      plan: standardPlan(4, { thirdPlace: true, firstMatchday: 4 }),
      seed: { kind: 'explicit' },
    });

    expect(shapes(b, 0)).toEqual([
      { round: 'semi', position: 0, home: 'A1', away: 'B2', matchday: 4 },
      { round: 'semi', position: 1, home: 'B1', away: 'A2', matchday: 4 },
    ]);

    b = advanceBracket(playRoundHomeWins(b));
    expect(shapes(b, 1)).toEqual([
      { round: 'final', position: 0, home: 'A1', away: 'B1', matchday: 5 },
    ]);
    expect(b.thirdPlaceTie?.homeTeamId).toBe('B2');
    expect(b.thirdPlaceTie?.awayTeamId).toBe('A2');
    expect(b.thirdPlaceTie?.matches[0].matchday).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Ida y vuelta (el formato de la copa villamariense)
// ---------------------------------------------------------------------------

describe('cuadro a ida y vuelta', () => {
  function twoLegged() {
    return createBracket({
      entrants: ['A', 'B', 'C', 'D'],
      legs: 2,
      neutral: false,
      stage: 'cup',
      idPrefix: 'cup',
      plan: standardPlan(4),
      seed: { kind: 'explicit' },
    });
  }

  it('cada cruce arma dos partidos con la localía invertida', () => {
    const b = twoLegged();
    const tie = b.rounds[0].ties[0];
    expect(tie.matches).toHaveLength(2);
    expect(tie.matches[0]).toMatchObject({ homeTeamId: 'A', awayTeamId: 'B', matchday: 1 });
    expect(tie.matches[1]).toMatchObject({ homeTeamId: 'B', awayTeamId: 'A', matchday: 2 });
  });

  it('el global suma ida y vuelta sin gol de visitante', () => {
    let b = twoLegged();
    const tie = b.rounds[0].ties[0];
    // A gana 2-0 de local; B gana 1-0 de local. Global 2-1 para A.
    b = recordBracketMatch(b, tie.matches[0].id, { homeScore: 2, awayScore: 0 });
    b = recordBracketMatch(b, tie.matches[1].id, { homeScore: 1, awayScore: 0 });
    const resolved = b.rounds[0].ties[0];
    expect(tieAggregate(resolved)).toEqual({ home: 2, away: 1 });
    expect(resolved.winnerId).toBe('A');
    expect(resolved.loserId).toBe('B');
  });

  it('empate global sin penales queda sin definir', () => {
    let b = twoLegged();
    const tie = b.rounds[0].ties[0];
    b = recordBracketMatch(b, tie.matches[0].id, { homeScore: 1, awayScore: 1 });
    b = recordBracketMatch(b, tie.matches[1].id, { homeScore: 2, awayScore: 2 });
    expect(b.rounds[0].ties[0].winnerId).toBeUndefined();
  });

  it('empate global con penales define por penales', () => {
    let b = twoLegged();
    const tie = b.rounds[0].ties[0];
    b = recordBracketMatch(b, tie.matches[0].id, { homeScore: 1, awayScore: 1 });
    b = recordBracketMatch(b, tie.matches[1].id, {
      homeScore: 2,
      awayScore: 2,
      extraTime: true,
      penalties: { homeScore: 3, awayScore: 4 },
    });
    const resolved = b.rounds[0].ties[0];
    expect(resolved.extraTime).toBe(true);
    // Los penales se marcan desde homeTeamId del cruce, que es 'A'.
    expect(resolved.winnerId).toBe('B');
  });

  it('la vuelta no se puede jugar antes que la ida', () => {
    let b = twoLegged();
    const tie = () => b.rounds[0].ties[0];
    const [ida, vuelta] = tie().matches;

    expect(isLegPlayable(tie(), ida.id)).toBe(true);
    expect(isLegPlayable(tie(), vuelta.id)).toBe(false);

    b = recordBracketMatch(b, ida.id, { homeScore: 2, awayScore: 0 });
    expect(isLegPlayable(tie(), ida.id)).toBe(false); // ya jugada
    expect(isLegPlayable(tie(), vuelta.id)).toBe(true);
  });

  it('la jornada del cuadro son todas las idas y después todas las vueltas', () => {
    let b = createBracket({
      entrants: ['A', 'B', 'C', 'D'],
      legs: 2,
      neutral: false,
      stage: 'cup',
      idPrefix: 'cup',
      plan: standardPlan(4),
      seed: { kind: 'explicit' },
    });

    const ida = currentBracketJornada(b)!;
    expect(ida.label).toBe('Semis · Ida');
    expect(ida.leg).toBe(0);
    // Los dos cruces de la ronda, su primer partido y ninguno más.
    expect(ida.matches.map((m) => m.id)).toEqual(b.rounds[0].ties.map((t) => t.matches[0].id));

    for (const m of ida.matches) b = recordBracketMatch(b, m.id, { homeScore: 1, awayScore: 0 });

    const vuelta = currentBracketJornada(b)!;
    expect(vuelta.label).toBe('Semis · Vuelta');
    expect(vuelta.leg).toBe(1);
    expect(vuelta.matches.map((m) => m.id)).toEqual(b.rounds[0].ties.map((t) => t.matches[1].id));
  });

  it('un partido a un solo leg usa el marcador directo', () => {
    const tie: Tie = {
      id: 't', round: 'final', position: 0, homeTeamId: 'A', awayTeamId: 'B',
      matches: [{
        id: 'm', homeTeamId: 'A', awayTeamId: 'B',
        homeScore: 3, awayScore: 1, isPlayed: true, stage: 'cup',
      }],
    };
    expect(tieAggregate(tie)).toEqual({ home: 3, away: 1 });
    expect(resolveTie(tie).winnerId).toBe('A');
  });
});

// ---------------------------------------------------------------------------
// Invariantes generales
// ---------------------------------------------------------------------------

describe('invariantes del cuadro', () => {
  it('una ronda incompleta no genera la siguiente', () => {
    let b = createBracket({
      entrants: ['A', 'B', 'C', 'D'],
      legs: 1, neutral: true, stage: 'knockout', idPrefix: 'k',
      plan: standardPlan(4), seed: { kind: 'explicit' },
    });
    // Sólo se juega uno de los dos cruces.
    b = recordBracketMatch(b, b.rounds[0].ties[0].matches[0].id, { homeScore: 1, awayScore: 0 });
    expect(isRoundResolved(b.rounds[0].ties)).toBe(false);
    b = advanceBracket(b);
    expect(b.rounds).toHaveLength(1);
  });

  it('advanceBracket es idempotente', () => {
    let b = createBracket({
      entrants: ['A', 'B', 'C', 'D'],
      legs: 1, neutral: true, stage: 'knockout', idPrefix: 'k',
      plan: standardPlan(4, { thirdPlace: true }), seed: { kind: 'explicit' },
    });
    b = advanceBracket(playRoundHomeWins(b));
    const once = advanceBracket(b);
    const twice = advanceBracket(once);
    expect(twice.rounds).toHaveLength(once.rounds.length);
    expect(twice.thirdPlaceTie?.id).toBe(once.thirdPlaceTie?.id);
  });

  it('cada entrante aparece exactamente una vez en la primera ronda', () => {
    for (const size of [4, 8, 16, 32, 64]) {
      const entrants = Array.from({ length: size }, (_, i) => `E${i}`);
      const b = createBracket({
        entrants, legs: 1, neutral: true, stage: 'knockout', idPrefix: 'k',
        plan: standardPlan(size), seed: { kind: 'seeded' },
      });
      const ids = b.rounds[0].ties.flatMap((t) => [t.homeTeamId!, t.awayTeamId!]);
      expect(new Set(ids).size).toBe(size);
      expect(b.rounds[0].ties).toHaveLength(size / 2);
    }
  });

  it('con cuadro incompleto los byes no generan partido', () => {
    const b = createBracket({
      entrants: ['A', 'B', 'C'], // 3 en un cuadro de 4
      legs: 1, neutral: true, stage: 'knockout', idPrefix: 'k',
      plan: standardPlan(4), seed: { kind: 'seeded' },
    });
    expect(b.rounds[0].ties).toHaveLength(1);
    expect(b.byeTeamIds).toHaveLength(1);
  });

  it('isBracketComplete exige campeón y, si el plan lo pide, tercero', () => {
    let b = createBracket({
      entrants: ['A', 'B', 'C', 'D'],
      legs: 1, neutral: true, stage: 'knockout', idPrefix: 'k',
      plan: standardPlan(4, { thirdPlace: true }), seed: { kind: 'explicit' },
    });
    b = advanceBracket(playRoundHomeWins(b));
    b = advanceBracket(playRoundHomeWins(b));
    expect(b.championId).toBe('A');
    expect(isBracketComplete(b)).toBe(false); // falta el 3er puesto
    b = recordBracketMatch(b, b.thirdPlaceTie!.matches[0].id, { homeScore: 2, awayScore: 1 });
    b = advanceBracket(b);
    expect(b.thirdPlaceId).toBe('B');
    expect(isBracketComplete(b)).toBe(true);
  });
});
