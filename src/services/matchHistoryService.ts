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

  // Get all match history
  async getAllMatches(limit = 100, offset = 0): Promise<MatchHistoryEntry[]> {
    if (!isSupabaseConfigured()) {
      return [];
    }

    // Para traer "todo", paginar con .range(): PostgREST recorta cualquier
    // .limit() contra db-max-rows (1000 por defecto), así que pedir 100000 no
    // desbloqueaba nada y las estadísticas se truncaban desde el segundo torneo
    // (~900 partidos por torneo).
    if (limit >= 10000) {
      console.log('🔍 [matchHistoryService] Fetching ALL matches (paginated)...');
      const pageSize = 1000;
      const all: MatchHistoryEntry[] = [];

      for (let page = 0; ; page++) {
        const from = page * pageSize;
        const { data, error } = await supabase
          .from('match_history')
          .select('*')
          .order('played_at', { ascending: false })
          .range(from, from + pageSize - 1);

        if (error) {
          console.error('❌ [matchHistoryService] Error fetching matches:', error);
          throw error;
        }

        if (!data || data.length === 0) break;
        all.push(...data.map(dbMatchToMatch));
        if (data.length < pageSize) break;
      }

      console.log(`✅ [matchHistoryService] Fetched ${all.length} matches from database`);
      return all;
    }

    const { data, error } = await supabase
      .from('match_history')
      .select('*')
      .order('played_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data.map(dbMatchToMatch);
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

  // Get matches by stage
  async getMatchesByStage(
    stage: 'qualifier' | 'world-cup-group' | 'world-cup-knockout'
  ): Promise<MatchHistoryEntry[]> {
    if (!isSupabaseConfigured()) {
      return [];
    }

    const { data, error } = await supabase
      .from('match_history')
      .select('*')
      .eq('stage', stage)
      .order('played_at', { ascending: false })
      .limit(100);

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

  // Get match statistics
  async getMatchStatistics() {
    if (!isSupabaseConfigured()) {
      return {
        totalMatches: 0,
        totalGoals: 0,
        averageGoalsPerMatch: 0,
        biggestWin: null,
      };
    }

    // Paginar con .range() en vez de un SELECT plano: sin esto PostgREST
    // devolvía como mucho db-max-rows filas (1000) y las estadísticas
    // globales quedaban truncadas al superar ese umbral.
    const pageSize = 1000;
    const data: Array<{ home_score: number; away_score: number }> = [];

    for (let page = 0; ; page++) {
      const from = page * pageSize;
      const { data: pageData, error } = await supabase
        .from('match_history')
        .select('home_score, away_score, home_team_id, away_team_id, played_at')
        .range(from, from + pageSize - 1);

      if (error) throw error;
      if (!pageData || pageData.length === 0) break;
      data.push(...(pageData as any[]));
      if (pageData.length < pageSize) break;
    }

    const totalMatches = data.length;
    const totalGoals = data.reduce((sum: number, match: any) => sum + match.home_score + match.away_score, 0);
    const averageGoalsPerMatch = totalMatches > 0 ? totalGoals / totalMatches : 0;

    // Find biggest win
    let biggestWin: {
      margin: number;
      match: any;
    } | null = null;

    data.forEach((match: any) => {
      const margin = Math.abs(match.home_score - match.away_score);
      if (!biggestWin || margin > biggestWin.margin) {
        biggestWin = { margin, match };
      }
    });

    return {
      totalMatches,
      totalGoals,
      averageGoalsPerMatch,
      biggestWin,
    };
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

  // Subscribe to match history changes
  subscribeToMatches(callback: (matches: MatchHistoryEntry[]) => void) {
    if (!isSupabaseConfigured()) {
      console.warn('Supabase not configured, real-time updates disabled');
      return () => {};
    }

    const channel = supabase
      .channel('match-history-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_history',
        },
        async () => {
          const matches = await matchHistoryService.getAllMatches(50);
          callback(matches);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
