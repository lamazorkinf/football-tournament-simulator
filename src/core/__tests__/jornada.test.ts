import { describe, it, expect } from 'vitest';
import {
  getCurrentJornada,
  getDisplayJornada,
  groupIntoJornadas,
  jornadaLabel,
  qualifierTemplateMatchdays,
  stageToPhase,
  type MatchWithContext,
} from '../jornada';
import { FIXTURE_TEMPLATE } from '../../constants/fixtureTemplate';
import type { KnockoutMatch, Match } from '../../types';

const baseMatch = (over: Partial<Match> = {}): Match => ({
  id: over.id ?? 'm1',
  homeTeamId: 'h',
  awayTeamId: 'a',
  homeScore: null,
  awayScore: null,
  isPlayed: false,
  ...over,
});

const koMatch = (round: KnockoutMatch['round'], over: Partial<KnockoutMatch> = {}): KnockoutMatch => ({
  ...baseMatch(over),
  round,
  ...over,
});

const ctx = (over: Partial<MatchWithContext> & Pick<MatchWithContext, 'match' | 'stage'>): MatchWithContext => ({
  groupId: 'g',
  groupName: 'Grupo A',
  displayJornada: getDisplayJornada(over.stage, over.match),
  ...over,
});

describe('stageToPhase', () => {
  it('mapea cada stage a su fase del ciclo', () => {
    expect(stageToPhase('qualifier')).toBe('wc-qualifiers');
    expect(stageToPhase('world-cup')).toBe('wc-groups');
    expect(stageToPhase('knockout')).toBe('wc-knockout');
    expect(stageToPhase('continental')).toBe('continental');
    expect(stageToPhase('confederations')).toBe('confed');
  });
});

describe('getDisplayJornada', () => {
  it('clasificatorias: empareja matchdays de a dos (20 → 10 jornadas)', () => {
    expect(getDisplayJornada('qualifier', baseMatch({ matchday: 1 }))).toBe(1);
    expect(getDisplayJornada('qualifier', baseMatch({ matchday: 2 }))).toBe(1);
    expect(getDisplayJornada('qualifier', baseMatch({ matchday: 3 }))).toBe(2);
    expect(getDisplayJornada('qualifier', baseMatch({ matchday: 19 }))).toBe(10);
    expect(getDisplayJornada('qualifier', baseMatch({ matchday: 20 }))).toBe(10);
  });

  it('grupos de mundial / continental / confederaciones: usa el matchday estampado', () => {
    expect(getDisplayJornada('world-cup', baseMatch({ matchday: 3 }))).toBe(3);
    expect(getDisplayJornada('continental', koMatch('round-of-64', { matchday: 1 }))).toBe(1);
    expect(getDisplayJornada('continental', koMatch('final', { matchday: 6 }))).toBe(6);
    expect(getDisplayJornada('confederations', baseMatch({ matchday: 2 }))).toBe(2);
    expect(getDisplayJornada('confederations', koMatch('semi', { matchday: 4 }))).toBe(4);
  });

  it('eliminatoria de mundial: deriva la jornada de la ronda (sin matchday)', () => {
    expect(getDisplayJornada('knockout', koMatch('round-of-32'))).toBe(1);
    expect(getDisplayJornada('knockout', koMatch('round-of-16'))).toBe(2);
    expect(getDisplayJornada('knockout', koMatch('quarter'))).toBe(3);
    expect(getDisplayJornada('knockout', koMatch('semi'))).toBe(4);
    expect(getDisplayJornada('knockout', koMatch('third-place'))).toBe(5);
    expect(getDisplayJornada('knockout', koMatch('final'))).toBe(5);
  });

  it('defensivo: sin matchday ni round cae en jornada 1', () => {
    expect(getDisplayJornada('qualifier', baseMatch())).toBe(1);
    expect(getDisplayJornada('world-cup', baseMatch())).toBe(1);
  });
});

describe('qualifierTemplateMatchdays', () => {
  it('devuelve el par de fechas del template que cubre la jornada visual', () => {
    expect(qualifierTemplateMatchdays(1)).toEqual([1, 2]);
    expect(qualifierTemplateMatchdays(5)).toEqual([9, 10]);
    expect(qualifierTemplateMatchdays(10)).toEqual([19, 20]);
  });
});

