import { describe, it, expect } from 'vitest';
import {
  drawGroupStage,
  groupLabel,
  groupStageMatches,
  groupStageQualifiers,
  isGroupStageComplete,
  recordGroupStageMatch,
  type GroupStageConfig,
  type GroupStageState,
} from '../groupStage';

function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function entrants(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `T${String(i + 1).padStart(2, '0')}`);
}

const QUALIFIERS_CFG: GroupStageConfig = {
  groupCount: 2,
  groupSize: 5,
  legs: 2,
  qualifiersPerGroup: 1,
  bestRunnersUp: 0,
  stage: 'qualifier',
  fixtureTemplate: 'fifa-5',
};

const WORLD_CUP_CFG: GroupStageConfig = {
  groupCount: 4,
  groupSize: 4,
  legs: 1,
  qualifiersPerGroup: 2,
  bestRunnersUp: 0,
  stage: 'world-cup-group',
  fixtureTemplate: 'fifa-4',
};

describe('groupLabel', () => {
  it('sigue A-Z y después AA, AB…', () => {
    expect(groupLabel(0)).toBe('A');
    expect(groupLabel(25)).toBe('Z');
    expect(groupLabel(26)).toBe('AA');
    expect(groupLabel(27)).toBe('AB');
  });
});

// ---------------------------------------------------------------------------
// La trampa de las plantillas: la numeración de fechas NO puede cambiar
// ---------------------------------------------------------------------------

