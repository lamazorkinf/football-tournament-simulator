import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MatchResultsModal } from '../MatchResultsModal';
import { useMatchResultsStore, type MatchResult } from '../../../store/useMatchResultsStore';

const result = (homeTeam: string, awayTeam: string, isFavorite = false): MatchResult => ({
  homeTeam,
  awayTeam,
  homeScore: 1,
  awayScore: 0,
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

  it('dibuja la bandera de cada equipo cuando el resultado trae sus ids', () => {
    useMatchResultsStore.getState().showResults(
      [{ ...result('Argentina', 'Brasil'), homeTeamId: 'arg', awayTeamId: 'bra' }],
      'Jornada 1',
    );
    render(<MatchResultsModal />);

    expect(screen.getByAltText('Argentina flag')).toBeInTheDocument();
    expect(screen.getByAltText('Brasil flag')).toBeInTheDocument();
  });

  it('sin ids de equipo muestra igual los nombres', () => {
    useMatchResultsStore.getState().showResults([result('Islandia', 'Malta')], 'Jornada 1');
    render(<MatchResultsModal />);

    expect(screen.getByText('Islandia')).toBeInTheDocument();
    expect(screen.getByText('Malta')).toBeInTheDocument();
    expect(screen.queryByAltText(/flag/)).not.toBeInTheDocument();
  });

  it('dice de qué confederación es cada partido', () => {
    useMatchResultsStore.getState().showResults(
      [{ ...result('Italia', 'Gales'), region: 'Europe', groupName: 'R64' }],
      'Continental · R64',
    );
    render(<MatchResultsModal />);

    expect(screen.getByText('Europa · R64')).toBeInTheDocument();
  });

  it('un partido sin confederación muestra solo su grupo', () => {
    useMatchResultsStore.getState().showResults(
      [{ ...result('Italia', 'Gales'), groupName: 'Semifinal' }],
      'Confederaciones · Semis',
    );
    render(<MatchResultsModal />);

    expect(screen.getByText('Semifinal')).toBeInTheDocument();
  });

  it('es un diálogo modal rotulado con el título del resumen', () => {
    useMatchResultsStore.getState().showResults([result('Islandia', 'Malta')], 'Jornada 1');
    render(<MatchResultsModal />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(/Jornada 1/);
  });

  it('encierra el foco: al abrir queda adentro y el Tab no se escapa al fondo', () => {
    useMatchResultsStore.getState().showResults([result('Islandia', 'Malta')], 'Jornada 1');
    render(
      <>
        <button>Fondo</button>
        <MatchResultsModal />
      </>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);

    screen.getByText('Fondo').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
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

/** Resultado con los datos que hacen falta para que produzca un titular. */
const conSkills = (
  homeTeam: string,
  awayTeam: string,
  over: Partial<MatchResult> = {},
): MatchResult => ({
  ...result(homeTeam, awayTeam),
  homeTeamId: homeTeam.toLowerCase(),
  awayTeamId: awayTeam.toLowerCase(),
  homeSkillBefore: 55,
  awaySkillBefore: 90,
  ...over,
});

const tabla = {
  leaderTeamId: 'a',
  leaderTeamName: 'Ben Hur',
  leaderIsNew: true,
  moves: [{ teamId: 'b', teamName: 'Talleres', from: 7, to: 4 }],
};

describe('MatchResultsModal — resumen de fecha', () => {
  it('titula el batacazo de la fecha', () => {
    useMatchResultsStore.getState().showResults([conSkills('Colon', 'Alumni')], 'Fecha 12');
    render(<MatchResultsModal />);
    expect(screen.getByText('BATACAZO')).toBeInTheDocument();
  });

  it('sin skills previos no hay bloque de titulares', () => {
    useMatchResultsStore.getState().showResults([result('Colon', 'Alumni')], 'Fecha 12');
    render(<MatchResultsModal />);
    expect(screen.queryByText(/titulares/i)).not.toBeInTheDocument();
  });

  it('rinde el bloque de tabla sólo cuando la fecha lo trae', () => {
    useMatchResultsStore.getState().showResults([result('Colon', 'Alumni')], 'Fecha 12', tabla);
    render(<MatchResultsModal />);
    expect(screen.getByText('Ben Hur')).toBeInTheDocument();
    expect(screen.getByText('7º → 4º')).toBeInTheDocument();
  });

  it('sin tabla no rinde ese bloque', () => {
    useMatchResultsStore.getState().showResults([result('Colon', 'Alumni')], 'Fecha 12');
    render(<MatchResultsModal />);
    expect(screen.queryByText(/la tabla/i)).not.toBeInTheDocument();
  });

  /**
   * Una fecha de Villamariense son 10 partidos y se sigue viendo como siempre;
   * una de clasificatorias son 84 y era un muro.
   */
  it('con pocos resultados la lista arranca abierta', () => {
    useMatchResultsStore
      .getState()
      .showResults(
        Array.from({ length: 10 }, (_, i) => result(`Local ${i}`, `Visita ${i}`)),
        'Fecha 12',
      );
    render(<MatchResultsModal />);
    expect(screen.getAllByTestId('match-result')).toHaveLength(10);
  });

  it('con muchos resultados la lista arranca colapsada', () => {
    useMatchResultsStore
      .getState()
      .showResults(
        Array.from({ length: 20 }, (_, i) => result(`Local ${i}`, `Visita ${i}`)),
        'Jornada 3',
      );
    render(<MatchResultsModal />);
    expect(screen.queryAllByTestId('match-result')).toHaveLength(0);
    expect(screen.getByRole('button', { name: /20 resultados/i })).toBeInTheDocument();
  });

  it('el plegable abre la lista', () => {
    useMatchResultsStore
      .getState()
      .showResults(
        Array.from({ length: 20 }, (_, i) => result(`Local ${i}`, `Visita ${i}`)),
        'Jornada 3',
      );
    render(<MatchResultsModal />);

    fireEvent.click(screen.getByRole('button', { name: /20 resultados/i }));

    expect(screen.getAllByTestId('match-result')).toHaveLength(20);
  });
});
