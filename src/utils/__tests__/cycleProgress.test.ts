import { describe, it, expect } from 'vitest';
import {
  getContinentalProgress, getConfederationsProgress,
  isContinentalDrawn, isConfederationsDrawn,
  canDrawContinental, canDrawConfederations,
  canAdvanceToQualifiers, canDrawQualifiers,
  continentalRoundLabel, getCyclePhaseBanner,
  isQualifiersDrawn, getQualifiersDrawStatus,
} from '../cycleProgress';
import { toCycle } from '../../core/cycle';
import {
  baseTournament, makeDrawnContinentalCycle,
  makeContinentalDoneCycle, makeDrawnConfedCycle,
} from '../../test/fixtures/cycle';
import type { Group, Match, Region } from '../../types';

describe('cycleProgress', () => {
  it('ciclo nuevo: continental sin sortear', () => {
    const cycle = toCycle(baseTournament());
    expect(isContinentalDrawn(cycle)).toBe(false);
    expect(canDrawContinental(cycle)).toBe(true);
    expect(getContinentalProgress(cycle)).toMatchObject({ totalMatches: 0, percentage: 0, isComplete: false });
  });

  it('tras sortear continental hay partidos y no se puede re-sortear', () => {
    const { cycle } = makeDrawnContinentalCycle();
    expect(isContinentalDrawn(cycle)).toBe(true);
    expect(canDrawContinental(cycle)).toBe(false);
    const p = getContinentalProgress(cycle);
    expect(p.totalMatches).toBeGreaterThan(0);
    expect(p.playedMatches).toBe(0);
  });

  it('continental completo habilita sortear confederaciones', () => {
    const { cycle } = makeContinentalDoneCycle();
    expect(getContinentalProgress(cycle).isComplete).toBe(true);
    expect(canDrawConfederations(cycle)).toBe(true);
    expect(isConfederationsDrawn(cycle)).toBe(false);
  });

  it('confederaciones sorteadas: no re-sortea, progreso desde 0', () => {
    const { cycle } = makeDrawnConfedCycle();
    expect(isConfederationsDrawn(cycle)).toBe(true);
    expect(canDrawConfederations(cycle)).toBe(false);
    expect(getConfederationsProgress(cycle).totalMatches).toBeGreaterThan(0);
  });

  it('gates de clasificatorias según fase', () => {
    const { cycle } = makeDrawnConfedCycle();
    expect(canAdvanceToQualifiers(cycle)).toBe(false); // confed no completo
    const done = { ...cycle, confederationsCup: { ...cycle.confederationsCup, isComplete: true } };
    expect(canAdvanceToQualifiers(done)).toBe(true);
    const inQuali = { ...done, calendar: { phase: 'wc-qualifiers' as const, matchday: 1 } };
    expect(canAdvanceToQualifiers(inQuali)).toBe(false);
    expect(canDrawQualifiers(inQuali)).toBe(true);
  });

  it('labels y banner de fase', () => {
    expect(continentalRoundLabel(1)).toBe('R64');
    expect(continentalRoundLabel(6)).toBe('Final');
    const { cycle } = makeDrawnContinentalCycle();
    expect(getCyclePhaseBanner(cycle)).toEqual({ label: 'Torneos Continentales · R64', targetView: 'continental' });
    expect(getCyclePhaseBanner(toCycle(baseTournament()))).toEqual({ label: 'Torneos Continentales · —', targetView: 'continental' });
  });
});

/** Grupo de clasificatorias armado a mano: `matches` en 0 = sorteado a medias. */
function makeGroup(
  id: string,
  region: Region,
  opts: { teams?: number; matches?: number } = {}
): Group {
  const teamCount = opts.teams ?? 5;
  const teamIds = Array.from({ length: teamCount }, (_, i) => `${id}-t${i}`);
  const matches: Match[] = Array.from({ length: opts.matches ?? 0 }, (_, i) => ({
    id: `${id}-m${i}`,
    homeTeamId: teamIds[0],
    awayTeamId: teamIds[1] ?? teamIds[0],
    homeScore: null,
    awayScore: null,
    isPlayed: false,
    stage: 'qualifier',
    matchday: i + 1,
  }));
  return {
    id,
    name: `Group ${id}`,
    region,
    teamIds,
    matches,
    standings: [],
    isDrawComplete: matches.length > 0,
  };
}

/** Ciclo con las cuatro regiones pobladas por la función que se le pase. */
function cycleWithQualifiers(build: (region: Region) => Group[]) {
  return {
    ...toCycle(baseTournament()),
    qualifiers: {
      Europe: build('Europe'),
      America: build('America'),
      Africa: build('Africa'),
      Asia: build('Asia'),
    },
  };
}

describe('isQualifiersDrawn / getQualifiersDrawStatus', () => {
  it('ciclo nuevo: sin sortear', () => {
    const cycle = toCycle(baseTournament());
    expect(isQualifiersDrawn(cycle)).toBe(false);
    expect(getQualifiersDrawStatus(cycle)).toEqual({ state: 'not-drawn' });
  });

  it('grupos creados pero sin partidos: sigue sin sortear', () => {
    const cycle = cycleWithQualifiers((r) => [makeGroup(`${r}-1`, r, { teams: 0 })]);
    expect(isQualifiersDrawn(cycle)).toBe(false);
    expect(getQualifiersDrawStatus(cycle)).toEqual({ state: 'not-drawn' });
  });

  it('todas las regiones con partidos: sorteado', () => {
    const cycle = cycleWithQualifiers((r) => [
      makeGroup(`${r}-1`, r, { matches: 20 }),
      makeGroup(`${r}-2`, r, { matches: 20 }),
    ]);
    expect(isQualifiersDrawn(cycle)).toBe(true);
    expect(getQualifiersDrawStatus(cycle)).toEqual({ state: 'drawn' });
  });

  it('un grupo sin partidos entre otros sorteados: parcial', () => {
    const cycle = cycleWithQualifiers((r) => [
      makeGroup(`${r}-1`, r, { matches: 20 }),
      makeGroup(`${r}-2`, r, { matches: r === 'Asia' ? 0 : 20 }),
    ]);
    expect(isQualifiersDrawn(cycle)).toBe(true);
    expect(getQualifiersDrawStatus(cycle)).toEqual({
      state: 'partial',
      groupsMissing: 1,
      totalGroups: 8,
      regionsMissing: 0,
    });
  });

  it('una región entera sin grupos: parcial', () => {
    const cycle = cycleWithQualifiers((r) =>
      r === 'Africa' ? [] : [makeGroup(`${r}-1`, r, { matches: 20 })]
    );
    expect(getQualifiersDrawStatus(cycle)).toEqual({
      state: 'partial',
      groupsMissing: 0,
      totalGroups: 3,
      regionsMissing: 1,
    });
  });

  it('un grupo sorteado sin equipos no cuenta como sano', () => {
    const cycle = cycleWithQualifiers((r) => [
      makeGroup(`${r}-1`, r, { matches: 20 }),
      makeGroup(`${r}-2`, r, { teams: 0, matches: 20 }),
    ]);
    expect(getQualifiersDrawStatus(cycle)).toMatchObject({
      state: 'partial',
      groupsMissing: 4,
    });
  });
});