describe('invariante del template de clasificatorias', () => {
  it('ningún equipo juega dos veces dentro de una jornada visual', () => {
    for (let j = 1; j <= 10; j++) {
      const [md1, md2] = qualifierTemplateMatchdays(j);
      const fixtures = FIXTURE_TEMPLATE.filter((f) => f.matchday === md1 || f.matchday === md2);
      expect(fixtures).toHaveLength(2);
      const letters = fixtures.flatMap((f) => [f.home, f.away]);
      expect(new Set(letters).size).toBe(letters.length);
    }
  });
});

describe('jornadaLabel', () => {
  it('etiqueta rondas eliminatorias y jornadas de grupos', () => {
    expect(jornadaLabel('wc-qualifiers', 3)).toBe('Jornada 3');
    expect(jornadaLabel('wc-groups', 2)).toBe('Jornada 2');
    expect(jornadaLabel('continental', 1)).toBe('R64');
    expect(jornadaLabel('continental', 6)).toBe('Final y 3er puesto');
    expect(jornadaLabel('confed', 2)).toBe('Jornada 2');
    expect(jornadaLabel('confed', 4)).toBe('Semifinales');
    expect(jornadaLabel('wc-knockout', 1)).toBe('R32');
    expect(jornadaLabel('wc-knockout', 5)).toBe('Final y 3er puesto');
  });
});

describe('groupIntoJornadas / getCurrentJornada', () => {
  it('agrupa por (fase, jornada) y ordena según el ciclo', () => {
    const items: MatchWithContext[] = [
      ctx({ match: baseMatch({ id: 'q1', matchday: 1, isPlayed: true }), stage: 'qualifier' }),
      ctx({ match: baseMatch({ id: 'q2', matchday: 2, isPlayed: true }), stage: 'qualifier' }),
      ctx({ match: baseMatch({ id: 'q3', matchday: 3 }), stage: 'qualifier' }),
      ctx({ match: koMatch('round-of-64', { id: 'c1', matchday: 1, isPlayed: true }), stage: 'continental' }),
      ctx({ match: baseMatch({ id: 'cf1', matchday: 1, isPlayed: true }), stage: 'confederations' }),
      ctx({ match: koMatch('quarter', { id: 'k1' }), stage: 'knockout' }),
    ];
    const groups = groupIntoJornadas(items);
    expect(groups.map((g) => `${g.phase}#${g.jornada}`)).toEqual([
      'continental#1',
      'confed#1',
      'wc-qualifiers#1',
      'wc-qualifiers#2',
      'wc-knockout#3',
    ]);
    // Los matchdays 1 y 2 de clasificatorias caen en la misma jornada visual.
    const qualJ1 = groups.find((g) => g.phase === 'wc-qualifiers' && g.jornada === 1)!;
    expect(qualJ1.matches.map((m) => m.match.id)).toEqual(['q1', 'q2']);
    expect(qualJ1.isComplete).toBe(true);
    expect(qualJ1.label).toBe('Jornada 1');
    expect(qualJ1.phaseLabel).toBe('Clasificatorias');
  });

  it('la jornada actual es la primera con partidos sin jugar', () => {
    const items: MatchWithContext[] = [
      ctx({ match: koMatch('round-of-64', { id: 'c1', matchday: 1, isPlayed: true }), stage: 'continental' }),
      ctx({ match: koMatch('round-of-32', { id: 'c2', matchday: 2 }), stage: 'continental' }),
      ctx({ match: baseMatch({ id: 'q1', matchday: 1 }), stage: 'qualifier' }),
    ];
    const current = getCurrentJornada(groupIntoJornadas(items));
    expect(current?.phase).toBe('continental');
    expect(current?.jornada).toBe(2);
  });

  it('una jornada parcialmente jugada sigue siendo la actual', () => {
    const items: MatchWithContext[] = [
      ctx({ match: baseMatch({ id: 'q1', matchday: 1, isPlayed: true }), stage: 'qualifier' }),
      ctx({ match: baseMatch({ id: 'q2', matchday: 2 }), stage: 'qualifier' }),
      ctx({ match: baseMatch({ id: 'q3', matchday: 3 }), stage: 'qualifier' }),
    ];
    const current = getCurrentJornada(groupIntoJornadas(items));
    expect(current?.jornada).toBe(1);
  });

  it('devuelve null cuando todo está jugado', () => {
    const items: MatchWithContext[] = [
      ctx({ match: baseMatch({ id: 'q1', matchday: 1, isPlayed: true }), stage: 'qualifier' }),
    ];
    expect(getCurrentJornada(groupIntoJornadas(items))).toBeNull();
  });
});
