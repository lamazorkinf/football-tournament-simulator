import { describe, it, expect } from 'vitest';
import { deriveHeadlines, type HeadlineMatch } from '../headlines';

/** Partido neutro: 1-0 entre iguales, no dispara ningún titular. */
const match = (over: Partial<HeadlineMatch> = {}): HeadlineMatch => ({
  homeTeamId: 'A',
  awayTeamId: 'B',
  homeScore: 1,
  awayScore: 0,
  homeSkillBefore: 70,
  awaySkillBefore: 70,
  stage: 'league',
  ...over,
});

describe('deriveHeadlines — batacazo', () => {
  it('ganar contra un rival mucho mejor es batacazo', () => {
    const [h] = deriveHeadlines([
      match({ homeSkillBefore: 60, awaySkillBefore: 85 }),
    ]);
    expect(h.kind).toBe('upset');
    expect(h.label).toBe('BATACAZO');
    expect(h.subjectTeamId).toBe('A');
    expect(h.detail).toBe('le ganó a un rival 25 puntos mejor');
  });

  it('el batacazo también vale de visitante', () => {
    const [h] = deriveHeadlines([
      match({ homeScore: 0, awayScore: 2, homeSkillBefore: 85, awaySkillBefore: 60 }),
    ]);
    expect(h.kind).toBe('upset');
    expect(h.subjectTeamId).toBe('B');
  });

  it('que gane el favorito no es noticia', () => {
    expect(deriveHeadlines([
      match({ homeSkillBefore: 85, awaySkillBefore: 60 }),
    ])).toEqual([]);
  });

  it('una brecha chica no alcanza', () => {
    expect(deriveHeadlines([
      match({ homeSkillBefore: 67, awaySkillBefore: 71 }),
    ])).toEqual([]);
  });
});

describe('deriveHeadlines — goleada', () => {
  it('cuatro goles de diferencia son goleada', () => {
    const [h] = deriveHeadlines([match({ homeScore: 5, awayScore: 1 })]);
    expect(h.kind).toBe('rout');
    expect(h.label).toBe('GOLEADA');
    expect(h.detail).toBe('4 goles de diferencia');
    expect(h.subjectTeamId).toBe('A');
  });

  it('tres goles de diferencia no', () => {
    expect(deriveHeadlines([match({ homeScore: 3, awayScore: 0 })])).toEqual([]);
  });
});

describe('deriveHeadlines — definición', () => {
  it('los penales mandan sobre el alargue', () => {
    const [h] = deriveHeadlines([
      match({
        homeScore: 1,
        awayScore: 1,
        wentToExtraTime: true,
        penalties: { homeScore: 4, awayScore: 2 },
        stage: 'world-cup-knockout',
      }),
    ]);
    expect(h.kind).toBe('decider');
    expect(h.label).toBe('PENALES');
    expect(h.detail).toBe('se definió por penales');
  });

  it('sin tanda guardada, el alargue igual es titular', () => {
    const [h] = deriveHeadlines([
      match({ homeScore: 2, awayScore: 1, wentToExtraTime: true, stage: 'cup' }),
    ]);
    expect(h.label).toBe('ALARGUE');
    expect(h.detail).toBe('se resolvió en el alargue');
  });
});

describe('deriveHeadlines — aguante', () => {
  it('empatarle al grande es titular', () => {
    const [h] = deriveHeadlines([
      match({ homeScore: 1, awayScore: 1, homeSkillBefore: 55, awaySkillBefore: 85 }),
    ]);
    expect(h.kind).toBe('hold');
    expect(h.label).toBe('AGUANTE');
    expect(h.subjectTeamId).toBe('A');
    expect(h.detail).toBe('empató contra un rival 30 puntos mejor');
  });

  it('un empate entre parecidos no es nada', () => {
    expect(deriveHeadlines([
      match({ homeScore: 1, awayScore: 1, homeSkillBefore: 68, awaySkillBefore: 75 }),
    ])).toEqual([]);
  });
});

