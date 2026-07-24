import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { GroupView } from '../GroupView';
import { useTournamentStore } from '../../../store/useTournamentStore';
import type { Group, Team, TeamStanding } from '../../../types';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

const teams: Team[] = [
  { id: 'arg', name: 'Argentina', flag: '🇦🇷', region: 'America', skill: 90 },
  { id: 'bra', name: 'Brasil', flag: '🇧🇷', region: 'America', skill: 88 },
];

const standing = (teamId: string): TeamStanding => ({
  teamId, played: 0, won: 0, drawn: 0, lost: 0,
  goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
});

const group: Group = {
  id: 'g1',
  name: 'Grupo A',
  region: 'America',
  teamIds: ['arg', 'bra'],
  matches: [
    { id: 'm1', homeTeamId: 'arg', awayTeamId: 'bra', homeScore: null, awayScore: null, isPlayed: false, matchday: 1 },
  ],
  standings: [standing('arg'), standing('bra')],
  isDrawComplete: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GroupView', () => {
  it('avisa el resultado con el marcador que devuelve la simulación', async () => {
    const simulateMatch = vi.fn(async () => ({ homeScore: 2, awayScore: 1 }));
    useTournamentStore.setState({ simulateMatch });

    render(<GroupView group={group} teams={teams} onBack={() => {}} />);
    await userEvent.click(screen.getAllByRole('button', { name: /jugar/i })[0]);

    expect(simulateMatch).toHaveBeenCalledWith('m1', 'g1', 'qualifier');
    expect(toast.success).toHaveBeenCalledTimes(1);
    render(<>{vi.mocked(toast.success).mock.calls[0][0] as React.ReactNode}</>);
    expect(screen.getByText('2 - 1')).toBeInTheDocument();
    expect(screen.getByText('Argentina')).toBeInTheDocument();
    expect(screen.getByText('Brasil')).toBeInTheDocument();
  });

  it('no avisa nada si la simulación no devuelve resultado', async () => {
    const simulateMatch = vi.fn(async () => null);
    useTournamentStore.setState({ simulateMatch });

    render(<GroupView group={group} teams={teams} onBack={() => {}} />);
    await userEvent.click(screen.getAllByRole('button', { name: /jugar/i })[0]);

    expect(toast.success).not.toHaveBeenCalled();
  });
});
