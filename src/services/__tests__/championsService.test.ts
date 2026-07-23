import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  formatFinalScore,
  filterTimeline,
  summarizeChampions,
  championsService,
  type ChampionHistoryRow,
} from '../championsService';
import * as supaLib from '../../lib/supabase';

const row = (o: Partial<ChampionHistoryRow>): ChampionHistoryRow => ({
  tournamentId: 't1',
  year: 2026,
  kind: 'world-cup',
  region: null,
  championId: 'arg',
  championName: 'Argentina',
  championRegion: 'America',
  runnerUpId: 'fra',
  runnerUpName: 'Francia',
  thirdId: 'bra',
  thirdName: 'Brasil',
  fourthId: 'nld',
  fourthName: 'Holanda',
  championScore: 2,
  runnerUpScore: 1,
  championPen: null,
  runnerUpPen: null,
  ...o,
});

describe('formatFinalScore', () => {
  it('marcador simple sin penales', () => {
    expect(formatFinalScore(row({ championScore: 2, runnerUpScore: 1 }))).toBe('2 - 1');
  });
  it('agrega los penales cuando los hubo', () => {
    expect(
      formatFinalScore(row({ championScore: 1, runnerUpScore: 1, championPen: 4, runnerUpPen: 2 })),
    ).toBe('1 - 1 (4-2 pen)');
  });
  it('sin marcador ⇒ string vacío', () => {
    expect(formatFinalScore(row({ championScore: null, runnerUpScore: null }))).toBe('');
  });
});

describe('filterTimeline', () => {
  const rows = [
    row({ year: 2026, kind: 'world-cup', region: null, championId: 'arg', runnerUpId: 'fra' }),
    row({ year: 2026, kind: 'continental', region: 'Europe', championId: 'esp', runnerUpId: 'ita', thirdId: 'deu', fourthId: 'prt' }),
    row({ year: 2025, kind: 'confederations', region: null, championId: 'fra', runnerUpId: 'bra', thirdId: 'esp', fourthId: 'mex' }),
  ];
  const base = { kind: 'all' as const, region: null, teamId: null, yearFrom: null, yearTo: null };

  it('sin filtros devuelve todo', () => {
    expect(filterTimeline(rows, base)).toHaveLength(3);
  });
  it('filtra por tipo de competición', () => {
    expect(filterTimeline(rows, { ...base, kind: 'continental' }).map((r) => r.championId)).toEqual(['esp']);
  });
  it('filtra continental por región', () => {
    expect(filterTimeline(rows, { ...base, kind: 'continental', region: 'Europe' })).toHaveLength(1);
    expect(filterTimeline(rows, { ...base, kind: 'continental', region: 'Asia' })).toHaveLength(0);
  });
  it('filtra por equipo en cualquier puesto del podio', () => {
    // esp: campeón en 2026 (continental) y tercero en 2025 (confed) ⇒ 2 filas
    expect(filterTimeline(rows, { ...base, teamId: 'esp' })).toHaveLength(2);
  });
  it('filtra por equipo que solo aparece como subcampeón', () => {
    // ita es subcampeón en 2026 (continental, campeón esp)
    expect(filterTimeline(rows, { ...base, teamId: 'ita' }).map((r) => r.championId)).toEqual(['esp']);
  });
  it('filtra por equipo que solo aparece como cuarto', () => {
    // mex es cuarto en 2025 (confed, campeón fra)
    expect(filterTimeline(rows, { ...base, teamId: 'mex' }).map((r) => r.championId)).toEqual(['fra']);
  });
  it('filtra por rango de años inclusivo', () => {
    expect(filterTimeline(rows, { ...base, yearFrom: 2026, yearTo: 2026 })).toHaveLength(2);
  });
});

describe('summarizeChampions', () => {
  it('cuenta títulos, años distintos y selecciones campeonas distintas', () => {
    const rows = [
      row({ year: 2026, championId: 'arg' }),
      row({ year: 2026, championId: 'esp' }),
      row({ year: 2025, championId: 'arg' }),
    ];
    expect(summarizeChampions(rows)).toEqual({ totalTitles: 3, years: 2, teams: 2 });
  });
});

const histDbRow = () => ({
  tournament_id: 't1', year: 2026, kind: 'world-cup', region: null, ord: 0,
  champion_id: 'arg', runner_up_id: 'fra', third_id: 'bra', fourth_id: 'nld',
  champion_score: 2, runner_up_score: 1, champion_pen: null, runner_up_pen: null,
  champion_name: 'Argentina', runner_up_name: 'Francia', third_name: 'Brasil',
  fourth_name: 'Holanda', champion_region: 'America',
});

afterEach(() => vi.restoreAllMocks());

describe('championsService.getChampionsHistory', () => {
  it('mapea snake_case → camelCase', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supaLib.supabase as unknown as { rpc: (...a: unknown[]) => unknown }, 'rpc')
      .mockResolvedValue({ data: [histDbRow()], error: null } as never);

    const res = await championsService.getChampionsHistory();
    expect(res[0]).toEqual({
      tournamentId: 't1',
      year: 2026,
      kind: 'world-cup',
      region: null,
      championId: 'arg',
      championName: 'Argentina',
      championRegion: 'America',
      runnerUpId: 'fra',
      runnerUpName: 'Francia',
      thirdId: 'bra',
      thirdName: 'Brasil',
      fourthId: 'nld',
      fourthName: 'Holanda',
      championScore: 2,
      runnerUpScore: 1,
      championPen: null,
      runnerUpPen: null,
    });
  });
  it('sin Supabase ⇒ []', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(false);
    expect(await championsService.getChampionsHistory()).toEqual([]);
  });
});

describe('championsService.getPalmares', () => {
  it('mapea filas y convierte bigints-string a number', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supaLib.supabase as unknown as { rpc: (...a: unknown[]) => unknown }, 'rpc')
      .mockResolvedValue({
        data: [{
          team_id: 'bra', team_name: 'Brasil', region: 'America',
          titles: '4', runner_ups: '1', thirds: '0',
          wc_titles: '2', continental_titles: '2', confed_titles: '0',
        }],
        error: null,
      } as never);

    const res = await championsService.getPalmares();
    expect(res[0]).toEqual({
      teamId: 'bra', teamName: 'Brasil', region: 'America',
      titles: 4, runnerUps: 1, thirds: 0,
      wcTitles: 2, continentalTitles: 2, confedTitles: 0,
    });
  });
  it('sin Supabase ⇒ []', async () => {
    vi.spyOn(supaLib, 'isSupabaseConfigured').mockReturnValue(false);
    expect(await championsService.getPalmares()).toEqual([]);
  });
});
