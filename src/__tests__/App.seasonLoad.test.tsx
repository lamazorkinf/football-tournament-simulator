import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../App';
import { useModeStore } from '../store/useModeStore';
import { useSeasonModeStore } from '../store/useSeasonModeStore';
import { useTournamentStore } from '../store/useTournamentStore';
import type { GameMode } from '../types';

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: () => false,
  supabase: {},
  escapeOrValue: (v: string) => v,
}));

vi.mock('../lib/hydrateSettings', () => ({
  hydrateSettings: vi.fn(),
  clearLegacyTournamentStorage: vi.fn(),
}));

const VILLAMARIENSE: GameMode = {
  id: 'villamariense',
  name: 'Liga Villamariense',
  kind: 'league-system',
  config: {},
  currentYear: 2028,
};

const SELECCIONES: GameMode = {
  id: 'selecciones',
  name: 'Selecciones',
  kind: 'national-cycle',
  config: {},
  currentYear: 2026,
};

/**
 * La app arranca con `initStatus: 'error'`, o sea rindiendo la pantalla de
 * reintento y NINGUNA vista del juego. Es a propósito: lo que se prueba es que
 * la temporada del modo se carga sin depender de qué pantalla monte, y la forma
 * más fuerte de afirmarlo es que se cargue cuando no monta ninguna. Con la
 * carga colgada de `SeasonModeView` —que es como estaba— estos tests fallan.
 */
function seedApp(activeModeId: string, modes: GameMode[]) {
  useTournamentStore.setState({
    initStatus: 'error',
    teams: [],
    currentTournament: null,
    loadTeamsFromDatabase: vi.fn(async () => {}),
    initializeTournament: vi.fn(async () => {}),
    refreshFromDatabase: vi.fn(async () => {}),
  });
  useModeStore.setState({
    activeModeId,
    modes,
    isLoaded: true,
    loadModes: vi.fn(async () => {}),
  });
  useSeasonModeStore.setState({ loadForMode: vi.fn(async () => {}) });
}

const loadForMode = () => useSeasonModeStore.getState().loadForMode as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('App — carga de la temporada del modo activo', () => {
  it('entrar en un modo de temporada carga su temporada', async () => {
    seedApp('villamariense', [VILLAMARIENSE]);
    render(<App />);

    await waitFor(() => expect(loadForMode()).toHaveBeenCalledWith(VILLAMARIENSE));
  });

  it('no se dispara una carga por render', async () => {
    seedApp('villamariense', [VILLAMARIENSE]);
    const { rerender } = render(<App />);
    await waitFor(() => expect(loadForMode()).toHaveBeenCalled());

    rerender(<App />);
    // Y un cambio de estado ajeno al modo tampoco la vuelve a disparar.
    act(() => {
      useSeasonModeStore.setState({ busy: true });
    });

    expect(loadForMode()).toHaveBeenCalledTimes(1);
  });

  it('el ciclo mundialista no tiene temporada que cargar', async () => {
    seedApp('selecciones', [SELECCIONES]);
    render(<App />);

    await waitFor(() => expect(useModeStore.getState().activeMode()).toBe(SELECCIONES));
    expect(loadForMode()).not.toHaveBeenCalled();
  });

  it('cambiar de modo con la app abierta carga el nuevo', async () => {
    seedApp('selecciones', [SELECCIONES, VILLAMARIENSE]);
    render(<App />);
    expect(loadForMode()).not.toHaveBeenCalled();

    act(() => {
      useModeStore.setState({ activeModeId: 'villamariense' });
    });

    await waitFor(() => expect(loadForMode()).toHaveBeenCalledWith(VILLAMARIENSE));
  });

  it('si la lista de modos resuelve después que el id activo, igual carga', async () => {
    // El id activo sale de localStorage y está antes que `loadModes()`: al
    // principio no hay objeto de modo, así que el efecto no puede depender sólo
    // del id crudo — tiene que despertar cuando el modo aparece.
    seedApp('villamariense', []);
    render(<App />);
    expect(loadForMode()).not.toHaveBeenCalled();

    act(() => {
      useModeStore.setState({ modes: [VILLAMARIENSE] });
    });

    await waitFor(() => expect(loadForMode()).toHaveBeenCalledWith(VILLAMARIENSE));
  });
});
