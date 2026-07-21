import { describe, it, expect } from 'vitest';
import {
  createInitialCalendar,
  createEmptyContinentalStage,
  createEmptyConfederationsCup,
  toCycle,
  ensureCycleFields,
} from '../cycle';
import type { Tournament, Region } from '../../types';

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
