import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { WorldCupViewEnhanced } from '../WorldCupViewEnhanced';
import { useTournamentStore } from '../../../store/useTournamentStore';
import { toCycle } from '../../../core/cycle';
import { baseTournament } from '../../../test/fixtures/cycle';
import type { Cycle, Group, Region, Team, TeamStanding, WorldCup, WorldCupGroup } from '../../../types';

// Espiar `toast.success` (sonner no necesita un <Toaster/> montado para
// registrar la llamada) es lo único que permite distinguir, desde afuera, si
// handleAdvanceToKnockout festejó o se quedó callado cuando el store rechazó.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

// DrawSimulator anima 64 elecciones con setTimeout reales; para probar
// handleDrawSimulatorComplete alcanza con un stub controlable que dispare
// onComplete al toque, sin correr la animación completa.
vi.mock('../DrawSimulator', () => ({
  DrawSimulator: ({ onComplete }: { onComplete: (groups: WorldCupGroup[]) => void }) => (
    <button onClick={() => onComplete([])}>completar sorteo manual (stub de test)</button>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// Mundial con grupos vacíos y llave de playoffs sin generar (roundOf32 vacío):
// el mismo estado que produce hoy la pestaña "Playoffs" bloqueada.
function makeCycleWithLockedPlayoffs() {
  const worldCup: WorldCup = {
    groups: [],
    knockout: {
      roundOf32: [],
      roundOf16: [],
      quarterFinals: [],
      semiFinals: [],
      thirdPlace: null,
      final: null,
    },
    qualifiedTeamIds: [],
  };
  return toCycle({ ...baseTournament(), worldCup });
}

describe('WorldCupViewEnhanced', () => {
  it('entrar a Playoffs bloqueado muestra el EmptyState, no un panel en blanco', async () => {
    const cycle = makeCycleWithLockedPlayoffs();
    useTournamentStore.setState({
      currentTournament: cycle,
      teams: [],
      advanceToKnockout: vi.fn(async () => true),
      regenerateKnockoutStage: vi.fn(async () => true),
      simulateMatch: vi.fn(async () => null),
    });

    render(<WorldCupViewEnhanced />);

    // La pestaña de playoffs sigue siendo alcanzable (no `disabled`) y su
    // etiqueta comunica el estado bloqueado, ya que el badge visual se perdió
    // al migrar a <Tabs>.
    const playoffsTab = screen.getByRole('tab', { name: 'Playoffs (bloqueado)' });
    expect(playoffsTab).not.toBeDisabled();

    await userEvent.click(playoffsTab);

    // En vez de un panel vacío, aparece el EmptyState explicando qué falta.
    expect(
      screen.getByText('Playoffs sin generar')
    ).toBeInTheDocument();
    // Contra el título y la acción, no contra el texto explicativo: ese copy se
    // afina y no tiene por qué romper el test cada vez que se reescribe.
    expect(
      screen.getByRole('button', { name: 'Ver fase de grupos' })
    ).toBeInTheDocument();

    // Su acción vuelve a la pestaña de grupos.
    await userEvent.click(screen.getByRole('button', { name: 'Ver fase de grupos' }));
    expect(screen.getByRole('tab', { name: 'Grupos' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByText('Playoffs sin generar')).not.toBeInTheDocument();
  });
});

// Mundial con un grupo completo (un partido jugado) y sin dieciseisavos
// generados todavía: el mismo estado que muestra el botón "Generar
// Dieciseisavos de Final".
function makeCycleWithGroupsComplete() {
  const worldCup: WorldCup = {
    groups: [
      {
        id: 'wc-g1',
        name: 'Grupo A',
        teamIds: ['a', 'b', 'c', 'd'],
        matches: [
          { id: 'wc-m1', homeTeamId: 'a', awayTeamId: 'b', homeScore: 1, awayScore: 0, isPlayed: true },
        ],
        standings: [],
      },
    ],
    knockout: {
      roundOf32: [],
      roundOf16: [],
      quarterFinals: [],
      semiFinals: [],
      thirdPlace: null,
      final: null,
    },
    qualifiedTeamIds: [],
  };
  return toCycle({ ...baseTournament(), worldCup });
}

describe('WorldCupViewEnhanced — handleAdvanceToKnockout', () => {
  it('no festeja ni cambia de pestaña si el guard rechaza', async () => {
    const cycle = makeCycleWithGroupsComplete();
    useTournamentStore.setState({
      currentTournament: cycle,
      teams: [],
      advanceToKnockout: vi.fn(async () => false),
      regenerateKnockoutStage: vi.fn(async () => true),
      simulateMatch: vi.fn(async () => null),
    });

    render(<WorldCupViewEnhanced />);

    await userEvent.click(screen.getByRole('button', { name: /generar dieciseisavos de final/i }));

    expect(toast.success).not.toHaveBeenCalled();
    // Sigue en Grupos (con el único partido jugado, la etiqueta pasa a
    // "Grupos 100%"): sin la ronda generada de verdad, saltar a Playoffs solo
    // mostraría el EmptyState de "sin generar" en falso.
    expect(screen.getByRole('tab', { name: /^grupos/i })).toHaveAttribute('aria-selected', 'true');
  });

  it('festeja y cambia a la pestaña de playoffs cuando la ronda se genera', async () => {
    const cycle = makeCycleWithGroupsComplete();
    useTournamentStore.setState({
      currentTournament: cycle,
      teams: [],
      advanceToKnockout: vi.fn(async () => true),
      regenerateKnockoutStage: vi.fn(async () => true),
      simulateMatch: vi.fn(async () => null),
    });

    render(<WorldCupViewEnhanced />);

    await userEvent.click(screen.getByRole('button', { name: /generar dieciseisavos de final/i }));

    expect(toast.success).toHaveBeenCalledWith('Dieciseisavos de final generados');
    expect(screen.getByRole('tab', { name: 'Playoffs (bloqueado)' })).toHaveAttribute('aria-selected', 'true');
  });
});

// Dieciseisavos ya generados (roundOf32 con un partido sin jugar): el mismo
// estado que muestra el botón "Regenerar Playoffs".
function makeCycleWithKnockoutUnplayed() {
  const worldCup: WorldCup = {
    groups: [
      {
        id: 'wc-g1',
        name: 'Grupo A',
        teamIds: ['a', 'b', 'c', 'd'],
        matches: [
          { id: 'wc-m1', homeTeamId: 'a', awayTeamId: 'b', homeScore: 1, awayScore: 0, isPlayed: true },
        ],
        standings: [],
      },
    ],
    knockout: {
      roundOf32: [
        { id: 'ko-1', homeTeamId: 'a', awayTeamId: 'b', homeScore: null, awayScore: null, isPlayed: false, round: 'round-of-32' },
      ],
      roundOf16: [],
      quarterFinals: [],
      semiFinals: [],
      thirdPlace: null,
      final: null,
    },
    qualifiedTeamIds: [],
  };
  return toCycle({ ...baseTournament(), worldCup });
}

describe('WorldCupViewEnhanced — handleRegenerateKnockout (ConfirmDialog)', () => {
  it('no festeja y deja el diálogo abierto si el guard rechaza', async () => {
    const cycle = makeCycleWithKnockoutUnplayed();
    useTournamentStore.setState({
      currentTournament: cycle,
      teams: [],
      advanceToKnockout: vi.fn(async () => true),
      regenerateKnockoutStage: vi.fn(async () => false),
      simulateMatch: vi.fn(async () => null),
    });

    render(<WorldCupViewEnhanced />);

    await userEvent.click(screen.getByRole('tab', { name: /playoffs/i }));
    await userEvent.click(screen.getByRole('button', { name: /regenerar playoffs/i }));
    await userEvent.click(screen.getByRole('button', { name: /^regenerar$/i }));

    expect(toast.success).not.toHaveBeenCalled();
    // El diálogo sigue abierto: no se cierra como si la acción destructiva
    // hubiera funcionado.
    expect(screen.getByRole('button', { name: /^regenerar$/i })).toBeInTheDocument();
  });

  it('festeja y cierra el diálogo cuando la regeneración se completa', async () => {
    const cycle = makeCycleWithKnockoutUnplayed();
    useTournamentStore.setState({
      currentTournament: cycle,
      teams: [],
      advanceToKnockout: vi.fn(async () => true),
      regenerateKnockoutStage: vi.fn(async () => true),
      simulateMatch: vi.fn(async () => null),
    });

    render(<WorldCupViewEnhanced />);

    await userEvent.click(screen.getByRole('tab', { name: /playoffs/i }));
    await userEvent.click(screen.getByRole('button', { name: /regenerar playoffs/i }));
    await userEvent.click(screen.getByRole('button', { name: /^regenerar$/i }));

    expect(toast.success).toHaveBeenCalledWith('Playoffs regenerados');
  });
});

// Mundial con un grupo sin ningún partido jugado: el mismo estado que
// habilita el botón "Regenerar Sorteo & Fixtures". A diferencia de
// `worldCupUnplayedCycle` en el extinto describe del wizard, no hace falta
// simular clasificatorias completas: el guard de esta acción sólo mira el
// propio Mundial (grupos y playoffs sin jugar), nunca las clasificatorias.
function makeCycleWithGroupsUnplayed() {
  const worldCup: WorldCup = {
    groups: [
      { id: 'wc-g1', name: 'Grupo A', teamIds: ['a', 'b', 'c', 'd'], matches: [], standings: [] },
    ],
    knockout: {
      roundOf32: [],
      roundOf16: [],
      quarterFinals: [],
      semiFinals: [],
      thirdPlace: null,
      final: null,
    },
    qualifiedTeamIds: [],
  };
  return toCycle({ ...baseTournament(), worldCup });
}

describe('WorldCupViewEnhanced — regenerar sorteo del Mundial (ConfirmDialog)', () => {
  it('no festeja y deja el diálogo abierto si el guard rechaza', async () => {
    const cycle = makeCycleWithGroupsUnplayed();
    useTournamentStore.setState({
      currentTournament: cycle,
      teams: [],
      regenerateWorldCupDrawAndFixtures: vi.fn(async () => false),
    });

    render(<WorldCupViewEnhanced />);

    await userEvent.click(screen.getByRole('button', { name: /regenerar sorteo & fixtures/i }));
    await userEvent.click(screen.getByRole('button', { name: /^regenerar$/i }));

    expect(toast.success).not.toHaveBeenCalled();
    // El diálogo sigue abierto: no se cierra como si la acción destructiva
    // hubiera funcionado (mismo contrato que handleRedrawQualifiers en
    // QualifiersView).
    expect(screen.getByRole('button', { name: /^regenerar$/i })).toBeInTheDocument();
  });

  it('festeja y cierra el diálogo cuando la regeneración se completa', async () => {
    const cycle = makeCycleWithGroupsUnplayed();
    useTournamentStore.setState({
      currentTournament: cycle,
      teams: [],
      regenerateWorldCupDrawAndFixtures: vi.fn(async () => true),
    });

    render(<WorldCupViewEnhanced />);

    await userEvent.click(screen.getByRole('button', { name: /regenerar sorteo & fixtures/i }));
    await userEvent.click(screen.getByRole('button', { name: /^regenerar$/i }));

    expect(toast.success).toHaveBeenCalledWith('Sorteo del Mundial regenerado');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^regenerar$/i })).not.toBeInTheDocument()
    );
  });
});

// 42 grupos: mismo reparto (11+11+10+10) que makeFullyQualifiedCycle en
// useTournamentStore.drawGuards.test.ts.
const QUALIFIER_REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];
const MANUAL_DRAW_REGION_GROUP_COUNTS: Record<Region, number> = {
  Europe: 11, America: 11, Africa: 10, Asia: 10,
};

function manualDrawStanding(teamId: string, points: number): TeamStanding {
  return { teamId, played: 2, won: 1, drawn: 0, lost: 1, goalsFor: 2, goalsAgainst: 1, goalDifference: 1, points };
}

/**
 * 42 grupos de clasificatorias con ganador y segundo bien definidos (puntos
 * distintos, sin empates) y UN partido jugado por grupo. A diferencia del
 * truco `matches: []` que alcanza para el guard interno del store (ver
 * makeFullyQualifiedCycle), acá hace falta un partido jugado de verdad:
 * `canAdvanceToWorldCup` -la que decide si se ve el botón "Sorteo Manual"-
 * exige `matches.length > 0` por grupo. Con menos de 42 grupos,
 * handleManualDraw tampoco llegaría nunca a los 64 clasificados (42
 * primeros + 22 mejores segundos) que exige antes de abrir el simulador.
 */
function manualDrawReadyCycle(): { cycle: Cycle; teams: Team[] } {
  const teams: Team[] = [];
  const qualifiers: Record<Region, Group[]> = { Europe: [], America: [], Africa: [], Asia: [] };
  for (const region of QUALIFIER_REGIONS) {
    for (let g = 0; g < MANUAL_DRAW_REGION_GROUP_COUNTS[region]; g++) {
      const winnerId = `${region}-mq${g}-w`;
      const runnerId = `${region}-mq${g}-r`;
      teams.push(
        { id: winnerId, name: `${region} MQ${g} W`, flag: '🏳️', region, skill: 80 },
        { id: runnerId, name: `${region} MQ${g} R`, flag: '🏳️', region, skill: 70 }
      );
      qualifiers[region].push({
        id: `${region}-mq${g}`,
        name: `Group ${g}`,
        region,
        teamIds: [winnerId, runnerId],
        matches: [
          {
            id: `${region}-mq${g}-m`,
            homeTeamId: winnerId,
            awayTeamId: runnerId,
            homeScore: 2,
            awayScore: 0,
            isPlayed: true,
            stage: 'qualifier',
            matchday: 1,
          },
        ],
        standings: [manualDrawStanding(winnerId, 9), manualDrawStanding(runnerId, 3)],
        isDrawComplete: true,
      });
    }
  }
  const base = toCycle(baseTournament());
  const cycle: Cycle = {
    ...base,
    qualifiers,
    hasAnyMatchPlayed: true,
    continental: { ...base.continental, isComplete: true },
    confederationsCup: { ...base.confederationsCup, isComplete: true },
    calendar: { phase: 'wc-groups', matchday: 1 },
  };
  return { cycle, teams };
}

describe('WorldCupViewEnhanced — handleDrawSimulatorComplete', () => {
  it('el más grave: si el guard rechaza, no descarta el sorteo manual ni festeja', async () => {
    const { cycle, teams } = manualDrawReadyCycle();
    useTournamentStore.setState({
      currentTournament: cycle,
      teams,
      advanceToWorldCupWithManualDraw: vi.fn(() => false),
    });

    render(<WorldCupViewEnhanced />);

    await userEvent.click(screen.getByRole('button', { name: /sorteo manual/i }));
    await userEvent.click(
      screen.getByRole('button', { name: /completar sorteo manual \(stub de test\)/i })
    );

    // El simulador sigue abierto -no se descartó el sorteo que el usuario
    // armó a mano- y no hay festejo contradictorio con el aviso que ya dio
    // el store.
    expect(
      screen.getByRole('button', { name: /completar sorteo manual \(stub de test\)/i })
    ).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('cierra el simulador y festeja cuando el sorteo manual se completa', async () => {
    const { cycle, teams } = manualDrawReadyCycle();
    useTournamentStore.setState({
      currentTournament: cycle,
      teams,
      advanceToWorldCupWithManualDraw: vi.fn(() => true),
    });

    render(<WorldCupViewEnhanced />);

    await userEvent.click(screen.getByRole('button', { name: /sorteo manual/i }));
    await userEvent.click(
      screen.getByRole('button', { name: /completar sorteo manual \(stub de test\)/i })
    );

    // El modal vive dentro de un <AnimatePresence>: al desmontar, framer-motion
    // corre la transición de salida antes de sacar el nodo del DOM, así que
    // no alcanza con mirar el estado apenas después del click.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /completar sorteo manual \(stub de test\)/i })
      ).not.toBeInTheDocument()
    );
    expect(toast.success).toHaveBeenCalledWith('🏆 ¡Sorteo manual completado y guardado exitosamente!');
  });
});
