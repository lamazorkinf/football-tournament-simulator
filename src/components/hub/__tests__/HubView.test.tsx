import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { HubView } from '../HubView';
import type { NavItem } from '../../../modes/nav';
import type { HubIdle } from '../../../modes/hubHeader';

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
    headlines: [],
    idle: { kind: 'done' } as HubIdle,
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
          idle: { kind: 'blocked', message: 'Este modo todavía no tiene sus divisiones cargadas.' },
        })}
      />,
    );
    expect(screen.getByText(/no tiene sus divisiones cargadas/i)).toBeInTheDocument();
    expect(screen.queryByText(/no queda nada por jugar/i)).not.toBeInTheDocument();
  });

  it('cargando no ofrece ninguna acción', () => {
    render(<HubView {...props({ idle: { kind: 'loading' } })} />);
    expect(screen.queryByRole('button', { name: /SORTEAR/ })).not.toBeInTheDocument();
  });

  /**
   * La regresión que arregla el `idle`: mientras la temporada carga no hay
   * próxima acción, y el Hub deducía de eso que el modo se había terminado.
   * "Cargando" y "no queda nada" son estados distintos y se dibujan distinto.
   */
  it('cargando SIN próxima acción tampoco anuncia un cierre', () => {
    render(<HubView {...props({ nextAction: null, idle: { kind: 'loading' } })} />);
    expect(screen.queryByText(/no queda nada por jugar/i)).not.toBeInTheDocument();
  });

  it('sin titulares no rinde el bloque de portada', () => {
    render(<HubView {...props()} />);
    expect(screen.queryByText(/titulares/i)).not.toBeInTheDocument();
  });

  it('con titulares los rinde, con banderas', () => {
    // Ids de selección (código de país): `TeamFlag` deriva la URL del id y no
    // depende del pool de equipos del store, así que no hace falta sembrarlo.
    render(
      <HubView
        {...props({
          headlines: [
            {
              kind: 'upset',
              label: 'BATACAZO',
              detail: 'le ganó a un rival 25 puntos mejor',
              subjectTeamId: 'isl',
              score: 0.6,
              homeTeamName: 'Islandia',
              awayTeamName: 'Brasil',
              match: {
                homeTeamId: 'isl',
                awayTeamId: 'bra',
                homeScore: 2,
                awayScore: 1,
                homeSkillBefore: 60,
                awaySkillBefore: 85,
                stage: 'qualifier',
              },
            },
          ],
        })}
      />,
    );
    expect(screen.getByText('BATACAZO')).toBeInTheDocument();
    expect(screen.getByText('Islandia')).toBeInTheDocument();
    // Las DOS banderas: el layout dibuja al visitante con su propia rama, así
    // que afirmar sólo la del local dejaba la mitad sin cubrir.
    expect(screen.getByRole('img', { name: /islandia/i })).toHaveAttribute(
      'src',
      expect.stringContaining('flagcdn.com'),
    );
    expect(screen.getByRole('img', { name: /brasil/i })).toHaveAttribute(
      'src',
      expect.stringContaining('flagcdn.com'),
    );
  });

  it('el peldaño de la escalera avisa cuál se eligió', async () => {
    const onSelectStep = vi.fn();
    render(<HubView {...props({ onSelectStep })} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continental' }));
    expect(onSelectStep).toHaveBeenCalledWith(LADDER[0]);
  });
});
