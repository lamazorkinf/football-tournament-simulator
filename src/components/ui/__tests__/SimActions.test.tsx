import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MatchSimActions, JornadaSimActions } from '../SimActions';
import { useLiveMatchStore } from '../../../store/useLiveMatchStore';

beforeEach(() => {
  vi.clearAllMocks();
  useLiveMatchStore.setState({ activeMatch: null });
});

const LIVE = {
  matchId: 'm1',
  homeTeamId: 'h',
  awayTeamId: 'a',
  kind: 'qualifier' as const,
  groupId: 'g1',
};

describe('MatchSimActions — las dos acciones de un partido', () => {
  it('ofrece jugar y ver en vivo, y nada más', () => {
    render(<MatchSimActions onSimulate={vi.fn()} live={LIVE} />);
    const labels = screen.getAllByRole('button').map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Jugar', 'Ver en vivo']);
  });

  it('"Jugar" dispara la simulación individual', async () => {
    const onSimulate = vi.fn();
    render(<MatchSimActions onSimulate={onSimulate} live={LIVE} />);
    await userEvent.click(screen.getByRole('button', { name: /jugar/i }));
    expect(onSimulate).toHaveBeenCalledTimes(1);
  });

  it('"Ver en vivo" abre el partido en vivo con el descriptor', async () => {
    render(<MatchSimActions onSimulate={vi.fn()} live={LIVE} />);
    await userEvent.click(screen.getByRole('button', { name: /ver en vivo/i }));
    expect(useLiveMatchStore.getState().activeMatch).toEqual(LIVE);
  });

  it('un partido de un modo de temporada viaja con su torneo', async () => {
    const seasonLive = {
      matchId: 'cup-final-0-l2',
      homeTeamId: 'h',
      awayTeamId: 'a',
      kind: 'season' as const,
      tournamentId: 't1',
    };
    render(<MatchSimActions live={seasonLive} />);
    await userEvent.click(screen.getByRole('button', { name: /ver en vivo/i }));
    expect(useLiveMatchStore.getState().activeMatch).toEqual(seasonLive);
  });

  it('respeta disabled en las dos acciones', async () => {
    const onSimulate = vi.fn();
    render(<MatchSimActions onSimulate={onSimulate} live={LIVE} disabled />);
    await userEvent.click(screen.getByRole('button', { name: /jugar/i }));
    await userEvent.click(screen.getByRole('button', { name: /ver en vivo/i }));
    expect(onSimulate).not.toHaveBeenCalled();
    expect(useLiveMatchStore.getState().activeMatch).toBeNull();
  });
});

describe('JornadaSimActions — las dos acciones de una jornada', () => {
  it('ofrece simular la jornada y verla en vivo, y nada más', () => {
    render(
      <JornadaSimActions
        jornadaLabel="Continental · Cuartos"
        onSimulate={vi.fn()}
        onSimulateLive={vi.fn()}
      />,
    );
    const labels = screen.getAllByRole('button').map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Simular jornada', 'Jornada en vivo']);
    expect(screen.getByText('Continental · Cuartos')).toBeInTheDocument();
  });

  it('cada botón dispara su acción', async () => {
    const onSimulate = vi.fn();
    const onSimulateLive = vi.fn();
    render(<JornadaSimActions onSimulate={onSimulate} onSimulateLive={onSimulateLive} />);

    await userEvent.click(screen.getByRole('button', { name: /simular jornada/i }));
    await userEvent.click(screen.getByRole('button', { name: /jornada en vivo/i }));
    expect(onSimulate).toHaveBeenCalledTimes(1);
    expect(onSimulateLive).toHaveBeenCalledTimes(1);
  });

  it('con la simulación en curso no se puede disparar otra', async () => {
    const onSimulate = vi.fn();
    const onSimulateLive = vi.fn();
    render(<JornadaSimActions onSimulate={onSimulate} onSimulateLive={onSimulateLive} busy />);

    await userEvent.click(screen.getByRole('button', { name: /jornada en vivo/i }));
    expect(onSimulateLive).not.toHaveBeenCalled();
  });
});
