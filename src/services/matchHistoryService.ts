import { supabase, isSupabaseConfigured, escapeOrValue } from '../lib/supabase';
import type { Database } from '../types/database';

type MatchHistoryRow = Database['public']['Tables']['match_history']['Row'];
type MatchHistoryInsert = Database['public']['Tables']['match_history']['Insert'];

export interface MatchHistoryEntry {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  stage: 'qualifier' | 'world-cup-group' | 'world-cup-knockout' | 'continental' | 'confed-group' | 'confed-knockout';
  groupName?: string;
  region?: string;
  tournamentId?: string;
  homeSkillBefore: number;
  awaySkillBefore: number;
  homeSkillAfter: number;
  awaySkillAfter: number;
  homeSkillChange: number;
  awaySkillChange: number;
  playedAt: string;
  metadata?: Record<string, unknown>;
}

export interface CreateMatchHistoryParams {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  stage: 'qualifier' | 'world-cup-group' | 'world-cup-knockout' | 'continental' | 'confed-group' | 'confed-knockout';
  groupName?: string;
  region?: string;
  tournamentId?: string;
  homeSkillBefore: number;
  awaySkillBefore: number;
  homeSkillAfter: number;
  awaySkillAfter: number;
  homeSkillChange: number;
  awaySkillChange: number;
  metadata?: Record<string, unknown>;
}

export interface MatchCursor {
  playedAt: string;
  id: string;
}

export interface MatchPage {
  matches: MatchHistoryEntry[];
  nextCursor: MatchCursor | null;
  hasMore: boolean;
}

export interface GetMatchesPageParams {
  cursor?: MatchCursor | null;
  pageSize?: number;
  stage?: MatchHistoryEntry['stage'];
}

