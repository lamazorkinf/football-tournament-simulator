import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { TournamentWizard } from '../TournamentWizard';
import { MobileActionProvider } from '../../../hooks/useMobileAction';
import { useTournamentStore } from '../../../store/useTournamentStore';
import { toCycle } from '../../../core/cycle';
import { baseTournament, makeContinentalDoneCycle } from '../../../test/fixtures/cycle';
import type { Cycle, Group, Match, Region, Team, TeamStanding, WorldCupGroup } from '../../../types';

// Espiar `toast.success` (sonner no necesita un <Toaster/> montado para
// registrar la llamada) es lo único que permite distinguir, desde afuera,
// si un handler festejó o se quedó callado cuando el store rechazó la acción.
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

function renderWizard(onNavigate?: (view: string) => void) {
  return render(
    <MobileActionProvider>
      <TournamentWizard onNavigate={onNavigate} />
    </MobileActionProvider>
  );
}

describe('TournamentWizard — pasos del ciclo', () => {
  it('ciclo nuevo: muestra los pasos Continental y Confederaciones', () => {
    useTournamentStore.setState({ currentTournament: toCycle(baseTournament()), teams: [] });
    renderWizard();
    expect(screen.getByText('Torneos Continentales')).toBeInTheDocument();
    expect(screen.getByText('Copa Confederaciones')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sortear continentales/i })).toBeInTheDocument();
  });

  it('continental completo: el paso Confederaciones ofrece sortear', () => {
    const { cycle, teams } = makeContinentalDoneCycle();
    useTournamentStore.setState({ currentTournament: cycle, teams });
    renderWizard();
    expect(screen.getByRole('button', { name: /sortear confederaciones/i })).toBeInTheDocument();
  });
});

const QUALIFIER_REGIONS: Region[] = ['Europe', 'America', 'Africa', 'Asia'];

function qualifierGroup(region: Region, index: number, matchCount: number): Group {
  const teamIds = Array.from({ length: 5 }, (_, i) => `${region}-t${i}`);
  const matches: Match[] = Array.from({ length: matchCount }, (_, i) => ({
    id: `${region}-${index}-m${i}`,
    homeTeamId: teamIds[0],
    awayTeamId: teamIds[1],
    homeScore: null,
    awayScore: null,
    isPlayed: false,
    stage: 'qualifier',
    matchday: i + 1,
  }));
  return {
    id: `${region}-g${index}`,
    name: `Group ${index}`,
    region,
    teamIds,
    matches,
    standings: [],
    isDrawComplete: matchCount > 0,
  };
}

/** Ciclo en fase de clasificatorias; `brokenRegion` queda sin partidos. */
function qualifiersCycle(brokenRegion?: Region): Cycle {
  const base = toCycle(baseTournament());
  const qualifiers = Object.fromEntries(
    QUALIFIER_REGIONS.map((r) => [r, [qualifierGroup(r, 1, r === brokenRegion ? 0 : 20)]])
  ) as Cycle['qualifiers'];
  return {
    ...base,
    qualifiers,
    continental: { ...base.continental, isComplete: true },
    confederationsCup: { ...base.confederationsCup, isComplete: true },
    calendar: { phase: 'wc-qualifiers', matchday: 1 },
  };
}

