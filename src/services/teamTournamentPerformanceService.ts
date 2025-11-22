import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Database } from '../types/database';

type PerformanceRow = Database['public']['Tables']['team_tournament_performance']['Row'];
type PerformanceInsert = Database['public']['Tables']['team_tournament_performance']['Insert'];

export type FinalStage =
  | 'did-not-participate'
  | 'eliminated-qualifiers'
  | 'eliminated-groups'
  | 'eliminated-round-of-32'
  | 'eliminated-round-of-16'
  | 'eliminated-quarterfinals'
  | 'eliminated-semifinals'
  | 'fourth-place'
  | 'third-place'
  | 'runner-up'
  | 'champion';

export interface TeamTournamentPerformance {
  id: string;
  tournamentId: string;
  teamId: string;
  finalStage: FinalStage;
  qualifierGroupName?: string;
  qualifierRegion?: string;
  worldCupGroupName?: string;
  totalMatchesPlayed: number;
  totalWins: number;
  totalDraws: number;
  totalLosses: number;
  totalGoalsFor: number;
  totalGoalsAgainst: number;
  createdAt: string;
  updatedAt: string;
}

function dbToPerformance(row: PerformanceRow): TeamTournamentPerformance {
  return {
    id: row.id,
    tournamentId: row.tournament_id,
    teamId: row.team_id,
    finalStage: row.final_stage as FinalStage,
    qualifierGroupName: row.qualifier_group_name || undefined,
    qualifierRegion: row.qualifier_region || undefined,
    worldCupGroupName: row.world_cup_group_name || undefined,
    totalMatchesPlayed: row.total_matches_played || 0,
    totalWins: row.total_wins || 0,
    totalDraws: row.total_draws || 0,
    totalLosses: row.total_losses || 0,
    totalGoalsFor: row.total_goals_for || 0,
    totalGoalsAgainst: row.total_goals_against || 0,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export const teamTournamentPerformanceService = {
  /**
   * Calculate and store the final performance for a team in a tournament
   * This should be called when a tournament is completed or when a team is eliminated
   */
  async calculateAndStorePerformance(tournamentId: string, teamId: string): Promise<void> {
    if (!isSupabaseConfigured()) return;

    console.log(`🔍 Calculating performance for team ${teamId} in tournament ${tournamentId}`);

    // 1. Check if team is champion, runner-up, third or fourth place
    const { data: tournament } = (await supabase
      .from('tournaments_new')
      .select('champion_team_id, runner_up_team_id, third_place_team_id, fourth_place_team_id')
      .eq('id', tournamentId)
      .maybeSingle()) as any;

    let finalStage: FinalStage = 'did-not-participate';

    if (tournament?.champion_team_id === teamId) {
      finalStage = 'champion';
    } else if (tournament?.runner_up_team_id === teamId) {
      finalStage = 'runner-up';
    } else if (tournament?.third_place_team_id === teamId) {
      finalStage = 'third-place';
    } else if (tournament?.fourth_place_team_id === teamId) {
      finalStage = 'fourth-place';
    } else {
      // 2. Check knockout elimination
      const { data: knockoutMatches } = (await supabase
        .from('matches_new')
        .select('knockout_round, winner_team_id, home_team_id, away_team_id')
        .eq('tournament_id', tournamentId)
        .eq('match_type', 'world-cup-knockout')
        .eq('is_played', true)
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)) as any;

      if (knockoutMatches && knockoutMatches.length > 0) {
        // Find the furthest round reached
        const rounds = ['round-of-32', 'round-of-16', 'quarter', 'semi', 'third-place', 'final'];
        let furthestRound = -1;

        for (const match of knockoutMatches) {
          const roundIndex = rounds.indexOf(match.knockout_round || '');
          if (roundIndex > furthestRound) {
            furthestRound = roundIndex;
          }

          // Check if team lost in this round
          if (match.winner_team_id && match.winner_team_id !== teamId) {
            const lostRound = match.knockout_round;
            if (lostRound === 'semi') finalStage = 'eliminated-semifinals';
            else if (lostRound === 'quarter') finalStage = 'eliminated-quarterfinals';
            else if (lostRound === 'round-of-16') finalStage = 'eliminated-round-of-16';
            else if (lostRound === 'round-of-32') finalStage = 'eliminated-round-of-32';
          }
        }
      } else {
        // 3. Check if eliminated in world cup groups
        // First get world cup groups for this tournament
        const { data: wcGroups } = (await supabase
          .from('world_cup_groups')
          .select('id')
          .eq('tournament_id', tournamentId)) as any;

        if (wcGroups && wcGroups.length > 0) {
          const groupIds = wcGroups.map((g: any) => g.id);
          const { data: wcGroupTeam } = (await supabase
            .from('world_cup_group_teams')
            .select('qualified, group_id')
            .eq('team_id', teamId)
            .in('group_id', groupIds)
            .maybeSingle()) as any;

          if (wcGroupTeam) {
            if (!wcGroupTeam.qualified) {
              finalStage = 'eliminated-groups';
            }
          }
        }

        // 4. Check if eliminated in qualifiers (if not found in world cup)
        if (finalStage === 'did-not-participate') {
          const { data: qualifierTeam } = (await supabase
            .from('qualifier_group_teams')
            .select('qualified, group_id')
            .eq('team_id', teamId)
            .limit(1)) as any;

          if (qualifierTeam && qualifierTeam.length > 0) {
            if (!qualifierTeam[0].qualified) {
              finalStage = 'eliminated-qualifiers';
            }
          }
        }
      }
    }

    // 5. Get additional context and stats
    const { data: qualifierGroup } = await supabase
      .from('qualifier_group_teams')
      .select('group_id, played, won, drawn, lost, goals_for, goals_against, qualifier_groups!inner(name, region)')
      .eq('team_id', teamId)
      .maybeSingle();

    const { data: wcGroup } = await supabase
      .from('world_cup_group_teams')
      .select('group_id, played, won, drawn, lost, goals_for, goals_against, world_cup_groups!inner(name)')
      .eq('team_id', teamId)
      .maybeSingle();

    // Calculate total stats
    const qualifierStats = qualifierGroup || { played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0 };
    const wcStats = wcGroup || { played: 0, won: 0, drawn: 0, lost: 0, goals_for: 0, goals_against: 0 };

    const performanceData: PerformanceInsert = {
      tournament_id: tournamentId,
      team_id: teamId,
      final_stage: finalStage,
      qualifier_group_name: (qualifierGroup as any)?.qualifier_groups?.name,
      qualifier_region: (qualifierGroup as any)?.qualifier_groups?.region,
      world_cup_group_name: (wcGroup as any)?.world_cup_groups?.name,
      total_matches_played: qualifierStats.played + wcStats.played,
      total_wins: qualifierStats.won + wcStats.won,
      total_draws: qualifierStats.drawn + wcStats.drawn,
      total_losses: qualifierStats.lost + wcStats.lost,
      total_goals_for: qualifierStats.goals_for + wcStats.goals_for,
      total_goals_against: qualifierStats.goals_against + wcStats.goals_against,
      updated_at: new Date().toISOString(),
    };

    // 6. Upsert the performance record
    const { error } = await supabase
      .from('team_tournament_performance')
      .upsert(performanceData as any, {
        onConflict: 'tournament_id,team_id',
      });

    if (error) {
      console.error('❌ Error storing performance:', error);
      throw error;
    }

    console.log(`✅ Performance calculated and stored: ${finalStage}`);
  },

  /**
   * Calculate performance for all teams in a tournament
   */
  async calculateAllPerformancesForTournament(tournamentId: string): Promise<void> {
    if (!isSupabaseConfigured()) return;

    console.log(`🔍 Calculating all performances for tournament ${tournamentId}`);

    // Get all teams that participated (either in qualifiers or world cup)
    const { data: qualifierTeams } = await supabase
      .from('qualifier_group_teams')
      .select('team_id, qualifier_groups!inner(tournament_id)')
      .eq('qualifier_groups.tournament_id', tournamentId);

    const teamIds = new Set<string>();
    qualifierTeams?.forEach((qt: any) => teamIds.add(qt.team_id));

    console.log(`📊 Found ${teamIds.size} teams to process`);

    // Calculate performance for each team
    for (const teamId of teamIds) {
      await this.calculateAndStorePerformance(tournamentId, teamId);
    }

    console.log(`✅ All performances calculated for tournament ${tournamentId}`);
  },

  /**
   * Get performance for a specific team in a tournament
   */
  async getTeamPerformance(
    tournamentId: string,
    teamId: string
  ): Promise<TeamTournamentPerformance | null> {
    if (!isSupabaseConfigured()) return null;

    const { data, error } = await supabase
      .from('team_tournament_performance')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('team_id', teamId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return dbToPerformance(data);
  },

  /**
   * Get all performances for a team across all tournaments
   */
  async getTeamAllPerformances(teamId: string): Promise<TeamTournamentPerformance[]> {
    if (!isSupabaseConfigured()) return [];

    const { data, error } = await supabase
      .from('team_tournament_performance')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ? data.map(dbToPerformance) : [];
  },

  /**
   * Get final stage display name in Spanish
   */
  getFinalStageDisplayName(stage: FinalStage): string {
    const displayNames: Record<FinalStage, string> = {
      'champion': '🏆 Campeón',
      'runner-up': '🥈 Subcampeón',
      'third-place': '🥉 Tercer Lugar',
      'fourth-place': '4️⃣ Cuarto Lugar',
      'eliminated-semifinals': 'Eliminado en Semifinales',
      'eliminated-quarterfinals': 'Eliminado en Cuartos de Final',
      'eliminated-round-of-16': 'Eliminado en Octavos de Final',
      'eliminated-round-of-32': 'Eliminado en R32',
      'eliminated-groups': 'Eliminado en Fase de Grupos',
      'eliminated-qualifiers': 'Eliminado en Clasificatorias',
      'did-not-participate': 'No Participó',
    };

    return displayNames[stage] || stage;
  },
};
