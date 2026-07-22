import { describe, it, expect } from 'vitest';
import {
  createInitialCalendar,
  createEmptyContinentalStage,
  createEmptyConfederationsCup,
  toCycle,
  ensureCycleFields,
  drawContinentalStage,
  recordContinentalMatch,
  assembleConfederationFinalists,
  drawConfederationsStage,
  recordConfedGroupMatch,
  recordConfedKnockoutMatch,
  serializeCycleState,
  reconstructCycle,
  type KnockoutResult,
  type CycleStatePayload,
} from '../cycle';
import type { Cycle, KnockoutMatch, Region, Team, Tournament, WorldCup } from '../../types';
import { canDrawContinental } from '../../utils/cycleProgress';
import { makeDrawnContinentalCycle } from '../../test/fixtures/cycle';

const REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

function baseTournament(): Tournament {
  return {
    id: 't1',
    name: 'World Cup 2026',
    year: 2026,
    qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
    worldCup: null,
    isQualifiersComplete: false,
    hasAnyMatchPlayed: false,
  };
}

describe('cycle: creación', () => {
  it('createInitialCalendar arranca en continental, jornada 0 (sin sortear)', () => {
    expect(createInitialCalendar()).toEqual({ phase: 'continental', matchday: 0 });
  });

  it('createEmptyContinentalStage crea 4 brackets vacíos, isComplete false', () => {
    const s = createEmptyContinentalStage();
    expect(s.isComplete).toBe(false);
    for (const r of REGIONS) {
      const b = s.brackets[r];
      expect(b.region).toBe(r);
      expect(b.roundOf64).toEqual([]);
      expect(b.roundOf32).toEqual([]);
      expect(b.final).toBeNull();
      expect(b.byeTeamIds).toEqual([]);
    }
  });

  it('createEmptyConfederationsCup crea grupos/knockout vacíos', () => {
    const c = createEmptyConfederationsCup();
    expect(c.groups).toEqual([]);
    expect(c.knockout.semiFinals).toEqual([]);
    expect(c.knockout.thirdPlace).toBeNull();
    expect(c.knockout.final).toBeNull();
    expect(c.isComplete).toBe(false);
  });

  it('toCycle envuelve un Tournament conservando sus campos y agregando los del ciclo', () => {
    const base = baseTournament();
    const cycle = toCycle(base);
    expect(cycle.id).toBe('t1');
    expect(cycle.year).toBe(2026);
    expect(cycle.worldCup).toBeNull();
    expect(cycle.calendar).toEqual({ phase: 'continental', matchday: 0 });
    expect(cycle.continental.isComplete).toBe(false);
    expect(cycle.confederationsCup.isComplete).toBe(false);
  });

  it('ensureCycleFields hace backfill de campos faltantes sin pisar los presentes', () => {
    const base = baseTournament();
    // Simula un torneo legacy sin campos de ciclo:
    const legacy = base as unknown as import('../../types').Cycle;
    const fixed = ensureCycleFields(legacy);
    expect(fixed.calendar).toEqual({ phase: 'continental', matchday: 0 });
    expect(fixed.continental.brackets.Europe.region).toBe('Europe');

    // Si ya tiene calendario, no lo pisa:
    const withCalendar = toCycle(base);
    withCalendar.calendar = { phase: 'confed', matchday: 3 };
    expect(ensureCycleFields(withCalendar).calendar).toEqual({ phase: 'confed', matchday: 3 });
  });
});

