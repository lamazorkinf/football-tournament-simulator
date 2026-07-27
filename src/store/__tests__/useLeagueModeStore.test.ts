import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLeagueModeStore } from '../useLeagueModeStore';
import { useTournamentStore } from '../useTournamentStore';
import { useModeStore } from '../useModeStore';
import { modeTournamentService } from '../../services/modeTournamentService';
import { modeSeasonService } from '../../services/modeSeasonService';
import { modesService } from '../../services/modesService';
import type { Team } from '../../types';
import type { CupTournament, LeagueTournament } from '../../core/formats/modeTournament';
import { isLeagueComplete } from '../../core/formats/league';
import { isRoundResolved } from '../../core/formats/cup';

vi.mock('../../lib/supabase', () => ({
  isSupabaseConfigured: () => true,
  supabase: {},
}));

let created = 0;
vi.mock('../../services/modeTournamentService', () => ({
  modeTournamentService: {
    create: vi.fn(async () => `t${created++}`),
    saveState: vi.fn(async () => {}),
    listByMode: vi.fn(async () => []),
  },
}));
vi.mock('../../services/modeSeasonService', () => ({
  modeSeasonService: {
    getSeason: vi.fn(async () => null),
    saveDivision: vi.fn(async () => {}),
  },
}));
vi.mock('../../services/modesService', () => ({
  modesService: { updateMode: vi.fn(async () => {}) },
}));
vi.mock('../../services/teamsService', () => ({
  teamsService: { batchUpdateTeams: vi.fn(async () => {}) },
}));
vi.mock('../../services/matchHistoryService', () => ({
  matchHistoryService: { createMatch: vi.fn(async () => ({})) },
}));

