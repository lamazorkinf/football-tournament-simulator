import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Hidratación de preferencias desde la DB, incluida la migración one-shot de lo
 * que hubiera quedado en el localStorage del `persist` viejo. Lo que se protege
 * acá es no perder los ajustes del usuario al eliminar el modo offline.
 */

const { loadSettings, saveSettings } = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock('../../services/appSettingsService', () => ({
  appSettingsService: { loadSettings, saveSettings },
}));

vi.mock('../persistSettings', () => ({
  queueSettingsSave: vi.fn(),
  flushSettingsSave: vi.fn(),
}));

const { hydrateSettings, clearLegacyTournamentStorage } = await import('../hydrateSettings');
const { useConfigStore, DEFAULT_CONFIG } = await import('../../store/useConfigStore');
const { useFavoritesStore } = await import('../../store/useFavoritesStore');

const LEGACY_CONFIG_KEY = 'football-engine-config';
const LEGACY_FAVORITES_KEY = 'football-favorites';
const LEGACY_TOURNAMENT_KEY = 'football-tournament-storage';

function seedLegacyStorage() {
  localStorage.setItem(
    LEGACY_CONFIG_KEY,
    JSON.stringify({ state: { config: { ...DEFAULT_CONFIG, kFactor: 9 }, scanlines: false }, version: 3 }),
  );
  localStorage.setItem(
    LEGACY_FAVORITES_KEY,
    JSON.stringify({ state: { favoriteTeamIds: ['arg'] }, version: 1 }),
  );
}

describe('hydrateSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveSettings.mockResolvedValue(undefined);
    localStorage.clear();
    useConfigStore.getState().applySettings({ engineConfig: DEFAULT_CONFIG, scanlines: true });
    useFavoritesStore.getState().applyFavorites([]);
  });

  it('aplica a los stores lo que devuelve la DB', async () => {
    loadSettings.mockResolvedValue({
      engineConfig: { ...DEFAULT_CONFIG, kFactor: 4 },
      favoriteTeamIds: ['bra'],
      scanlines: false,
    });

    await hydrateSettings();

    expect(useConfigStore.getState().config.kFactor).toBe(4);
    expect(useConfigStore.getState().scanlines).toBe(false);
    expect(useFavoritesStore.getState().favoriteTeamIds).toEqual(['bra']);
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('con fila en la DB, purga el localStorage viejo', async () => {
    seedLegacyStorage();
    loadSettings.mockResolvedValue({
      engineConfig: DEFAULT_CONFIG,
      favoriteTeamIds: [],
      scanlines: true,
    });

    await hydrateSettings();

    expect(localStorage.getItem(LEGACY_CONFIG_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_FAVORITES_KEY)).toBeNull();
  });

  it('sin fila en la DB, migra los ajustes que quedaron en localStorage', async () => {
    seedLegacyStorage();
    loadSettings.mockResolvedValue(null);

    await hydrateSettings();

    expect(saveSettings).toHaveBeenCalledWith({
      engineConfig: { ...DEFAULT_CONFIG, kFactor: 9 },
      favoriteTeamIds: ['arg'],
      scanlines: false,
    });
    expect(useConfigStore.getState().config.kFactor).toBe(9);
    expect(useFavoritesStore.getState().favoriteTeamIds).toEqual(['arg']);
    expect(localStorage.getItem(LEGACY_CONFIG_KEY)).toBeNull();
  });

  it('sin fila ni localStorage, siembra los defaults', async () => {
    loadSettings.mockResolvedValue(null);

    await hydrateSettings();

    expect(saveSettings).toHaveBeenCalledWith({
      engineConfig: DEFAULT_CONFIG,
      favoriteTeamIds: [],
      scanlines: true,
    });
  });

  it('si la DB falla, NO borra el localStorage viejo (no se pierden los ajustes)', async () => {
    seedLegacyStorage();
    loadSettings.mockRejectedValue(new Error('network down'));

    await hydrateSettings();

    expect(localStorage.getItem(LEGACY_CONFIG_KEY)).not.toBeNull();
    expect(localStorage.getItem(LEGACY_FAVORITES_KEY)).not.toBeNull();
    // Aun sin DB, la sesión usa lo que había guardado localmente.
    expect(useConfigStore.getState().config.kFactor).toBe(9);
  });

  it('si falla el sembrado, tampoco borra el localStorage viejo', async () => {
    seedLegacyStorage();
    loadSettings.mockResolvedValue(null);
    saveSettings.mockRejectedValue(new Error('boom'));

    await hydrateSettings();

    expect(localStorage.getItem(LEGACY_CONFIG_KEY)).not.toBeNull();
  });

  it('un localStorage con JSON corrupto no rompe el arranque', async () => {
    localStorage.setItem(LEGACY_CONFIG_KEY, '{ no es json');
    loadSettings.mockResolvedValue(null);

    await hydrateSettings();

    expect(saveSettings).toHaveBeenCalledWith({
      engineConfig: DEFAULT_CONFIG,
      favoriteTeamIds: [],
      scanlines: true,
    });
  });
});

describe('clearLegacyTournamentStorage', () => {
  beforeEach(() => localStorage.clear());

  it('borra el estado de torneos del persist viejo', () => {
    localStorage.setItem(LEGACY_TOURNAMENT_KEY, JSON.stringify({ state: { tournaments: [] } }));

    clearLegacyTournamentStorage();

    expect(localStorage.getItem(LEGACY_TOURNAMENT_KEY)).toBeNull();
  });

  it('es idempotente sin la clave presente', () => {
    expect(() => clearLegacyTournamentStorage()).not.toThrow();
  });
});
