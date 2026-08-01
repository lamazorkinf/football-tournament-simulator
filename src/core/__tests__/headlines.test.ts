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

  /**
   * En una eliminación directa nadie empata. El 0-0 es sólo cómo terminaron los
   * 120 minutos: el sujeto del "AGUANTE" sería el que erró la tanda y quedó
   * eliminado, y encima con 1.04 de puntaje —el más alto que puede sacar la
   * portada— porque la base de `hold` (0.8 × 40/40) le gana a la de `decider`.
   */
  it('una definición por penales NO es aguante, aunque el marcador esté empatado', () => {
    const res = deriveHeadlines([
      match({
        homeScore: 0,
        awayScore: 0,
        homeSkillBefore: 55,
        awaySkillBefore: 95,
        stage: 'world-cup-knockout',
        penalties: { homeScore: 2, awayScore: 4 },
      }),
    ]);
    expect(res.map((h) => h.kind)).not.toContain('hold');
    expect(res).toHaveLength(1);
    expect(res[0].label).toBe('PENALES');
    // El que perdió la tanda no queda de sujeto de nada.
    expect(res[0].subjectTeamId).toBeUndefined();
  });
});

describe('deriveHeadlines — filas reconstruidas', () => {
  /**
   * EL ESCENARIO. Bolivia le ganó 2-1 a Brasil en la Copa América cuando los dos
   * estaban en 70 y el insert se perdió por un bache de red. Dos años después
   * Bolivia está en 55 y Brasil en 90; el backfill reinserta la fila con
   * `played_at = now()` y esos skills de HOY. La brecha de 35 nunca existió.
   */
  const reconstruida = (over: Partial<HeadlineMatch> = {}): HeadlineMatch =>
    match({
      homeTeamId: 'bol',
      awayTeamId: 'bra',
      homeScore: 2,
      awayScore: 1,
      homeSkillBefore: 55,
      awaySkillBefore: 90,
      stage: 'continental',
      skillsReconstructed: true,
      ...over,
    });

  it('la brecha fabricada no produce BATACAZO', () => {
    expect(deriveHeadlines([reconstruida()])).toEqual([]);
    // Control: la MISMA fila sin la marca sí titula, o sea que el test mide la
    // marca y no otra cosa.
    const [h] = deriveHeadlines([reconstruida({ skillsReconstructed: false })]);
    expect(h.kind).toBe('upset');
  });

  it('la brecha fabricada tampoco produce AGUANTE', () => {
    expect(deriveHeadlines([
      reconstruida({ homeScore: 1, awayScore: 1 }),
    ])).toEqual([]);
    const [h] = deriveHeadlines([
      reconstruida({ homeScore: 1, awayScore: 1, skillsReconstructed: false }),
    ]);
    expect(h.kind).toBe('hold');
  });

  /** La diferencia de gol es un dato real aun en una fila reconstruida. */
  it('la GOLEADA se sigue emitiendo', () => {
    const [h] = deriveHeadlines([reconstruida({ homeScore: 5, awayScore: 0 })]);
    expect(h.kind).toBe('rout');
    expect(h.detail).toBe('5 goles de diferencia');
  });

  /** El alargue y la tanda también son datos reales. */
  it('la definición se sigue emitiendo', () => {
    const [penales] = deriveHeadlines([
      reconstruida({ homeScore: 1, awayScore: 1, penalties: { homeScore: 4, awayScore: 2 } }),
    ]);
    expect(penales.label).toBe('PENALES');

    const [alargue] = deriveHeadlines([reconstruida({ wentToExtraTime: true })]);
    expect(alargue.label).toBe('ALARGUE');
  });

  /** Las rachas cuentan victorias, no brechas: la marca no las toca. */
  it('la RACHA se sigue emitiendo', () => {
    const gana = (rival: string, over: Partial<HeadlineMatch> = {}) =>
      reconstruida({ awayTeamId: rival, homeScore: 1, awayScore: 0, ...over });
    const [h] = deriveHeadlines([
      gana('B'),
      gana('C'),
      gana('D'),
      gana('E'),
      gana('F', { homeScore: 0, awayScore: 1 }),
    ]);
    expect(h.kind).toBe('streak');
    expect(h.subjectTeamId).toBe('bol');
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

describe('deriveHeadlines — racha', () => {
  /** Cuatro victorias de A, y después el partido que cortó la racha anterior. */
  const rachaAcotada = (corte: Partial<HeadlineMatch>): HeadlineMatch[] => [
    match({ homeTeamId: 'A', awayTeamId: 'B' }),
    match({ homeTeamId: 'A', awayTeamId: 'C' }),
    match({ homeTeamId: 'A', awayTeamId: 'D' }),
    match({ homeTeamId: 'A', awayTeamId: 'E' }),
    match({ homeTeamId: 'A', awayTeamId: 'F', ...corte }),
  ];

  it('cuatro al hilo, con el corte a la vista, son titular', () => {
    const [h] = deriveHeadlines(rachaAcotada({ homeScore: 0, awayScore: 1 }));
    expect(h.kind).toBe('streak');
    expect(h.label).toBe('RACHA');
    expect(h.subjectTeamId).toBe('A');
    expect(h.detail).toBe('4 victorias al hilo');
  });

  it('un empate también corta la racha', () => {
    const [h] = deriveHeadlines(rachaAcotada({ homeScore: 1, awayScore: 1 }));
    expect(h.detail).toBe('4 victorias al hilo');
  });

  /**
   * La regla de honestidad. Sin el partido que la corta, la racha podría ser de
   * 4 o de 12 y no hay forma de saberlo: se calla. Si este test se cae porque
   * alguien "arregló" el borde emitiendo el número que ve, la app pasa a mentir.
   */
  it('una racha que llega al borde de la ventana NO se emite', () => {
    expect(deriveHeadlines(rachaAcotada({}).slice(0, 4))).toEqual([]);
  });

  it('tres al hilo no alcanzan', () => {
    expect(deriveHeadlines(rachaAcotada({}).slice(0, 3).concat(
      match({ homeTeamId: 'A', awayTeamId: 'F', homeScore: 0, awayScore: 1 }),
    ))).toEqual([]);
  });

  it('la racha se cuenta desde el partido más reciente, no desde el más largo', () => {
    // A gana 2, empata, y antes había ganado 4: la racha vigente es de 2.
    const res = deriveHeadlines([
      match({ homeTeamId: 'A', awayTeamId: 'B' }),
      match({ homeTeamId: 'A', awayTeamId: 'C' }),
      match({ homeTeamId: 'A', awayTeamId: 'D', homeScore: 1, awayScore: 1 }),
      match({ homeTeamId: 'A', awayTeamId: 'E' }),
      match({ homeTeamId: 'A', awayTeamId: 'F' }),
      match({ homeTeamId: 'A', awayTeamId: 'G' }),
      match({ homeTeamId: 'A', awayTeamId: 'H' }),
      match({ homeTeamId: 'A', awayTeamId: 'I', homeScore: 0, awayScore: 1 }),
    ]);
    expect(res).toEqual([]);
  });

  it('el partido que ilustra la racha es el más reciente', () => {
    const [h] = deriveHeadlines(rachaAcotada({ homeScore: 0, awayScore: 1 }));
    expect(h.match.awayTeamId).toBe('B');
  });

  it('las victorias de visitante también cuentan', () => {
    const visitante = (rival: string, over: Partial<HeadlineMatch> = {}) =>
      match({ homeTeamId: rival, awayTeamId: 'A', homeScore: 0, awayScore: 1, ...over });
    const [h] = deriveHeadlines([
      visitante('B'),
      visitante('C'),
      visitante('D'),
      visitante('E'),
      visitante('F', { homeScore: 2, awayScore: 0 }),
    ]);
    expect(h.kind).toBe('streak');
    expect(h.subjectTeamId).toBe('A');
  });
});