describe('TournamentWizard — sorteo de clasificatorias', () => {
  it('con el sorteo hecho ofrece rehacerlo y no ofrece empezar', () => {
    useTournamentStore.setState({ currentTournament: qualifiersCycle(), teams: [] });
    renderWizard();

    expect(screen.getByRole('button', { name: /rehacer sorteo/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /empezar/i })).not.toBeInTheDocument();
  });

  it('sin sorteo ofrece empezar y no ofrece rehacer', () => {
    const cycle = qualifiersCycle();
    const empty = {
      ...cycle,
      qualifiers: { Europe: [], America: [], Africa: [], Asia: [] },
    } as Cycle;
    useTournamentStore.setState({ currentTournament: empty, teams: [] });
    renderWizard();

    expect(screen.getByRole('button', { name: /empezar/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rehacer sorteo/i })).not.toBeInTheDocument();
  });

  it('sorteo incompleto: lo avisa en la tarjeta', () => {
    useTournamentStore.setState({ currentTournament: qualifiersCycle('Asia'), teams: [] });
    renderWizard();

    expect(screen.getByText(/sorteo incompleto/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rehacer sorteo/i })).toBeInTheDocument();
  });

  it('con partidos jugados no se puede rehacer', () => {
    const cycle = qualifiersCycle();
    const played: Cycle = {
      ...cycle,
      hasAnyMatchPlayed: true,
      qualifiers: {
        ...cycle.qualifiers,
        Europe: cycle.qualifiers.Europe.map((g) => ({
          ...g,
          matches: g.matches.map((m, i) => (i === 0 ? { ...m, isPlayed: true, homeScore: 1, awayScore: 0 } : m)),
        })),
      },
    };
    useTournamentStore.setState({ currentTournament: played, teams: [] });
    renderWizard();

    expect(screen.queryByRole('button', { name: /rehacer sorteo/i })).not.toBeInTheDocument();
  });

  it('sorteo incompleto con partidos ya jugados: el aviso no invita a rehacer', () => {
    // Asia sin partidos = sorteo parcial (misma condición que el test de
    // arriba), combinado con un partido jugado en Europa: el guard de
    // "Rehacer sorteo" exige además que no se haya jugado nada, así que en
    // esta combinación el botón no existe y el aviso no puede pedir una
    // acción que la UI no ofrece.
    const cycle = qualifiersCycle('Asia');
    const played: Cycle = {
      ...cycle,
      hasAnyMatchPlayed: true,
      qualifiers: {
        ...cycle.qualifiers,
        Europe: cycle.qualifiers.Europe.map((g) => ({
          ...g,
          matches: g.matches.map((m, i) => (i === 0 ? { ...m, isPlayed: true, homeScore: 1, awayScore: 0 } : m)),
        })),
      },
    };
    useTournamentStore.setState({ currentTournament: played, teams: [] });
    renderWizard();

    expect(screen.getByText(/sorteo incompleto/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rehacer sorteo/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/rehac[eé] el sorteo para completarlo/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no se puede rehacer: ya se jugaron partidos/i)).toBeInTheDocument();
  });
});

