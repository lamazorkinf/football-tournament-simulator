import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { Team, SimulatedMatchOutcome } from '../../../types';
import { LiveMatchModal } from '../LiveMatchModal';
import { useLiveMatchStore } from '../../../store/useLiveMatchStore';
import { useTournamentStore } from '../../../store/useTournamentStore';

const teams: Team[] = [
  { id: 'h', name: 'Local', flag: '🏠', region: 'Europe', skill: 80 },
  { id: 'a', name: 'Visita', flag: '✈️', region: 'Asia', skill: 75 },
];

beforeEach(() => {
  useLiveMatchStore.setState({ activeMatch: null });
  // Override de teams y de una acción del store real (zustand permite setState de campos).
  // El mock devuelve un resultado conocido; el modal lo reproduce.
  useTournamentStore.setState({
    teams,
    simulateContinentalMatch: async () => ({ homeScore: 2, awayScore: 1 }),
  });
});

describe('LiveMatchModal', () => {
  it('sin partido activo no renderiza nada', () => {
    const { container } = render(<LiveMatchModal />);
    expect(container).toBeEmptyDOMElement();
  });

  it('simula y reproduce: "Saltar al final" muestra el marcador final', async () => {
    render(<LiveMatchModal />);
    act(() => {
      useLiveMatchStore.getState().openLiveMatch({
        matchId: 'm1', homeTeamId: 'h', awayTeamId: 'a', kind: 'continental',
      });
    });
    // Sin fake timers: la promesa mock resuelve y arma el timeline; "Saltar al
    // final" solo aparece una vez que hay timeline.
    const skip = await screen.findByText('Saltar al final');
    act(() => skip.click());
    expect(screen.getByText('2 - 1')).toBeInTheDocument();
    expect(screen.getByText('FINAL')).toBeInTheDocument();
  });

  it('si la simulación no devuelve resultado, muestra el error', async () => {
    useTournamentStore.setState({ simulateContinentalMatch: async () => null });
    render(<LiveMatchModal />);
    act(() => {
      useLiveMatchStore.getState().openLiveMatch({
        matchId: 'm2', homeTeamId: 'h', awayTeamId: 'a', kind: 'continental',
      });
    });
    expect(await screen.findByText('No se pudo simular el partido.')).toBeInTheDocument();
  });

  it('llama a la acción de simulación una sola vez', async () => {
    const spy = vi.fn(async () => ({ homeScore: 1, awayScore: 0 }));
    useTournamentStore.setState({ simulateContinentalMatch: spy });
    render(<LiveMatchModal />);
    act(() => {
      useLiveMatchStore.getState().openLiveMatch({
        matchId: 'm3', homeTeamId: 'h', awayTeamId: 'a', kind: 'continental',
      });
    });
    await screen.findByText('Saltar al final');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('pausa el reloj y lo reanuda', async () => {
    render(<LiveMatchModal />);
    act(() => {
      useLiveMatchStore.getState().openLiveMatch({
        matchId: 'm4', homeTeamId: 'h', awayTeamId: 'a', kind: 'continental',
      });
    });
    await screen.findByText('Saltar al final');

    act(() => screen.getByRole('button', { name: 'Pausar' }).click());
    expect(screen.getByRole('button', { name: 'Reanudar' })).toBeInTheDocument();

    act(() => screen.getByRole('button', { name: 'Reanudar' }).click());
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument();
  });

  it('terminado el partido ya no ofrece pausar', async () => {
    render(<LiveMatchModal />);
    act(() => {
      useLiveMatchStore.getState().openLiveMatch({
        matchId: 'm5', homeTeamId: 'h', awayTeamId: 'a', kind: 'continental',
      });
    });
    const skip = await screen.findByText('Saltar al final');
    act(() => skip.click());

    expect(screen.queryByRole('button', { name: /pausar|reanudar/i })).not.toBeInTheDocument();
  });

  it('es un diálogo modal, se cierra con Escape y bloquea el scroll del fondo', async () => {
    render(<LiveMatchModal />);
    act(() => {
      useLiveMatchStore.getState().openLiveMatch({
        matchId: 'm6', homeTeamId: 'h', awayTeamId: 'a', kind: 'continental',
      });
    });
    await screen.findByText('Saltar al final');

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(document.body.style.overflow).toBe('hidden');

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(useLiveMatchStore.getState().activeMatch).toBeNull();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('encierra el foco mientras el partido se reproduce', async () => {
    render(
      <>
        <button>Fondo</button>
        <LiveMatchModal />
      </>,
    );
    act(() => {
      useLiveMatchStore.getState().openLiveMatch({
        matchId: 'm7', homeTeamId: 'h', awayTeamId: 'a', kind: 'continental',
      });
    });
    await screen.findByText('Saltar al final');

    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);

    screen.getByText('Fondo').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('descarta el resultado de un partido si se abrió otro antes de resolver', async () => {
    let resolveA!: (v: SimulatedMatchOutcome | null) => void;
    const pendingA = new Promise<SimulatedMatchOutcome | null>((r) => { resolveA = r; });
    useTournamentStore.setState({
      simulateContinentalMatch: () => pendingA,
      simulateKnockoutMatch: async () => ({ homeScore: 0, awayScore: 0, penalties: { homeScore: 4, awayScore: 2 } }),
    });
    render(<LiveMatchModal />);
    act(() => {
      useLiveMatchStore.getState().openLiveMatch({ matchId: 'A', homeTeamId: 'h', awayTeamId: 'a', kind: 'continental' });
    });
    // se abre B (knockout) antes de que A resuelva
    act(() => {
      useLiveMatchStore.getState().openLiveMatch({ matchId: 'B', homeTeamId: 'h', awayTeamId: 'a', kind: 'knockout' });
    });
    await screen.findByText('Saltar al final'); // B ya armó su timeline
    // A resuelve tarde
    await act(async () => { resolveA({ homeScore: 3, awayScore: 0 }); await pendingA; });
    // debe seguir mostrándose B (0-0 con penales), NO A (3-0)
    act(() => screen.getByText('Saltar al final').click());
    expect(screen.getByText('0 - 0')).toBeInTheDocument();
    expect(screen.queryByText('3 - 0')).not.toBeInTheDocument();
  });
});
