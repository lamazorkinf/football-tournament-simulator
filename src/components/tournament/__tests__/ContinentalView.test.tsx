import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ContinentalView } from '../ContinentalView';
import { useTournamentStore } from '../../../store/useTournamentStore';
import { makeDrawnContinentalCycle } from '../../../test/fixtures/cycle';

describe('ContinentalView', () => {
  it('renderiza el bracket de Europa con partidos R64 jugables e invoca la acción', async () => {
    const { cycle, teams } = makeDrawnContinentalCycle();
    const simulateContinentalMatch = vi.fn(async () => null);
    useTournamentStore.setState({ simulateContinentalMatch, isSavingMatch: false });

    render(<ContinentalView cycle={cycle} teams={teams} />);

    expect(screen.getByText('Torneos Continentales')).toBeInTheDocument();
    const playButtons = screen.getAllByRole('button', { name: /jugar/i });
    // Europa: 23 cruces R64, todos en la jornada actual (md1).
    expect(playButtons).toHaveLength(cycle.continental.brackets.Europe.roundOf64.length);

    await userEvent.click(playButtons[0]);
    expect(simulateContinentalMatch).toHaveBeenCalledTimes(1);
  });

  it('muestra el botón "Ver en vivo" junto a cada partido jugable del bracket', () => {
    const { cycle, teams } = makeDrawnContinentalCycle();
    const simulateContinentalMatch = vi.fn(async () => null);
    useTournamentStore.setState({ simulateContinentalMatch, isSavingMatch: false });

    render(<ContinentalView cycle={cycle} teams={teams} />);

    expect(screen.getAllByRole('button', { name: /ver en vivo/i }).length).toBeGreaterThan(0);
  });
});
