import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useModeJornada } from '../useModeJornada';
import { useSeasonModeStore } from '../../store/useSeasonModeStore';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useMatchResultsStore } from '../../store/useMatchResultsStore';
import { useFavoritesStore } from '../../store/useFavoritesStore';
import type { LigaTournament } from '../../core/formats/modeTournament';
import type { Match, Team } from '../../types';

const teams: Team[] = [
  { id: 'A', name: 'Ben Hur', flag: '', skill: 70 },
  { id: 'B', name: 'Alumni', flag: '', skill: 70 },
  { id: 'C', name: 'Talleres', flag: '', skill: 70 },
  { id: 'D', name: 'Colon', flag: '', skill: 70 },
];

const partido = (id: string, home: string, away: string, played: boolean, hs = 0, as = 0): Match => ({
  id,
  homeTeamId: home,
  awayTeamId: away,
  homeScore: played ? hs : null,
  awayScore: played ? as : null,
  isPlayed: played,
  matchday: played ? 1 : 2,
});

/** Liga con la fecha 1 jugada (B puntero) y la fecha 2 pendiente. */
const liga = (matches: Match[]): LigaTournament => ({
  id: 't1',
  modeId: 'villamariense',
  competitionId: 'liga-a',
  year: 2028,
  name: 'Liga A 2028',
  status: 'in-progress',
  division: 'A',
  format: 'liga',
  state: {
    teamIds: ['A', 'B', 'C', 'D'],
    legs: 1,
    matches,
    standings: [],
  },
});

const fecha1 = [partido('m1', 'B', 'A', true, 3, 0), partido('m2', 'C', 'D', true, 1, 1)];
const fecha2 = [partido('m3', 'A', 'C', false), partido('m4', 'B', 'D', false)];

beforeEach(() => {
  useTournamentStore.setState({ teams });
  useFavoritesStore.setState({ favoriteTeamIds: [] });
  useMatchResultsStore.setState({ isOpen: false, results: [], title: '', table: null });
});

/**
 * EL TEST DEL CABLE. La derivación de la tabla y la tarjeta que la dibuja tienen
 * sus propios tests; éste es el único que se rompe si el hook deja de pasarle el
 * resumen al store. En las dos etapas anteriores de este proyecto un bug así
 * pasó con la suite entera en verde.
 */
describe('useModeJornada — el resumen llega al store', () => {
  it('una fecha de liga entrega los movimientos de la tabla', async () => {
    const run = liga([...fecha1, ...fecha2]);
    // Después de simular, la fecha 2 queda jugada: A le gana a C y pasa arriba.
    const jugada = liga([
      ...fecha1,
      partido('m3', 'A', 'C', true, 3, 0),
      partido('m4', 'B', 'D', true, 0, 2),
    ]);
    useSeasonModeStore.setState({
      busy: false,
      tournaments: [jugada],
      simulateJornada: vi.fn(async () => [
        { matchId: 'm3', homeTeamId: 'A', awayTeamId: 'C', homeScore: 3, awayScore: 0 },
        { matchId: 'm4', homeTeamId: 'B', awayTeamId: 'D', homeScore: 0, awayScore: 2 },
      ]),
    });

    const { result } = renderHook(() => useModeJornada(run, 'Liga A'));
    await act(async () => {
      await result.current.simulate();
    });

    const table = useMatchResultsStore.getState().table;
    expect(table).not.toBeNull();
    // DESVÍO DEL BRIEF: el original esperaba 'Ben Hur' (A) como puntero, pero
    // con estos resultados exactos (D empata 1-1 y después le gana 2-0 a B)
    // Colón (D) termina solo en la cima con 4 puntos contra los 3 de Ben Hur y
    // Alumni — verificado corriendo `recalcLeagueStandings` sobre este mismo
    // fixture. El valor se corrige al resultado matemáticamente correcto; lo
    // que importa para el test del cable es que la tabla llegue, no cuál
    // equipo puntea.
    expect(table?.leaderTeamName).toBe('Colon');
    expect(table?.moves.length).toBeGreaterThan(0);
  });

  /**
   * El torneo que el hook tiene en la clausura es el de ANTES de simular; la
   * tabla de después se relee del store. Si ahí no está, no se inventa nada.
   */
  it('si el torneo no está en el store, no entrega tabla', async () => {
    const run = liga([...fecha1, ...fecha2]);
    useSeasonModeStore.setState({
      busy: false,
      tournaments: [],
      simulateJornada: vi.fn(async () => [
        { matchId: 'm3', homeTeamId: 'A', awayTeamId: 'C', homeScore: 3, awayScore: 0 },
      ]),
    });

    const { result } = renderHook(() => useModeJornada(run, 'Liga A'));
    await act(async () => {
      await result.current.simulate();
    });

    expect(useMatchResultsStore.getState().table).toBeNull();
    // Pero los resultados sí llegan: la tabla es un extra, no un requisito.
    expect(useMatchResultsStore.getState().results).toHaveLength(1);
  });

  it('los resultados llevan el skill previo de cada equipo', async () => {
    const run = liga([...fecha1, ...fecha2]);
    useSeasonModeStore.setState({
      busy: false,
      tournaments: [run],
      simulateJornada: vi.fn(async () => {
        // El store aplica los deltas antes de que el hook arme los resultados.
        useTournamentStore.setState({ teams: teams.map((t) => ({ ...t, skill: 99 })) });
        return [{ matchId: 'm3', homeTeamId: 'A', awayTeamId: 'C', homeScore: 3, awayScore: 0 }];
      }),
    });

    const { result } = renderHook(() => useModeJornada(run, 'Liga A'));
    await act(async () => {
      await result.current.simulate();
    });

    expect(useMatchResultsStore.getState().results[0].homeSkillBefore).toBe(70);
  });
});
