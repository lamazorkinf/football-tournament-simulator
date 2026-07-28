import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSeasonModeStore } from '../useSeasonModeStore';
import { deriveModeNav } from '../../modes/nav';
import { useTournamentStore } from '../useTournamentStore';
import { useModeStore } from '../useModeStore';
import { modeTournamentService } from '../../services/modeTournamentService';
import { modeSeasonService } from '../../services/modeSeasonService';
import { modesService } from '../../services/modesService';
import type { Team } from '../../types';
import type { EliminacionTournament, LigaTournament } from '../../core/formats/modeTournament';
import { isLeagueComplete } from '../../core/formats/league';
import { currentModeJornada } from '../../core/formats/modeJornada';
import { VILLAMARIENSE_DESCRIPTOR } from '../../modes/registry';
import type { ModeDescriptor } from '../../modes/types';

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
    listYears: vi.fn(async () => []),
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

/** Deja el store listo para jugar la temporada de un descriptor dado. */
function seedStore(descriptor: ModeDescriptor, divisions: Record<string, string[]>) {
  useSeasonModeStore.setState({
    modeId: 'liga',
    descriptor,
    year: 2026,
    // El año que se mira es el que corre: es lo que habilita jugar y cerrar.
    currentYear: 2026,
    availableYears: [2026],
    divisions,
    previousDivisions: null,
    tournaments: [],
    status: 'ready',
    busy: false,
  });
}

