import { appSettingsService, type AppSettings } from '../services/appSettingsService';
import { useConfigStore, DEFAULT_CONFIG, type EngineConfig } from '../store/useConfigStore';
import { useFavoritesStore } from '../store/useFavoritesStore';

/**
 * Claves que escribía el middleware `persist` de zustand antes de que la DB
 * pasara a ser la única fuente de verdad. Se leen una última vez para no
 * perder los ajustes del usuario y después se borran.
 */
const LEGACY_CONFIG_KEY = 'football-engine-config';
const LEGACY_FAVORITES_KEY = 'football-favorites';
const LEGACY_TOURNAMENT_KEY = 'football-tournament-storage';

/** Lee y parsea una clave de localStorage tolerando storage roto o JSON inválido. */
function readLegacy<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return (JSON.parse(raw) as { state?: T })?.state ?? null;
  } catch {
    return null;
  }
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage no disponible (modo privado): nada que limpiar */
  }
}

/**
 * Borra el estado de torneos que persistía el middleware `persist`. Se ejecuta
 * al arrancar y sin condiciones: los torneos ya viven en la DB, así que esa
 * copia no tiene nada que rescatar — es justamente la que pisaba lo jugado en
 * otro dispositivo. Idempotente.
 */
export function clearLegacyTournamentStorage(): void {
  removeKey(LEGACY_TOURNAMENT_KEY);
}

/**
 * Borra las preferencias viejas. Sólo se llama después de haberlas migrado a
 * la DB, para no perderlas si la base está caída.
 */
function clearLegacySettingsStorage(): void {
  removeKey(LEGACY_CONFIG_KEY);
  removeKey(LEGACY_FAVORITES_KEY);
}

/** Preferencias rescatadas del localStorage viejo, si las hubiera. */
function readLegacySettings(): Partial<AppSettings> {
  const legacy: Partial<AppSettings> = {};

  const config = readLegacy<{ config?: EngineConfig; scanlines?: boolean }>(LEGACY_CONFIG_KEY);
  if (config?.config) legacy.engineConfig = config.config;
  if (typeof config?.scanlines === 'boolean') legacy.scanlines = config.scanlines;

  const favorites = readLegacy<{ favoriteTeamIds?: string[] }>(LEGACY_FAVORITES_KEY);
  if (Array.isArray(favorites?.favoriteTeamIds)) legacy.favoriteTeamIds = favorites.favoriteTeamIds;

  return legacy;
}

/**
 * Carga las preferencias desde la DB y las aplica a los stores.
 *
 * En el primer arranque tras el cambio la fila `app_settings` todavía no existe:
 * en ese caso se siembra con lo que hubiera quedado en localStorage (para no
 * perder la config del motor ni los favoritos) o con los defaults.
 *
 * Sólo se purga localStorage cuando la DB respondió: si está caída, los valores
 * viejos siguen ahí para el próximo intento en vez de perderse.
 */
export async function hydrateSettings(): Promise<void> {
  const legacy = readLegacySettings();

  let stored: AppSettings | null;
  try {
    stored = await appSettingsService.loadSettings();
  } catch (error) {
    console.error('No se pudieron cargar las preferencias:', error);
    // Sin DB, al menos aplicar lo que haya quedado local en esta sesión.
    applyToStores(legacy);
    return;
  }

  if (stored) {
    applyToStores(stored);
    clearLegacySettingsStorage();
    return;
  }

  // Primer arranque: sembrar la fila con lo rescatado (o los defaults).
  const seed: AppSettings = {
    engineConfig: legacy.engineConfig ?? DEFAULT_CONFIG,
    favoriteTeamIds: legacy.favoriteTeamIds ?? [],
    scanlines: legacy.scanlines ?? true,
  };
  applyToStores(seed);
  try {
    await appSettingsService.saveSettings(seed);
    clearLegacySettingsStorage();
  } catch (error) {
    console.error('No se pudieron sembrar las preferencias en la DB:', error);
  }
}

function applyToStores(settings: Partial<AppSettings>): void {
  useConfigStore.getState().applySettings({
    engineConfig: settings.engineConfig,
    scanlines: settings.scanlines,
  });
  if (settings.favoriteTeamIds) {
    useFavoritesStore.getState().applyFavorites(settings.favoriteTeamIds);
  }
}
