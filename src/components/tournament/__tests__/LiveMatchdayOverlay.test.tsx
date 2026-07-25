import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import type { Cycle, Team } from '../../../types';
import { LiveMatchdayOverlay } from '../LiveMatchdayOverlay';
import { useLiveMatchdayStore, type LiveMatchdayEntry } from '../../../store/useLiveMatchdayStore';
import { useMatchResultsStore } from '../../../store/useMatchResultsStore';
import { useTournamentStore } from '../../../store/useTournamentStore';
import { useConfigStore, DEFAULT_CONFIG } from '../../../store/useConfigStore';
import { toCycle } from '../../../core/cycle';
import { baseTournament } from '../../../test/fixtures/cycle';

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
  // Energía de ENTRADA (con la que llegaron al partido), distinta a propósito
  // de cualquier valor que pueda quedar comprometido en `cycle.energy` — ver
  // describe('energía en vivo').
  homeEnergy: 82,
  awayEnergy: 91,
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

    it('grilla mixta: la tarjeta sin alargue muestra FINAL a los 90 aunque la otra siga jugando hasta el 120', () => {
      const finishedAt90: LiveMatchdayEntry = entry; // arg vs bra, 2-1, sin alargue
      const stillPlayingExtraTime: LiveMatchdayEntry = {
        matchId: 'm2',
        homeTeamId: 'usa',
        awayTeamId: 'mex',
        timeline: {
          goals: [{ minute: 105, side: 'home', homeScore: 1, awayScore: 0 }],
          finalHomeScore: 1,
          finalAwayScore: 0,
          hasExtraTime: true,
        },
        groupName: 'Octavos',
        region: 'America',
        isFavorite: false,
        homeEnergy: 100,
        awayEnergy: 100,
      };
      useTournamentStore.setState({
        teams: [
          ...teams,
          { id: 'usa', name: 'Estados Unidos', flag: '🇺🇸', region: 'America', skill: 70 },
          { id: 'mex', name: 'México', flag: '🇲🇽', region: 'America', skill: 72 },
        ],
      });
      useLiveMatchdayStore.setState({
        session: {
          title: 'Mixta',
          entries: [finishedAt90, stillPlayingExtraTime],
          allResults: [],
          hiddenCount: 0,
        },
      });
      render(<LiveMatchdayOverlay />);

      act(() => vi.advanceTimersByTime(90 * 1000));
      // A los 90': el reloj compartido sigue en 'playing' (hay alargue en la
      // grilla), pero la tarjeta que ya terminó sus 90' lo comunica igual...
      let [cardA, cardB] = screen.getAllByTestId('live-card');
      expect(screen.getByText("90'")).toBeInTheDocument();
      expect(within(cardA).getByText('FINAL')).toBeInTheDocument();
      // ...mientras la que sigue en alargue no muestra FINAL todavía.
      expect(within(cardB).queryByText('FINAL')).not.toBeInTheDocument();

      act(() => vi.advanceTimersByTime(30 * 1000)); // minuto 120: termina el alargue
      [cardA, cardB] = screen.getAllByTestId('live-card');
      expect(within(cardA).getByText('FINAL')).toBeInTheDocument();
      expect(within(cardB).getByText('FINAL')).toBeInTheDocument();
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

  describe('energía en vivo', () => {
    afterEach(() => {
      useConfigStore.setState({ config: DEFAULT_CONFIG });
      useTournamentStore.setState({ currentTournament: null });
    });

    // Regresión: la tarjeta mostraba la energía YA comprometida al ciclo
    // (`cycle.energy`), que en commit-then-replay es la energía POSTERIOR al
    // costo del partido — sistemáticamente menor a la de entrada. La tarjeta
    // tiene que mostrar con cuánta energía llegaron los equipos (la que
    // viaja en `entry.homeEnergy`/`awayEnergy`), no con cuánta quedaron.
    it('muestra la energía de entrada del partido, no la del ciclo ya comprometido', () => {
      const committedCycle: Cycle = {
        ...toCycle(baseTournament()),
        energy: {
          scope: 'world-cup',
          byTeam: {
            // Valores POST-partido, deliberadamente distintos (más bajos) que
            // entry.homeEnergy/awayEnergy (82/91): si la tarjeta leyera acá
            // en vez del entry, este test lo detectaría.
            arg: { value: 58, lastMatchdayIndex: 1 },
            bra: { value: 71, lastMatchdayIndex: 1 },
          },
        },
      };
      useTournamentStore.setState({ teams, currentTournament: committedCycle });

      openSession();
      render(<LiveMatchdayOverlay />);

      expect(screen.getByText('82%')).toBeInTheDocument();
      expect(screen.getByText('91%')).toBeInTheDocument();
      expect(screen.queryByText('58%')).not.toBeInTheDocument();
      expect(screen.queryByText('71%')).not.toBeInTheDocument();
    });

    it('con la fatiga apagada en la config no muestra energía', () => {
      useConfigStore.getState().updateFatigue({ enabled: false });
      openSession();
      render(<LiveMatchdayOverlay />);

      expect(screen.queryByText('82%')).not.toBeInTheDocument();
      expect(screen.queryByText('91%')).not.toBeInTheDocument();
    });
  });
});
