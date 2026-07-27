import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { ConfederationsCupView } from '../ConfederationsCupView';
import { useTournamentStore } from '../../../store/useTournamentStore';
import { makeDrawnConfedCycle } from '../../../test/fixtures/cycle';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ConfederationsCupView', () => {
  it('renderiza 2 grupos con partidos de la jornada 1 jugables e invoca la acción', async () => {
    const { cycle, teams } = makeDrawnConfedCycle();
    const simulateConfederationsMatch = vi.fn(async () => null);
    useTournamentStore.setState({ simulateConfederationsMatch, isSavingMatch: false });

    render(<ConfederationsCupView cycle={cycle} teams={teams} />);

    expect(screen.getByText(/Copa Confederaciones/)).toBeInTheDocument();
    const playButtons = screen.getAllByRole('button', { name: /jugar/i });
    // md1: 2 partidos jugables por grupo × 2 grupos = 4.
    expect(playButtons).toHaveLength(4);

    await userEvent.click(playButtons[0]);
    expect(simulateConfederationsMatch).toHaveBeenCalledTimes(1);
  });

  it('avisa el resultado del partido simulado', async () => {
    const { cycle, teams } = makeDrawnConfedCycle();
    const simulateConfederationsMatch = vi.fn(async () => ({ homeScore: 3, awayScore: 0 }));
    useTournamentStore.setState({ simulateConfederationsMatch, isSavingMatch: false });

    render(<ConfederationsCupView cycle={cycle} teams={teams} />);
    await userEvent.click(screen.getAllByRole('button', { name: /jugar/i })[0]);

    expect(toast.success).toHaveBeenCalledTimes(1);
    render(<>{vi.mocked(toast.success).mock.calls[0][0] as React.ReactNode}</>);
    expect(screen.getByText('3 - 0')).toBeInTheDocument();
  });

  it('avisa cuando el partido no se pudo simular', async () => {
    const { cycle, teams } = makeDrawnConfedCycle();
    const simulateConfederationsMatch = vi.fn(async () => null);
    useTournamentStore.setState({ simulateConfederationsMatch, isSavingMatch: false });

    render(<ConfederationsCupView cycle={cycle} teams={teams} />);
    await userEvent.click(screen.getAllByRole('button', { name: /jugar/i })[0]);

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledTimes(1);
  });
});
