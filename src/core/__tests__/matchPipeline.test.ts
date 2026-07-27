import { describe, it, expect, vi } from 'vitest';
import {
  FULL_ENERGY,
  matchHistoryRow,
  playOneMatch,
  playTie,
  tieHistoryRows,
  type PipelineTeam,
} from '../matchPipeline';
import {
  calculateSkillChanges,
  simulateExtraTimeGoals,
  simulateMatch,
  simulateMatchWithPenalties,
  updateTeamSkill,
} from '../engine';

// Sin este mock, tocar la config del motor deja armada una escritura real a
// Supabase (ver src/store/__tests__/useConfigStore.test.ts).
vi.mock('../../lib/persistSettings', () => ({
  queueSettingsSave: vi.fn(),
  flushSettingsSave: vi.fn(),
}));

/** RNG determinista (LCG), igual al de los demás tests. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const HOME: PipelineTeam = { id: 'H', skill: 82 };
const AWAY: PipelineTeam = { id: 'A', skill: 74 };

const CTX = { importance: 1.4, neutral: false } as const;

describe('playTie — cruce a ida y vuelta', () => {
  /**
   * El test importante de esta etapa: la implementación que vivía dentro del
   * store del modo de ligas, escrita a mano acá contra el motor. Si el pipeline
   * consume el rng en otro orden o calcula el Elo distinto, esto se rompe.
   */
  function reference(rngSeed: number) {
    const rng = seededRng(rngSeed);
    const ctx = (h: PipelineTeam, a: PipelineTeam) => ({
      home: { skill: h.skill, energy: 100 },
      away: { skill: a.skill, energy: 100 },
      importance: CTX.importance,
      neutral: false,
      rng,
    });

    const leg1 = simulateMatch(ctx(HOME, AWAY));
    const leg2 = simulateMatch(ctx(AWAY, HOME));
    let leg2Home = leg2.homeScore;
    let leg2Away = leg2.awayScore;
    let extraTime = false;

    if (leg1.homeScore + leg2Away === leg1.awayScore + leg2Home) {
      extraTime = true;
      const et = simulateExtraTimeGoals(ctx(AWAY, HOME));
      leg2Home += et.homeGoals;
      leg2Away += et.awayGoals;
    }

    const c1 = calculateSkillChanges(HOME.skill, AWAY.skill, leg1.homeScore, leg1.awayScore, CTX.importance);
    const c2 = calculateSkillChanges(AWAY.skill, HOME.skill, leg2Home, leg2Away, CTX.importance);

    return {
      legs: [
        { homeScore: leg1.homeScore, awayScore: leg1.awayScore },
        { homeScore: leg2Home, awayScore: leg2Away },
      ],
      legChanges: [c1, c2],
      extraTime,
      deltas: {
        H: c1.homeChange + c2.awayChange,
        A: c1.awayChange + c2.homeChange,
      },
    };
  }

  it('reproduce la implementación de referencia con el mismo rng', () => {
    for (const seed of [1, 7, 42, 123, 999]) {
      const got = playTie(HOME, AWAY, { ...CTX, legs: 2, rng: seededRng(seed) });
      const want = reference(seed);

      expect(got.legs).toEqual(want.legs);
      expect(got.legChanges).toEqual(want.legChanges);
      expect(got.extraTime).toBe(want.extraTime);
      expect(got.deltas.get('H')).toBe(want.deltas.H);
      expect(got.deltas.get('A')).toBe(want.deltas.A);
    }
  });

  it('el global es sin gol de visitante, desde la perspectiva del local de la ida', () => {
    const t = playTie(HOME, AWAY, { ...CTX, legs: 2, rng: seededRng(5) });
    const [l1, l2] = t.legs;
    // El local de la vuelta es AWAY: sus goles suman del lado `away` del global.
    expect(t.aggregate).toEqual({
      home: l1.homeScore + l2.awayScore,
      away: l1.awayScore + l2.homeScore,
    });
  });

  it('si hay ganador en el global, no hay prórroga ni penales', () => {
    for (const seed of [3, 11, 21, 55, 88, 404]) {
      const t = playTie(HOME, AWAY, { ...CTX, legs: 2, rng: seededRng(seed) });
      if (t.aggregate.home !== t.aggregate.away) {
        expect(t.extraTime).toBe(false);
        expect(t.penalties).toBeUndefined();
      }
    }
  });

  it('penales sólo si la prórroga tampoco desempata', () => {
    for (const seed of [2, 4, 6, 8, 10, 12, 14, 16]) {
      const t = playTie(HOME, AWAY, { ...CTX, legs: 2, rng: seededRng(seed) });
      if (t.penalties) {
        expect(t.extraTime).toBe(true);
        expect(t.aggregate.home).toBe(t.aggregate.away);
        expect(t.penalties.homeScore).not.toBe(t.penalties.awayScore);
      }
    }
  });

  it('sin `decisive` un cruce puede quedar empatado', () => {
    let anyDraw = false;
    for (let seed = 0; seed < 60; seed++) {
      const t = playTie(HOME, AWAY, { ...CTX, legs: 2, decisive: false, rng: seededRng(seed) });
      expect(t.extraTime).toBe(false);
      expect(t.penalties).toBeUndefined();
      if (t.aggregate.home === t.aggregate.away) anyDraw = true;
    }
    expect(anyDraw).toBe(true);
  });
});

