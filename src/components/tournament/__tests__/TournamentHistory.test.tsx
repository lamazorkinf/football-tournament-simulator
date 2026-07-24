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
    expect(deleteTournament).toHaveBeenCalledWith('a');
  });

  it('cancelar deja el torneo intacto', async () => {
    render(<TournamentHistory />);

    await userEvent.click(screen.getAllByTitle('Eliminar torneo')[0]);
    await userEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(deleteTournament).not.toHaveBeenCalled();
  });

  it('deja el diálogo abierto si falla el borrado en la base', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('sin red'));
    useTournamentStore.setState({ deleteTournament: failing } as never);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<TournamentHistory />);
    await userEvent.click(screen.getAllByTitle('Eliminar torneo')[0]);
    await userEvent.click(screen.getByRole('button', { name: /^eliminar$/i }));

    expect(failing).toHaveBeenCalledTimes(1);
    // El diálogo sigue en pantalla: el borrado no ocurrió.
    expect(screen.getByRole('button', { name: /^eliminar$/i })).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