describe('useSeasonModeStore — la temporada villamariense, dirigida por el descriptor', () => {
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
    seedStore(VILLAMARIENSE_DESCRIPTOR, { A: DIV_A, B: DIV_B });
  });

  it('startSeason crea dos ligas (A/B) y una copa de 16 cruces A-vs-B', async () => {
    await useSeasonModeStore.getState().startSeason();
    const ts = useSeasonModeStore.getState().tournaments;
    expect(ts).toHaveLength(3);

    const leagues = ts.filter((t): t is LigaTournament => t.format === 'liga');
    expect(leagues.map((l) => l.division).sort()).toEqual(['A', 'B']);
    // 16 equipos ida y vuelta = 30 fechas × 8 = 240 partidos por liga.
    expect(leagues[0].state.matches).toHaveLength(240);

    const cup = ts.find((t): t is EliminacionTournament => t.format === 'eliminacion')!;
    expect(cup.state.rounds[0].ties).toHaveLength(16);
    const setA = new Set(DIV_A);
    const setB = new Set(DIV_B);
    for (const tie of cup.state.rounds[0].ties) {
      const teams = [tie.homeTeamId!, tie.awayTeamId!];
      expect(teams.filter((x) => setA.has(x))).toHaveLength(1);
      expect(teams.filter((x) => setB.has(x))).toHaveLength(1);
    }
  });

  it('cada torneo queda atado a su competición del descriptor', async () => {
    await useSeasonModeStore.getState().startSeason();
    const ids = useSeasonModeStore.getState().tournaments.map((t) => t.competitionId);
    expect(ids).toEqual(['league-A', 'league-B', 'cup']);
    // Y lo que se persiste es el formato canónico, no el legacy.
    const formats = vi.mocked(modeTournamentService.create).mock.calls.map((c) => c[0].format);
    expect(formats).toEqual(['liga', 'liga', 'eliminacion']);
  });

  it('juega ambas ligas hasta completarlas y evoluciona el skill', async () => {
    const rng = seededRng(123);
    await useSeasonModeStore.getState().startSeason();
    const leagues = useSeasonModeStore
      .getState()
      .tournaments.filter((t): t is LigaTournament => t.format === 'liga');

    const skillBefore = useTournamentStore.getState().teams.find((t) => t.id === 'A1')!.skill;

    for (const lg of leagues) {
      for (let md = 1; md <= 30; md++) {
        await useSeasonModeStore.getState().simulateMatchday(lg.id, md, rng);
      }
    }

    const done = useSeasonModeStore
      .getState()
      .tournaments.filter((t): t is LigaTournament => t.format === 'liga');
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

  it('juega la copa jornada por jornada hasta coronar un campeón', async () => {
    const rng = seededRng(77);
    await useSeasonModeStore.getState().startSeason();
    const cupId = useSeasonModeStore.getState().tournaments.find((t) => t.format === 'eliminacion')!.id;
    const cupRun = () =>
      useSeasonModeStore
        .getState()
        .tournaments.find((t): t is EliminacionTournament => t.format === 'eliminacion')!;

    // Cada jornada es una tanda de idas o de vueltas, nunca las dos juntas: una
    // ronda de la copa villamariense se juega en exactamente dos jornadas.
    const jornadas: string[] = [];
    for (let guard = 0; guard < 40; guard++) {
      const jornada = currentModeJornada(cupRun());
      if (!jornada) break;
      jornadas.push(jornada.label);
      // Todos los partidos de la jornada son del mismo cruce-leg y ninguno se
      // jugó todavía.
      expect(jornada.matches.every((m) => !m.isPlayed)).toBe(true);
      await useSeasonModeStore.getState().simulateJornada(cupId, rng);
    }

    const cup = cupRun();
    expect(cup.state.championId).toBeDefined();
    expect(cup.state.runnerUpId).toBeDefined();
    expect(cup.status).toBe('completed');
    // 5 rondas: R32, R16, QF, SF, final.
    expect(cup.state.rounds).toHaveLength(5);
    expect(cup.state.rounds[4].ties).toHaveLength(1);
    // Ida y vuelta: cada cruce se jugó a dos partidos, en dos jornadas.
    expect(cup.state.rounds[0].ties.every((t) => t.matches.length === 2)).toBe(true);
    expect(jornadas).toEqual([
      '16avos · Ida',
      '16avos · Vuelta',
      'Octavos · Ida',
      'Octavos · Vuelta',
      'Cuartos · Ida',
      'Cuartos · Vuelta',
      'Semis · Ida',
      'Semis · Vuelta',
      'Final · Ida',
      'Final · Vuelta',
    ]);
  });

  it('la vuelta de un cruce no se puede jugar antes que la ida', async () => {
    const rng = seededRng(31);
    await useSeasonModeStore.getState().startSeason();
    const cupId = useSeasonModeStore.getState().tournaments.find((t) => t.format === 'eliminacion')!.id;
    const firstTie = () =>
      useSeasonModeStore
        .getState()
        .tournaments.find((t): t is EliminacionTournament => t.format === 'eliminacion')!
        .state.rounds[0].ties[0];

    const [ida, vuelta] = firstTie().matches;
    // Saltear la ida no hace nada: el global de la vuelta depende de ella.
    expect(await useSeasonModeStore.getState().simulateMatch(cupId, vuelta.id, rng)).toBeNull();
    expect(firstTie().matches[1].isPlayed).toBe(false);

    const playedIda = await useSeasonModeStore.getState().simulateMatch(cupId, ida.id, rng);
    expect(playedIda).not.toBeNull();
    expect(firstTie().matches[0].isPlayed).toBe(true);
    // Con la ida jugada el cruce sigue abierto: lo define la vuelta.
    expect(firstTie().winnerId).toBeUndefined();

    const playedVuelta = await useSeasonModeStore.getState().simulateMatch(cupId, vuelta.id, rng);
    expect(playedVuelta).not.toBeNull();
    expect(firstTie().winnerId).toBeDefined();
  });

  it('closeSeason aplica ascensos/descensos y avanza el año', async () => {
    const rng = seededRng(9);
    await useSeasonModeStore.getState().startSeason();
    const leagues = useSeasonModeStore
      .getState()
      .tournaments.filter((t): t is LigaTournament => t.format === 'liga');
    for (const lg of leagues) {
      for (let md = 1; md <= 30; md++) {
        await useSeasonModeStore.getState().simulateMatchday(lg.id, md, rng);
      }
    }

    await useSeasonModeStore.getState().closeSeason();

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

  it('los torneos creados alimentan la navegacion del modo', async () => {
    await useSeasonModeStore.getState().startSeason();
    const { descriptor, tournaments } = useSeasonModeStore.getState();
    const nav = deriveModeNav({
      descriptor,
      currentView: 'league',
      requestedTab: 'season',
      runningCompetitionIds: tournaments.map((t) => t.competitionId),
    });
    expect(nav.sections[0].items.map((i) => i.label)).toEqual([
      'Liga A', 'Liga B', 'Copa', 'Temporada', 'Escudos',
    ]);
    expect(nav.tab).toBe('season');
  });
});

// ---------------------------------------------------------------------------
// Lo que el descriptor desbloquea: tres divisiones y una rueda, sin código nuevo
// ---------------------------------------------------------------------------

const DIV_C = Array.from({ length: 16 }, (_, i) => `C${i + 1}`);

const THREE_TIER: ModeDescriptor = {
  divisions: ['A', 'B', 'C'],
  promotion: { count: 2 },
  competitions: ['A', 'B', 'C'].map((division, i) => ({
    id: `league-${division}`,
    name: `Liga ${division}`,
    order: i + 1,
    stage: 'league' as const,
    entrants: { from: 'division' as const, division },
    format: 'liga' as const,
    legs: 1 as const,
  })),
  theme: 'villamariense',
  extraTabs: ['season'],
  dataTabs: [],
  archiveTabs: [],
  engine: 'season',
};

describe('useSeasonModeStore — escalera de tres divisiones', () => {
  beforeEach(() => {
    created = 0;
    vi.mocked(modeSeasonService.saveDivision).mockClear();
    vi.mocked(modesService.updateMode).mockClear();
    vi.mocked(modeSeasonService.getSeason).mockResolvedValue(null);

    useTournamentStore.setState({
      teams: [
        ...makeTeams(),
        ...Array.from({ length: 16 }, (_, i) => ({
          id: `C${i + 1}`,
          name: `C${i + 1}`,
          flag: '',
          skill: 40 - i,
          modeId: 'liga',
        })),
      ],
    });
    useModeStore.setState({
      modes: [{ id: 'liga', name: 'Liga', kind: 'league-system', config: {}, currentYear: 2026 }],
      activeModeId: 'liga',
      isLoaded: true,
    });
    seedStore(THREE_TIER, { A: DIV_A, B: DIV_B, C: DIV_C });
  });

  it('arranca tres ligas de una rueda, sin copa', async () => {
    await useSeasonModeStore.getState().startSeason();
    const ts = useSeasonModeStore.getState().tournaments;
    expect(ts).toHaveLength(3);
    expect(ts.every((t) => t.format === 'liga')).toBe(true);
    // Una rueda de 16 equipos = 15 fechas × 8 = 120 partidos.
    expect((ts[0] as LigaTournament).state.matches).toHaveLength(120);
  });

  it('cierra la temporada moviendo a cada equipo UNA sola vez', async () => {
    const rng = seededRng(5);
    await useSeasonModeStore.getState().startSeason();
    for (const lg of useSeasonModeStore.getState().tournaments) {
      for (let md = 1; md <= 15; md++) {
        await useSeasonModeStore.getState().simulateMatchday(lg.id, md, rng);
      }
    }

    await useSeasonModeStore.getState().closeSeason();
    expect(modeSeasonService.saveDivision).toHaveBeenCalledTimes(3);

    const saved = ['A', 'B', 'C'].map(
      (d) => vi.mocked(modeSeasonService.saveDivision).mock.calls.find((c) => c[2] === d)![3],
    );
    // Cada división conserva su tamaño y no se pierde ni se duplica nadie: si la
    // escalera se plegara por pares, un descendido de la A volvería a bajar a la C.
    expect(saved.every((d) => d.length === 16)).toBe(true);
    expect(new Set(saved.flat()).size).toBe(48);

    // La B intermedia recibió 2 de la A y 2 de la C, y cedió 2 para cada lado.
    const nextB = saved[1];
    expect(nextB.filter((id) => id.startsWith('A'))).toHaveLength(2);
    expect(nextB.filter((id) => id.startsWith('C'))).toHaveLength(2);
    expect(nextB.filter((id) => id.startsWith('B'))).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------------
// Elegir temporada
// ---------------------------------------------------------------------------

describe('useSeasonModeStore — elegir temporada', () => {
  beforeEach(() => {
    vi.mocked(modeTournamentService.create).mockClear();
    vi.mocked(modeSeasonService.saveDivision).mockClear();
    vi.mocked(modesService.updateMode).mockClear();
    vi.mocked(modeSeasonService.getSeason).mockResolvedValue({ divisions: { A: DIV_A, B: DIV_B } });
    vi.mocked(modeSeasonService.listYears).mockResolvedValue([2028, 2027, 2026]);
    vi.mocked(modeTournamentService.listByMode).mockResolvedValue([]);

    useTournamentStore.setState({ teams: makeTeams() });
    useSeasonModeStore.getState().reset();
  });

  const MODE = {
    id: 'liga',
    name: 'Liga',
    kind: 'league-system' as const,
    config: {},
    currentYear: 2028,
  };

  it('al entrar se mira el año en curso y se listan las temporadas', async () => {
    await useSeasonModeStore.getState().loadForMode(MODE);

    const s = useSeasonModeStore.getState();
    expect(s.year).toBe(2028);
    expect(s.currentYear).toBe(2028);
    expect(s.availableYears).toEqual([2028, 2027, 2026]);
  });

  it('el año en curso entra en la lista aunque todavía no esté sembrado', async () => {
    vi.mocked(modeSeasonService.listYears).mockResolvedValue([2027, 2026]);

    await useSeasonModeStore.getState().loadForMode(MODE);

    expect(useSeasonModeStore.getState().availableYears).toEqual([2028, 2027, 2026]);
  });

  it('selectYear cambia el año mirado sin mover el que corre', async () => {
    await useSeasonModeStore.getState().loadForMode(MODE);
    await useSeasonModeStore.getState().selectYear(2026);

    const s = useSeasonModeStore.getState();
    expect(s.year).toBe(2026);
    expect(s.currentYear).toBe(2028);
    expect(s.status).toBe('ready');
    expect(modeTournamentService.listByMode).toHaveBeenCalledWith('liga', 2026, expect.any(Function));
  });

  it('una temporada vieja no se puede iniciar ni cerrar', async () => {
    await useSeasonModeStore.getState().loadForMode(MODE);
    await useSeasonModeStore.getState().selectYear(2026);

    await useSeasonModeStore.getState().startSeason();
    expect(modeTournamentService.create).not.toHaveBeenCalled();
    expect(useSeasonModeStore.getState().tournaments).toEqual([]);

    await useSeasonModeStore.getState().closeSeason();
    expect(modeSeasonService.saveDivision).not.toHaveBeenCalled();
    expect(modesService.updateMode).not.toHaveBeenCalled();
    // Y el año en curso del modo no se movió.
    expect(useSeasonModeStore.getState().currentYear).toBe(2028);
  });

  it('volver al año en curso lo deja jugable otra vez', async () => {
    await useSeasonModeStore.getState().loadForMode(MODE);
    await useSeasonModeStore.getState().selectYear(2026);
    await useSeasonModeStore.getState().selectYear(2028);

    await useSeasonModeStore.getState().startSeason();
    expect(useSeasonModeStore.getState().tournaments.length).toBeGreaterThan(0);
  });
});
