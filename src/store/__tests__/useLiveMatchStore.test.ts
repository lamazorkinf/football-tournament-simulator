import { describe, it, expect, beforeEach } from 'vitest';
import { useLiveMatchStore } from '../useLiveMatchStore';

describe('useLiveMatchStore', () => {
  beforeEach(() => {
    useLiveMatchStore.setState({ activeMatch: null });
  });

  it('arranca sin partido activo', () => {
    expect(useLiveMatchStore.getState().activeMatch).toBeNull();
  });

  it('openLiveMatch setea el descriptor', () => {
    useLiveMatchStore.getState().openLiveMatch({
      matchId: 'm1', homeTeamId: 'h', awayTeamId: 'a', kind: 'continental',
    });
    expect(useLiveMatchStore.getState().activeMatch).toEqual({
      matchId: 'm1', homeTeamId: 'h', awayTeamId: 'a', kind: 'continental',
    });
  });

  it('closeLiveMatch limpia el partido activo', () => {
    useLiveMatchStore.getState().openLiveMatch({
      matchId: 'm1', homeTeamId: 'h', awayTeamId: 'a', kind: 'qualifier', groupId: 'g1',
    });
    useLiveMatchStore.getState().closeLiveMatch();
    expect(useLiveMatchStore.getState().activeMatch).toBeNull();
  });
});
