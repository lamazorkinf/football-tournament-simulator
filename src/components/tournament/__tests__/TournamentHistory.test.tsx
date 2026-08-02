import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TournamentHistory } from '../TournamentHistory';
import { useTournamentStore } from '../../../store/useTournamentStore';

const deleteTournament = vi.fn();
const selectTournament = vi.fn();

/** Mundial vacío: `getStats` recorre grupos y llaves, así que no pueden faltar. */
const emptyWorldCup = (champion: string) => ({
  champion,
  groups: [],
  knockout: {
    roundOf32: [],
    roundOf16: [],
    quarterFinals: [],
    semiFinals: [],
    thirdPlace: null,
    final: null,
  },
});

function makeTournament(id: string, year: number, champion?: string) {
  return {
    id,
    year,
    name: `Mundial ${year}`,
    qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
    worldCup: champion ? emptyWorldCup(champion) : null,
  };
}

describe('TournamentHistory', () => {
  beforeEach(() => {
    deleteTournament.mockClear();
    selectTournament.mockClear();
    useTournamentStore.setState({
      tournaments: [makeTournament('a', 2026), makeTournament('b', 2030)],
      currentTournamentId: 'a',
      teams: [{ id: 'bra', name: 'Brasil', flag: '', skill: 90 }],
      deleteTournament,
      selectTournament,
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

  /**
   * El campeón se guarda como id (`champion: final.winnerId` en el store), así
   * que rendirlo crudo mostraba algo como "bra" en vez de "Brasil".
   */
  it('muestra el NOMBRE del campeón, no su id', () => {
    useTournamentStore.setState({
      tournaments: [makeTournament('a', 2026, 'bra')],
    } as never);
    render(<TournamentHistory />);

    expect(screen.getByText(/Campeón: Brasil/)).toBeInTheDocument();
    expect(screen.queryByText(/Campeón: bra$/)).not.toBeInTheDocument();
  });

  it('un campeón que no está en el pool cae a su id', () => {
    useTournamentStore.setState({
      tournaments: [makeTournament('a', 2026, 'fantasma')],
    } as never);
    render(<TournamentHistory />);

    expect(screen.getByText(/Campeón: fantasma/)).toBeInTheDocument();
  });

  /**
   * "Ver" activaba el torneo pero dejaba al usuario mirando la misma lista, así
   * que parecía un botón muerto. Ahora también navega.
   */
  it('"Ver" activa el torneo Y navega', async () => {
    const onNavigate = vi.fn();
    render(<TournamentHistory onNavigate={onNavigate} />);

    // El primero es el activo ("Activo"); el segundo es el que se puede ver.
    await userEvent.click(screen.getByRole('button', { name: /^ver$/i }));

    expect(selectTournament).toHaveBeenCalledWith('b');
    expect(onNavigate).toHaveBeenCalledWith('hub');
  });

  it('sin onNavigate no revienta: sólo activa', async () => {
    render(<TournamentHistory />);

    await userEvent.click(screen.getByRole('button', { name: /^ver$/i }));

    expect(selectTournament).toHaveBeenCalledWith('b');
  });
});
