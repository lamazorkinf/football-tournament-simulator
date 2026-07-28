import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Sidebar } from '../Sidebar';
import { useTournamentStore } from '../../../store/useTournamentStore';

describe('Sidebar', () => {
  it('incluye entradas Continental y Confederaciones y navega al hacer click', async () => {
    useTournamentStore.setState({ tournaments: [], currentTournamentId: null });
    const onViewChange = vi.fn();
    render(<Sidebar currentView="wizard" onViewChange={onViewChange} tournamentYear={2026} />);

    await userEvent.click(screen.getByRole('button', { name: /continental/i }));
    expect(onViewChange).toHaveBeenCalledWith('continental');

    await userEvent.click(screen.getByRole('button', { name: /confederaciones/i }));
    expect(onViewChange).toHaveBeenCalledWith('confederations');
  });

  it('agrupa los ítems en secciones', () => {
    useTournamentStore.setState({ tournaments: [], currentTournamentId: null });
    render(<Sidebar currentView="wizard" onViewChange={vi.fn()} tournamentYear={2026} />);

    expect(screen.getByText('Ciclo actual')).toBeInTheDocument();
    expect(screen.getByText('Datos')).toBeInTheDocument();
    expect(screen.getByText('Archivo')).toBeInTheDocument();
  });

  it('marca como bloqueadas las fases no desbloqueadas pero las deja clickeables', async () => {
    // Las fases bloqueadas ya no son un prop: salen del progreso del ciclo
    // (modes/seleccionesAdapter). Un ciclo sin sortear las tiene todas.
    useTournamentStore.setState({
      tournaments: [],
      currentTournamentId: null,
      currentTournament: {
        continental: { brackets: {} },
        confederationsCup: { groups: [], isComplete: false },
        worldCup: null,
      } as never,
    });
    const onViewChange = vi.fn();
    render(<Sidebar currentView="wizard" onViewChange={onViewChange} tournamentYear={2026} />);

    const confed = screen.getByRole('button', { name: /confederaciones/i });
    expect(confed).not.toBeDisabled();
    expect(confed).toHaveAttribute('title', expect.stringContaining('bloqueada'));
    await userEvent.click(confed);
    expect(onViewChange).toHaveBeenCalledWith('confederations');

    useTournamentStore.setState({ currentTournament: null });
  });
});
