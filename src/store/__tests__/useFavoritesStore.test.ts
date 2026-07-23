import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useFavoritesStore } from '../useFavoritesStore';
import { queueSettingsSave } from '../../lib/persistSettings';

vi.mock('../../lib/persistSettings', () => ({
  queueSettingsSave: vi.fn(),
  flushSettingsSave: vi.fn(),
}));

const favorites = () => useFavoritesStore.getState().favoriteTeamIds;

describe('useFavoritesStore', () => {
  beforeEach(() => {
    useFavoritesStore.getState().clearFavorites();
    vi.mocked(queueSettingsSave).mockClear();
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

  it('guarda los favoritos en la DB, no en localStorage', () => {
    useFavoritesStore.getState().toggleFavorite('arg');

    expect(queueSettingsSave).toHaveBeenCalledWith({ favoriteTeamIds: ['arg'] });
    expect(localStorage.getItem('football-favorites')).toBeNull();
  });

  it('clearFavorites también se propaga a la DB', () => {
    useFavoritesStore.getState().toggleFavorite('arg');
    vi.mocked(queueSettingsSave).mockClear();

    useFavoritesStore.getState().clearFavorites();
    expect(queueSettingsSave).toHaveBeenCalledWith({ favoriteTeamIds: [] });
  });

  it('applyFavorites escribe sin re-guardar (los datos vienen de la DB)', () => {
    useFavoritesStore.getState().applyFavorites(['bra', 'ita']);

    expect(favorites()).toEqual(['bra', 'ita']);
    expect(queueSettingsSave).not.toHaveBeenCalled();
  });
});
