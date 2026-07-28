import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChampionsTimeline } from '../ChampionsTimeline';
import { SELECCIONES_DESCRIPTOR, VILLAMARIENSE_DESCRIPTOR } from '../../../modes/registry';
import type { ChampionHistoryRow } from '../../../services/championsService';

vi.mock('../../../hooks/useTeamProfile', () => ({
  useTeamProfile: () => ({ openTeamProfile: vi.fn() }),
}));

/**
 * La cronología es la misma pantalla en los dos modos: lo único que cambia son
 * las competiciones. Estos tests fijan que el rótulo y los filtros salgan de los
 * datos y del descriptor, y no de una lista escrita a mano.
 */

function row(over: Partial<ChampionHistoryRow>): ChampionHistoryRow {
  return {
    tournamentId: 't1',
    year: 2031,
    kind: 'season',
    region: null,
    championId: 'vm-1',
    championName: 'Alumni',
    championRegion: null,
    runnerUpId: 'vm-2',
    runnerUpName: 'Rivadavia',
    runnerUpRegion: null,
    thirdId: null,
    thirdName: null,
    thirdRegion: null,
    fourthId: null,
    fourthName: null,
    fourthRegion: null,
    championScore: 2,
    runnerUpScore: 1,
    championPen: null,
    runnerUpPen: null,
    ...over,
  };
}

function renderTimeline(rows: ChampionHistoryRow[], descriptor = VILLAMARIENSE_DESCRIPTOR) {
  return render(
    <ChampionsTimeline
      rows={rows}
      teamFilter={null}
      onClearTeamFilter={vi.fn()}
      onOpenTournament={vi.fn()}
      descriptor={descriptor}
    />,
  );
}

describe('ChampionsTimeline — modo de temporada', () => {
  it('nombra cada torneo por su competición y no "Temporada"', () => {
    renderTimeline([
      row({ tournamentId: 'a', region: 'A' }),
      row({ tournamentId: 'b', region: 'B' }),
      row({ tournamentId: 'c', region: null }),
    ]);

    expect(screen.getByText('Liga A')).toBeInTheDocument();
    expect(screen.getByText('Liga B')).toBeInTheDocument();
    expect(screen.getByText('Copa')).toBeInTheDocument();
    expect(screen.queryByText('Temporada')).not.toBeInTheDocument();
  });

  it('sin descriptor cae en el rótulo genérico', () => {
    render(
      <ChampionsTimeline
        rows={[row({ region: 'A' })]}
        teamFilter={null}
        onClearTeamFilter={vi.fn()}
        onOpenTournament={vi.fn()}
      />,
    );
    expect(screen.getByText('Temporada')).toBeInTheDocument();
  });

  it('con un solo tipo de competición no pinta filtros que no filtran nada', () => {
    renderTimeline([row({ region: 'A' }), row({ tournamentId: 'b', region: 'B' })]);

    expect(screen.queryByRole('button', { name: 'Todas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mundial' })).not.toBeInTheDocument();
  });
});

describe('ChampionsTimeline — ciclo mundialista', () => {
  it('ofrece un chip por tipo presente en las filas', () => {
    renderTimeline(
      [
        row({ tournamentId: 'wc', kind: 'world-cup', region: null }),
        row({ tournamentId: 'co', kind: 'continental', region: 'Europe' }),
      ],
      SELECCIONES_DESCRIPTOR,
    );

    expect(screen.getByRole('button', { name: 'Mundial' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continental' })).toBeInTheDocument();
    // Sin filas de Confederaciones no hay chip de Confederaciones.
    expect(screen.queryByRole('button', { name: 'Confed.' })).not.toBeInTheDocument();
  });
});
