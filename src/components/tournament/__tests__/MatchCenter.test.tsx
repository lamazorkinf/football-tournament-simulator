import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MatchCenter } from '../MatchCenter';
import { toCycle } from '../../../core/cycle';
import { baseTournament } from '../../../test/fixtures/cycle';
import { useTournamentStore } from '../../../store/useTournamentStore';
import { useFavoritesStore } from '../../../store/useFavoritesStore';
import { TeamProfileProvider } from '../../../hooks/useTeamProfile';
import type { Cycle, Group, Team } from '../../../types';

// Sin este mock, los hooks de simulación dejan armada una escritura real a
// Supabase (mismo proyecto que producción).
vi.mock('../../../lib/persistSettings', () => ({
  queueSettingsSave: vi.fn(),
  flushSettingsSave: vi.fn(),
}));

const teams: Team[] = [
  { id: 'arg', name: 'Argentina', flag: '🇦🇷', region: 'America', skill: 90 },
  { id: 'bra', name: 'Brasil', flag: '🇧🇷', region: 'America', skill: 85 },
];

/** Grupo de clasificatorias con un único partido, jugado o no. */
function grupoConUnPartido(isPlayed: boolean): Group {
  return {
    id: 'g1',
    name: 'Grupo A',
    region: 'America',
    teamIds: ['arg', 'bra'],
    standings: [],
    matches: [
      {
        id: 'm1',
        homeTeamId: 'arg',
        awayTeamId: 'bra',
        homeScore: isPlayed ? 2 : null,
        awayScore: isPlayed ? 1 : null,
        isPlayed,
        stage: 'qualifier',
        matchday: 1,
      },
    ],
  };
}

/** Ciclo con las clasificatorias sorteadas: un grupo, un partido. */
function cicloConFixture(isPlayed: boolean): Cycle {
  const t = baseTournament();
  t.qualifiers.America = [grupoConUnPartido(isPlayed)];
  return toCycle(t);
}

beforeEach(() => {
  useTournamentStore.setState({ teams, isSavingMatch: false } as never);
  useFavoritesStore.setState({ favoriteTeamIds: [] } as never);
});

/** Las filas de partido abren la ficha de equipo, que necesita su provider. */
function renderCenter(tournament: Cycle) {
  return render(
    <TeamProfileProvider>
      <MatchCenter tournament={tournament} teams={teams} />
    </TeamProfileProvider>,
  );
}

/**
 * La lista de próximos partidos se vacía por TRES motivos distintos, y decirlos
 * como si fueran uno solo miente: antes del sorteo no hay fixture, y con un
 * filtro puesto los partidos existen pero no se están viendo.
 */
describe('MatchCenter — por qué no hay partidos próximos', () => {
  it('sin sorteo dice que falta el fixture, no que ya se jugó todo', () => {
    renderCenter(toCycle(baseTournament()));

    expect(screen.getByText(/todavía no se sortearon/i)).toBeInTheDocument();
    expect(screen.queryByText(/todos los partidos han sido jugados/i)).not.toBeInTheDocument();
  });

  it('con todo jugado sí lo dice', () => {
    renderCenter(cicloConFixture(true));

    expect(screen.getByText(/todos los partidos han sido jugados/i)).toBeInTheDocument();
    expect(screen.queryByText(/todavía no se sortearon/i)).not.toBeInTheDocument();
  });

  it('con partidos pendientes no muestra ningún estado vacío', () => {
    renderCenter(cicloConFixture(false));

    expect(screen.queryByText(/todavía no se sortearon/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/todos los partidos han sido jugados/i)).not.toBeInTheDocument();
  });
});

/**
 * La columna izquierda puede tener 84 partidos. Sin `sticky` la vista previa se
 * queda arriba y deja media pantalla en negro mientras se scrollea; sin
 * `self-start` el ítem del grid se estira a la altura de la fila y `sticky` no
 * tiene margen donde pegarse.
 */
describe('MatchCenter — la vista previa acompaña el scroll', () => {
  it('la columna derecha es sticky y no se estira', () => {
    const { container } = renderCenter(cicloConFixture(false));

    const columna = container.querySelector('.lg\\:sticky');
    expect(columna).not.toBeNull();
    expect(columna?.className).toContain('lg:self-start');
  });
});
