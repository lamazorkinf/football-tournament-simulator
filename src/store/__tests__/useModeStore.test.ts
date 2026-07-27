import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useModeStore } from '../useModeStore';
import { modesService } from '../../services/modesService';
import { SELECCIONES_MODE_ID } from '../../constants/modes';
import type { GameMode } from '../../types';

vi.mock('../../services/modesService', () => ({
  modesService: {
    getAllModes: vi.fn(),
    createMode: vi.fn(),
  },
}));

const MODES: GameMode[] = [
  { id: 'selecciones', name: 'Selecciones', kind: 'national-cycle', config: {}, currentYear: 2026 },
  { id: 'villamariense', name: 'Liga Villamariense', kind: 'league-system', config: {}, currentYear: 2026 },
];

function resetStore() {
  useModeStore.setState({ modes: [], activeModeId: SELECCIONES_MODE_ID, isLoaded: false });
}

describe('useModeStore', () => {
  beforeEach(() => {
    resetStore();
    vi.mocked(modesService.getAllModes).mockReset();
    vi.mocked(modesService.createMode).mockReset();
  });

  it('arranca en el modo selecciones (national-cycle por defecto)', () => {
    expect(useModeStore.getState().activeModeId).toBe(SELECCIONES_MODE_ID);
    // Sin lista cargada, el kind cae a national-cycle para no romper el arranque.
    expect(useModeStore.getState().activeModeKind()).toBe('national-cycle');
  });

  it('loadModes puebla la lista y resuelve el modo activo', async () => {
    vi.mocked(modesService.getAllModes).mockResolvedValue(MODES);
    await useModeStore.getState().loadModes();

    expect(useModeStore.getState().modes).toHaveLength(2);
    expect(useModeStore.getState().isLoaded).toBe(true);
    expect(useModeStore.getState().activeMode()?.id).toBe('selecciones');
  });

  it('selectMode cambia el modo activo y su kind', async () => {
    vi.mocked(modesService.getAllModes).mockResolvedValue(MODES);
    await useModeStore.getState().loadModes();

    useModeStore.getState().selectMode('villamariense');
    expect(useModeStore.getState().activeModeId).toBe('villamariense');
    expect(useModeStore.getState().activeModeKind()).toBe('league-system');
  });

  it('loadModes cae a selecciones si el modo recordado ya no existe', async () => {
    useModeStore.setState({ activeModeId: 'un-modo-borrado' });
    vi.mocked(modesService.getAllModes).mockResolvedValue(MODES);
    await useModeStore.getState().loadModes();

    expect(useModeStore.getState().activeModeId).toBe(SELECCIONES_MODE_ID);
  });

  it('createMode agrega el modo a la lista', async () => {
    const nuevo: GameMode = { id: 'sudamerica', name: 'Sudamérica', kind: 'league-system', config: {}, currentYear: 2026 };
    vi.mocked(modesService.createMode).mockResolvedValue(nuevo);

    await useModeStore.getState().createMode({ id: 'sudamerica', name: 'Sudamérica', kind: 'league-system' });
    expect(useModeStore.getState().modes.map((m) => m.id)).toContain('sudamerica');
  });
});