describe('plantillas de fixture', () => {
  it("'fifa-5' da 20 partidos en 20 fechas, uno por fecha", () => {
    const state = drawGroupStage(entrants(10), QUALIFIERS_CFG, {
      kind: 'pots',
      rng: seededRng(1),
    });
    const group = state.groups[0];
    expect(group.matches).toHaveLength(20);
    const matchdays = group.matches.map((m) => m.matchday);
    expect(new Set(matchdays).size).toBe(20);
    expect(Math.min(...(matchdays as number[]))).toBe(1);
    expect(Math.max(...(matchdays as number[]))).toBe(20);
  });

  it("'fifa-4' da 6 partidos en 3 fechas, dos por fecha", () => {
    const state = drawGroupStage(entrants(16), WORLD_CUP_CFG, {
      kind: 'pots',
      rng: seededRng(1),
    });
    const group = state.groups[0];
    expect(group.matches).toHaveLength(6);
    const byMatchday = new Map<number, number>();
    for (const m of group.matches) {
      byMatchday.set(m.matchday!, (byMatchday.get(m.matchday!) ?? 0) + 1);
    }
    expect([...byMatchday.entries()].sort()).toEqual([[1, 2], [2, 2], [3, 2]]);
  });

  it('sin plantilla usa el round-robin algorítmico (10 fechas de 2 para 5 equipos)', () => {
    const state = drawGroupStage(entrants(5), { ...QUALIFIERS_CFG, groupCount: 1, fixtureTemplate: undefined }, {
      kind: 'pots',
      rng: seededRng(1),
    });
    const group = state.groups[0];
    // 5 equipos, ida y vuelta = 20 partidos, pero repartidos en 10 fechas.
    expect(group.matches).toHaveLength(20);
    expect(new Set(group.matches.map((m) => m.matchday)).size).toBe(10);
  });

  it('firstMatchday corre las fechas del camino algorítmico', () => {
    const cfg = { ...QUALIFIERS_CFG, groupCount: 1, fixtureTemplate: undefined, firstMatchday: 7 };
    const state = drawGroupStage(entrants(5), cfg, { kind: 'pots', rng: seededRng(1) });
    const mds = state.groups[0].matches.map((m) => m.matchday!) as number[];
    expect(Math.min(...mds)).toBe(7);
  });

  it('un grupo incompleto descarta los cruces de la letra sin equipo', () => {
    // 4 equipos en un formato de grupos de 5: falta la letra E.
    const state = drawGroupStage(entrants(4), { ...QUALIFIERS_CFG, groupCount: 1 }, {
      kind: 'pots',
      rng: seededRng(3),
    });
    const group = state.groups[0];
    expect(group.teamIds).toHaveLength(4);
    // Round-robin ida y vuelta entre 4 = 12 partidos.
    expect(group.matches).toHaveLength(12);
    const ids = new Set(group.teamIds);
    expect(group.matches.every((m) => ids.has(m.homeTeamId) && ids.has(m.awayTeamId))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sorteo
// ---------------------------------------------------------------------------

describe('sorteo por bombos', () => {
  it('cada grupo recibe exactamente un equipo por bombo', () => {
    const state = drawGroupStage(entrants(16), WORLD_CUP_CFG, {
      kind: 'pots',
      rng: seededRng(42),
    });
    for (const g of state.groups) {
      expect(g.teamIds).toHaveLength(4);
      const letters = g.teamIds.map((id) => g.potLetters![id]).sort();
      expect(letters).toEqual(['A', 'B', 'C', 'D']);
    }
  });

  it('reparte a todos los equipos, sin repetir ni perder ninguno', () => {
    const all = entrants(16);
    const state = drawGroupStage(all, WORLD_CUP_CFG, { kind: 'pots', rng: seededRng(7) });
    const placed = state.groups.flatMap((g) => g.teamIds);
    expect(placed).toHaveLength(16);
    expect(new Set(placed)).toEqual(new Set(all));
  });

  it('el bombo 1 son los mejores por orden de mérito', () => {
    const state = drawGroupStage(entrants(16), WORLD_CUP_CFG, { kind: 'pots', rng: seededRng(5) });
    const potA = state.groups.map((g) => g.teamIds.find((id) => g.potLetters![id] === 'A')!);
    expect(new Set(potA)).toEqual(new Set(['T01', 'T02', 'T03', 'T04']));
  });

  it('serpiente: el bombo impar recorre los grupos al revés', () => {
    const straight = drawGroupStage(entrants(16), WORLD_CUP_CFG, {
      kind: 'pots', rng: seededRng(11), snake: false,
    });
    const snaked = drawGroupStage(entrants(16), WORLD_CUP_CFG, {
      kind: 'pots', rng: seededRng(11), snake: true,
    });
    const potB = (s: GroupStageState) =>
      s.groups.map((g) => g.teamIds.find((id) => g.potLetters![id] === 'B')!);
    // Mismo rng ⇒ mismo barajado; sólo cambia el orden de recorrido.
    expect(potB(snaked)).toEqual([...potB(straight)].reverse());
  });

  it('evita dos equipos de la misma región en un grupo cuando se puede', () => {
    // 4 grupos de 4, con exactamente 4 equipos por región: hay solución perfecta.
    const regions = ['Europe', 'America', 'Africa', 'Asia'];
    const teams = entrants(16);
    const regionOf = (id: string) => regions[(Number(id.slice(1)) - 1) % 4];

    const state = drawGroupStage(teams, WORLD_CUP_CFG, {
      kind: 'pots', rng: seededRng(23), snake: true, avoidSameRegion: true, regionOf,
    });

    for (const g of state.groups) {
      const rs = g.teamIds.map(regionOf);
      expect(new Set(rs).size).toBe(rs.length);
    }
  });

  it("'explicit' respeta la composición que decidió el caller", () => {
    const state = drawGroupStage([], { ...WORLD_CUP_CFG, groupCount: 2 }, {
      kind: 'explicit',
      groups: [['X1', 'X2', 'X3', 'X4'], ['Y1', 'Y2', 'Y3', 'Y4']],
    });
    expect(state.groups.map((g) => g.teamIds)).toEqual([
      ['X1', 'X2', 'X3', 'X4'],
      ['Y1', 'Y2', 'Y3', 'Y4'],
    ]);
    expect(state.groups[0].name).toBe('Group A');
    expect(state.groups[1].name).toBe('Group B');
  });

  it('el mismo rng da el mismo sorteo; otro rng da otro', () => {
    const a = drawGroupStage(entrants(16), WORLD_CUP_CFG, { kind: 'pots', rng: seededRng(1) });
    const b = drawGroupStage(entrants(16), WORLD_CUP_CFG, { kind: 'pots', rng: seededRng(1) });
    const c = drawGroupStage(entrants(16), WORLD_CUP_CFG, { kind: 'pots', rng: seededRng(2) });
    expect(a.groups.map((g) => g.teamIds)).toEqual(b.groups.map((g) => g.teamIds));
    expect(a.groups.map((g) => g.teamIds)).not.toEqual(c.groups.map((g) => g.teamIds));
  });
});

// ---------------------------------------------------------------------------
// Juego, tabla y clasificados
// ---------------------------------------------------------------------------

describe('tabla y clasificados', () => {
  /** Juega todo el grupo haciendo ganar siempre al equipo de menor número. */
  function playAll(state: GroupStageState): GroupStageState {
    let next = state;
    for (const m of groupStageMatches(state)) {
      const homeWins = m.homeTeamId < m.awayTeamId;
      next = recordGroupStageMatch(next, m.id, {
        homeScore: homeWins ? 2 : 0,
        awayScore: homeWins ? 0 : 2,
      });
    }
    return next;
  }

  it('la tabla se recalcula entera y es idempotente', () => {
    const state = drawGroupStage(entrants(4), { ...WORLD_CUP_CFG, groupCount: 1 }, {
      kind: 'explicit', groups: [['A', 'B', 'C', 'D']],
    });
    const m = state.groups[0].matches[0];
    const once = recordGroupStageMatch(state, m.id, { homeScore: 3, awayScore: 1 });
    const twice = recordGroupStageMatch(once, m.id, { homeScore: 3, awayScore: 1 });
    expect(twice.groups[0].standings).toEqual(once.groups[0].standings);
    const played = once.groups[0].standings.filter((s) => s.played > 0);
    expect(played).toHaveLength(2);
  });

  it('isGroupStageComplete sólo con todos los partidos jugados', () => {
    const state = drawGroupStage(entrants(8), { ...WORLD_CUP_CFG, groupCount: 2 }, {
      kind: 'pots', rng: seededRng(4),
    });
    expect(isGroupStageComplete(state)).toBe(false);
    expect(isGroupStageComplete(playAll(state))).toBe(true);
  });

  it('los clasificados salen ordenados: todos los 1ºs y después los 2ºs', () => {
    const state = playAll(
      drawGroupStage([], { ...WORLD_CUP_CFG, groupCount: 2 }, {
        kind: 'explicit',
        groups: [['A1', 'A2', 'A3', 'A4'], ['B1', 'B2', 'B3', 'B4']],
      }),
    );
    const { perGroup, qualified } = groupStageQualifiers(state);
    expect(perGroup).toEqual([['A1', 'A2'], ['B1', 'B2']]);
    // Primero los dos ganadores de grupo, después los dos segundos.
    expect(qualified).toEqual(['A1', 'B1', 'A2', 'B2']);
  });

  it('los mejores segundos se agregan al final y salen de la posición correcta', () => {
    const cfg: GroupStageConfig = {
      ...WORLD_CUP_CFG, groupCount: 4, qualifiersPerGroup: 1, bestRunnersUp: 2,
    };
    const state = playAll(
      drawGroupStage([], cfg, {
        kind: 'explicit',
        groups: [
          ['A1', 'A2', 'A3', 'A4'],
          ['B1', 'B2', 'B3', 'B4'],
          ['C1', 'C2', 'C3', 'C4'],
          ['D1', 'D2', 'D3', 'D4'],
        ],
      }),
    );
    const { qualified, bestRunnersUp } = groupStageQualifiers(state);
    expect(qualified.slice(0, 4)).toEqual(['A1', 'B1', 'C1', 'D1']);
    expect(bestRunnersUp).toHaveLength(2);
    // Los candidatos son los segundos de cada grupo, no otros.
    expect(bestRunnersUp.every((id) => ['A2', 'B2', 'C2', 'D2'].includes(id))).toBe(true);
    expect(qualified).toHaveLength(6);
  });
});
