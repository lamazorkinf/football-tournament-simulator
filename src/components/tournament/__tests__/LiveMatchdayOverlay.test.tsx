import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import type { Team } from '../../../types';
import { LiveMatchdayOverlay } from '../LiveMatchdayOverlay';
import { useLiveMatchdayStore, type LiveMatchdayEntry } from '../../../store/useLiveMatchdayStore';
import { useMatchResultsStore } from '../../../store/useMatchResultsStore';
import { useTournamentStore } from '../../../store/useTournamentStore';

const teams: Team[] = [
  { id: 'arg', name: 'Argentina', flag: '🇦🇷', region: 'America', skill: 90 },
  { id: 'bra', name: 'Brasil', flag: '🇧🇷', region: 'America', skill: 85 },
];

/** Entrada 2-1: goles locales a los 12' y 77', gol visitante a los 40'. */
const entry: LiveMatchdayEntry = {
  matchId: 'm1',
  homeTeamId: 'arg',
  awayTeamId: 'bra',
  timeline: {
    goals: [
      { minute: 12, side: 'home', homeScore: 1, awayScore: 0 },
      { minute: 40, side: 'away', homeScore: 1, awayScore: 1 },
      { minute: 77, side: 'home', homeScore: 2, awayScore: 1 },
    ],
    finalHomeScore: 2,
    finalAwayScore: 1,
    hasExtraTime: false,
  },
  groupName: 'Octavos',
  region: 'America',
  isFavorite: true,
};

function openSession(e: LiveMatchdayEntry = entry) {
  useLiveMatchdayStore.setState({
    session: { title: 'Continental · Octavos', entries: [e], allResults: [], hiddenCount: 0 },
  });
}

beforeEach(() => {
  useLiveMatchdayStore.setState({ session: null });
  useMatchResultsStore.setState({ isOpen: false, results: [], title: '' });
  useTournamentStore.setState({ teams });
});

describe('LiveMatchdayOverlay', () => {
  it('muestra los minutos de gol del lado del equipo que marcó', () => {
    openSession();
    render(<LiveMatchdayOverlay />);
    act(() => screen.getByText('Saltar al final').click());

    expect(screen.getByLabelText('Goles de Argentina')).toHaveTextContent("12'");
    expect(screen.getByLabelText('Goles de Argentina')).toHaveTextContent("77'");
    expect(screen.getByLabelText('Goles de Brasil')).toHaveTextContent("40'");
    // El gol visitante no se cuela del lado local.
    expect(screen.getByLabelText('Goles de Argentina')).not.toHaveTextContent("40'");
  });

  it('sin goles revelados no muestra minutos de ningún lado', () => {
    openSession();
    render(<LiveMatchdayOverlay />);
    // El reloj arranca en 0': todavía no hay goles.
    expect(screen.queryByLabelText('Goles de Argentina')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Goles de Brasil')).not.toBeInTheDocument();
    expect(screen.getByText('Sin goles')).toBeInTheDocument();
  });

  describe('pausa', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('frena el reloj y lo reanuda donde estaba', () => {
      openSession();
      render(<LiveMatchdayOverlay />);
      act(() => vi.advanceTimersByTime(20 * 1000));
      expect(screen.getByText("20'")).toBeInTheDocument();

      act(() => screen.getByRole('button', { name: 'Pausar' }).click());
      act(() => vi.advanceTimersByTime(30 * 1000));
      expect(screen.getByText("20'")).toBeInTheDocument();

      act(() => screen.getByRole('button', { name: 'Reanudar' }).click());
      act(() => vi.advanceTimersByTime(5 * 1000));
      expect(screen.getByText("25'")).toBeInTheDocument();
    });

    it('terminada la jornada ya no ofrece pausar', () => {
      openSession();
      render(<LiveMatchdayOverlay />);
      act(() => screen.getByText('Saltar al final').click());

      expect(screen.queryByRole('button', { name: /pausar|reanudar/i })).not.toBeInTheDocument();
    });
  });

  describe('alargue', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('si algún partido de la grilla fue a alargue, el reloj compartido sigue hasta el 120', () => {
      openSession({
        ...entry,
        timeline: { ...entry.timeline, hasExtraTime: true },
      });
      render(<LiveMatchdayOverlay />);

      act(() => vi.advanceTimersByTime(90 * 1000));
      // A los 90' la grilla sigue en juego: el alargue todavía no terminó.
      expect(screen.getByText("90'")).toBeInTheDocument();
      expect(screen.queryByText('FINAL')).not.toBeInTheDocument();

      act(() => vi.advanceTimersByTime(30 * 1000));
      // Termina en el 120: header y tarjeta muestran FINAL.
      expect(screen.getAllByText('FINAL')).toHaveLength(2);
    });

    it('sin alargue en la grilla, el reloj compartido sigue terminando a los 90', () => {
      openSession();
      render(<LiveMatchdayOverlay />);

      act(() => vi.advanceTimersByTime(90 * 1000));
      expect(screen.getAllByText('FINAL')).toHaveLength(2);
    });
  });

  it('marca FINAL en la tarjeta cuando el partido terminó', () => {
    openSession();
    render(<LiveMatchdayOverlay />);
    // Acotado a la tarjeta: el reloj del header también dice FINAL.
    expect(within(screen.getByTestId('live-card')).queryByText('FINAL')).not.toBeInTheDocument();

    act(() => screen.getByText('Saltar al final').click());
    expect(within(screen.getByTestId('live-card')).getByText('FINAL')).toBeInTheDocument();
  });

  it('resalta al equipo que va ganando', () => {
    openSession();
    render(<LiveMatchdayOverlay />);
    act(() => screen.getByText('Saltar al final').click());

    // 2-1: gana Argentina.
    expect(screen.getByText('ARG')).toHaveClass('text-led');
    expect(screen.getByText('BRA')).not.toHaveClass('text-led');
  });

  it('en un empate no resalta a ninguno', () => {
    openSession({
      ...entry,
      timeline: {
        goals: [
          { minute: 12, side: 'home', homeScore: 1, awayScore: 0 },
          { minute: 40, side: 'away', homeScore: 1, awayScore: 1 },
        ],
        finalHomeScore: 1,
        finalAwayScore: 1,
        hasExtraTime: false,
      },
    });
    render(<LiveMatchdayOverlay />);
    act(() => screen.getByText('Saltar al final').click());

    expect(screen.getByText('ARG')).not.toHaveClass('text-led');
    expect(screen.getByText('BRA')).not.toHaveClass('text-led');
  });

  it('es un diálogo modal rotulado con el título de la jornada', () => {
    openSession();
    render(<LiveMatchdayOverlay />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName(/Continental · Octavos/);
  });

  it('Escape cierra la sesión y muestra el resumen', () => {
    openSession();
    render(<LiveMatchdayOverlay />);

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    expect(useLiveMatchdayStore.getState().session).toBeNull();
    expect(useMatchResultsStore.getState().isOpen).toBe(true);
  });

  it('encierra el foco mientras la jornada está en vivo', () => {
    openSession();
    render(
      <>
        <button>Fondo</button>
        <LiveMatchdayOverlay />
      </>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);

    screen.getByText('Fondo').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('bloquea el scroll del fondo mientras está abierto', () => {
    openSession();
    const { unmount } = render(<LiveMatchdayOverlay />);
    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
