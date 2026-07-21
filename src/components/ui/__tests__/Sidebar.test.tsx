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
});
