import { describe, it, expect } from 'vitest';
import { makeCycle, makeEmptyBracket, REGIONS } from './calendar.fixtures';

describe('calendar fixtures', () => {
  it('makeCycle arranca en la fase continental, jornada 1', () => {
    const cycle = makeCycle();
    expect(cycle.calendar).toEqual({ phase: 'continental', matchday: 1 });
    expect(Object.keys(cycle.continental.brackets)).toHaveLength(4);
    expect(cycle.confederationsCup.groups).toEqual([]);
    expect(cycle.worldCup).toBeNull();
  });

  it('makeEmptyBracket crea un bracket vacío para la región dada', () => {
    const b = makeEmptyBracket('Europe');
    expect(b.region).toBe('Europe');
    expect(b.roundOf64).toEqual([]);
    expect(b.final).toBeNull();
    expect(b.byeTeamIds).toEqual([]);
  });

  it('REGIONS tiene las 4 confederaciones', () => {
    expect(REGIONS).toEqual(['Europe', 'America', 'Africa', 'Asia']);
  });
});
