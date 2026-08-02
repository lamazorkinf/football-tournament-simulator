import { describe, it, expect } from 'vitest';
import type { KnockoutMatch, Match, MatchdayOutcome, Team } from '../../../types';
import type { JornadaGroup, MatchWithContext } from '../../../core/jornada';
import { buildJornadaResults } from '../jornadaResults';

const teams: Team[] = [
  { id: 'arg', name: 'Argentina', flag: '🇦🇷', region: 'America', skill: 90 },
  { id: 'bra', name: 'Brasil', flag: '🇧🇷', region: 'America', skill: 85 },
  { id: 'per', name: 'Perú', flag: '🇵🇪', region: 'America', skill: 70 },
  { id: 'bol', name: 'Bolivia', flag: '🇧🇴', region: 'America', skill: 65 },
];

const match = (id: string, homeTeamId: string, awayTeamId: string, played = false): Match => ({
  id,
  homeTeamId,
  awayTeamId,
  homeScore: played ? 3 : null,
  awayScore: played ? 0 : null,
  isPlayed: played,
  matchday: 1,
});

const ctx = (m: Match): MatchWithContext => ({
  match: m,
  stage: 'qualifier',
  groupId: 'g1',
  groupName: 'Grupo A',
  region: 'America',
  displayJornada: 1,
});

const jornada = (matches: MatchWithContext[]): JornadaGroup => ({
  phase: 'wc-qualifiers',
  jornada: 1,
  label: 'Jornada 1',
  phaseLabel: 'Clasificatorias',
  matches,
  isComplete: false,
});

const outcome = (
  matchId: string,
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
): MatchdayOutcome => ({ matchId, homeTeamId, awayTeamId, homeScore, awayScore });

