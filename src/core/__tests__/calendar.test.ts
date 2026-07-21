import { describe, it, expect } from 'vitest';
import type { Cycle } from '../../types';
import { getPhaseMatches, getMatchdayMatches } from '../calendar';
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