export interface TeamStatsRow {
  teamId: string;
  totalMatches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface RegionStatsRow {
  region: string;
  totalGoals: number;
  matchesPlayed: number;
}

// Ensambla una página keyset a partir de las filas ya convertidas.
// hasMore es true sólo si la página vino llena (== pageSize); en ese caso el
// cursor apunta al último partido para pedir la siguiente.
export const assembleMatchPage = (
  entries: MatchHistoryEntry[],
  pageSize: number,
): MatchPage => {
  const hasMore = entries.length === pageSize;
  const last = entries[entries.length - 1];
  return {
    matches: entries,
    hasMore,
    nextCursor: hasMore && last ? { playedAt: last.playedAt, id: last.id } : null,
  };
};

// Porcentaje de victorias, con guard de división por cero.
export const computeWinRate = (wins: number, totalMatches: number): number =>
  totalMatches > 0 ? (wins / totalMatches) * 100 : 0;

// Convert database row to app type
const dbMatchToMatch = (dbMatch: MatchHistoryRow): MatchHistoryEntry => ({
  id: dbMatch.id,
  homeTeamId: dbMatch.home_team_id,
  awayTeamId: dbMatch.away_team_id,
  homeScore: dbMatch.home_score,
  awayScore: dbMatch.away_score,
  stage: dbMatch.stage,
  groupName: dbMatch.group_name || undefined,
  region: dbMatch.region || undefined,
  tournamentId: dbMatch.tournament_id || undefined,
  homeSkillBefore: dbMatch.home_skill_before,
  awaySkillBefore: dbMatch.away_skill_before,
  homeSkillAfter: dbMatch.home_skill_after,
  awaySkillAfter: dbMatch.away_skill_after,
  homeSkillChange: dbMatch.home_skill_change,
  awaySkillChange: dbMatch.away_skill_change,
  playedAt: dbMatch.played_at,
  metadata: dbMatch.metadata as Record<string, unknown> | undefined,
});

export const matchHistoryService = {
  // Create match history entry
  async createMatch(params: CreateMatchHistoryParams): Promise<MatchHistoryEntry> {
    if (!isSupabaseConfigured()) {
      // Return a mock entry if Supabase is not configured
      return {
        id: crypto.randomUUID(),
        ...params,
        playedAt: new Date().toISOString(),
      };
    }

    const insert: MatchHistoryInsert = {
      home_team_id: params.homeTeamId,
      away_team_id: params.awayTeamId,
      home_score: params.homeScore,
      away_score: params.awayScore,
      stage: params.stage,
      group_name: params.groupName,
      region: params.region,
      tournament_id: params.tournamentId,
      home_skill_before: params.homeSkillBefore,
      away_skill_before: params.awaySkillBefore,
      home_skill_after: params.homeSkillAfter,
      away_skill_after: params.awaySkillAfter,
      home_skill_change: params.homeSkillChange,
      away_skill_change: params.awaySkillChange,
      metadata: (params.metadata || {}) as any,
    };

    const { data, error } = await supabase
      .from('match_history')
      .insert(insert as any)
      .select()
      .single();

    if (error) throw error;
    return dbMatchToMatch(data);
  },

  // Página keyset del historial (cursor sobre played_at DESC, id DESC).
  async getMatchesPage(
    { cursor, pageSize = 30, stage }: GetMatchesPageParams = {},
  ): Promise<MatchPage> {
    if (!isSupabaseConfigured()) {
      return { matches: [], nextCursor: null, hasMore: false };
    }

    const { data, error } = await (supabase as any).rpc('get_matches_page', {
      p_cursor_played_at: cursor?.playedAt ?? null,
      p_cursor_id: cursor?.id ?? null,
      p_page_size: pageSize,
      p_stage: stage ?? null,
    });

    if (error) throw error;

    const entries = ((data ?? []) as MatchHistoryRow[]).map(dbMatchToMatch);
    return assembleMatchPage(entries, pageSize);
  },

  // Get matches for a specific team
  async getTeamMatches(teamId: string, limit = 20): Promise<MatchHistoryEntry[]> {
    if (!isSupabaseConfigured()) {
      return [];
    }

    const { data, error } = await supabase
      .from('match_history')
      .select('*')
      .or(`home_team_id.eq.${escapeOrValue(teamId)},away_team_id.eq.${escapeOrValue(teamId)}`)
      .order('played_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data.map(dbMatchToMatch);
  },

  // Get recent matches using the database function
  async getTeamRecentMatches(teamId: string, limit = 10) {
    if (!isSupabaseConfigured()) {
      return [];
    }

    const { data, error } = await (supabase as any).rpc('get_team_recent_matches', {
      team_id_param: teamId,
      limit_param: limit,
    });

    if (error) throw error;
    return data;
  },

  // Get matches by tournament
  async getTournamentMatches(tournamentId: string): Promise<MatchHistoryEntry[]> {
    if (!isSupabaseConfigured()) {
      return [];
    }

    const { data, error } = await supabase
      .from('match_history')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('played_at', { ascending: false });

    if (error) throw error;
    return data.map(dbMatchToMatch);
  },

  // Get matches by region
  async getMatchesByRegion(region: string): Promise<MatchHistoryEntry[]> {
    if (!isSupabaseConfigured()) {
      return [];
    }

    const { data, error } = await supabase
      .from('match_history')
      .select('*')
      .eq('region', region)
      .order('played_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return data.map(dbMatchToMatch);
  },

  // Estadísticas globales (una sola llamada agregada en el servidor).
  async getMatchStatistics() {
    if (!isSupabaseConfigured()) {
      return { totalMatches: 0, totalGoals: 0, averageGoalsPerMatch: 0 };
    }

    const { data, error } = await (supabase as any).rpc('get_match_statistics');
    if (error) throw error;

    const row = (data?.[0] ?? {}) as {
      total_matches?: number | string;
      total_goals?: number | string;
      avg_goals?: number | string;
    };
    return {
      totalMatches: Number(row.total_matches ?? 0),
      totalGoals: Number(row.total_goals ?? 0),
      averageGoalsPerMatch: Number(row.avg_goals ?? 0),
    };
  },

  // Stats agregadas por equipo (una fila por equipo con partidos).
  async getTeamStats(): Promise<TeamStatsRow[]> {
    if (!isSupabaseConfigured()) return [];

    const { data, error } = await (supabase as any).rpc('get_team_stats');
    if (error) throw error;

    return ((data ?? []) as any[]).map((r) => ({
      teamId: r.team_id,
      totalMatches: Number(r.total_matches ?? 0),
      wins: Number(r.wins ?? 0),
      draws: Number(r.draws ?? 0),
      losses: Number(r.losses ?? 0),
      goalsFor: Number(r.goals_for ?? 0),
      goalsAgainst: Number(r.goals_against ?? 0),
    }));
  },

  // Stats regionales de eliminatorias (una fila por región).
  async getRegionStats(): Promise<RegionStatsRow[]> {
    if (!isSupabaseConfigured()) return [];

    const { data, error } = await (supabase as any).rpc('get_region_stats');
    if (error) throw error;

    return ((data ?? []) as any[]).map((r) => ({
      region: r.region,
      totalGoals: Number(r.total_goals ?? 0),
      matchesPlayed: Number(r.matches_played ?? 0),
    }));
  },

  // IDs (metadata.cycleMatchId) de partidos continental/confed ya persistidos
  // para un torneo — base de la idempotencia del backfill.
  async getExistingCycleMatchIds(tournamentId: string): Promise<Set<string>> {
    if (!isSupabaseConfigured()) return new Set();
    const { data, error } = await supabase
      .from('match_history')
      .select('metadata')
      .eq('tournament_id', tournamentId)
      .in('stage', ['continental', 'confed-group', 'confed-knockout']);
    if (error) {
      console.error('getExistingCycleMatchIds:', error);
      return new Set();
    }
    const ids = new Set<string>();
    // El select() de una sola columna sobre `match_history` colapsa el tipo
    // inferido de `data` a `never` (bug de inferencia preexistente en este
    // archivo — ver `match: any` en getMatchStatistics); se castea a la forma
    // esperada en vez de depender de esa inferencia.
    for (const row of (data ?? []) as Array<{ metadata: { cycleMatchId?: string } | null }>) {
      const cid = row.metadata?.cycleMatchId;
      if (cid) ids.add(cid);
    }
    return ids;
  },

  // Batch create multiple match history entries
  async createMatchesBatch(matchesParams: CreateMatchHistoryParams[]): Promise<MatchHistoryEntry[]> {
    if (!isSupabaseConfigured()) {
      // Return mock entries if Supabase is not configured
      return matchesParams.map(params => ({
        id: crypto.randomUUID(),
        ...params,
        playedAt: new Date().toISOString(),
      }));
    }

    const inserts: MatchHistoryInsert[] = matchesParams.map(params => ({
      home_team_id: params.homeTeamId,
      away_team_id: params.awayTeamId,
      home_score: params.homeScore,
      away_score: params.awayScore,
      stage: params.stage,
      group_name: params.groupName,
      region: params.region,
      tournament_id: params.tournamentId,
      home_skill_before: params.homeSkillBefore,
      away_skill_before: params.awaySkillBefore,
      home_skill_after: params.homeSkillAfter,
      away_skill_after: params.awaySkillAfter,
      home_skill_change: params.homeSkillChange,
      away_skill_change: params.awaySkillChange,
      metadata: (params.metadata || {}) as any,
    }));

    const { data, error } = await supabase
      .from('match_history')
      .insert(inserts as any)
      .select();

    if (error) throw error;
    return data.map(dbMatchToMatch);
  },

  // Delete all matches for a specific tournament
  async deleteMatchesByTournament(tournamentId: string): Promise<void> {
    if (!isSupabaseConfigured()) {
      return;
    }

    const { error } = await supabase
      .from('match_history')
      .delete()
      .eq('tournament_id', tournamentId);

    if (error) throw error;
  },

  // Suscripción a inserts en tiempo real. Entrega la fila nueva ya convertida;
  // el consumidor decide cómo integrarla (p.ej. anteponerla a su lista paginada)
  // en vez de re-descargar todo el historial.
  subscribeToMatches(callback: (newMatch: MatchHistoryEntry) => void) {
    if (!isSupabaseConfigured()) {
      console.warn('Supabase not configured, real-time updates disabled');
      return () => {};
    }

    const channel = supabase
      .channel('match-history-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'match_history' },
        (payload) => {
          callback(dbMatchToMatch(payload.new as MatchHistoryRow));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
