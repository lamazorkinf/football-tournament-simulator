import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChampionsPalmares } from '../ChampionsPalmares';
import type { PalmaresRow } from '../../../services/championsService';

vi.mock('../../../hooks/useTeamProfile', () => ({
  useTeamProfile: () => ({ openTeamProfile: vi.fn() }),
}));

/**
 * El palmarés se adapta a lo que hay en las filas: las columnas de desglose y el
 * filtro por región son del ciclo mundialista, y en un modo de temporada
 * escondían la tabla entera (los clubes no tienen región).
 */

function row(over: Partial<PalmaresRow>): PalmaresRow {
  return {
    teamId: 'vm-1',
    teamName: 'Alumni',
    region: '',
    titles: 3,
    runnerUps: 1,
    thirds: 0,
    wcTitles: 0,
    continentalTitles: 0,
    confedTitles: 0,
    seasonTitles: 3,
    ...over,
  };
}

describe('ChampionsPalmares', () => {
  it('un modo de temporada ve TEMP y ninguna columna del ciclo', () => {
    render(<ChampionsPalmares rows={[row({})]} onSelectTeam={vi.fn()} />);

    expect(screen.getByText('TEMP')).toBeInTheDocument();
    for (const label of ['MUN', 'CON', 'CCF']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it('sin regiones en las filas no se pinta el filtro que vaciaría la tabla', () => {
    render(
      <ChampionsPalmares
        rows={[row({}), row({ teamId: 'vm-2', teamName: 'Rivadavia' })]}
        onSelectTeam={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Todas' })).not.toBeInTheDocument();
    expect(screen.getByText('Alumni')).toBeInTheDocument();
  });

  it('el ciclo mundialista conserva sus columnas y su filtro por región', () => {
    render(
      <ChampionsPalmares
        rows={[
          row({ teamId: 'br', teamName: 'Brasil', region: 'America', wcTitles: 2, seasonTitles: 0 }),
          row({ teamId: 'de', teamName: 'Alemania', region: 'Europe', confedTitles: 1, seasonTitles: 0 }),
        ]}
        onSelectTeam={vi.fn()}
      />,
    );

    expect(screen.getByText('MUN')).toBeInTheDocument();
    expect(screen.getByText('CCF')).toBeInTheDocument();
    // Sin títulos continentales ni de temporada, esas columnas no ocupan lugar.
    expect(screen.queryByText('CON')).not.toBeInTheDocument();
    expect(screen.queryByText('TEMP')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'América' })).toBeInTheDocument();
  });
});
