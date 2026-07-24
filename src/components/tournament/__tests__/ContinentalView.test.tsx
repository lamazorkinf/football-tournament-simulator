import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { ContinentalView } from '../ContinentalView';
import { useTournamentStore } from '../../../store/useTournamentStore';
import { makeDrawnContinentalCycle } from '../../../test/fixtures/cycle';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

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

  it('avisa el resultado del partido simulado', async () => {
    const { cycle, teams } = makeDrawnContinentalCycle();
    const simulateContinentalMatch = vi.fn(async (_matchId: string) => ({ homeScore: 2, awayScore: 1 }));
    useTournamentStore.setState({ simulateContinentalMatch, isSavingMatch: false });

    render(<ContinentalView cycle={cycle} teams={teams} />);
    await userEvent.click(screen.getAllByRole('button', { name: /jugar/i })[0]);

    // El partido que se jugó es el que recibió la acción, sin asumir el orden.
    const playedId = simulateContinentalMatch.mock.calls[0][0];
    const played = cycle.continental.brackets.Europe.roundOf64.find((m) => m.id === playedId)!;
    const homeName = teams.find((t) => t.id === played.homeTeamId)!.name;
    const awayName = teams.find((t) => t.id === played.awayTeamId)!.name;

    expect(toast.success).toHaveBeenCalledTimes(1);
    render(<>{vi.mocked(toast.success).mock.calls[0][0] as React.ReactNode}</>);
    expect(screen.getByText(homeName)).toBeInTheDocument();
    expect(screen.getByText(awayName)).toBeInTheDocument();
    expect(screen.getByText('2 - 1')).toBeInTheDocument();
  });

  it('avisa cuando el partido no se pudo simular', async () => {
    const { cycle, teams } = makeDrawnContinentalCycle();
    const simulateContinentalMatch = vi.fn(async () => null);
    useTournamentStore.setState({ simulateContinentalMatch, isSavingMatch: false });

    render(<ContinentalView cycle={cycle} teams={teams} />);
    await userEvent.click(screen.getAllByRole('button', { name: /jugar/i })[0]);

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledTimes(1);
  });
});
