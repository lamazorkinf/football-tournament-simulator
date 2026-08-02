import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

/** América con su partido jugado, Europa con el suyo pendiente. */
function cicloMitadJugado(): Cycle {
  const t = baseTournament();
  t.qualifiers.America = [grupoConUnPartido(true)];
  t.qualifiers.Europe = [
    {
      ...grupoConUnPartido(false),
      id: 'g2',
      name: 'Grupo B',
      region: 'Europe',
      matches: [{ ...grupoConUnPartido(false).matches[0], id: 'm2' }],
    },
  ];
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
 * La lista de próximos partidos se vacía por CUATRO motivos distintos, y
 * decirlos como si fueran uno solo miente: antes del sorteo no hay fixture; con
 * un filtro puesto los partidos existen pero no se están viendo; lo que se está
 * mirando puede haberse jugado entero con pendientes en el resto; y recién
 * después queda el caso de que efectivamente no falte nada.
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

  /**
   * El caso más frecuente de todos, y el que el primer arreglo se comía: es el
   * estado en el que queda la vista JUSTO DESPUÉS de simular la jornada que se
   * está mirando, porque la jornada seleccionada no sigue al avance.
   */
  it('si lo que se está mirando ya se jugó pero queda pendiente en el resto, lo dice', async () => {
    renderCenter(cicloMitadJugado());
    // Filtrar por América, donde el único partido ya se jugó.
    await userEvent.selectOptions(screen.getByDisplayValue(/todas las regiones/i), 'America');

    expect(screen.getByText(/queda 1 partido pendiente fuera de esta selección/i)).toBeInTheDocument();
    expect(screen.queryByText(/todos los partidos han sido jugados/i)).not.toBeInTheDocument();
  });

  it('un filtro que no matchea nada lo dice con sus palabras', async () => {
    renderCenter(cicloConFixture(false));
    // El único partido es de América: filtrar por Europa no deja nada.
    await userEvent.selectOptions(screen.getByDisplayValue(/todas las regiones/i), 'Europe');

    expect(screen.getByText(/ningún partido coincide con los filtros/i)).toBeInTheDocument();
  });
});

/**
 * La columna izquierda puede tener 84 partidos. Sin `sticky` la vista previa se
 * queda arriba y deja media pantalla en negro mientras se scrollea; sin
 * `self-start` el ítem del grid se estira a la altura de la fila y `sticky` no
 * tiene margen donde pegarse.
 */
describe('MatchCenter — la vista previa acompaña el scroll', () => {
  it('la columna derecha es sticky, no se estira y scrollea por dentro', () => {
    const { container } = renderCenter(cicloConFixture(false));

    const columna = container.querySelector('.lg\\:sticky');
    expect(columna).not.toBeNull();
    expect(columna?.className).toContain('lg:self-start');
    // Y con su propio techo de altura: el contenido (marcador, tabla del grupo,
    // últimos partidos de los dos equipos y H2H) pasa el alto de un portátil, y
    // pegado sin `max-h` la parte de abajo dejaba de verse.
    expect(columna?.className).toContain('lg:max-h-[calc(100vh-2rem)]');
    expect(columna?.className).toContain('lg:overflow-y-auto');
  });
});
