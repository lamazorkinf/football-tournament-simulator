import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useNextAction } from '../useNextAction';
import { useModeStore } from '../../store/useModeStore';
import { useTournamentStore } from '../../store/useTournamentStore';
import { useSeasonModeStore } from '../../store/useSeasonModeStore';
import { toCycle } from '../../core/cycle';
import { baseTournament } from '../../test/fixtures/cycle';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useNextAction', () => {
  it('modo selecciones: usa la rama del ciclo', () => {
    useModeStore.setState({ activeModeId: 'selecciones' });
    useTournamentStore.setState({ currentTournament: toCycle(baseTournament()) });

    const { result } = renderHook(() => useNextAction(vi.fn()));
    expect(result.current?.label).toBe('▶ SORTEAR CONTINENTAL');
  });

  it('modo de temporada: usa la rama de la temporada', () => {
    // `activeModeId` solo no alcanza: `useModeDescriptor` resuelve por el `kind`
    // del modo activo en `modes`, así que hay que sembrarlo para que caiga en el
    // descriptor de Villamariense (engine 'season') y no en el de selecciones.
    useModeStore.setState({
      activeModeId: 'villamariense',
      modes: [
        {
          id: 'villamariense',
          name: 'Liga Villamariense',
          kind: 'league-system',
          config: {},
          currentYear: 2027,
        },
      ],
    });
    useSeasonModeStore.setState({ status: 'ready', tournaments: [] });

    const { result } = renderHook(() => useNextAction(vi.fn()));
    expect(result.current?.label).toBe('▶ EMPEZAR TEMPORADA');
  });
});
