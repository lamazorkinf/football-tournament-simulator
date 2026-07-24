import { describe, it, expect } from 'vitest';
import { penaltiesLabel } from '../matchLabels';

describe('penaltiesLabel', () => {
  it('describe el desempate cuando el partido fue a penales', () => {
    expect(penaltiesLabel({ homeScore: 4, awayScore: 3 })).toBe('Penales 4 - 3');
  });

  it('devuelve null cuando no hubo penales', () => {
    expect(penaltiesLabel(undefined)).toBeNull();
    expect(penaltiesLabel(null)).toBeNull();
  });
});
