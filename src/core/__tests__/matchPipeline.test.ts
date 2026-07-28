import { describe, it, expect, vi } from 'vitest';
import {
  FULL_ENERGY,
  matchHistoryRow,
  playOneMatch,
  playTieLeg,
  tieLegName,
  type LegScore,
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

/**
 * Juega un cruce a ida y vuelta partido a partido, que es como lo juega el
 * store: dos llamadas, la segunda con el marcador de la primera. El mismo `rng`
 * viaja a las dos para poder compararlo contra una referencia.
 */
function playBothLegs(rng: () => number, o: { decisive?: boolean } = {}) {
  const first = playTieLeg(HOME, AWAY, { ...CTX, legs: 2, legIndex: 0, rng, ...o });
  const previous: LegScore[] = [{ homeScore: first.homeScore, awayScore: first.awayScore }];
  const second = playTieLeg(HOME, AWAY, {
    ...CTX,
    legs: 2,
    legIndex: 1,
    previous,
    rng,
    ...o,
  });
  return { first, second };
}

describe('playTieLeg — cruce a ida y vuelta, partido a partido', () => {
  /**
   * El test importante: la implementación que vivía dentro del store del modo
   * de ligas —que jugaba los dos partidos de una—, escrita a mano acá contra el
   * motor. Jugarlos por separado no puede cambiar ni el consumo del rng ni el
   * Elo: si cambia, esto se rompe.
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
      const { first, second } = playBothLegs(seededRng(seed));
      const want = reference(seed);

      expect([
        { homeScore: first.homeScore, awayScore: first.awayScore },
        { homeScore: second.homeScore, awayScore: second.awayScore },
      ]).toEqual(want.legs);
      expect({ homeChange: first.homeChange, awayChange: first.awayChange }).toEqual(
        want.legChanges[0],
      );
      expect({ homeChange: second.homeChange, awayChange: second.awayChange }).toEqual(
        want.legChanges[1],
      );
      expect(Boolean(second.extraTime)).toBe(want.extraTime);
      // El delta de cada equipo es la suma de sus dos partidos: en la vuelta H
      // es visitante, así que le toca `awayChange`.
      expect(first.homeChange + second.awayChange).toBe(want.deltas.H);
      expect(first.awayChange + second.homeChange).toBe(want.deltas.A);
    }
  });

  it('la ida no define nada: nunca hay prórroga ni penales en el primer partido', () => {
    for (let seed = 0; seed < 40; seed++) {
      const first = playTieLeg(HOME, AWAY, { ...CTX, legs: 2, legIndex: 0, rng: seededRng(seed) });
      expect(first.extraTime).toBeUndefined();
      expect(first.penalties).toBeUndefined();
      // Y el global parcial es el marcador de la ida.
      expect(first.aggregate).toEqual({ home: first.homeScore, away: first.awayScore });
    }
  });

  it('el global es sin gol de visitante, desde la perspectiva del local de la ida', () => {
    const { first, second } = playBothLegs(seededRng(5));
    // El local de la vuelta es AWAY: sus goles suman del lado `away` del global.
    expect(second.aggregate).toEqual({
      home: first.homeScore + second.awayScore,
      away: first.awayScore + second.homeScore,
    });
  });

  it('si hay ganador en el global, no hay prórroga ni penales', () => {
    for (const seed of [3, 11, 21, 55, 88, 404]) {
      const { second } = playBothLegs(seededRng(seed));
      if (second.aggregate.home !== second.aggregate.away) {
        expect(second.extraTime).toBeUndefined();
        expect(second.penalties).toBeUndefined();
      }
    }
  });

  it('penales sólo si la prórroga tampoco desempata', () => {
    for (const seed of [2, 4, 6, 8, 10, 12, 14, 16]) {
      const { second } = playBothLegs(seededRng(seed));
      if (second.penalties) {
        expect(second.extraTime).toBeDefined();
        expect(second.aggregate.home).toBe(second.aggregate.away);
        expect(second.penalties.homeScore).not.toBe(second.penalties.awayScore);
      }
    }
  });

  it('sin `decisive` un cruce puede quedar empatado', () => {
    let anyDraw = false;
    for (let seed = 0; seed < 60; seed++) {
      const { second } = playBothLegs(seededRng(seed), { decisive: false });
      expect(second.extraTime).toBeUndefined();
      expect(second.penalties).toBeUndefined();
      if (second.aggregate.home === second.aggregate.away) anyDraw = true;
    }
    expect(anyDraw).toBe(true);
  });
});

describe('playTieLeg — cruce a partido único', () => {
  it('equivale a simulateMatchWithPenalties', () => {
    const got = playTieLeg(HOME, AWAY, { ...CTX, legs: 1, legIndex: 0, rng: seededRng(31) });
    const want = simulateMatchWithPenalties({
      home: { skill: HOME.skill, energy: 100 },
      away: { skill: AWAY.skill, energy: 100 },
      importance: CTX.importance,
      neutral: false,
      rng: seededRng(31),
    });

    expect({ homeScore: got.homeScore, awayScore: got.awayScore }).toEqual({
      homeScore: want.homeScore,
      awayScore: want.awayScore,
    });
    expect(got.aggregate).toEqual({ home: want.homeScore, away: want.awayScore });
    expect(got.homeChange).toBe(want.homeSkillChange);
    expect(got.awayChange).toBe(want.awaySkillChange);
  });

  it('un partido decisivo nunca termina empatado', () => {
    for (let seed = 0; seed < 40; seed++) {
      const t = playTieLeg(HOME, AWAY, { ...CTX, legs: 1, legIndex: 0, rng: seededRng(seed) });
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
  it('cada partido del cruce da su fila, con la localía real y su rótulo', () => {
    const rng = seededRng(64);
    const { first, second } = playBothLegs(rng);

    const ida = matchHistoryRow(HOME, AWAY, first, {
      stage: 'cup',
      name: tieLegName('Copa 2026', 2, 0),
    });
    // En la vuelta el local es AWAY.
    const vuelta = matchHistoryRow(AWAY, HOME, second, {
      stage: 'cup',
      name: tieLegName('Copa 2026', 2, 1),
    });

    expect(ida.homeId).toBe('H');
    expect(ida.awayId).toBe('A');
    expect(vuelta.homeId).toBe('A'); // la vuelta se juega en cancha de AWAY
    expect(vuelta.awayId).toBe('H');
    expect([ida.name, vuelta.name]).toEqual(['Copa 2026 · Ida', 'Copa 2026 · Vuelta']);
    expect([ida.stage, vuelta.stage]).toEqual(['cup', 'cup']);
  });

  it('un cruce a partido único usa el nombre de la competición tal cual', () => {
    expect(tieLegName('Copa 2026', 1, 0)).toBe('Copa 2026');
  });

  it('`wentToExtraTime` va sólo en el partido que se fue al alargue', () => {
    for (const seed of [64, 65, 66, 67, 68, 69]) {
      const { first, second } = playBothLegs(seededRng(seed));
      const ida = matchHistoryRow(HOME, AWAY, first, { stage: 'cup', name: 'Copa' });
      const vuelta = matchHistoryRow(AWAY, HOME, second, { stage: 'cup', name: 'Copa' });
      expect(ida.wentToExtraTime).toBeUndefined();
      expect(vuelta.wentToExtraTime).toBe(second.extraTime ? true : undefined);
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
