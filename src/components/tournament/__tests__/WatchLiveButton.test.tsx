import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WatchLiveButton } from '../WatchLiveButton';
import { useLiveMatchStore } from '../../../store/useLiveMatchStore';

beforeEach(() => useLiveMatchStore.setState({ activeMatch: null }));

describe('WatchLiveButton', () => {
  it('al hacer click abre el partido en vivo con el descriptor', () => {
    render(
      <WatchLiveButton matchId="m1" homeTeamId="h" awayTeamId="a" kind="qualifier" groupId="g1" />,
    );
    screen.getByRole('button', { name: /ver en vivo/i }).click();
    expect(useLiveMatchStore.getState().activeMatch).toEqual({
      matchId: 'm1', homeTeamId: 'h', awayTeamId: 'a', kind: 'qualifier', groupId: 'g1',
    });
  });

  it('respeta disabled', () => {
    render(<WatchLiveButton matchId="m1" homeTeamId="h" awayTeamId="a" kind="knockout" disabled />);
    screen.getByRole('button', { name: /ver en vivo/i }).click();
    expect(useLiveMatchStore.getState().activeMatch).toBeNull();
  });
});
