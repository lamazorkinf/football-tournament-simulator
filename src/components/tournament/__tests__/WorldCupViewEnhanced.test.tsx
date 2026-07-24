import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { WorldCupViewEnhanced } from '../WorldCupViewEnhanced';
import { useTournamentStore } from '../../../store/useTournamentStore';
import { toCycle } from '../../../core/cycle';
import { baseTournament } from '../../../test/fixtures/cycle';
import type { WorldCup } from '../../../types';

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
      advanceToKnockout: vi.fn(async () => undefined),
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
    expect(
      screen.getByText('Se generan los dieciseisavos de final cuando termine la fase de grupos.')
    ).toBeInTheDocument();

    // Su acción vuelve a la pestaña de grupos.
    await userEvent.click(screen.getByRole('button', { name: 'Ver fase de grupos' }));
    expect(screen.getByRole('tab', { name: 'Grupos' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Playoffs sin generar')).not.toBeInTheDocument();
  });
});
