import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Qué competición coronó al campeón. `season` cubre a los modos de temporada:
 * su torneo puede ser una liga, una copa o grupos + eliminación, y todos entran
 * en la cronología por la misma vía (`champions_history`, migración 021).
 */
export type CompetitionKind = 'world-cup' | 'continental' | 'confederations' | 'season';

export interface ChampionHistoryRow {
  tournamentId: string;
  year: number;
  kind: CompetitionKind;
  region: string | null;
  championId: string | null;
  championName: string | null;
  championRegion: string | null;
  runnerUpId: string | null;
  runnerUpName: string | null;
  runnerUpRegion: string | null;
  thirdId: string | null;
  thirdName: string | null;
  thirdRegion: string | null;
  fourthId: string | null;
  fourthName: string | null;
  fourthRegion: string | null;
  championScore: number | null;
  runnerUpScore: number | null;
  championPen: number | null;
  runnerUpPen: number | null;
}

export interface PalmaresRow {
  teamId: string;
  teamName: string;
  region: string;
  titles: number;
  runnerUps: number;
  thirds: number;
  wcTitles: number;
  continentalTitles: number;
  confedTitles: number;
  seasonTitles: number;
}

export interface TimelineFilters {
  kind: CompetitionKind | 'all';
  region: string | null;
  teamId: string | null;
  yearFrom: number | null;
  yearTo: number | null;
}

// "2 - 1" o "1 - 1 (4-2 pen)". Vacío si no hay marcador (final no jugada).
export const formatFinalScore = (row: ChampionHistoryRow): string => {
  if (row.championScore === null || row.runnerUpScore === null) return '';
  const base = `${row.championScore} - ${row.runnerUpScore}`;
  if (row.championPen !== null && row.runnerUpPen !== null) {
    return `${base} (${row.championPen}-${row.runnerUpPen} pen)`;
  }
  return base;
};

// Filtra la cronología en el cliente sobre las filas ya traídas.
export const filterTimeline = (
  rows: ChampionHistoryRow[],
  f: TimelineFilters,
): ChampionHistoryRow[] =>
  rows.filter((r) => {
    if (f.kind !== 'all' && r.kind !== f.kind) return false;
    if (f.region && r.region !== f.region) return false;
    if (f.teamId) {
      const inPodium =
        r.championId === f.teamId ||
        r.runnerUpId === f.teamId ||
        r.thirdId === f.teamId ||
        r.fourthId === f.teamId;
      if (!inPodium) return false;
    }
    if (f.yearFrom !== null && r.year < f.yearFrom) return false;
    if (f.yearTo !== null && r.year > f.yearTo) return false;
    return true;
  });

// Resumen del header: títulos totales, años distintos, selecciones campeonas distintas.
export const summarizeChampions = (
  rows: ChampionHistoryRow[],
): { totalTitles: number; years: number; teams: number } => ({
  totalTitles: rows.length,
  years: new Set(rows.map((r) => r.year)).size,
  teams: new Set(rows.map((r) => r.championId).filter(Boolean)).size,
});

const num = (v: unknown): number => Number(v ?? 0);
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

export const championsService = {
  /** @param modeId Modo al que limitar la cronología. Sin él, mezcla todos. */
  async getChampionsHistory(modeId?: string): Promise<ChampionHistoryRow[]> {
    if (!isSupabaseConfigured()) return [];

    const { data, error } = await (supabase as any).rpc('champions_history', {
      p_mode_id: modeId ?? null,
    });
    if (error) throw error;

    return ((data ?? []) as any[]).map((r) => ({
      tournamentId: r.tournament_id,
      year: num(r.year),
      kind: r.kind as CompetitionKind,
      region: r.region ?? null,
      championId: r.champion_id ?? null,
      championName: r.champion_name ?? null,
      championRegion: r.champion_region ?? null,
      runnerUpId: r.runner_up_id ?? null,
      runnerUpName: r.runner_up_name ?? null,
      runnerUpRegion: r.runner_up_region ?? null,
      thirdId: r.third_id ?? null,
      thirdName: r.third_name ?? null,
      thirdRegion: r.third_region ?? null,
      fourthId: r.fourth_id ?? null,
      fourthName: r.fourth_name ?? null,
      fourthRegion: r.fourth_region ?? null,
      championScore: numOrNull(r.champion_score),
      runnerUpScore: numOrNull(r.runner_up_score),
      championPen: numOrNull(r.champion_pen),
      runnerUpPen: numOrNull(r.runner_up_pen),
    }));
  },

  async getPalmares(modeId?: string): Promise<PalmaresRow[]> {
    if (!isSupabaseConfigured()) return [];

    const { data, error } = await (supabase as any).rpc('champions_palmares', {
      p_mode_id: modeId ?? null,
    });
    if (error) throw error;

    return ((data ?? []) as any[]).map((r) => ({
      teamId: r.team_id,
      teamName: r.team_name,
      region: r.region,
      titles: num(r.titles),
      runnerUps: num(r.runner_ups),
      thirds: num(r.thirds),
      wcTitles: num(r.wc_titles),
      continentalTitles: num(r.continental_titles),
      confedTitles: num(r.confed_titles),
      seasonTitles: num(r.season_titles),
    }));
  },
};