describe('playTie — cruce a partido único', () => {
  it('equivale a simulateMatchWithPenalties', () => {
    const got = playTie(HOME, AWAY, { ...CTX, legs: 1, rng: seededRng(31) });
    const want = simulateMatchWithPenalties({
      home: { skill: HOME.skill, energy: 100 },
      away: { skill: AWAY.skill, energy: 100 },
      importance: CTX.importance,
      neutral: false,
      rng: seededRng(31),
    });

    expect(got.legs).toEqual([{ homeScore: want.homeScore, awayScore: want.awayScore }]);
    expect(got.aggregate).toEqual({ home: want.homeScore, away: want.awayScore });
    expect(got.deltas.get('H')).toBe(want.homeSkillChange);
    expect(got.deltas.get('A')).toBe(want.awaySkillChange);
  });

  it('un partido decisivo nunca termina empatado', () => {
    for (let seed = 0; seed < 40; seed++) {
      const t = playTie(HOME, AWAY, { ...CTX, legs: 1, rng: seededRng(seed) });
      const winnerByScore = t.aggregate.home !== t.aggregate.away;
      expect(winnerByScore || !!t.penalties).toBe(true);
    }
  });
});

describe('playOneMatch — energía', () => {
  it('sin energía explícita juega al 100%', () => {
    const got = playOneMatch(HOME, AWAY, { ...CTX, rng: seededRng(17) });
    const want = simulateMatch({
      home: { skill: HOME.skill, energy: FULL_ENERGY },
      away: { skill: AWAY.skill, energy: FULL_ENERGY },
      importance: CTX.importance,
      neutral: false,
      rng: seededRng(17),
    });
    expect(got.homeScore).toBe(want.homeScore);
    expect(got.awayScore).toBe(want.awayScore);
  });

  it('la energía explícita llega al motor', () => {
    const got = playOneMatch(HOME, AWAY, {
      ...CTX,
      energy: { home: 60, away: 100 },
      rng: seededRng(17),
    });
    const want = simulateMatch({
      home: { skill: HOME.skill, energy: 60 },
      away: { skill: AWAY.skill, energy: 100 },
      importance: CTX.importance,
      neutral: false,
      rng: seededRng(17),
    });
    expect(got.homeScore).toBe(want.homeScore);
    expect(got.awayScore).toBe(want.awayScore);
  });
});

describe('filas de historial', () => {
  it('un cruce da una fila por partido, con la localía real de cada uno', () => {
    const played = playTie(HOME, AWAY, { ...CTX, legs: 2, rng: seededRng(64) });
    const rows = tieHistoryRows(HOME, AWAY, played, { stage: 'cup', name: 'Copa 2026' });

    expect(rows).toHaveLength(2);
    expect(rows[0].homeId).toBe('H');
    expect(rows[0].awayId).toBe('A');
    expect(rows[1].homeId).toBe('A'); // la vuelta se juega en cancha de AWAY
    expect(rows[1].awayId).toBe('H');
    expect(rows.map((r) => r.name)).toEqual(['Copa 2026 · Ida', 'Copa 2026 · Vuelta']);
    expect(rows.every((r) => r.stage === 'cup')).toBe(true);
  });

  it('el skill final del cruce queda en la fila de la vuelta', () => {
    const played = playTie(HOME, AWAY, { ...CTX, legs: 2, rng: seededRng(64) });
    const rows = tieHistoryRows(HOME, AWAY, played, { stage: 'cup', name: 'Copa' });

    // En la vuelta el local es AWAY, así que `homeAfter` es el skill final de AWAY.
    expect(rows[1].homeAfter).toBe(updateTeamSkill(AWAY.skill, played.deltas.get('A')!));
    expect(rows[1].awayAfter).toBe(updateTeamSkill(HOME.skill, played.deltas.get('H')!));
    // `before` es siempre el skill con el que llegaron al cruce.
    expect(rows[0].homeBefore).toBe(HOME.skill);
    expect(rows[1].homeBefore).toBe(AWAY.skill);
  });

  it('`wentToExtraTime` va sólo en el último partido, y sólo si lo hubo', () => {
    for (const seed of [64, 65, 66, 67, 68, 69]) {
      const played = playTie(HOME, AWAY, { ...CTX, legs: 2, rng: seededRng(seed) });
      const rows = tieHistoryRows(HOME, AWAY, played, { stage: 'cup', name: 'Copa' });
      expect(rows[0].wentToExtraTime).toBeUndefined();
      expect(rows[1].wentToExtraTime).toBe(played.extraTime ? true : undefined);
    }
  });

  it('un partido suelto da una fila con su propio delta aplicado', () => {
    const played = playOneMatch(HOME, AWAY, { ...CTX, rng: seededRng(101) });
    const row = matchHistoryRow(HOME, AWAY, played, { stage: 'league', name: 'Liga A 2026' });

    expect(row).toMatchObject({
      homeId: 'H',
      awayId: 'A',
      stage: 'league',
      name: 'Liga A 2026',
      homeBefore: HOME.skill,
      awayBefore: AWAY.skill,
      homeAfter: updateTeamSkill(HOME.skill, played.homeChange),
      awayAfter: updateTeamSkill(AWAY.skill, played.awayChange),
    });
    expect(row.wentToExtraTime).toBeUndefined();
  });
});
