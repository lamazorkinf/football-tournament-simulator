import { describe, it, expect } from 'vitest';
import { LIVE_MATCH_CAP, selectLiveMatches, type SelectableMatch } from '../liveSelection';

const m = (matchId: string, homeTeamId: string, awayTeamId: string): SelectableMatch => ({
  matchId,
  homeTeamId,
  awayTeamId,
});

/** n partidos t{2i} vs t{2i+1} con skills decrecientes desde `top`. */
function makePool(n: number, top = 100) {
  const matches: SelectableMatch[] = [];
  const skills = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const home = `t${i * 2}`;
    const away = `t${i * 2 + 1}`;
    matches.push(m(`m${String(i).padStart(2, '0')}`, home, away));
    skills.set(home, top - i);
    skills.set(away, top - i);
  }
  return { matches, skills };
}

describe('selectLiveMatches', () => {
  it('la grilla en vivo muestra hasta 20 partidos', () => {
    const { matches, skills } = makePool(40);
    expect(selectLiveMatches(matches, skills, new Set())).toHaveLength(20);
  });

  it('con menos partidos que el cap devuelve todos', () => {
    const { matches, skills } = makePool(3);
    expect(selectLiveMatches(matches, skills, new Set())).toHaveLength(3);
  });

  it('sin favoritos: los mejores del cap por suma de skill', () => {
    const { matches, skills } = makePool(LIVE_MATCH_CAP + 8);
    const chosen = selectLiveMatches(matches, skills, new Set());
    expect(chosen).toHaveLength(LIVE_MATCH_CAP);
    expect(chosen.map((c) => c.matchId)).toEqual(
      matches.slice(0, LIVE_MATCH_CAP).map((c) => c.matchId),
    );
  });

  it('los partidos de favoritos siempre entran aunque tengan poca skill', () => {
    const { matches, skills } = makePool(LIVE_MATCH_CAP + 8);
    // El peor partido del pool tiene un equipo favorito.
    const worst = matches[matches.length - 1];
    const chosen = selectLiveMatches(matches, skills, new Set([worst.homeTeamId]));
    expect(chosen.map((c) => c.matchId)).toContain(worst.matchId);
    expect(chosen).toHaveLength(LIVE_MATCH_CAP);
    // Y desplaza al último no-favorito que entraba por skill.
    expect(chosen.map((c) => c.matchId)).not.toContain(matches[LIVE_MATCH_CAP - 1].matchId);
    // Favoritos primero en el orden de salida.
    expect(chosen[0].matchId).toBe(worst.matchId);
  });

  it('con más partidos de favoritos que el cap gana la suma de skill entre ellos', () => {
    const { matches, skills } = makePool(LIVE_MATCH_CAP + 8);
    // Todos los equipos son favoritos → todos los partidos son favoritos.
    const favorites = new Set(matches.flatMap((x) => [x.homeTeamId, x.awayTeamId]));
    const chosen = selectLiveMatches(matches, skills, favorites);
    expect(chosen).toHaveLength(LIVE_MATCH_CAP);
    expect(chosen.map((c) => c.matchId)).toEqual(
      matches.slice(0, LIVE_MATCH_CAP).map((c) => c.matchId),
    );
  });

  it('con menos partidos de favoritos que el cap completa con los mejores del resto', () => {
    const { matches, skills } = makePool(LIVE_MATCH_CAP + 8);
    // Dos favoritos del fondo de la tabla (fuera de los que entran por skill).
    const first = matches[LIVE_MATCH_CAP + 3];
    const second = matches[LIVE_MATCH_CAP + 6];
    const favs = new Set([first.homeTeamId, second.awayTeamId]);
    const chosen = selectLiveMatches(matches, skills, favs);
    expect(chosen).toHaveLength(LIVE_MATCH_CAP);
    // Los 2 favoritos primero (ordenados por skill entre ellos)…
    expect(chosen[0].matchId).toBe(first.matchId);
    expect(chosen[1].matchId).toBe(second.matchId);
    // …y el resto de los cupos para los mejores no-favoritos.
    expect(chosen.slice(2).map((c) => c.matchId)).toEqual(
      matches.slice(0, LIVE_MATCH_CAP - 2).map((c) => c.matchId),
    );
  });

  it('un partido entre dos favoritos cuenta una sola vez', () => {
    const { matches, skills } = makePool(5);
    const both = matches[2];
    const chosen = selectLiveMatches(matches, skills, new Set([both.homeTeamId, both.awayTeamId]));
    expect(chosen.filter((c) => c.matchId === both.matchId)).toHaveLength(1);
    expect(chosen).toHaveLength(5);
  });

  it('skill desconocida cuenta como 0 y el desempate por matchId es estable', () => {
    const matches = [m('b', 'x1', 'x2'), m('a', 'x3', 'x4'), m('c', 'x5', 'x6')];
    const chosen = selectLiveMatches(matches, new Map(), new Set(), 2);
    expect(chosen.map((c) => c.matchId)).toEqual(['a', 'b']);
  });

  it('cap 0 o negativo devuelve vacío', () => {
    const { matches, skills } = makePool(3);
    expect(selectLiveMatches(matches, skills, new Set(), 0)).toEqual([]);
    expect(selectLiveMatches(matches, skills, new Set(), -1)).toEqual([]);
  });
});
