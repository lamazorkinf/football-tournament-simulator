import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Equipos favoritos del usuario (por teamId, transversal a todos los torneos).
 * Sus partidos entran sí o sí a la grilla de la jornada en vivo (ver
 * core/liveSelection). Persistencia local-only, mismo patrón que la config
 * del motor.
 */
interface FavoritesStore {
  favoriteTeamIds: string[];
  toggleFavorite: (teamId: string) => void;
  clearFavorites: () => void;
}

export const useFavoritesStore = create<FavoritesStore>()(
  persist(
    (set) => ({
      favoriteTeamIds: [],

      toggleFavorite: (teamId: string) =>
        set((state) => ({
          favoriteTeamIds: state.favoriteTeamIds.includes(teamId)
            ? state.favoriteTeamIds.filter((id) => id !== teamId)
            : [...state.favoriteTeamIds, teamId],
        })),

      clearFavorites: () => set({ favoriteTeamIds: [] }),
    }),
    {
      name: 'football-favorites',
      version: 1,
    }
  )
);
