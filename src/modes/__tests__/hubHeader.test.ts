import { describe, it, expect } from 'vitest';
import { deriveHubHeader, type SeasonHeaderInput } from '../hubHeader';
import { toCycle } from '../../core/cycle';
import { baseTournament } from '../../test/fixtures/cycle';
import type { Cycle, KnockoutMatch } from '../../types';
import type { LigaTournament, ModeTournament } from '../../core/formats/modeTournament';

function cycleHeader(cycle: Cycle | null) {
  return deriveHubHeader({
    engine: 'national-cycle',
    cycle,
    season: { status: 'idle', tournaments: [], year: null },
  });
}

function seasonHeader(season: Partial<SeasonHeaderInput> = {}) {
  return deriveHubHeader({
    engine: 'season',
    cycle: null,
    season: { status: 'ready', tournaments: [], year: 2027, ...season },
  });
}

/** Un partido de llave, jugado o no. */
function koMatch(id: string, isPlayed: boolean): KnockoutMatch {
  return {
    id,
    homeTeamId: 'a',
    awayTeamId: 'b',
    homeScore: isPlayed ? 1 : null,
    awayScore: isPlayed ? 0 : null,
    isPlayed,
    round: 'round-of-32',
  };
}

/**
 * Ciclo con el Mundial sorteado: un grupo de un partido (jugado) y la llave en
 * el estado que pida el caller. Las fases previas quedan vacías a propósito, así
 * la cuenta del progreso es legible a mano.
 */
function cycleWithWorldCup(roundOf32: KnockoutMatch[]): Cycle {
  const base = toCycle(baseTournament());
  return {
    ...base,
    calendar: { phase: roundOf32.length > 0 ? 'wc-knockout' : 'wc-groups', matchday: 1 },
    worldCup: {
      groups: [
        {
          id: 'wc-g1',
          name: 'Grupo A',
          teamIds: ['a', 'b'],
          matches: [
            { id: 'wc-m1', homeTeamId: 'a', awayTeamId: 'b', homeScore: 1, awayScore: 0, isPlayed: true },
          ],
          standings: [],
        },
      ],
      knockout: {
        roundOf32,
        roundOf16: [], quarterFinals: [], semiFinals: [], thirdPlace: null, final: null,
      },
      qualifiedTeamIds: [],
    },
  };
}

function liga(id: string, name: string, played: number, total: number): LigaTournament {
  return {
    id,
    modeId: 'villamariense',
    competitionId: id,
    year: 2027,
    name,
    status: 'in-progress',
    division: null,
    format: 'liga',
    state: {
      teamIds: ['a', 'b'],
      legs: 1,
      matches: Array.from({ length: total }, (_, i) => ({
        id: `${id}-m${i}`,
        homeTeamId: 'a',
        awayTeamId: 'b',
        homeScore: i < played ? 1 : null,
        awayScore: i < played ? 0 : null,
        isPlayed: i < played,
        matchday: i + 1,
      })),
      standings: [],
    },
  };
}

describe('deriveHubHeader — ciclo mundialista', () => {
  it('sin ciclo cargado avisa que está cargando', () => {
    expect(cycleHeader(null)).toEqual({
      title: 'Ciclo mundial',
      phaseLabel: 'Cargando…',
      progress: 0,
    });
  });

  it('el título es el año del ciclo y la fase sale del calendario', () => {
    const header = cycleHeader(toCycle(baseTournament()));
    expect(header.title).toBe('Ciclo 2026');
    expect(header.phaseLabel).toBe('Torneos Continentales');
  });

  it('una fase sin rótulo propio (ciclo terminado) cae en "Ciclo completo"', () => {
    const cycle = toCycle(baseTournament());
    expect(
      cycleHeader({ ...cycle, calendar: { phase: 'completed', matchday: 0 } }).phaseLabel,
    ).toBe('Ciclo completo');
  });

  /**
   * El bug que motivó contar los playoffs con un total fijo: con la llave recién
   * generada, todo lo demás jugado y ninguna ronda contada, la barra marcaba
   * 100% al lado del rótulo "Mundial · Playoffs".
   */
  it('durante los playoffs la barra NO marca 100%', () => {
    const header = cycleHeader(cycleWithWorldCup([koMatch('ko-1', false)]));
    expect(header.phaseLabel).toBe('Mundial · Playoffs');
    // 1 partido de grupos jugado sobre 1 de grupos + los 62 de la llave.
    expect(header.progress).toBeCloseTo(1 / 63, 5);
  });

  it('jugar la llave hace avanzar la barra', () => {
    const antes = cycleHeader(cycleWithWorldCup([koMatch('ko-1', false), koMatch('ko-2', false)]));
    const despues = cycleHeader(cycleWithWorldCup([koMatch('ko-1', true), koMatch('ko-2', false)]));
    expect(despues.progress).toBeGreaterThan(antes.progress);
    expect(despues.progress).toBeCloseTo(2 / 63, 5);
  });

  it('sin Mundial sorteado la llave todavía no pesa en la cuenta', () => {
    // Ciclo nuevo: sin partidos en ningún lado, la barra arranca en 0 y no
    // dividiendo por los 62 de una llave que no existe.
    expect(cycleHeader(toCycle(baseTournament())).progress).toBe(0);
  });
});

describe('deriveHubHeader — modo de temporada', () => {
  it('sin clubes sembrados lo dice y explica por qué no se puede jugar', () => {
    const header = seasonHeader({ status: 'needs-seed' });
    expect(header.title).toBe('Temporada 2027');
    expect(header.phaseLabel).toBe('Sin clubes sembrados');
    expect(header.progress).toBe(0);
    expect(header.emptyMessage).toMatch(/no tiene sus divisiones cargadas/i);
    expect(header.emptyMessage).toMatch(/la temporada 2027/);
  });

  it('los demás estados no traen mensaje de cierre propio', () => {
    expect(seasonHeader().emptyMessage).toBeUndefined();
    expect(seasonHeader({ status: 'error' }).emptyMessage).toBeUndefined();
  });

  it('sin torneos la temporada figura sin arrancar, no completa', () => {
    // Es donde queda el modo después de cerrar la temporada anterior: decir
    // "Temporada completa" al lado de "▶ EMPEZAR TEMPORADA" sería contradictorio.
    expect(seasonHeader().phaseLabel).toBe('Sin arrancar');
  });

  it('con una jornada pendiente muestra de qué torneo es', () => {
    const tournaments: ModeTournament[] = [liga('league-A', 'Liga A', 0, 2)];
    const header = seasonHeader({ tournaments });
    expect(header.phaseLabel).toBe('Liga A · Fecha 1');
    expect(header.progress).toBe(0);
  });

  it('todo jugado: temporada completa y barra llena', () => {
    const header = seasonHeader({ tournaments: [liga('league-A', 'Liga A', 2, 2)] });
    expect(header.phaseLabel).toBe('Temporada completa');
    expect(header.progress).toBe(1);
  });

  it('sin conexión lo dice en el rótulo', () => {
    expect(seasonHeader({ status: 'error' }).phaseLabel).toBe('Sin conexión');
  });

  it('mientras carga no inventa una fase', () => {
    expect(seasonHeader({ status: 'loading' }).phaseLabel).toBe('Cargando…');
  });

  it('sin año todavía, el título es genérico', () => {
    expect(seasonHeader({ year: null }).title).toBe('Temporada');
  });
});
