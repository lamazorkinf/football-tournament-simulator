import { describe, it, expect } from 'vitest';
import type { CalendarState, Cycle, CyclePhase } from '../../types';
import { getPhaseMatches, getMatchdayMatches, getPlayableMatches, isMatchPlayable, getPhaseMatchdayCount, isCurrentMatchdayComplete, getNextCalendarState, phaseYear } from '../calendar';
import {
  makeCycle,
  makeContinentalStage,
  makeEmptyBracket,
  makeKnockoutMatch,
  makeMatch,
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

describe('getPhaseMatches — otras fases con datos', () => {
  it('confed: junta partidos de grupos + semis + 3er puesto + final', () => {
    const cycle = makeCycle({
      confederationsCup: {
        groups: [
          {
            id: 'cf-A',
            name: 'Group A',
            teamIds: [],
            matches: [makeMatch('cf-g1', 1, false, 'confed-group')],
            standings: [],
          },
        ],
        knockout: {
          semiFinals: [makeKnockoutMatch('cf-sf1', 'semi', 4, false, 'confed-knockout')],
          thirdPlace: makeKnockoutMatch('cf-3p', 'third-place', 5, false, 'confed-knockout'),
          final: makeKnockoutMatch('cf-final', 'final', 5, false, 'confed-knockout'),
        },
        isComplete: false,
      },
    });
    expect(getPhaseMatches(cycle, 'confed').map((m) => m.id).sort()).toEqual([
      'cf-3p',
      'cf-final',
      'cf-g1',
      'cf-sf1',
    ]);
  });

  it('wc-qualifiers: junta los partidos de los grupos de todas las regiones', () => {
    const cycle = makeCycle({
      qualifiers: {
        Europe: [
          {
            id: 'q-eu',
            name: 'Group A',
            region: 'Europe',
            teamIds: [],
            matches: [
              makeMatch('q-1', 1, false, 'qualifier'),
              makeMatch('q-2', 2, false, 'qualifier'),
            ],
            standings: [],
          },
        ],
        America: [],
        Africa: [],
        Asia: [],
      },
    });
    expect(getPhaseMatches(cycle, 'wc-qualifiers').map((m) => m.id).sort()).toEqual(['q-1', 'q-2']);
  });

  it('wc-groups: junta los partidos de los grupos del Mundial', () => {
    const cycle = makeCycle({
      worldCup: {
        groups: [
          {
            id: 'wc-A',
            name: 'Group A',
            teamIds: [],
            matches: [makeMatch('wg-1', 1, false, 'world-cup-group')],
            standings: [],
          },
        ],
        knockout: {
          roundOf32: [],
          roundOf16: [],
          quarterFinals: [],
          semiFinals: [],
          thirdPlace: null,
          final: null,
        },
        qualifiedTeamIds: [],
      },
    });
    expect(getPhaseMatches(cycle, 'wc-groups').map((m) => m.id)).toEqual(['wg-1']);
  });

  it('wc-knockout: junta las rondas del knockout del Mundial', () => {
    const cycle = makeCycle({
      worldCup: {
        groups: [],
        knockout: {
          roundOf32: [makeKnockoutMatch('k-r32', 'round-of-32', 1, false, 'world-cup-knockout')],
          roundOf16: [],
          quarterFinals: [],
          semiFinals: [],
          thirdPlace: null,
          final: makeKnockoutMatch('k-final', 'final', 5, false, 'world-cup-knockout'),
        },
        qualifiedTeamIds: [],
      },
    });
    expect(getPhaseMatches(cycle, 'wc-knockout').map((m) => m.id).sort()).toEqual(['k-final', 'k-r32']);
  });

  it('wc-knockout / wc-groups: [] cuando no hay worldCup', () => {
    expect(getPhaseMatches(makeCycle(), 'wc-knockout')).toEqual([]);
    expect(getPhaseMatches(makeCycle(), 'wc-groups')).toEqual([]);
  });
});

describe('getPlayableMatches / isMatchPlayable', () => {
  it('solo devuelve partidos no jugados de la jornada actual', () => {
    const cycle = continentalCycle();
    const ids = getPlayableMatches(cycle).map((m) => m.id);
    expect(ids).toEqual(['eu-r64-1']);
  });

  it('isMatchPlayable es true solo para partidos de la jornada actual sin jugar', () => {
    const cycle = continentalCycle();
    expect(isMatchPlayable(cycle, 'eu-r64-1')).toBe(true);
    expect(isMatchPlayable(cycle, 'eu-r64-2')).toBe(false);
    expect(isMatchPlayable(cycle, 'eu-r32-1')).toBe(false);
    expect(isMatchPlayable(cycle, 'inexistente')).toBe(false);
  });
});

describe('getPhaseMatchdayCount', () => {
  it('devuelve el mayor número de jornada de la fase', () => {
    const cycle = continentalCycle(); // jornadas 1 y 2
    expect(getPhaseMatchdayCount(cycle, 'continental')).toBe(2);
  });

  it('devuelve 0 para una fase sin partidos', () => {
    expect(getPhaseMatchdayCount(makeCycle(), 'wc-groups')).toBe(0);
  });
});

describe('isCurrentMatchdayComplete', () => {
  it('es false si algún partido de la jornada actual sigue sin jugar', () => {
    const cycle = continentalCycle(); // eu-r64-1 sin jugar
    expect(isCurrentMatchdayComplete(cycle)).toBe(false);
  });

  it('es true cuando todos los partidos de la jornada actual están jugados', () => {
    const europe = makeEmptyBracket('Europe');
    europe.roundOf64 = [
      makeKnockoutMatch('eu-r64-1', 'round-of-64', 1, true),
      makeKnockoutMatch('eu-r64-2', 'round-of-64', 1, true),
    ];
    const cycle = makeCycle({ continental: makeContinentalStage({ Europe: europe }) });
    expect(isCurrentMatchdayComplete(cycle)).toBe(true);
  });

  it('es false si la jornada actual no tiene partidos', () => {
    expect(isCurrentMatchdayComplete(makeCycle())).toBe(false);
  });
});

describe('getNextCalendarState', () => {
  it('avanza de jornada dentro de la misma fase', () => {
    const cycle = continentalCycle(); // continental, matchday 1, count 2
    expect(getNextCalendarState(cycle)).toEqual({ phase: 'continental', matchday: 2 });
  });

  it('al terminar la última jornada pasa a la fase siguiente en jornada 1', () => {
    const cycle = { ...continentalCycle(), calendar: { phase: 'continental' as const, matchday: 2 } };
    expect(getNextCalendarState(cycle)).toEqual({ phase: 'confed', matchday: 1 });
  });

  it('desde wc-knockout (última jornada) pasa a completed', () => {
    const cycle = makeCycle({ calendar: { phase: 'wc-knockout', matchday: 1 } });
    // sin partidos en wc-knockout → count 0 → se considera terminada
    expect(getNextCalendarState(cycle)).toEqual({ phase: 'completed', matchday: 0 });
  });

  it('completed es idempotente', () => {
    const cycle = makeCycle({ calendar: { phase: 'completed', matchday: 0 } });
    expect(getNextCalendarState(cycle)).toEqual({ phase: 'completed', matchday: 0 });
  });
});

describe('getNextCalendarState — todos los bordes de fase', () => {
  // Con fases vacías (count 0) y matchday 1, cada fase se considera terminada
  // y el planificador salta a la siguiente: esto fija el orden de CYCLE_PHASE_ORDER.
  const boundaries: Array<[CyclePhase, CalendarState]> = [
    ['continental', { phase: 'confed', matchday: 1 }],
    ['confed', { phase: 'wc-qualifiers', matchday: 1 }],
    ['wc-qualifiers', { phase: 'wc-groups', matchday: 1 }],
    ['wc-groups', { phase: 'wc-knockout', matchday: 1 }],
    ['wc-knockout', { phase: 'completed', matchday: 0 }],
  ];

  it.each(boundaries)('desde %s salta a la fase siguiente', (from, expected) => {
    const cycle = makeCycle({ calendar: { phase: from, matchday: 1 } });
    expect(getNextCalendarState(cycle)).toEqual(expected);
  });
});

describe('phaseYear — cada fase en su año', () => {
  it('ancla el Mundial en el año del ciclo y las fases previas antes', () => {
    // Mundial 2026: continental 2023, confed 2024, eliminatorias 2025, mundial 2026.
    expect(phaseYear('continental', 2026)).toBe(2023);
    expect(phaseYear('confed', 2026)).toBe(2024);
    expect(phaseYear('wc-qualifiers', 2026)).toBe(2025);
    expect(phaseYear('wc-groups', 2026)).toBe(2026);
    expect(phaseYear('wc-knockout', 2026)).toBe(2026);
    expect(phaseYear('completed', 2026)).toBe(2026);
  });

  it('funciona para otro ciclo (2030)', () => {
    expect(phaseYear('continental', 2030)).toBe(2027);
    expect(phaseYear('wc-groups', 2030)).toBe(2030);
  });
});
