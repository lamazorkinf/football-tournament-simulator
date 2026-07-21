import { describe, it, expect } from 'vitest';
import {
  createInitialCalendar,
  createEmptyContinentalStage,
  createEmptyConfederationsCup,
  toCycle,
  ensureCycleFields,
  drawContinentalStage,
  recordContinentalMatch,
  type KnockoutResult,
} from '../cycle';
import type { Cycle, KnockoutMatch, Region, Team, Tournament } from '../../types';

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
