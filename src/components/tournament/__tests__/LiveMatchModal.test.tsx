import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { Team } from '../../../types';
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
});
