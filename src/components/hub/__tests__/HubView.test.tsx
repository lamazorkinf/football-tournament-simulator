import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { HubView } from '../HubView';
import type { NavItem } from '../../../modes/nav';

const LADDER: NavItem[] = [
  {
    key: 'continental',
    label: 'Continental',
    shortLabel: 'CONTI',
    icon: 'globe',
    target: { view: 'continental' },
    locked: false,
    section: 'competition',
  },
  {
    key: 'world-cup',
    label: 'Mundial',
    shortLabel: 'COPA',
    icon: 'trophy',
    target: { view: 'worldcup' },
    locked: true,
    section: 'competition',
  },
];

function props(over: Partial<React.ComponentProps<typeof HubView>> = {}) {
  return {
    title: 'Ciclo 2026',
    phaseLabel: 'Torneos Continentales',
    progress: 0.12,
    nextAction: { label: '▶ SORTEAR CONTINENTAL', onPress: vi.fn() },
    ladder: LADDER,
    currentView: 'hub' as const,
    onSelectStep: vi.fn(),
    lastResult: null,
    ...over,
  };
}

describe('HubView', () => {
  it('muestra titulo y fase del modo', () => {
    render(<HubView {...props()} />);
    expect(screen.getByText('Ciclo 2026')).toBeInTheDocument();
    expect(screen.getByText('Torneos Continentales')).toBeInTheDocument();
  });

  it('el boton principal dispara la accion', async () => {
    const onPress = vi.fn();
    render(<HubView {...props({ nextAction: { label: '▶ EMPEZAR', onPress } })} />);
    await userEvent.click(screen.getByRole('button', { name: /EMPEZAR/ }));
    expect(onPress).toHaveBeenCalled();
  });

  it('respeta el disabled de la accion', async () => {
    const onPress = vi.fn();
    render(
      <HubView {...props({ nextAction: { label: '▶ EMPEZAR', onPress, disabled: true } })} />,
    );
    expect(screen.getByRole('button', { name: /EMPEZAR/ })).toBeDisabled();
  });

  it('sirve igual a un modo de temporada: mismo componente, otras props', () => {
    render(
      <HubView
        {...props({
          title: 'Temporada 2027',
          phaseLabel: 'Liga A',
          nextAction: { label: '▶ SIMULAR FECHA 4', onPress: vi.fn() },
        })}
      />,
    );
    expect(screen.getByText('Temporada 2027')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /SIMULAR FECHA 4/ })).toBeInTheDocument();
  });

  it('sin proxima accion muestra el cierre y ofrece torneo nuevo', async () => {
    const onNewTournament = vi.fn();
    render(<HubView {...props({ nextAction: null, onNewTournament })} />);
    expect(screen.getByText(/no queda nada por jugar/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Nuevo torneo/i }));
    expect(onNewTournament).toHaveBeenCalled();
  });

  it('sin proxima accion y sin salida no rinde boton de cierre', () => {
    render(<HubView {...props({ nextAction: null })} />);
    expect(screen.queryByRole('button', { name: /Nuevo torneo/i })).not.toBeInTheDocument();
  });

  it('cargando no ofrece ninguna accion', () => {
    render(<HubView {...props({ isLoading: true })} />);
    expect(screen.queryByRole('button', { name: /SORTEAR/ })).not.toBeInTheDocument();
  });

  it('sin ultimo resultado no rinde ese bloque', () => {
    render(<HubView {...props()} />);
    expect(screen.queryByText(/ultimo resultado/i)).not.toBeInTheDocument();
  });

  it('con ultimo resultado lo muestra', () => {
    render(
      <HubView
        {...props({
          lastResult: { homeTeam: 'Islandia', awayTeam: 'Brasil', homeScore: 2, awayScore: 1 },
        })}
      />,
    );
    expect(screen.getByText('Islandia')).toBeInTheDocument();
    expect(screen.getByText('Brasil')).toBeInTheDocument();
  });

  it('el peldano de la escalera avisa cual se eligio', async () => {
    const onSelectStep = vi.fn();
    render(<HubView {...props({ onSelectStep })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continental' }));
    expect(onSelectStep).toHaveBeenCalledWith(LADDER[0]);
  });
});
