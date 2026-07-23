import { create } from 'zustand';
import { queueSettingsSave } from '../lib/persistSettings';

/**
 * Equipos favoritos del usuario (por teamId, transversal a todos los torneos).
 * Sus partidos entran sí o sí a la grilla de la jornada en vivo (ver
 * core/liveSelection). Se guardan en la fila `app_settings` de la DB, igual que
 * la config del motor: la app ya no persiste nada en localStorage.
 */
interface FavoritesStore {
  favoriteTeamIds: string[];
  toggleFavorite: (teamId: string) => void;
  clearFavorites: () => void;
  /** Aplica los favoritos traídos de la DB (ver hydrateSettings). */
  applyFavorites: (favoriteTeamIds: string[]) => void;
}

export const useFavoritesStore = create<FavoritesStore>()((set) => ({
  favoriteTeamIds: [],

  toggleFavorite: (teamId: string) =>
    set((state) => {
      const favoriteTeamIds = state.favoriteTeamIds.includes(teamId)
        ? state.favoriteTeamIds.filter((id) => id !== teamId)
        : [...state.favoriteTeamIds, teamId];
      queueSettingsSave({ favoriteTeamIds });
      return { favoriteTeamIds };
    }),

  clearFavorites: () => {
    queueSettingsSave({ favoriteTeamIds: [] });
    set({ favoriteTeamIds: [] });
  },

  // Escritura directa sin re-guardar: viene de la DB.
  applyFavorites: (favoriteTeamIds: string[]) => set({ favoriteTeamIds }),
}));
