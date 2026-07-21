import { describe, it, expect } from 'vitest';
import {
  getContinentalProgress, getConfederationsProgress,
  isContinentalDrawn, isConfederationsDrawn,
  canDrawContinental, canDrawConfederations,
  canAdvanceToQualifiers, canDrawQualifiers,
  continentalRoundLabel, getCyclePhaseBanner,
} from '../cycleProgress';
import { toCycle } from '../../core/cycle';
import {
  baseTournament, makeDrawnContinentalCycle,
  makeContinentalDoneCycle, makeDrawnConfedCycle,
} from '../../test/fixtures/cycle';

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
