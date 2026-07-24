import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ConfederationsCupView } from '../ConfederationsCupView';
import { useTournamentStore } from '../../../store/useTournamentStore';
import { makeDrawnConfedCycle } from '../../../test/fixtures/cycle';

describe('ConfederationsCupView', () => {
  it('renderiza 2 grupos con partidos de la jornada 1 jugables e invoca la acción', async () => {
    const { cycle, teams } = makeDrawnConfedCycle();
    const simulateConfederationsMatch = vi.fn(async () => null);
    useTournamentStore.setState({ simulateConfederationsMatch, isSavingMatch: false });

    render(<ConfederationsCupView cycle={cycle} teams={teams} />);

    expect(screen.getByText('Copa Confederaciones')).toBeInTheDocument();
    const playButtons = screen.getAllByRole('button', { name: /jugar/i });
    // md1: 2 partidos jugables por grupo × 2 grupos = 4.
    expect(playButtons).toHaveLength(4);

    await userEvent.click(playButtons[0]);
    expect(simulateConfederationsMatch).toHaveBeenCalledTimes(1);
  });
});