// Helper: N equipos de una región con skills decrecientes (100, 99, ...).
function makeRegionTeams(region: Region, count: number): Team[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${region}-${i}`,
    name: `${region} ${i}`,
    flag: '🏳️',
    region,
    skill: 100 - i,
  }));
}

function fullTeamsByRegion(): Record<Region, Team[]> {
  return {
    Europe: makeRegionTeams('Europe', 55),
    Asia: makeRegionTeams('Asia', 55),
    Africa: makeRegionTeams('Africa', 55),
    America: makeRegionTeams('America', 45),
  };
}

// Toma todos los partidos continentales de la jornada actual sin jugar y los
// "juega" con victoria del local (home), devolviendo el cycle avanzado.
function playContinentalMatchday(cycle: Cycle): Cycle {
  const md = cycle.calendar.matchday;
  const matches = Object.values(cycle.continental.brackets)
    .flatMap((b): KnockoutMatch[] => [
      ...b.roundOf64, ...b.roundOf32, ...b.roundOf16,
      ...b.quarterFinals, ...b.semiFinals, ...(b.final ? [b.final] : []),
    ])
    .filter((m) => (m.matchday ?? 0) === md && !m.isPlayed);
  let next = cycle;
  for (const m of matches) {
    const result: KnockoutResult = {
      homeScore: 1, awayScore: 0, winnerId: m.homeTeamId, loserId: m.awayTeamId,
    };
    next = recordContinentalMatch(next, m.id, result);
  }
  return next;
}

describe('cycle: continental', () => {
  it('drawContinentalStage sortea 4 brackets y pone calendario en md1', () => {
    const cycle = drawContinentalStage(toCycle({
      id: 't', name: 'c', year: 2026,
      qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
      worldCup: null, isQualifiersComplete: false, hasAnyMatchPlayed: false,
    }), fullTeamsByRegion());

    expect(cycle.calendar).toEqual({ phase: 'continental', matchday: 1 });
    // Europa: 55 equipos → 9 byes, 23 cruces R64.
    expect(cycle.continental.brackets.Europe.byeTeamIds).toHaveLength(9);
    expect(cycle.continental.brackets.Europe.roundOf64).toHaveLength(23);
    // América: 45 equipos → 19 byes, 13 cruces R64.
    expect(cycle.continental.brackets.America.byeTeamIds).toHaveLength(19);
    expect(cycle.continental.brackets.America.roundOf64).toHaveLength(13);
  });

  it('al completar la jornada R64 global genera R32 y avanza a md2', () => {
    let cycle = drawContinentalStage(toCycle({
      id: 't', name: 'c', year: 2026,
      qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
      worldCup: null, isQualifiersComplete: false, hasAnyMatchPlayed: false,
    }), fullTeamsByRegion());

    cycle = playContinentalMatchday(cycle); // juega toda la R64
    expect(cycle.calendar).toEqual({ phase: 'continental', matchday: 2 });
    // Cada bracket ya tiene su R32 (16 cruces).
    expect(cycle.continental.brackets.Europe.roundOf32).toHaveLength(16);
    expect(cycle.continental.brackets.America.roundOf32).toHaveLength(16);
  });

  it('corre las 6 jornadas y corona campeón/subcampeón por confederación', () => {
    let cycle = drawContinentalStage(toCycle({
      id: 't', name: 'c', year: 2026,
      qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
      worldCup: null, isQualifiersComplete: false, hasAnyMatchPlayed: false,
    }), fullTeamsByRegion());

    for (let i = 0; i < 6; i++) cycle = playContinentalMatchday(cycle);

    expect(cycle.continental.isComplete).toBe(true);
    // La final quedó jugada y hay campeón + subcampeón en cada bracket.
    for (const r of ['Europe', 'America', 'Africa', 'Asia'] as Region[]) {
      const b = cycle.continental.brackets[r];
      expect(b.final?.isPlayed).toBe(true);
      expect(b.championId).toBeTruthy();
      expect(b.runnerUpId).toBeTruthy();
      expect(b.championId).not.toBe(b.runnerUpId);
    }
    // Boundary: el calendario NO saltó solo a confed (queda en continental md6).
    expect(cycle.calendar).toEqual({ phase: 'continental', matchday: 6 });
  });
});

// Arma un cycle con continental YA completo (finalistas fijados a mano).
function cycleWithContinentalDone(): { cycle: Cycle; teams: Team[] } {
  const teams: Team[] = [];
  const regions: Region[] = ['Europe', 'America', 'Africa', 'Asia'];
  const base = toCycle({
    id: 't', name: 'c', year: 2026,
    qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
    worldCup: null, isQualifiersComplete: false, hasAnyMatchPlayed: false,
  });
  const brackets = { ...base.continental.brackets };
  regions.forEach((r, ri) => {
    const champ: Team = { id: `${r}-champ`, name: `${r} C`, flag: '🏳️', region: r, skill: 90 - ri };
    const runner: Team = { id: `${r}-runner`, name: `${r} R`, flag: '🏳️', region: r, skill: 80 - ri };
    teams.push(champ, runner);
    brackets[r] = { ...brackets[r], championId: champ.id, runnerUpId: runner.id };
  });
  const cycle: Cycle = {
    ...base,
    continental: { brackets, isComplete: true },
    calendar: { phase: 'continental', matchday: 6 },
  };
  return { cycle, teams };
}

// Juega todos los partidos de grupo confed de la jornada actual (home gana).
function playConfedGroupMatchday(cycle: Cycle, teams: Team[]): Cycle {
  const md = cycle.calendar.matchday;
  const matches = cycle.confederationsCup.groups
    .flatMap((g) => g.matches)
    .filter((m) => (m.matchday ?? 0) === md && !m.isPlayed);
  let next = cycle;
  for (const m of matches) {
    next = recordConfedGroupMatch(next, m.id, { homeScore: 2, awayScore: 0 }, teams);
  }
  return next;
}

describe('cycle: confederaciones', () => {
  it('assembleConfederationFinalists arma 4 finalistas desde los brackets', () => {
    const { cycle } = cycleWithContinentalDone();
    const finalists = assembleConfederationFinalists(cycle);
    expect(finalists).toHaveLength(4);
    expect(new Set(finalists.map((f) => f.region)).size).toBe(4);
    expect(finalists.every((f) => f.championId && f.runnerUpId)).toBe(true);
  });

  it('drawConfederationsStage crea 2 grupos de 4 y pone calendario en confed md1', () => {
    const { cycle, teams } = cycleWithContinentalDone();
    const drawn = drawConfederationsStage(cycle, teams);
    expect(drawn.calendar).toEqual({ phase: 'confed', matchday: 1 });
    expect(drawn.confederationsCup.groups).toHaveLength(2);
    for (const g of drawn.confederationsCup.groups) {
      expect(g.teamIds).toHaveLength(4);
      expect(g.matches).toHaveLength(6); // round-robin 4 equipos
    }
  });

  it('completa grupos (md1-3), genera semis, luego final+3er puesto y corona campeón', () => {
    const { cycle, teams } = cycleWithContinentalDone();
    let c = drawConfederationsStage(cycle, teams);

    c = playConfedGroupMatchday(c, teams); // md1
    expect(c.calendar).toEqual({ phase: 'confed', matchday: 2 });
    c = playConfedGroupMatchday(c, teams); // md2
    c = playConfedGroupMatchday(c, teams); // md3 → genera semis, avanza a md4
    expect(c.calendar).toEqual({ phase: 'confed', matchday: 4 });
    expect(c.confederationsCup.knockout.semiFinals).toHaveLength(2);

    // Jugar las 2 semis (home gana):
    for (const m of c.confederationsCup.knockout.semiFinals.filter((s) => !s.isPlayed)) {
      c = recordConfedKnockoutMatch(c, m.id, {
        homeScore: 1, awayScore: 0, winnerId: m.homeTeamId, loserId: m.awayTeamId,
      });
    }
    expect(c.calendar).toEqual({ phase: 'confed', matchday: 5 });
    expect(c.confederationsCup.knockout.final).not.toBeNull();
    expect(c.confederationsCup.knockout.thirdPlace).not.toBeNull();

    // Jugar final + 3er puesto (md5):
    const final = c.confederationsCup.knockout.final!;
    const third = c.confederationsCup.knockout.thirdPlace!;
    c = recordConfedKnockoutMatch(c, final.id, {
      homeScore: 2, awayScore: 1, winnerId: final.homeTeamId, loserId: final.awayTeamId,
    });
    c = recordConfedKnockoutMatch(c, third.id, {
      homeScore: 1, awayScore: 0, winnerId: third.homeTeamId, loserId: third.awayTeamId,
    });

    expect(c.confederationsCup.isComplete).toBe(true);
    expect(c.confederationsCup.championId).toBe(final.homeTeamId);
    // Boundary: no salta solo a wc-qualifiers.
    expect(c.calendar).toEqual({ phase: 'confed', matchday: 5 });
  });
});

describe('serializeCycleState / reconstructCycle (persistencia)', () => {
  it('serializeCycleState extrae exactamente los 3 campos del ciclo', () => {
    const cycle = toCycle(baseTournament());
    const payload = serializeCycleState(cycle);
    expect(Object.keys(payload).sort()).toEqual(['calendar', 'confederationsCup', 'continental']);
    expect(payload.calendar).toBe(cycle.calendar);
    expect(payload.continental).toBe(cycle.continental);
    expect(payload.confederationsCup).toBe(cycle.confederationsCup);
  });

  it('round-trip: reconstructCycle(base, serialize(cycle)) reproduce los campos de ciclo', () => {
    const { cycle: drawn } = makeDrawnContinentalCycle();
    const payload = JSON.parse(JSON.stringify(serializeCycleState(drawn))) as CycleStatePayload;
    const restored = reconstructCycle(baseTournament(), payload);
    expect(restored.calendar).toEqual(drawn.calendar);
    expect(restored.continental.brackets.Europe.roundOf64.length).toBe(
      drawn.continental.brackets.Europe.roundOf64.length,
    );
    expect(restored.continental.brackets.Europe.roundOf64.length).toBeGreaterThan(0);
  });

  it('legacy (state=null) con Mundial completado → calendar.phase "completed", NO continental', () => {
    const base: Tournament = { ...baseTournament(), worldCup: { champion: 'x' } as unknown as WorldCup };
    const restored = reconstructCycle(base, null);
    expect(restored.calendar.phase).toBe('completed');
    expect(canDrawContinental(restored)).toBe(false);
  });

  it('legacy (state=null) con Mundial en curso → phase "wc-groups", NO continental', () => {
    const base: Tournament = { ...baseTournament(), worldCup: {} as unknown as WorldCup };
    const restored = reconstructCycle(base, null);
    expect(restored.calendar.phase).toBe('wc-groups');
    expect(canDrawContinental(restored)).toBe(false);
  });

  it('legacy (state=null) solo clasificatorias → phase "wc-qualifiers", NO continental', () => {
    const base: Tournament = { ...baseTournament(), worldCup: null };
    const restored = reconstructCycle(base, null);
    expect(restored.calendar.phase).toBe('wc-qualifiers');
    expect(canDrawContinental(restored)).toBe(false);
  });
});