/** RNG determinista para una temporada reproducible. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function makeTeams(): Team[] {
  const teams: Team[] = [];
  for (let i = 1; i <= 16; i++) teams.push({ id: `A${i}`, name: `A${i}`, flag: '', skill: 70 - i, modeId: 'liga' });
  for (let i = 1; i <= 16; i++) teams.push({ id: `B${i}`, name: `B${i}`, flag: '', skill: 55 - i, modeId: 'liga' });
  return teams;
}

const DIV_A = Array.from({ length: 16 }, (_, i) => `A${i + 1}`);
const DIV_B = Array.from({ length: 16 }, (_, i) => `B${i + 1}`);

describe('useLeagueModeStore — temporada completa', () => {
  beforeEach(() => {
    created = 0;
    vi.mocked(modeTournamentService.create).mockClear();
    vi.mocked(modeSeasonService.saveDivision).mockClear();
    vi.mocked(modesService.updateMode).mockClear();
    vi.mocked(modeSeasonService.getSeason).mockResolvedValue(null);

    useTournamentStore.setState({ teams: makeTeams() });
    useModeStore.setState({
      modes: [{ id: 'liga', name: 'Liga', kind: 'league-system', config: {}, currentYear: 2026 }],
      activeModeId: 'liga',
      isLoaded: true,
    });
    useLeagueModeStore.setState({
      modeId: 'liga',
      year: 2026,
      divisions: { A: DIV_A, B: DIV_B },
      tournaments: [],
      status: 'ready',
      busy: false,
    });
  });

  it('startSeason crea dos ligas (A/B) y una copa de 16 cruces A-vs-B', async () => {
    await useLeagueModeStore.getState().startSeason();
    const ts = useLeagueModeStore.getState().tournaments;
    expect(ts).toHaveLength(3);

    const leagues = ts.filter((t): t is LeagueTournament => t.format === 'league');
    expect(leagues.map((l) => l.division).sort()).toEqual(['A', 'B']);
    // 16 equipos ida y vuelta = 30 fechas × 8 = 240 partidos por liga.
    expect(leagues[0].state.matches).toHaveLength(240);

    const cup = ts.find((t): t is CupTournament => t.format === 'cup')!;
    expect(cup.state.rounds[0]).toHaveLength(16);
    const setA = new Set(DIV_A);
    const setB = new Set(DIV_B);
    for (const tie of cup.state.rounds[0]) {
      const teams = [tie.homeTeamId!, tie.awayTeamId!];
      expect(teams.filter((x) => setA.has(x))).toHaveLength(1);
      expect(teams.filter((x) => setB.has(x))).toHaveLength(1);
    }
  });

  it('juega ambas ligas hasta completarlas y evoluciona el skill', async () => {
    const rng = seededRng(123);
    await useLeagueModeStore.getState().startSeason();
    const leagues = useLeagueModeStore
      .getState()
      .tournaments.filter((t): t is LeagueTournament => t.format === 'league');

    const skillBefore = useTournamentStore.getState().teams.find((t) => t.id === 'A1')!.skill;

    for (const lg of leagues) {
      for (let md = 1; md <= 30; md++) {
        await useLeagueModeStore.getState().simulateLeagueMatchday(lg.id, md, rng);
      }
    }

    const done = useLeagueModeStore
      .getState()
      .tournaments.filter((t): t is LeagueTournament => t.format === 'league');
    for (const lg of done) {
      expect(isLeagueComplete(lg.state)).toBe(true);
      expect(lg.status).toBe('completed');
      const table = lg.state.standings;
      // La tabla suma 16 equipos y 30 partidos jugados cada uno.
      expect(table).toHaveLength(16);
      expect(table.every((s) => s.played === 30)).toBe(true);
    }

    const skillAfter = useTournamentStore.getState().teams.find((t) => t.id === 'A1')!.skill;
    expect(skillAfter).not.toBe(skillBefore); // el rating se movió
  });

  it('juega la copa hasta coronar un campeón', async () => {
    const rng = seededRng(77);
    await useLeagueModeStore.getState().startSeason();
    const cupId = useLeagueModeStore.getState().tournaments.find((t) => t.format === 'cup')!.id;

    // Resolver ronda por ronda hasta que haya campeón (o tope de seguridad).
    for (let guard = 0; guard < 40; guard++) {
      const cup = useLeagueModeStore.getState().tournaments.find((t): t is CupTournament => t.format === 'cup')!;
      if (cup.state.championId) break;
      const round = cup.state.rounds[cup.state.rounds.length - 1];
      if (isRoundResolved(round)) continue;
      for (const tie of round) {
        if (!tie.winnerId) await useLeagueModeStore.getState().simulateCupTie(cupId, tie.id, rng);
      }
    }

    const cup = useLeagueModeStore.getState().tournaments.find((t): t is CupTournament => t.format === 'cup')!;
    expect(cup.state.championId).toBeDefined();
    expect(cup.state.runnerUpId).toBeDefined();
    expect(cup.status).toBe('completed');
    // 5 rondas: R32, R16, QF, SF, final.
    expect(cup.state.rounds).toHaveLength(5);
    expect(cup.state.rounds[4]).toHaveLength(1);
  });

  it('closeSeason aplica ascensos/descensos y avanza el año', async () => {
    const rng = seededRng(9);
    await useLeagueModeStore.getState().startSeason();
    const leagues = useLeagueModeStore
      .getState()
      .tournaments.filter((t): t is LeagueTournament => t.format === 'league');
    for (const lg of leagues) {
      for (let md = 1; md <= 30; md++) {
        await useLeagueModeStore.getState().simulateLeagueMatchday(lg.id, md, rng);
      }
    }

    await useLeagueModeStore.getState().closeSeason();

    // Guardó la composición 2027 de ambas divisiones y avanzó currentYear.
    expect(modeSeasonService.saveDivision).toHaveBeenCalledTimes(2);
    expect(modesService.updateMode).toHaveBeenCalledWith('liga', { currentYear: 2027 });

    // La nueva A tiene 16 equipos y contiene a los 3 mejores de la B anterior.
    const callA = vi.mocked(modeSeasonService.saveDivision).mock.calls.find((c) => c[2] === 'A')!;
    const nextA: string[] = callA[3];
    expect(nextA).toHaveLength(16);
    const promoted = nextA.filter((id) => id.startsWith('B'));
    expect(promoted).toHaveLength(3);
  });
});
