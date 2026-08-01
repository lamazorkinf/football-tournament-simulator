import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../App';
import { HEADLINES_DEBOUNCE_MS } from '../hooks/useRecentHeadlines';
import { matchHistoryService, type MatchHistoryEntry } from '../services/matchHistoryService';
import { useHistoryRevisionStore } from '../store/useHistoryRevisionStore';
import { useModeStore } from '../store/useModeStore';
import { useSeasonModeStore } from '../store/useSeasonModeStore';
import { useTournamentStore } from '../store/useTournamentStore';
import type { GameMode } from '../types';

// A diferencia de `App.seasonLoad.test.tsx`, acá NO se mockea `../lib/supabase`:
// ese test corta en la pantalla de reintento y no monta ninguna vista, mientras
// que éste renderiza el Hub entero. Sin las env vars, `isSupabaseConfigured()`
// ya devuelve false y los servicios cortan solos — es lo que hace `App.test.tsx`,
// que también renderiza la app completa.
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

const BATACAZO: MatchHistoryEntry = {
  id: 'm1',
  homeTeamId: 'A',
  awayTeamId: 'B',
  homeScore: 2,
  awayScore: 0,
  stage: 'league',
  homeSkillBefore: 55,
  awaySkillBefore: 90,
  homeSkillAfter: 56,
  awaySkillAfter: 89,
  homeSkillChange: 1,
  awaySkillChange: -1,
  playedAt: '2026-01-01T00:00:00Z',
};

/**
 * Cuánto espera este archivo por algo que depende del debounce de 300 ms de la
 * portada. Con timers reales, el default de `findByText` (1000 ms) deja ~640 ms
 * de margen medido: holgura de sobra para que no titile.
 */
const ESPERA_MS = 5000;

beforeEach(() => {
  vi.clearAllMocks();
  useTournamentStore.setState({
    initStatus: 'ready',
    currentTournament: null,
    teams: [
      { id: 'A', name: 'Ben Hur', flag: '', skill: 55 },
      { id: 'B', name: 'Alumni', flag: '', skill: 90 },
    ],
    loadTeamsFromDatabase: vi.fn(async () => {}),
    initializeTournament: vi.fn(async () => {}),
    refreshFromDatabase: vi.fn(async () => {}),
  });
  useModeStore.setState({
    activeModeId: 'villamariense',
    modes: [VILLAMARIENSE],
    isLoaded: true,
    loadModes: vi.fn(async () => {}),
  });
  useSeasonModeStore.setState({ loadForMode: vi.fn(async () => {}) });
});

/**
 * EL TEST DEL CABLE. La derivación y la tarjeta tienen sus propios tests; este
 * es el único que se rompe si `App.tsx` deja de pasarle los titulares al Hub.
 * El Critical de la etapa 1 —la Liga Villamariense muerta— pasó con 866 tests
 * en verde justamente por no tener uno así.
 */
describe('App — los titulares llegan al Hub', () => {
  it('un batacazo del historial se ve en la pantalla de inicio', async () => {
    vi.spyOn(matchHistoryService, 'getMatchesPage').mockResolvedValue({
      matches: [BATACAZO],
      nextCursor: null,
      hasMore: false,
    });

    render(<App />);

    // Timeout explícito: la consulta espera el debounce de 300 ms y recién
    // después resuelve. Con el default de 1000 ms el margen quedaba en ~640 ms,
    // justo en el test que no puede ser intermitente.
    expect(await screen.findByText('BATACAZO', {}, { timeout: ESPERA_MS })).toBeInTheDocument();
    expect(screen.getByText('Ben Hur')).toBeInTheDocument();
  });

  it('sin partidos en el historial, el Hub no rinde el bloque', async () => {
    vi.spyOn(matchHistoryService, 'getMatchesPage').mockResolvedValue({
      matches: [],
      nextCursor: null,
      hasMore: false,
    });

    render(<App />);

    await waitFor(() => expect(matchHistoryService.getMatchesPage).toHaveBeenCalled());
    expect(screen.queryByText(/titulares/i)).not.toBeInTheDocument();
  });

  /**
   * EL ESCENARIO. Simular los octavos del Mundial son 16 incrementos de la
   * revisión espaciados por más de un debounce (`simulateRoundBatch` es
   * secuencial y cada llave espera dos round trips): con el hook siempre
   * encendido, eso son hasta 16 páginas de 80 filas peleándole la conexión a los
   * writes de la simulación mientras el Hub ni siquiera está montado.
   */
  it('fuera del Hub, la portada no vuelve a consultar', async () => {
    vi.spyOn(matchHistoryService, 'getMatchesPage').mockResolvedValue({
      matches: [BATACAZO],
      nextCursor: null,
      hasMore: false,
    });

    render(<App />);
    await screen.findByText('BATACAZO', {}, { timeout: ESPERA_MS });

    // Salir del Hub a una vista que no lee el historial (Ajustes).
    await userEvent.click(screen.getAllByRole('button', { name: /Ajustes/i })[0]);
    await waitFor(() => expect(screen.queryByText('BATACAZO')).not.toBeInTheDocument());

    const antes = vi.mocked(matchHistoryService.getMatchesPage).mock.calls.length;
    // Diez inserts del motor, como una fecha cualquiera de la simulación.
    for (let i = 0; i < 10; i++) act(() => useHistoryRevisionStore.getState().bump());
    // Bastante más que el debounce: si el hook siguiera encendido, ya habría
    // consultado.
    await new Promise((resolve) => setTimeout(resolve, HEADLINES_DEBOUNCE_MS * 3));

    expect(vi.mocked(matchHistoryService.getMatchesPage).mock.calls.length).toBe(antes);
  });
});
