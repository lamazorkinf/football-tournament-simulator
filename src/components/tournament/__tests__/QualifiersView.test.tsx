import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { QualifiersView } from '../QualifiersView';
import { useTournamentStore } from '../../../store/useTournamentStore';
import { toCycle } from '../../../core/cycle';
import { baseTournament } from '../../../test/fixtures/cycle';
import type { Cycle, Group, Match, Region } from '../../../types';

// Espiar `toast.success` (sonner no necesita un <Toaster/> montado para
// registrar la llamada) es lo único que permite distinguir, desde afuera,
// si el handler festejó o se quedó callado cuando el store rechazó la acción.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function renderQualifiers() {
  return render(<QualifiersView />);
}

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

describe('QualifiersView — rehacer sorteo de clasificatorias (ConfirmDialog)', () => {
  it('no festeja y deja el diálogo abierto si el guard rechaza', async () => {
    useTournamentStore.setState({
      currentTournament: qualifiersCycle(),
      teams: [],
      generateDrawAndFixtures: vi.fn(async () => false),
    });
    renderQualifiers();

    await userEvent.click(screen.getByRole('button', { name: /rehacer sorteo/i }));
    await userEvent.click(screen.getByRole('button', { name: /^rehacer$/i }));

    expect(toast.success).not.toHaveBeenCalled();
    // El diálogo sigue abierto: no se cierra como si la acción destructiva
    // hubiera funcionado (mismo contrato que handleRegenerateWorldCupDraw).
    expect(screen.getByRole('button', { name: /^rehacer$/i })).toBeInTheDocument();
  });

  it('festeja y cierra el diálogo cuando el sorteo se rehace', async () => {
    useTournamentStore.setState({
      currentTournament: qualifiersCycle(),
      teams: [],
      generateDrawAndFixtures: vi.fn(async () => true),
    });
    renderQualifiers();

    await userEvent.click(screen.getByRole('button', { name: /rehacer sorteo/i }));
    await userEvent.click(screen.getByRole('button', { name: /^rehacer$/i }));

    expect(toast.success).toHaveBeenCalledWith('Sorteo de clasificatorias rehecho');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^rehacer$/i })).not.toBeInTheDocument()
    );
  });
});

describe('QualifiersView — botón de rehacer sorteo', () => {
  it('con el sorteo hecho y sin partidos jugados ofrece rehacerlo', () => {
    useTournamentStore.setState({ currentTournament: qualifiersCycle(), teams: [] });
    renderQualifiers();

    expect(screen.getByRole('button', { name: /rehacer sorteo/i })).toBeInTheDocument();
  });

  it('con partidos jugados no ofrece rehacer sorteo', () => {
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
    renderQualifiers();

    expect(screen.queryByRole('button', { name: /rehacer sorteo/i })).not.toBeInTheDocument();
  });
});
