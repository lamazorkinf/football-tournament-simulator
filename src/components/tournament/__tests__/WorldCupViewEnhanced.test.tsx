import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { WorldCupViewEnhanced } from '../WorldCupViewEnhanced';
import { useTournamentStore } from '../../../store/useTournamentStore';
import { toCycle } from '../../../core/cycle';
import { baseTournament } from '../../../test/fixtures/cycle';
import type { WorldCup } from '../../../types';

// Espiar `toast.success` (sonner no necesita un <Toaster/> montado para
// registrar la llamada) es lo único que permite distinguir, desde afuera, si
// handleAdvanceToKnockout festejó o se quedó callado cuando el store rechazó.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// Mundial con grupos vacíos y llave de playoffs sin generar (roundOf32 vacío):
// el mismo estado que produce hoy la pestaña "Playoffs" bloqueada.
function makeCycleWithLockedPlayoffs() {
  const worldCup: WorldCup = {
    groups: [],
    knockout: {
      roundOf32: [],
      roundOf16: [],
      quarterFinals: [],
      semiFinals: [],
      thirdPlace: null,
      final: null,
    },
    qualifiedTeamIds: [],
  };
  return toCycle({ ...baseTournament(), worldCup });
}

describe('WorldCupViewEnhanced', () => {
  it('entrar a Playoffs bloqueado muestra el EmptyState, no un panel en blanco', async () => {
    const cycle = makeCycleWithLockedPlayoffs();
    useTournamentStore.setState({
      currentTournament: cycle,
      teams: [],
      advanceToKnockout: vi.fn(async () => true),
      regenerateKnockoutStage: vi.fn(async () => undefined),
      simulateMatch: vi.fn(async () => null),
    });

    render(<WorldCupViewEnhanced />);

    // La pestaña de playoffs sigue siendo alcanzable (no `disabled`) y su
    // etiqueta comunica el estado bloqueado, ya que el badge visual se perdió
    // al migrar a <Tabs>.
    const playoffsTab = screen.getByRole('tab', { name: 'Playoffs (bloqueado)' });
    expect(playoffsTab).not.toBeDisabled();

    await userEvent.click(playoffsTab);

    // En vez de un panel vacío, aparece el EmptyState explicando qué falta.
    expect(
      screen.getByText('Playoffs sin generar')
    ).toBeInTheDocument();
    // Contra el título y la acción, no contra el texto explicativo: ese copy se
    // afina y no tiene por qué romper el test cada vez que se reescribe.
    expect(
      screen.getByRole('button', { name: 'Ver fase de grupos' })
    ).toBeInTheDocument();

    // Su acción vuelve a la pestaña de grupos.
    await userEvent.click(screen.getByRole('button', { name: 'Ver fase de grupos' }));
    expect(screen.getByRole('tab', { name: 'Grupos' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Playoffs sin generar')).not.toBeInTheDocument();
  });
});

// Mundial con un grupo completo (un partido jugado) y sin dieciseisavos
// generados todavía: el mismo estado que muestra el botón "Generar
// Dieciseisavos de Final".
function makeCycleWithGroupsComplete() {
  const worldCup: WorldCup = {
    groups: [
      {
        id: 'wc-g1',
        name: 'Grupo A',
        teamIds: ['a', 'b', 'c', 'd'],
        matches: [
          { id: 'wc-m1', homeTeamId: 'a', awayTeamId: 'b', homeScore: 1, awayScore: 0, isPlayed: true },
        ],
        standings: [],
      },
    ],
    knockout: {
      roundOf32: [],
      roundOf16: [],
      quarterFinals: [],
      semiFinals: [],
      thirdPlace: null,
      final: null,
    },
    qualifiedTeamIds: [],
  };
  return toCycle({ ...baseTournament(), worldCup });
}

describe('WorldCupViewEnhanced — handleAdvanceToKnockout', () => {
  it('no festeja ni cambia de pestaña si el guard rechaza', async () => {
    const cycle = makeCycleWithGroupsComplete();
    useTournamentStore.setState({
      currentTournament: cycle,
      teams: [],
      advanceToKnockout: vi.fn(async () => false),
      regenerateKnockoutStage: vi.fn(async () => undefined),
      simulateMatch: vi.fn(async () => null),
    });

    render(<WorldCupViewEnhanced />);

    await userEvent.click(screen.getByRole('button', { name: /generar dieciseisavos de final/i }));

    expect(toast.success).not.toHaveBeenCalled();
    // Sigue en Grupos (con el único partido jugado, la etiqueta pasa a
    // "Grupos 100%"): sin la ronda generada de verdad, saltar a Playoffs solo
    // mostraría el EmptyState de "sin generar" en falso.
    expect(screen.getByRole('tab', { name: /^grupos/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('festeja y cambia a la pestaña de playoffs cuando la ronda se genera', async () => {
    const cycle = makeCycleWithGroupsComplete();
    useTournamentStore.setState({
      currentTournament: cycle,
      teams: [],
      advanceToKnockout: vi.fn(async () => true),
      regenerateKnockoutStage: vi.fn(async () => undefined),
      simulateMatch: vi.fn(async () => null),
    });

    render(<WorldCupViewEnhanced />);

    await userEvent.click(screen.getByRole('button', { name: /generar dieciseisavos de final/i }));

    expect(toast.success).toHaveBeenCalledWith('Dieciseisavos de final generados');
    expect(screen.getByRole('tab', { name: 'Playoffs (bloqueado)' })).toHaveAttribute('aria-selected', 'true');
  });
});
