import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchResultsModal } from '../MatchResultsModal';
import { useMatchResultsStore, type MatchResult } from '../../../store/useMatchResultsStore';

const result = (homeTeam: string, awayTeam: string, isFavorite = false): MatchResult => ({
  homeTeam,
  awayTeam,
  homeScore: 1,
  awayScore: 0,
  stage: 'Continental',
  groupName: 'Octavos',
  isFavorite,
});

beforeEach(() => {
  useMatchResultsStore.setState({ isOpen: false, results: [], title: '' });
});

describe('MatchResultsModal', () => {
  it('muestra primero los partidos de equipos favoritos', () => {
    useMatchResultsStore.getState().showResults(
      [
        result('Islandia', 'Malta'),
        result('Argentina', 'Bolivia', true),
        result('Gales', 'Chipre'),
        result('Brasil', 'Perú', true),
      ],
      'Jornada 1',
    );
    render(<MatchResultsModal />);

    const shown = screen.getAllByTestId('match-result').map((el) => el.textContent);
    expect(shown[0]).toContain('Argentina');
    expect(shown[1]).toContain('Brasil');
    expect(shown[2]).toContain('Islandia');
    expect(shown[3]).toContain('Gales');
  });

  it('conserva el orden original dentro de favoritos y no favoritos', () => {
    useMatchResultsStore.getState().showResults(
      [result('Islandia', 'Malta'), result('Gales', 'Chipre'), result('Argentina', 'Bolivia', true)],
      'Jornada 1',
    );
    render(<MatchResultsModal />);

    const shown = screen.getAllByTestId('match-result').map((el) => el.textContent);
    expect(shown[1]).toContain('Islandia');
    expect(shown[2]).toContain('Gales');
  });

  it('muestra la definición por penales del partido que fue al punto', () => {
    useMatchResultsStore.getState().showResults(
      [
        { ...result('Argentina', 'Brasil'), homeScore: 1, awayScore: 1, penalties: { homeScore: 4, awayScore: 3 } },
        result('Gales', 'Chipre'),
      ],
      'Semifinales',
    );
    render(<MatchResultsModal />);

    expect(screen.getByText('Penales 4 - 3')).toBeInTheDocument();
    // El que no fue a penales no inventa una línea de penales.
    expect(screen.getAllByText(/Penales/)).toHaveLength(1);
  });

  it('los penales no se cuentan como goles del partido', () => {
    useMatchResultsStore.getState().showResults(
      [
        { ...result('Argentina', 'Brasil'), homeScore: 1, awayScore: 1, penalties: { homeScore: 4, awayScore: 3 } },
        { ...result('Gales', 'Chipre'), homeScore: 2, awayScore: 0 },
      ],
      'Semifinales',
    );
    render(<MatchResultsModal />);

    // 1+1+2+0 = 4 goles; los 7 penales no suman.
    const totales = screen.getByText('Goles Totales').parentElement;
    expect(totales).toHaveTextContent('4');
    expect(totales).not.toHaveTextContent('11');
  });

  it('sin favoritos respeta el orden de la jornada', () => {
    useMatchResultsStore.getState().showResults(
      [result('Islandia', 'Malta'), result('Gales', 'Chipre')],
      'Jornada 1',
    );
    render(<MatchResultsModal />);

    const shown = screen.getAllByTestId('match-result').map((el) => el.textContent);
    expect(shown[0]).toContain('Islandia');
    expect(shown[1]).toContain('Gales');
  });
});