describe('TournamentWizard — sorteo continental y confederaciones no festejan cuando el guard rechaza', () => {
  it('handleDrawContinental no festeja ni navega si el guard rechaza', async () => {
    const onNavigate = vi.fn();
    useTournamentStore.setState({
      currentTournament: toCycle(baseTournament()),
      teams: [],
      drawContinental: vi.fn(() => false),
    });
    renderWizard(onNavigate);

    await userEvent.click(screen.getByRole('button', { name: /sortear continentales/i }));

    expect(toast.success).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('handleDrawContinental festeja y navega cuando el sorteo se completa', async () => {
    const onNavigate = vi.fn();
    useTournamentStore.setState({
      currentTournament: toCycle(baseTournament()),
      teams: [],
      drawContinental: vi.fn(() => true),
    });
    renderWizard(onNavigate);

    await userEvent.click(screen.getByRole('button', { name: /sortear continentales/i }));

    expect(toast.success).toHaveBeenCalledWith('Torneos continentales sorteados');
    expect(onNavigate).toHaveBeenCalledWith('continental');
  });

  it('handleDrawConfederations no festeja ni navega si el guard rechaza', async () => {
    const { cycle, teams } = makeContinentalDoneCycle();
    const onNavigate = vi.fn();
    useTournamentStore.setState({
      currentTournament: cycle,
      teams,
      drawConfederations: vi.fn(() => false),
    });
    renderWizard(onNavigate);

    await userEvent.click(screen.getByRole('button', { name: /sortear confederaciones/i }));

    expect(toast.success).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('handleDrawConfederations festeja y navega cuando el sorteo se completa', async () => {
    const { cycle, teams } = makeContinentalDoneCycle();
    const onNavigate = vi.fn();
    useTournamentStore.setState({
      currentTournament: cycle,
      teams,
      drawConfederations: vi.fn(() => true),
    });
    renderWizard(onNavigate);

    await userEvent.click(screen.getByRole('button', { name: /sortear confederaciones/i }));

    expect(toast.success).toHaveBeenCalledWith('Copa Confederaciones sorteada');
    expect(onNavigate).toHaveBeenCalledWith('confederations');
  });
});

/** Mismos 4 grupos de qualifiersCycle(), pero con TODOS sus partidos jugados (no solo el primero). */
function allQualifiersPlayedCycle(): Cycle {
  const cycle = qualifiersCycle();
  const playedQualifiers = Object.fromEntries(
    QUALIFIER_REGIONS.map((r) => [
      r,
      cycle.qualifiers[r].map((g) => ({
        ...g,
        matches: g.matches.map((m) => ({ ...m, isPlayed: true, homeScore: 1, awayScore: 0 })),
      })),
    ])
  ) as Cycle['qualifiers'];
  return { ...cycle, hasAnyMatchPlayed: true, qualifiers: playedQualifiers };
}

/** Ciclo con clasificatorias completas y un Mundial de 1 grupo ya jugado (sin playoffs). */
function worldCupGroupsCompleteCycle(): Cycle {
  const base = allQualifiersPlayedCycle();
  return {
    ...base,
    worldCup: {
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
      knockout: { roundOf32: [], roundOf16: [], quarterFinals: [], semiFinals: [], thirdPlace: null, final: null },
      qualifiedTeamIds: [],
    },
  };
}

describe('TournamentWizard — avanzar al Mundial y a playoffs no festejan cuando el guard rechaza', () => {
  it('handleAdvanceToWorldCup no festeja si el guard rechaza', async () => {
    useTournamentStore.setState({
      currentTournament: allQualifiersPlayedCycle(),
      teams: [],
      advanceToWorldCup: vi.fn(async () => false),
    });
    renderWizard();

    await userEvent.click(screen.getByRole('button', { name: /sorteo autom[aá]tico/i }));

    expect(toast.success).not.toHaveBeenCalled();
  });

  it('handleAdvanceToWorldCup festeja cuando el avance se completa', async () => {
    useTournamentStore.setState({
      currentTournament: allQualifiersPlayedCycle(),
      teams: [],
      advanceToWorldCup: vi.fn(async () => true),
    });
    renderWizard();

    await userEvent.click(screen.getByRole('button', { name: /sorteo autom[aá]tico/i }));

    expect(toast.success).toHaveBeenCalledWith('Avanzado a Copa del Mundo con 64 equipos clasificados');
  });

  it('handleAdvanceToKnockout no festeja si el guard rechaza', async () => {
    useTournamentStore.setState({
      currentTournament: worldCupGroupsCompleteCycle(),
      teams: [],
      advanceToKnockout: vi.fn(async () => false),
    });
    renderWizard();

    await userEvent.click(screen.getByRole('button', { name: /generar dieciseisavos/i }));

    expect(toast.success).not.toHaveBeenCalled();
  });

  it('handleAdvanceToKnockout festeja cuando la ronda se genera', async () => {
    useTournamentStore.setState({
      currentTournament: worldCupGroupsCompleteCycle(),
      teams: [],
      advanceToKnockout: vi.fn(async () => true),
    });
    renderWizard();

    await userEvent.click(screen.getByRole('button', { name: /generar dieciseisavos/i }));

    expect(toast.success).toHaveBeenCalledWith('Dieciseisavos de final generados');
  });
});

// 42 grupos: mismo reparto (11+11+10+10) que makeFullyQualifiedCycle en
// useTournamentStore.drawGuards.test.ts.
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

describe('TournamentWizard — handleDrawSimulatorComplete', () => {
  it('el más grave: si el guard rechaza, no descarta el sorteo manual ni festeja', async () => {
    const { cycle, teams } = manualDrawReadyCycle();
    useTournamentStore.setState({
      currentTournament: cycle,
      teams,
      advanceToWorldCupWithManualDraw: vi.fn(() => false),
    });
    renderWizard();

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
    renderWizard();

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