describe('deriveHeadlines — selección', () => {
  it('un partido produce UN titular: el de mayor puntaje', () => {
    // Batacazo con brecha 40 (base 1.0) y goleada de 4 (base 0.25) en el mismo
    // partido: gana el batacazo, y no salen dos titulares del mismo partido.
    const res = deriveHeadlines([
      match({ homeScore: 4, awayScore: 0, homeSkillBefore: 50, awaySkillBefore: 90 }),
    ]);
    expect(res).toHaveLength(1);
    expect(res[0].kind).toBe('upset');
  });

  it('ordena por puntaje descendente', () => {
    const res = deriveHeadlines([
      match({ homeTeamId: 'A', awayTeamId: 'B', homeSkillBefore: 65, awaySkillBefore: 75 }),
      match({ homeTeamId: 'C', awayTeamId: 'D', homeSkillBefore: 45, awaySkillBefore: 90 }),
    ]);
    expect(res.map((h) => h.subjectTeamId)).toEqual(['C', 'A']);
    expect(res[0].score).toBeGreaterThan(res[1].score);
  });

  it('lo más reciente pesa más: el mismo titular vale menos más atrás', () => {
    const viejo = Array.from({ length: 50 }, () => match({ homeTeamId: 'X', awayTeamId: 'Y' }));
    const res = deriveHeadlines([
      match({ homeTeamId: 'A', awayTeamId: 'B', homeSkillBefore: 60, awaySkillBefore: 85 }),
      ...viejo,
      match({ homeTeamId: 'C', awayTeamId: 'D', homeSkillBefore: 60, awaySkillBefore: 85 }),
    ]);
    expect(res.map((h) => h.subjectTeamId)).toEqual(['A', 'C']);
    expect(res[0].score).toBeGreaterThan(res[1].score);
  });

  it('un titular flojo y muy viejo cae por debajo del umbral', () => {
    // Batacazo mínimo (brecha 6) en clasificatorias (peso 0.9), al final de una
    // ventana de 80: el decaimiento lo deja por debajo de MIN_SCORE.
    const relleno = Array.from({ length: 79 }, (_, i) =>
      match({ homeTeamId: `h${i}`, awayTeamId: `a${i}` }),
    );
    expect(deriveHeadlines([
      ...relleno,
      match({ homeTeamId: 'A', awayTeamId: 'B', homeSkillBefore: 66, awaySkillBefore: 72, stage: 'qualifier' }),
    ])).toEqual([]);
  });

  it('un equipo no aparece dos veces en la portada', () => {
    const res = deriveHeadlines([
      match({ homeTeamId: 'A', awayTeamId: 'B', homeSkillBefore: 45, awaySkillBefore: 90 }),
      match({ homeTeamId: 'A', awayTeamId: 'C', homeScore: 6, awayScore: 0 }),
    ]);
    expect(res).toHaveLength(1);
    expect(res[0].subjectTeamId).toBe('A');
  });

  it('corta en el límite pedido', () => {
    const res = deriveHeadlines(
      Array.from({ length: 5 }, (_, i) =>
        match({ homeTeamId: `h${i}`, awayTeamId: `a${i}`, homeSkillBefore: 50, awaySkillBefore: 90 }),
      ),
    );
    expect(res).toHaveLength(3);
  });

  it('sin partidos no hay titulares', () => {
    expect(deriveHeadlines([])).toEqual([]);
  });

  /** Las etiquetas se dibujan en Press Start 2P, que no tiene mayúsculas acentuadas. */
  it('las etiquetas son mayúsculas sin tildes', () => {
    const res = deriveHeadlines([
      match({ homeTeamId: 'A', awayTeamId: 'B', homeSkillBefore: 50, awaySkillBefore: 90 }),
      match({ homeTeamId: 'C', awayTeamId: 'D', homeScore: 5, awayScore: 0 }),
      match({
        homeTeamId: 'E',
        awayTeamId: 'F',
        homeScore: 1,
        awayScore: 1,
        homeSkillBefore: 55,
        awaySkillBefore: 85,
      }),
    ]);
    expect(res).toHaveLength(3);
    for (const h of res) expect(h.label).toMatch(/^[A-Z]+$/);
  });
});