describe('buildJornadaResults', () => {
  it('marca como favoritos los partidos con algún equipo favorito', () => {
    const j = jornada([ctx(match('m1', 'per', 'bol')), ctx(match('m2', 'arg', 'bra'))]);
    const outcomes = [outcome('m1', 'per', 'bol', 1, 1), outcome('m2', 'arg', 'bra', 2, 0)];

    const results = buildJornadaResults(j, outcomes, teams, new Set(['arg']), new Map());

    expect(results.find((r) => r.homeTeam === 'Perú')?.isFavorite).toBe(false);
    expect(results.find((r) => r.homeTeam === 'Argentina')?.isFavorite).toBe(true);
  });

  it('incluye los partidos ya jugados que no se simularon ahora', () => {
    const j = jornada([ctx(match('m1', 'arg', 'bra', true)), ctx(match('m2', 'per', 'bol'))]);
    const outcomes = [outcome('m2', 'per', 'bol', 1, 0)];

    const results = buildJornadaResults(j, outcomes, teams, new Set(), new Map());

    expect(results).toHaveLength(2);
    expect(results.find((r) => r.homeTeam === 'Argentina')).toMatchObject({
      homeScore: 3,
      awayScore: 0,
    });
  });

  it('omite los partidos sin jugar y sin resultado simulado', () => {
    const j = jornada([ctx(match('m1', 'arg', 'bra')), ctx(match('m2', 'per', 'bol'))]);

    const results = buildJornadaResults(j, [outcome('m1', 'arg', 'bra', 1, 0)], teams, new Set(), new Map());

    expect(results.map((r) => r.homeTeam)).toEqual(['Argentina']);
  });

  it('lleva los penales del partido recién simulado', () => {
    const j = jornada([ctx(match('m1', 'arg', 'bra'))]);
    const outcomes: MatchdayOutcome[] = [
      { ...outcome('m1', 'arg', 'bra', 1, 1), penalties: { homeScore: 4, awayScore: 3 } },
    ];

    const results = buildJornadaResults(j, outcomes, teams, new Set(), new Map());

    expect(results[0].penalties).toEqual({ homeScore: 4, awayScore: 3 });
  });

  it('lleva los penales de un partido de eliminatorias ya jugado', () => {
    const played: KnockoutMatch = {
      ...match('m1', 'arg', 'bra', true),
      homeScore: 1,
      awayScore: 1,
      round: 'semi',
      penalties: { homeScore: 5, awayScore: 4 },
    };
    const j = jornada([{ ...ctx(played), stage: 'knockout' }]);

    const results = buildJornadaResults(j, [], teams, new Set(), new Map());

    expect(results[0].penalties).toEqual({ homeScore: 5, awayScore: 4 });
  });

  it('un partido sin penales no los declara', () => {
    const j = jornada([ctx(match('m1', 'arg', 'bra'))]);

    const results = buildJornadaResults(j, [outcome('m1', 'arg', 'bra', 2, 0)], teams, new Set(), new Map());

    expect(results[0].penalties).toBeUndefined();
  });

  it('lleva los ids de los dos equipos, para poder dibujar sus banderas', () => {
    const j = jornada([ctx(match('m1', 'arg', 'bra'))]);

    const results = buildJornadaResults(j, [outcome('m1', 'arg', 'bra', 1, 0)], teams, new Set(), new Map());

    expect(results[0]).toMatchObject({ homeTeamId: 'arg', awayTeamId: 'bra' });
  });

  it('lleva la región y el grupo de cada partido', () => {
    const j = jornada([ctx(match('m1', 'arg', 'bra'))]);

    const results = buildJornadaResults(j, [outcome('m1', 'arg', 'bra', 1, 0)], teams, new Set(), new Map());

    expect(results[0]).toMatchObject({ region: 'America', groupName: 'Grupo A' });
  });

  it('un partido sin región (Mundial, Confederaciones) no la inventa', () => {
    const j = jornada([{ ...ctx(match('m1', 'arg', 'bra')), stage: 'confederations', region: undefined }]);

    const results = buildJornadaResults(j, [outcome('m1', 'arg', 'bra', 1, 0)], teams, new Set(), new Map());

    expect(results[0].region).toBeUndefined();
  });

  it('estampa el skill previo de cada equipo', () => {
    const m = match('m1', 'arg', 'bra');
    const outcomes: MatchdayOutcome[] = [
      { matchId: 'm1', homeTeamId: 'arg', awayTeamId: 'bra', homeScore: 2, awayScore: 1 },
    ];
    const skillBefore = new Map([['arg', 88], ['bra', 84]]);

    const [res] = buildJornadaResults(jornada([ctx(m)]), outcomes, teams, new Set(), skillBefore);

    // El pool de equipos ya trae los skills NUEVOS (90 y 85): lo que se estampa
    // es el mapa capturado antes de simular.
    expect(res.homeSkillBefore).toBe(88);
    expect(res.awaySkillBefore).toBe(84);
  });

  /**
   * El mapa de skills se captura antes de ESTA tanda, así que para un partido
   * que el usuario ya había simulado suelto desde el Centro de Partidos ese
   * snapshot es POSTERIOR al partido: la brecha que mide el titular ya viene
   * achicada por los dos deltas de Elo. Sin skill confiable, `undefined`, igual
   * que `wentToExtraTime`.
   */
  it('un partido ya jugado no se estampa con skills posteriores', () => {
    const m = match('m1', 'bol', 'bra', true); // simulado suelto antes de la tanda
    const skillBefore = new Map([['bol', 66], ['bra', 84]]);

    const [res] = buildJornadaResults(jornada([ctx(m)]), [], teams, new Set(), skillBefore);

    expect(res.homeSkillBefore).toBeUndefined();
    expect(res.awaySkillBefore).toBeUndefined();
  });

  it('un equipo que no está en el mapa queda sin skill previo', () => {
    const m = match('m1', 'arg', 'bra');
    const outcomes: MatchdayOutcome[] = [
      { matchId: 'm1', homeTeamId: 'arg', awayTeamId: 'bra', homeScore: 2, awayScore: 1 },
    ];

    const [res] = buildJornadaResults(jornada([ctx(m)]), outcomes, teams, new Set(), new Map());

    expect(res.homeSkillBefore).toBeUndefined();
  });

  it('marca el alargue del partido que lo tuvo', () => {
    const m = match('m1', 'arg', 'bra');
    const outcomes: MatchdayOutcome[] = [
      {
        matchId: 'm1',
        homeTeamId: 'arg',
        awayTeamId: 'bra',
        homeScore: 2,
        awayScore: 1,
        extraTime: { homeGoals: 1, awayGoals: 0 },
      },
    ];

    const [res] = buildJornadaResults(jornada([ctx(m)]), outcomes, teams, new Set(), new Map());

    expect(res.wentToExtraTime).toBe(true);
  });
});
