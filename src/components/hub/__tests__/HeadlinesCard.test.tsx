import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HeadlinesCard } from '../HeadlinesCard';
import type { HeadlineView } from '../../../hooks/useRecentHeadlines';

const headline = (over: Partial<HeadlineView> = {}): HeadlineView => ({
  kind: 'upset',
  label: 'BATACAZO',
  detail: 'le ganó a un rival 25 puntos mejor',
  subjectTeamId: 'A',
  score: 0.6,
  homeTeamName: 'Ben Hur',
  awayTeamName: 'Alumni',
  match: {
    homeTeamId: 'A',
    awayTeamId: 'B',
    homeScore: 2,
    awayScore: 0,
    homeSkillBefore: 60,
    awaySkillBefore: 85,
    stage: 'league',
  },
  ...over,
});

describe('HeadlinesCard', () => {
  it('sin titulares no rinde nada', () => {
    const { container } = render(<HeadlinesCard headlines={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('rinde etiqueta, marcador y explicación', () => {
    render(<HeadlinesCard headlines={[headline()]} />);
    expect(screen.getByText('BATACAZO')).toBeInTheDocument();
    expect(screen.getByText('Ben Hur')).toBeInTheDocument();
    expect(screen.getByText('Alumni')).toBeInTheDocument();
    expect(screen.getByText('2 - 0')).toBeInTheDocument();
    expect(screen.getByText('le ganó a un rival 25 puntos mejor')).toBeInTheDocument();
  });

  it('rinde los tres titulares de la portada', () => {
    render(
      <HeadlinesCard
        headlines={[
          headline(),
          headline({
            kind: 'rout',
            label: 'GOLEADA',
            detail: '5 goles de diferencia',
            homeTeamName: 'Ferrocarril',
            awayTeamName: 'Bochas',
            match: { ...headline().match, homeTeamId: 'C', awayTeamId: 'D' },
          }),
          headline({
            kind: 'streak',
            label: 'RACHA',
            detail: '6 victorias al hilo',
            homeTeamName: 'Talleres',
            awayTeamName: 'Alem',
            match: { ...headline().match, homeTeamId: 'E', awayTeamId: 'F' },
          }),
        ]}
      />,
    );
    expect(screen.getByText('BATACAZO')).toBeInTheDocument();
    expect(screen.getByText('GOLEADA')).toBeInTheDocument();
    expect(screen.getByText('RACHA')).toBeInTheDocument();
  });

  it('muestra la tanda de penales junto al marcador', () => {
    render(
      <HeadlinesCard
        headlines={[
          headline({
            kind: 'decider',
            label: 'PENALES',
            detail: 'se definió por penales',
            subjectTeamId: undefined,
            match: {
              ...headline().match,
              homeScore: 1,
              awayScore: 1,
              penalties: { homeScore: 4, awayScore: 2 },
            },
          }),
        ]}
      />,
    );
    expect(screen.getByText(/Penales 4 - 2/)).toBeInTheDocument();
  });

  /**
   * El texto se escribe en minúscula y la mayúscula la pone el CSS (`uppercase`),
   * igual que el bloque que este reemplaza — por eso las aserciones van con
   * regex insensible a mayúsculas y no con el string literal.
   */
  it('titula el bloque en la tipografía arcade', () => {
    render(<HeadlinesCard headlines={[headline()]} />);
    const titulo = screen.getByText(/titulares/i);
    expect(titulo.className).toContain('font-arcade');
  });
});
