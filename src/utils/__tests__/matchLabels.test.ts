import { describe, it, expect } from 'vitest';
import { penaltiesLabel, matchResultToastText } from '../matchLabels';

describe('penaltiesLabel', () => {
  it('describe el desempate cuando el partido fue a penales', () => {
    expect(penaltiesLabel({ homeScore: 4, awayScore: 3 })).toBe('Penales 4 - 3');
  });

  it('devuelve null cuando no hubo penales', () => {
    expect(penaltiesLabel(undefined)).toBeNull();
    expect(penaltiesLabel(null)).toBeNull();
  });
});

describe('matchResultToastText', () => {
  it('arma el marcador del partido', () => {
    expect(
      matchResultToastText('Argentina', 'Brasil', { homeScore: 2, awayScore: 1 }),
    ).toBe('Argentina 2 - 1 Brasil');
  });

  it('agrega los penales cuando el partido se definió desde el punto', () => {
    expect(
      matchResultToastText('Argentina', 'Brasil', {
        homeScore: 1,
        awayScore: 1,
        penalties: { homeScore: 4, awayScore: 3 },
      }),
    ).toBe('Argentina 1 - 1 Brasil · Penales 4 - 3');
  });
});
