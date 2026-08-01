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
  it('muestra título y fase del modo', () => {
    render(<HubView {...props()} />);
    expect(screen.getByText('Ciclo 2026')).toBeInTheDocument();
    expect(screen.getByText('Torneos Continentales')).toBeInTheDocument();
  });

  it('el botón principal dispara la acción', async () => {
    const onPress = vi.fn();
    render(<HubView {...props({ nextAction: { label: '▶ EMPEZAR', onPress } })} />);
    await userEvent.click(screen.getByRole('button', { name: /EMPEZAR/ }));
    expect(onPress).toHaveBeenCalled();
  });

  it('respeta el disabled de la acción', async () => {
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

  it('sin próxima acción muestra el cierre y ofrece torneo nuevo', async () => {
    const onNewTournament = vi.fn();
    render(<HubView {...props({ nextAction: null, onNewTournament })} />);
    expect(screen.getByText(/no queda nada por jugar/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Nuevo torneo/i }));
    expect(onNewTournament).toHaveBeenCalled();
  });

  it('sin próxima acción y sin salida no rinde botón de cierre', () => {
    render(<HubView {...props({ nextAction: null })} />);
    expect(screen.queryByRole('button', { name: /Nuevo torneo/i })).not.toBeInTheDocument();
  });

  it('el modo puede explicar su propio cierre en vez del texto genérico', () => {
    render(
      <HubView
        {...props({
          nextAction: null,
          emptyMessage: 'Este modo todavía no tiene sus divisiones cargadas.',
        })}
      />,
    );
    expect(screen.getByText(/no tiene sus divisiones cargadas/i)).toBeInTheDocument();
    expect(screen.queryByText(/no queda nada por jugar/i)).not.toBeInTheDocument();
  });

  it('cargando no ofrece ninguna acción', () => {
    render(<HubView {...props({ isLoading: true })} />);
    expect(screen.queryByRole('button', { name: /SORTEAR/ })).not.toBeInTheDocument();
  });

  it('sin último resultado no rinde ese bloque', () => {
    render(<HubView {...props()} />);
    expect(screen.queryByText(/ultimo resultado/i)).not.toBeInTheDocument();
  });

  it('con último resultado lo muestra', () => {
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

  it('con ids de equipo en el resultado rinde las banderas', () => {
    // Ids de selección (código de país): `TeamFlag` deriva la URL del id y no
    // depende del pool de equipos del store, así que no hace falta sembrarlo
    // para que esta rama sea honesta — si se rompe la condición que hoy exige
    // `homeTeamId`/`awayTeamId`, este test deja de encontrar el <img>.
    render(
      <HubView
        {...props({
          lastResult: {
            homeTeam: 'Islandia',
            awayTeam: 'Brasil',
            homeTeamId: 'isl',
            awayTeamId: 'bra',
            homeScore: 2,
            awayScore: 1,
          },
        })}
      />,
    );
    const homeFlag = screen.getByRole('img', { name: /islandia/i });
    const awayFlag = screen.getByRole('img', { name: /brasil/i });
    expect(homeFlag).toHaveAttribute('src', expect.stringContaining('flagcdn.com'));
    expect(awayFlag).toHaveAttribute('src', expect.stringContaining('flagcdn.com'));
  });

  it('el peldaño de la escalera avisa cuál se eligió', async () => {
    const onSelectStep = vi.fn();
    render(<HubView {...props({ onSelectStep })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continental' }));
    expect(onSelectStep).toHaveBeenCalledWith(LADDER[0]);
  });
});
