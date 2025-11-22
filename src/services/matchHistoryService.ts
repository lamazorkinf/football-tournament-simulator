import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Database } from '../types/database';

type MatchHistoryRow = Database['public']['Tables']['match_history']['Row'];
type MatchHistoryInsert = Database['public']['Tables']['match_history']['Insert'];

export interface MatchHistoryEntry {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  stage: 'qualifier' | 'world-cup-group' | 'world-cup-knockout';
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
  stage: 'qualifier' | 'world-cup-group' | 'world-cup-knockout';
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

    // If limit is very high (>= 10000), get all matches with explicit high limit
    if (limit >= 10000) {
      console.log('🔍 [matchHistoryService] Fetching ALL matches with high limit...');
      const { data, error } = await supabase
        .from('match_history')
        .select('*')
        .order('played_at', { ascending: false })
        .limit(100000);

      if (error) {
        console.error('❌ [matchHistoryService] Error fetching matches:', error);
        throw error;
      }

      console.log(`✅ [matchHistoryService] Fetched ${data?.length || 0} matches from database`);
      return data.map(dbMatchToMatch);
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
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
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

    const { data, error } = await supabase
      .from('match_history')
      .select('home_score, away_score, home_team_id, away_team_id, played_at');

    if (error) throw error;

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
