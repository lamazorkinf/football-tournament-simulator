import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { Cycle, Group, Team } from '../../../types';
import { MatchPreview } from '../MatchPreview';
import { TeamProfileProvider } from '../../../hooks/useTeamProfile';
import { matchHistoryService } from '../../../services/matchHistoryService';
import { useTournamentStore } from '../../../store/useTournamentStore';
import { useConfigStore, DEFAULT_CONFIG } from '../../../store/useConfigStore';
import { toCycle } from '../../../core/cycle';
import { baseTournament } from '../../../test/fixtures/cycle';

// Sin este mock, updateFatigue() deja armada una escritura real a Supabase
// (mismo proyecto que producción): ver src/store/__tests__/useConfigStore.test.ts.
vi.mock('../../../lib/persistSettings', () => ({
  queueSettingsSave: vi.fn(),
  flushSettingsSave: vi.fn(),
}));

const homeTeam: Team = { id: 'arg', name: 'Argentina', flag: '🇦🇷', region: 'America', skill: 90 };
const awayTeam: Team = { id: 'bra', name: 'Brasil', flag: '🇧🇷', region: 'America', skill: 85 };
const teams: Team[] = [homeTeam, awayTeam];

const group: Group = {
  id: 'g1',
  name: 'Grupo A',
  region: 'America',
  teamIds: ['arg', 'bra'],
  matches: [
    { id: 'm1', homeTeamId: 'arg', awayTeamId: 'bra', homeScore: null, awayScore: null, isPlayed: false, matchday: 1 },
  ],
  standings: [],
};

function renderPreview() {
  return render(
    <TeamProfileProvider>
      <MatchPreview homeTeam={homeTeam} awayTeam={awayTeam} group={group} teams={teams} />
    </TeamProfileProvider>,
  );
}

describe('MatchPreview — energía en vivo', () => {
  afterEach(() => {
    useConfigStore.setState({ config: DEFAULT_CONFIG });
    useTournamentStore.setState({ currentTournament: null });
    vi.restoreAllMocks();
  });

  it('muestra la energía cuando el ciclo y la fatiga están disponibles', async () => {
    vi.spyOn(matchHistoryService, 'getTeamMatches').mockResolvedValue([]);
    const cycle: Cycle = {
      ...toCycle(baseTournament()),
      energy: {
        scope: 'wc-qualifiers',
        byTeam: {
          arg: { value: 82, lastMatchdayIndex: 1 },
          bra: { value: 91, lastMatchdayIndex: 1 },
        },
      },
    };
    useTournamentStore.setState({ currentTournament: cycle });

    renderPreview();

    expect(await screen.findByText('82%')).toBeInTheDocument();
    expect(screen.getByText('91%')).toBeInTheDocument();
  });

  // Regresión: `getEngineConfig()` es un getter no reactivo — leerlo no
  // suscribe al componente. Si la previa lo usara en vez de un selector de
  // `useConfigStore`, apagar el cansancio desde Ajustes (Task 9) con la
  // previa YA ABIERTA no la actualizaría hasta recargar o remontar el
  // componente, lo que se lee como un control roto.
  it('apagar la fatiga en Ajustes oculta la energía en una previa ya montada', async () => {
    vi.spyOn(matchHistoryService, 'getTeamMatches').mockResolvedValue([]);
    const cycle: Cycle = {
      ...toCycle(baseTournament()),
      energy: {
        scope: 'wc-qualifiers',
        byTeam: {
          arg: { value: 82, lastMatchdayIndex: 1 },
          bra: { value: 91, lastMatchdayIndex: 1 },
        },
      },
    };
    useTournamentStore.setState({ currentTournament: cycle });

    renderPreview();
    expect(await screen.findByText('82%')).toBeInTheDocument();

    act(() => {
      useConfigStore.getState().updateFatigue({ enabled: false });
    });

    expect(screen.queryByText('82%')).not.toBeInTheDocument();
    expect(screen.queryByText('91%')).not.toBeInTheDocument();
  });
});
