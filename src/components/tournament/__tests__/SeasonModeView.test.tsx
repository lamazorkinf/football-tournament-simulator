import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SeasonModeView } from '../SeasonModeView';
import { useSeasonModeStore } from '../../../store/useSeasonModeStore';
import { useModeStore } from '../../../store/useModeStore';
import { useTournamentStore } from '../../../store/useTournamentStore';
import { VILLAMARIENSE_DESCRIPTOR } from '../../../modes/registry';
import type { LigaTournament } from '../../../core/formats/modeTournament';

/** Liga terminada: hace falta que las dos estén completas para poder cerrar. */
function ligaCompleta(id: string, name: string, division: string): LigaTournament {
  return {
    id,
    modeId: 'villamariense',
    competitionId: id,
    year: 2027,
    name,
    status: 'completed',
    division,
    format: 'liga',
    state: {
      teamIds: ['a', 'b'],
      legs: 2,
      matches: [
        { id: `${id}-m1`, homeTeamId: 'a', awayTeamId: 'b', homeScore: 1, awayScore: 0, isPlayed: true, matchday: 1 },
        { id: `${id}-m2`, homeTeamId: 'b', awayTeamId: 'a', homeScore: 2, awayScore: 2, isPlayed: true, matchday: 2 },
      ],
      standings: [],
    },
  };
}

/**
 * Modo de temporada en la pestaña "Temporada", con las dos ligas terminadas: el
 * único estado en el que el botón de cerrar está habilitado.
 *
 * `loadForMode` va mockeada porque el efecto de montaje la dispara y pisaría lo
 * que sembramos; `closeSeason` también, para no depender de la persistencia.
 */
function seedSeasonReadyToClose(closeSeason: () => Promise<void>) {
  useModeStore.setState({
    activeModeId: 'villamariense',
    modes: [
      { id: 'villamariense', name: 'Liga Villamariense', kind: 'league-system', config: {}, currentYear: 2027 },
    ],
  });
  useTournamentStore.setState({ teams: [] });
  useSeasonModeStore.setState({
    modeId: 'villamariense',
    descriptor: VILLAMARIENSE_DESCRIPTOR,
    year: 2027,
    currentYear: 2027,
    availableYears: [2027],
    divisions: {},
    tournaments: [ligaCompleta('league-A', 'Liga A', 'A'), ligaCompleta('league-B', 'Liga B', 'B')],
    status: 'ready',
    busy: false,
    activeTab: 'season',
    loadForMode: vi.fn(async () => {}),
    closeSeason: vi.fn(closeSeason),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useSeasonModeStore.getState().reset();
});

describe('SeasonModeView — cerrar la temporada', () => {
  it('al cerrarla lleva al inicio, que es donde se arranca la siguiente', async () => {
    // Lo que hace closeSeason de verdad: avanza el año y recarga sin torneos.
    seedSeasonReadyToClose(async () => {
      useSeasonModeStore.setState({ year: 2028, currentYear: 2028, tournaments: [] });
    });
    const onNavigate = vi.fn();
    render(<SeasonModeView onNavigate={onNavigate} />);

    await userEvent.click(screen.getByRole('button', { name: /cerrar temporada/i }));

    // Sin esto el usuario queda en esta misma vista, que ya no tiene ninguna
    // competición: la única pestaña que sobrevive es Escudos.
    expect(onNavigate).toHaveBeenCalledWith('hub');
  });

  it('si el cierre no prospera no se mueve de la vista', async () => {
    // Los guards de closeSeason abortan en silencio (ligas sin terminar, fallo
    // de red): el año no avanza y no hay adónde ir.
    seedSeasonReadyToClose(async () => {});
    const onNavigate = vi.fn();
    render(<SeasonModeView onNavigate={onNavigate} />);

    await userEvent.click(screen.getByRole('button', { name: /cerrar temporada/i }));

    expect(useSeasonModeStore.getState().closeSeason).toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  /**
   * Afirmar que los bloques de la portada no se rinden sería vacuo: eran
   * inalcanzables incluso antes de borrarlos, porque `nav.tab` nunca vale
   * 'main'. Lo que sí se puede romper —y es la causa de aquello— es que la
   * portada vuelva a ser una PESTAÑA de esta vista: alcanza con reponer el
   * pseudo-item `main` en `nav.ts`, o con dejar de filtrar el item del Hub acá.
   * Las dos regresiones hacen aparecer un botón "Inicio" en esta barra.
   */
  it('la portada del modo dejó de ser una pestaña de esta vista', () => {
    seedSeasonReadyToClose(async () => {});
    useSeasonModeStore.setState({ tournaments: [] });
    render(<SeasonModeView />);

    // Sin temporada arrancada queda una sola pestaña, Escudos: el inicio es el
    // Hub, una vista aparte.
    expect(screen.getByRole('button', { name: 'Escudos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inicio' })).not.toBeInTheDocument();
  });
});
