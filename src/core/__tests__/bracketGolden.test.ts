import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  generateRoundOf32,
  generateRoundOf16,
  generateQuarterFinals,
  generateSemiFinals,
  generateThirdPlaceMatch,
  generateFinal,
} from '../knockout';
import {
  generateContinentalBracket,
  generateContinentalRoundOf32,
  generateContinentalRoundOf16,
  generateContinentalQuarterFinals,
  generateContinentalSemiFinals,
  generateContinentalFinal,
  generateContinentalThirdPlace,
} from '../continental';
import {
  generateConfederationsSemiFinals,
  generateConfederationsFinal,
  generateConfederationsThirdPlace,
} from '../confederations';
import {
  makeTeams,
  makeWorldCupGroups,
  makeWorldCupTeams,
  resolveAllHomeWins,
  seededRandom,
  shapeOf,
  shapesOf,
  type TieShape,
} from './bracketGolden.fixtures';
import type { KnockoutMatch, WorldCupGroup } from '../../types';

vi.mock('../../lib/persistSettings', () => ({
  queueSettingsSave: vi.fn(),
  flushSettingsSave: vi.fn(),
}));

/**
 * FIXTURES DORADOS DE LOS CUADROS.
 *
 * Capturados contra el código previo a la unificación de formatos. Son el
 * criterio de aceptación del refactor: la primitiva única de eliminación
 * (core/formats/bracket.ts) tiene que reproducir estos cuadros EXACTAMENTE.
 *
 * Por qué importa tanto: los cuatro "avanzar de ronda" del repo NO son la misma
 * lógica. El Mundial empareja R32 (0,1)(8,9)(2,3)… y R16 (0,4)(2,6)(1,5)(3,7)
 * para que dos equipos del mismo grupo no se reencuentren antes de la final; el
 * continental y la copa sí son adyacencia; la Copa Confederaciones es un cruce
 * entre grupos. Una primitiva sólo-adyacencia reescribiría el cuadro del Mundial
 * en silencio. Y como `position` se persiste, renumerar corrompe torneos vivos.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Mundial: 16 grupos → R32 → R16 → cuartos → semis → 3º y final
// ---------------------------------------------------------------------------

function playWorldCup(groups: WorldCupGroup[]) {
  const teams = makeWorldCupTeams();
  const r32 = resolveAllHomeWins(generateRoundOf32(groups, teams));
  const r16 = resolveAllHomeWins(generateRoundOf16(r32));
  const qf = resolveAllHomeWins(generateQuarterFinals(r16));
  const sf = resolveAllHomeWins(generateSemiFinals(qf));
  return {
    r32,
    r16,
    qf,
    sf,
    third: generateThirdPlaceMatch(sf),
    final: generateFinal(sf),
  };
}

describe('dorado · cuadro del Mundial', () => {
  const wc = playWorldCup(makeWorldCupGroups());

  it('R32: los 16 cruces 1º-vs-2º de grupo distinto, en su posición', () => {
    expect(shapesOf(wc.r32)).toEqual<TieShape[]>([
      { round: 'round-of-32', position: 0, home: 'A1', away: 'B2', matchday: null },
      { round: 'round-of-32', position: 1, home: 'C1', away: 'D2', matchday: null },
      { round: 'round-of-32', position: 2, home: 'E1', away: 'F2', matchday: null },
      { round: 'round-of-32', position: 3, home: 'G1', away: 'H2', matchday: null },
      { round: 'round-of-32', position: 4, home: 'I1', away: 'J2', matchday: null },
      { round: 'round-of-32', position: 5, home: 'K1', away: 'L2', matchday: null },
      { round: 'round-of-32', position: 6, home: 'M1', away: 'N2', matchday: null },
      { round: 'round-of-32', position: 7, home: 'O1', away: 'P2', matchday: null },
      { round: 'round-of-32', position: 8, home: 'B1', away: 'A2', matchday: null },
      { round: 'round-of-32', position: 9, home: 'D1', away: 'C2', matchday: null },
      { round: 'round-of-32', position: 10, home: 'F1', away: 'E2', matchday: null },
      { round: 'round-of-32', position: 11, home: 'H1', away: 'G2', matchday: null },
      { round: 'round-of-32', position: 12, home: 'J1', away: 'I2', matchday: null },
      { round: 'round-of-32', position: 13, home: 'L1', away: 'K2', matchday: null },
      { round: 'round-of-32', position: 14, home: 'N1', away: 'M2', matchday: null },
      { round: 'round-of-32', position: 15, home: 'P1', away: 'O2', matchday: null },
    ]);
  });

  it('R16: pares de grupos disjuntos, y i / i+8 en mitades opuestas', () => {
    expect(shapesOf(wc.r16)).toEqual<TieShape[]>([
      { round: 'round-of-16', position: 0, home: 'A1', away: 'C1', matchday: null },
      { round: 'round-of-16', position: 1, home: 'B1', away: 'D1', matchday: null },
      { round: 'round-of-16', position: 2, home: 'E1', away: 'G1', matchday: null },
      { round: 'round-of-16', position: 3, home: 'F1', away: 'H1', matchday: null },
      { round: 'round-of-16', position: 4, home: 'I1', away: 'K1', matchday: null },
      { round: 'round-of-16', position: 5, home: 'J1', away: 'L1', matchday: null },
      { round: 'round-of-16', position: 6, home: 'M1', away: 'O1', matchday: null },
      { round: 'round-of-16', position: 7, home: 'N1', away: 'P1', matchday: null },
    ]);
  });

  it('cuartos: (0,4) (2,6) (1,5) (3,7) — NO adyacencia', () => {
    expect(shapesOf(wc.qf)).toEqual<TieShape[]>([
      { round: 'quarter', position: 0, home: 'A1', away: 'I1', matchday: null },
      { round: 'quarter', position: 1, home: 'E1', away: 'M1', matchday: null },
      { round: 'quarter', position: 2, home: 'B1', away: 'J1', matchday: null },
      { round: 'quarter', position: 3, home: 'F1', away: 'N1', matchday: null },
    ]);
  });

  it('semis, 3er puesto y final', () => {
    expect(shapesOf(wc.sf)).toEqual<TieShape[]>([
      { round: 'semi', position: 0, home: 'A1', away: 'E1', matchday: null },
      { round: 'semi', position: 1, home: 'B1', away: 'F1', matchday: null },
    ]);
    expect(shapeOf(wc.third!)).toEqual<TieShape>({
      round: 'third-place', position: null, home: 'E1', away: 'F1', matchday: null,
    });
    expect(shapeOf(wc.final!)).toEqual<TieShape>({
      round: 'final', position: null, home: 'A1', away: 'B1', matchday: null,
    });
  });

  it('los partidos de knockout del Mundial NO llevan matchday', () => {
    // Continental y confed sí lo llevan. Estampárselo al Mundial haría que
    // getPhaseMatchdayCount(cycle, 'wc-knockout') deje de dar 0 y el cuadro
    // quedaría bloqueado por calendario.
    const all = [...wc.r32, ...wc.r16, ...wc.qf, ...wc.sf, wc.third!, wc.final!];
    expect(all.every((m) => m.matchday === undefined)).toBe(true);
  });

  it('dos equipos del mismo grupo sólo pueden reencontrarse en la final', () => {
    // Propiedad estructural del cuadro FIFA: la posición i y la i+8 de R32
    // salen de los MISMOS dos grupos, y van a mitades opuestas.
    const groupOf = (id: string) => id[0];
    for (const round of [wc.r16, wc.qf, wc.sf]) {
      for (const m of round) {
        expect(groupOf(m.homeTeamId)).not.toBe(groupOf(m.awayTeamId));
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Continental: 55 equipos → 9 byes + 23 cruces en R64 → R32 (re-siembra) → …
// ---------------------------------------------------------------------------

describe('dorado · cuadro continental', () => {
  function playContinental(teamCount: number, seed: number) {
    vi.spyOn(Math, 'random').mockImplementation(seededRandom(seed));
    const teams = makeTeams(teamCount);
    const bracket = generateContinentalBracket('Europe', teams);
    const r64 = resolveAllHomeWins(bracket.roundOf64);
    const r32 = resolveAllHomeWins(
      generateContinentalRoundOf32({ ...bracket, roundOf64: r64 }),
    );
    const r16 = resolveAllHomeWins(generateContinentalRoundOf16(r32));
    const qf = resolveAllHomeWins(generateContinentalQuarterFinals(r16));
    const sf = resolveAllHomeWins(generateContinentalSemiFinals(qf));
    return {
      bracket,
      r64,
      r32,
      r16,
      qf,
      sf,
      third: generateContinentalThirdPlace(sf),
      final: generateContinentalFinal(sf),
    };
  }

  it('55 equipos: 9 byes (los de mayor skill) y 23 cruces en R64', () => {
    const c = playContinental(55, 12345);
    expect(c.bracket.byeTeamIds).toEqual([
      'T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09',
    ]);
    expect(c.r64).toHaveLength(23);
    // Bombo alto de local: los 23 siguientes por skill, en orden.
    expect(c.r64.map((m) => m.homeTeamId)).toEqual([
      'T10', 'T11', 'T12', 'T13', 'T14', 'T15', 'T16', 'T17', 'T18', 'T19', 'T20', 'T21',
      'T22', 'T23', 'T24', 'T25', 'T26', 'T27', 'T28', 'T29', 'T30', 'T31', 'T32',
    ]);
    // El bombo bajo se baraja: cada visitante sale de los últimos 23.
    const bottom = new Set(Array.from({ length: 23 }, (_, i) => `T${33 + i}`));
    expect(c.r64.every((m) => bottom.has(m.awayTeamId))).toBe(true);
    expect(c.r64.every((m, i) => m.position === i && m.matchday === 1)).toBe(true);
  });

  it('R32 re-siembra byes + ganadores por seedSlots(32): 16 cruces, jornada 2', () => {
    const c = playContinental(55, 12345);
    expect(c.r32).toHaveLength(16);
    expect(c.r32.every((m, i) => m.position === i && m.matchday === 2)).toBe(true);
    // Con byes = las 9 mejores semillas y ganadores = los 23 locales, los
    // ocupantes son T01..T32 y seedSlots(32) los cruza 1-32, 16-17, 8-25, …
    expect(shapesOf(c.r32)).toEqual<TieShape[]>([
      { round: 'round-of-32', position: 0, home: 'T01', away: 'T32', matchday: 2 },
      { round: 'round-of-32', position: 1, home: 'T16', away: 'T17', matchday: 2 },
      { round: 'round-of-32', position: 2, home: 'T08', away: 'T25', matchday: 2 },
      { round: 'round-of-32', position: 3, home: 'T09', away: 'T24', matchday: 2 },
      { round: 'round-of-32', position: 4, home: 'T04', away: 'T29', matchday: 2 },
      { round: 'round-of-32', position: 5, home: 'T13', away: 'T20', matchday: 2 },
      { round: 'round-of-32', position: 6, home: 'T05', away: 'T28', matchday: 2 },
      { round: 'round-of-32', position: 7, home: 'T12', away: 'T21', matchday: 2 },
      { round: 'round-of-32', position: 8, home: 'T02', away: 'T31', matchday: 2 },
      { round: 'round-of-32', position: 9, home: 'T15', away: 'T18', matchday: 2 },
      { round: 'round-of-32', position: 10, home: 'T07', away: 'T26', matchday: 2 },
      { round: 'round-of-32', position: 11, home: 'T10', away: 'T23', matchday: 2 },
      { round: 'round-of-32', position: 12, home: 'T03', away: 'T30', matchday: 2 },
      { round: 'round-of-32', position: 13, home: 'T14', away: 'T19', matchday: 2 },
      { round: 'round-of-32', position: 14, home: 'T06', away: 'T27', matchday: 2 },
      { round: 'round-of-32', position: 15, home: 'T11', away: 'T22', matchday: 2 },
    ]);
  });

  it('R16 en adelante es adyacencia pura, con jornadas 3-6', () => {
    const c = playContinental(55, 12345);
    expect(shapesOf(c.r16)).toEqual<TieShape[]>([
      { round: 'round-of-16', position: 0, home: 'T01', away: 'T16', matchday: 3 },
      { round: 'round-of-16', position: 1, home: 'T08', away: 'T09', matchday: 3 },
      { round: 'round-of-16', position: 2, home: 'T04', away: 'T13', matchday: 3 },
      { round: 'round-of-16', position: 3, home: 'T05', away: 'T12', matchday: 3 },
      { round: 'round-of-16', position: 4, home: 'T02', away: 'T15', matchday: 3 },
      { round: 'round-of-16', position: 5, home: 'T07', away: 'T10', matchday: 3 },
      { round: 'round-of-16', position: 6, home: 'T03', away: 'T14', matchday: 3 },
      { round: 'round-of-16', position: 7, home: 'T06', away: 'T11', matchday: 3 },
    ]);
    expect(shapesOf(c.qf)).toEqual<TieShape[]>([
      { round: 'quarter', position: 0, home: 'T01', away: 'T08', matchday: 4 },
      { round: 'quarter', position: 1, home: 'T04', away: 'T05', matchday: 4 },
      { round: 'quarter', position: 2, home: 'T02', away: 'T07', matchday: 4 },
      { round: 'quarter', position: 3, home: 'T03', away: 'T06', matchday: 4 },
    ]);
    expect(shapesOf(c.sf)).toEqual<TieShape[]>([
      { round: 'semi', position: 0, home: 'T01', away: 'T04', matchday: 5 },
      { round: 'semi', position: 1, home: 'T02', away: 'T03', matchday: 5 },
    ]);
    expect(shapeOf(c.final!)).toEqual<TieShape>({
      round: 'final', position: 0, home: 'T01', away: 'T02', matchday: 6,
    });
    expect(shapeOf(c.third!)).toEqual<TieShape>({
      round: 'third-place', position: 0, home: 'T04', away: 'T03', matchday: 6,
    });
  });

  it('64 equipos: sin byes, 32 cruces en R64', () => {
    const c = playContinental(64, 777);
    expect(c.bracket.byeTeamIds).toEqual([]);
    expect(c.r64).toHaveLength(32);
    expect(c.r32).toHaveLength(16);
  });

  it('cada equipo aparece a lo sumo una vez por ronda', () => {
    const c = playContinental(55, 999);
    for (const round of [c.r64, c.r32, c.r16, c.qf, c.sf]) {
      const ids = round.flatMap((m) => [m.homeTeamId, m.awayTeamId]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

// ---------------------------------------------------------------------------
// Copa Confederaciones: 2 grupos → semis cruzadas → 3º y final
// ---------------------------------------------------------------------------

describe('dorado · Copa Confederaciones', () => {
  function confedGroups(): WorldCupGroup[] {
    const mk = (letter: string): WorldCupGroup => {
      const teamIds = Array.from({ length: 4 }, (_, i) => `${letter}${i + 1}`);
      return {
        id: `confed-${letter}`,
        name: `Group ${letter}`,
        teamIds,
        // Un partido jugado alcanza: el generador sólo exige que TODOS lo estén.
        matches: [
          {
            id: `${letter}-m1`,
            homeTeamId: teamIds[0],
            awayTeamId: teamIds[1],
            homeScore: 1,
            awayScore: 0,
            isPlayed: true,
            stage: 'confed-group',
          },
        ],
        standings: teamIds.map((teamId, i) => ({
          teamId,
          played: 3,
          won: 3 - i,
          drawn: 0,
          lost: i,
          goalsFor: 9 - i,
          goalsAgainst: i,
          goalDifference: 9 - 2 * i,
          points: (3 - i) * 3,
        })),
      };
    };
    return [mk('A'), mk('B')];
  }

  it('semis 1ºA-2ºB y 1ºB-2ºA en jornada 4; final y 3er puesto en la 5', () => {
    const groups = confedGroups();
    const teams = groups.flatMap((g) =>
      g.teamIds.map((id, i) => ({ id, name: id, flag: '🏳️', skill: 90 - i })),
    );
    const sf = resolveAllHomeWins(generateConfederationsSemiFinals(groups, teams));

    expect(shapesOf(sf)).toEqual<TieShape[]>([
      { round: 'semi', position: 0, home: 'A1', away: 'B2', matchday: 4 },
      { round: 'semi', position: 1, home: 'B1', away: 'A2', matchday: 4 },
    ]);
    expect(shapeOf(generateConfederationsFinal(sf)!)).toEqual<TieShape>({
      round: 'final', position: 0, home: 'A1', away: 'B1', matchday: 5,
    });
    expect(shapeOf(generateConfederationsThirdPlace(sf)!)).toEqual<TieShape>({
      round: 'third-place', position: 0, home: 'B2', away: 'A2', matchday: 5,
    });
  });
});

// ---------------------------------------------------------------------------
// Guardas de forma que valen para cualquier cuadro
// ---------------------------------------------------------------------------

describe('dorado · invariantes de cualquier cuadro', () => {
  it('una ronda incompleta no genera la siguiente', () => {
    const partial: KnockoutMatch[] = [
      {
        id: 'a', homeTeamId: 'X', awayTeamId: 'Y', homeScore: null, awayScore: null,
        isPlayed: false, stage: 'continental', round: 'semi', position: 0,
      },
      {
        id: 'b', homeTeamId: 'Z', awayTeamId: 'W', homeScore: 1, awayScore: 0,
        isPlayed: true, stage: 'continental', round: 'semi', position: 1, winnerId: 'Z',
      },
    ];
    expect(generateContinentalFinal(partial)).toBeNull();
    expect(generateContinentalThirdPlace(partial)).toBeNull();
    expect(generateFinal(partial)).toBeNull();
    expect(generateThirdPlaceMatch(partial)).toBeNull();
  });

  it('el Mundial exige 16 grupos exactos', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(generateRoundOf32(makeWorldCupGroups().slice(0, 8), makeWorldCupTeams())).toEqual([]);
  });
});
