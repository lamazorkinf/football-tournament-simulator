import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TournamentHistory } from '../TournamentHistory';
import { useTournamentStore } from '../../../store/useTournamentStore';

const deleteTournament = vi.fn();

function makeTournament(id: string, year: number) {
  return {
    id,
    year,
    name: `Mundial ${year}`,
    qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
    worldCup: null,
  };
}

describe('TournamentHistory', () => {
  beforeEach(() => {
    deleteTournament.mockClear();
    useTournamentStore.setState({
      tournaments: [makeTournament('a', 2026), makeTournament('b', 2030)],
      currentTournamentId: 'a',
      deleteTournament,
    } as never);
  });

  it('no borra el torneo hasta confirmar', async () => {
    render(<TournamentHistory />);

    await userEvent.click(screen.getAllByTitle('Eliminar torneo')[0]);
    expect(deleteTournament).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /^eliminar$/i }));
    expect(deleteTournament).toHaveBeenCalledTimes(1);
  });

  it('cancelar deja el torneo intacto', async () => {
    render(<TournamentHistory />);

    await userEvent.click(screen.getAllByTitle('Eliminar torneo')[0]);
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(deleteTournament).not.toHaveBeenCalled();
  });
});
