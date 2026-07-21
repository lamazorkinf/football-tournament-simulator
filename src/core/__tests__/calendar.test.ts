import { describe, it, expect } from 'vitest';
import type { Cycle } from '../../types';
import { getPhaseMatches, getMatchdayMatches } from '../calendar';
import {
  makeCycle,
  makeContinentalStage,
  makeEmptyBracket,
  makeKnockoutMatch,
} from './calendar.fixtures';

function continentalCycle(): Cycle {
  const europe = makeEmptyBracket('Europe');
  europe.roundOf64 = [
    makeKnockoutMatch('eu-r64-1', 'round-of-64', 1),
    makeKnockoutMatch('eu-r64-2', 'round-of-64', 1, true),
  ];
  europe.roundOf32 = [makeKnockoutMatch('eu-r32-1', 'round-of-32', 2)];
  return makeCycle({ continental: makeContinentalStage({ Europe: europe }) });
}

describe('getPhaseMatches', () => {
  it('junta todos los partidos de los brackets continentales', () => {
    const cycle = continentalCycle();
    const ids = getPhaseMatches(cycle, 'continental').map((m) => m.id);
    expect(ids.sort()).toEqual(['eu-r32-1', 'eu-r64-1', 'eu-r64-2']);
  });

  it('devuelve [] para una fase sin datos', () => {
    expect(getPhaseMatches(makeCycle(), 'wc-groups')).toEqual([]);
    expect(getPhaseMatches(makeCycle(), 'completed')).toEqual([]);
  });
});

describe('getMatchdayMatches', () => {
  it('filtra por número de jornada dentro de la fase', () => {
    const cycle = continentalCycle();
    const md1 = getMatchdayMatches(cycle, 'continental', 1).map((m) => m.id);
    const md2 = getMatchdayMatches(cycle, 'continental', 2).map((m) => m.id);
    expect(md1.sort()).toEqual(['eu-r64-1', 'eu-r64-2']);
    expect(md2).toEqual(['eu-r32-1']);
  });
});
