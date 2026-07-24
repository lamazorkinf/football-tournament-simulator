import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TournamentWizard } from '../TournamentWizard';
import { MobileActionProvider } from '../../../hooks/useMobileAction';
import { useTournamentStore } from '../../../store/useTournamentStore';
import { toCycle } from '../../../core/cycle';
import { baseTournament, makeContinentalDoneCycle } from '../../../test/fixtures/cycle';
import type { Cycle, Group, Match, Region } from '../../../types';

function renderWizard() {
  return render(
    <MobileActionProvider>
      <TournamentWizard />
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
