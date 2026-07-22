import { describe, it, expect, beforeEach } from 'vitest';
import { useFavoritesStore } from '../useFavoritesStore';

const favorites = () => useFavoritesStore.getState().favoriteTeamIds;

describe('useFavoritesStore', () => {
  beforeEach(() => {
    useFavoritesStore.getState().clearFavorites();
  });

  it('arranca sin favoritos', () => {
    expect(favorites()).toEqual([]);
  });

  it('toggleFavorite agrega y quita un equipo', () => {
    useFavoritesStore.getState().toggleFavorite('arg');
    expect(favorites()).toEqual(['arg']);

    useFavoritesStore.getState().toggleFavorite('bra');
    expect(favorites()).toEqual(['arg', 'bra']);

    useFavoritesStore.getState().toggleFavorite('arg');
    expect(favorites()).toEqual(['bra']);
  });

  it('clearFavorites vacía la lista', () => {
    useFavoritesStore.getState().toggleFavorite('arg');
    useFavoritesStore.getState().toggleFavorite('bra');
    useFavoritesStore.getState().clearFavorites();
    expect(favorites()).toEqual([]);
  });

  it('persiste bajo la clave football-favorites', () => {
    useFavoritesStore.getState().toggleFavorite('arg');
    const raw = localStorage.getItem('football-favorites');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.favoriteTeamIds).toEqual(['arg']);
    expect(parsed.version).toBe(1);
  });
});
