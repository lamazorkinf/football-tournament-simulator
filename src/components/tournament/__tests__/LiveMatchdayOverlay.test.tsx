import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { Team } from '../../../types';
import { LiveMatchdayOverlay } from '../LiveMatchdayOverlay';
import { useLiveMatchdayStore, type LiveMatchdayEntry } from '../../../store/useLiveMatchdayStore';
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
});
