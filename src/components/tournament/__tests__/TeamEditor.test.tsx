import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TeamEditor } from '../TeamEditor';
import { useTournamentStore } from '../../../store/useTournamentStore';
import * as teamsServiceModule from '../../../services/teamsService';
import * as supabaseModule from '../../../lib/supabase';

// Mock del servicio de equipos
vi.mock('../../../services/teamsService');
// Mock de supabase
vi.mock('../../../lib/supabase');

const mockDeleteTeam = vi.fn();
const mockLoadTeamsFromDatabase = vi.fn();
const mockIsSupabaseConfigured = vi.fn();

function makeTeam(id: string, name: string, region: any = 'Europe') {
  return {
    id,
    name,
    region,
    skill: 50,
    confederation: 'UEFA',
  };
}

describe('TeamEditor', () => {
  beforeEach(() => {
    mockDeleteTeam.mockClear();
    mockLoadTeamsFromDatabase.mockClear();
    mockIsSupabaseConfigured.mockClear();

    // Setup mocks
    (teamsServiceModule.teamsService.deleteTeam as any) = mockDeleteTeam;
    (supabaseModule.isSupabaseConfigured as any) = mockIsSupabaseConfigured;

    // Configurar el store con un equipo
    useTournamentStore.setState({
      teams: [makeTeam('arg', 'Argentina')],
      updateTeam: vi.fn(),
      loadTeamsFromDatabase: mockLoadTeamsFromDatabase,
    } as never);
  });

  afterEach(() => {
    // Restaurar mocks de console si se usaron
    vi.restoreAllMocks();
  });

  it('el diálogo permanece abierto cuando falla la eliminación del equipo', async () => {
    // Configurar mocks
    mockIsSupabaseConfigured.mockReturnValue(true);
    mockDeleteTeam.mockRejectedValue(new Error('Supabase error'));
    mockLoadTeamsFromDatabase.mockResolvedValue(undefined);

    // Espiar console.error para no contaminar la salida de tests
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<TeamEditor />);

    // Encontrar el botón de eliminar (último botón con clase text-loss)
    const deleteButtons = screen.getAllByRole('button').filter((btn) => {
      return btn.className.includes('text-loss');
    });
    expect(deleteButtons.length).toBeGreaterThan(0);

    await userEvent.click(deleteButtons[0]);

    // Confirmar en el diálogo
    const confirmButton = screen.getByRole('button', { name: /^eliminar$/i });
    await userEvent.click(confirmButton);

    // El diálogo debe permanecer abierto
    expect(screen.getByText(/se elimina/i)).toBeInTheDocument();
    expect(confirmButton).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
