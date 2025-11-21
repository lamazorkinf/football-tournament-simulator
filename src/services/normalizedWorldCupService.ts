import { isSupabaseConfigured } from '../lib/supabase';
import { db } from '../lib/supabaseNormalized';
import type { WorldCupGroup, Match, KnockoutMatch } from '../types';

/**
 * Normalized World Cup Service
 *
 * Handles operations specific to World Cup groups and knockout stages
 * in the normalized schema.
 */

export const normalizedWorldCupService = {
  /**
   * Create World Cup groups for a tournament
   */
  async createWorldCupGroups(
    tournamentId: string,
    groups: WorldCupGroup[]
  ): Promise<void> {
    if (!isSupabaseConfigured()) return;

    try {
      for (const group of groups) {
        // Create world cup group
        const { error: groupError } = await db
          .world_cup_groups()
          .insert({
            id: group.id,
            tournament_id: tournamentId,
            name: group.name,
            num_qualify: 2, // Top 2 qualify from each group
          });

        if (groupError) throw groupError;

        // Create group teams with initial standings
        for (const teamId of group.teamIds) {
          const { error: teamError } = await db
            .world_cup_group_teams()
            .insert({
              group_id: group.id,
              team_id: teamId,
              points: 0,
              played: 0,
              won: 0,
              drawn: 0,
              lost: 0,
              goals_for: 0,
              goals_against: 0,
              qualified: false,
            });

          if (teamError) throw teamError;
        }

        // Create matches if they exist
        if (group.matches && group.matches.length > 0) {
          for (const match of group.matches) {
            await this.createWorldCupGroupMatch(tournamentId, group.id, match);
          }
        }
      }

      console.log(`Created ${groups.length} World Cup groups`);
    } catch (error) {
      console.error('Error creating World Cup groups:', error);
      throw error;
    }
  },

  /**
   * Create a single World Cup group match
   */
  async createWorldCupGroupMatch(
    tournamentId: string,
    groupId: string,
    match: Match
  ): Promise<void> {
    if (!isSupabaseConfigured()) return;

    try {
      const { error } = await db
        .matches_new()
        .insert({
          id: match.id,
          tournament_id: tournamentId,
          match_type: 'world-cup-group',
          world_cup_group_id: groupId,
          home_team_id: match.homeTeamId,
          away_team_id: match.awayTeamId,
          home_score: match.homeScore,
          away_score: match.awayScore,
          is_played: match.isPlayed,
          matchday: match.matchday, // Save matchday for ordering
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error creating World Cup group match:', error);
      throw error;
    }
  },

  /**
   * Update World Cup group match result
   * Note: Standings are updated automatically via database trigger
   */
  async updateGroupMatchResult(
    matchId: string,
    homeScore: number,
    awayScore: number
  ): Promise<void> {
    if (!isSupabaseConfigured()) return;

    try {
      const { error } = await db
        .matches_new()
        .update({
          home_score: homeScore,
          away_score: awayScore,
          is_played: true,
          played_at: new Date().toISOString(),
        })
        .eq('id', matchId);

      if (error) throw error;

      console.log(`World Cup group match ${matchId} updated with result ${homeScore}-${awayScore}`);
    } catch (error) {
      console.error('Error updating World Cup group match result:', error);
      throw error;
    }
  },

  /**
   * Mark teams as qualified from World Cup groups
   */
  async markGroupTeamsAsQualified(
    groupId: string,
    qualifiedTeamIds: string[]
  ): Promise<void> {
    if (!isSupabaseConfigured()) return;

    try {
      // Reset all teams in group
      await db
        .world_cup_group_teams()
        .update({ qualified: false })
        .eq('group_id', groupId);

      // Mark qualified teams
      if (qualifiedTeamIds.length > 0) {
        const { error } = await db
          .world_cup_group_teams()
          .update({ qualified: true })
          .eq('group_id', groupId)
          .in('team_id', qualifiedTeamIds);

        if (error) throw error;
      }

      console.log(`Marked ${qualifiedTeamIds.length} teams as qualified from group ${groupId}`);
    } catch (error) {
      console.error('Error marking group teams as qualified:', error);
      throw error;
    }
  },

  /**
   * Create knockout match
   */
  async createKnockoutMatch(
    tournamentId: string,
    match: KnockoutMatch
  ): Promise<void> {
    if (!isSupabaseConfigured()) return;

    try {
      const { error } = await db
        .matches_new()
        .insert({
          id: match.id,
          tournament_id: tournamentId,
          match_type: 'world-cup-knockout',
          knockout_round: match.round,
          knockout_position: match.position || null,
          home_team_id: match.homeTeamId,
          away_team_id: match.awayTeamId,
          home_score: match.homeScore,
          away_score: match.awayScore,
          is_played: match.isPlayed,
          home_penalties: match.penalties?.homeScore || null,
          away_penalties: match.penalties?.awayScore || null,
          winner_team_id: match.winnerId || null,
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error creating knockout match:', error);
      throw error;
    }
  },

  /**
   * Update knockout match result
   */
  async updateKnockoutMatchResult(
    matchId: string,
    homeScore: number,
    awayScore: number,
    penalties?: { homeScore: number; awayScore: number },
    winnerId?: string
  ): Promise<void> {
    if (!isSupabaseConfigured()) return;

    try {
      const { error } = await db
        .matches_new()
        .update({
          home_score: homeScore,
          away_score: awayScore,
          is_played: true,
          played_at: new Date().toISOString(),
          home_penalties: penalties?.homeScore || null,
          away_penalties: penalties?.awayScore || null,
          winner_team_id: winnerId || null,
        })
        .eq('id', matchId);

      if (error) throw error;

      console.log(`Knockout match ${matchId} updated with result ${homeScore}-${awayScore}`);
    } catch (error) {
      console.error('Error updating knockout match result:', error);
      throw error;
    }
  },

  /**
   * Set final positions for teams
   */
  async setFinalPositions(
    tournamentId: string,
    positions: {
      champion: string;
      runnerUp: string;
      thirdPlace: string;
      fourthPlace: string;
    }
  ): Promise<void> {
    if (!isSupabaseConfigured()) return;

    try {
      const { error } = await db
        .tournaments_new()
        .update({
          status: 'completed',
          champion_team_id: positions.champion,
          runner_up_team_id: positions.runnerUp,
          third_place_team_id: positions.thirdPlace,
          fourth_place_team_id: positions.fourthPlace,
        })
        .eq('id', tournamentId);

      if (error) throw error;

      console.log(`Final positions set for tournament ${tournamentId}`);
    } catch (error) {
      console.error('Error setting final positions:', error);
      throw error;
    }
  },

  /**
   * Get World Cup standings for a specific group
   */
  async getWorldCupGroupStandings(groupId: string) {
    if (!isSupabaseConfigured()) return [];

    try {
      const { data, error } = await db
        .world_cup_standings()
        .select('*')
        .eq('group_id', groupId)
        .order('position', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error getting World Cup group standings:', error);
      return [];
    }
  },

  /**
   * Get all qualified teams from World Cup groups
   */
  async getQualifiedTeamsFromGroups(tournamentId: string): Promise<string[]> {
    if (!isSupabaseConfigured()) return [];

    try {
      // Get all world cup groups for this tournament
      const { data: groups, error: groupsError } = await db
        .world_cup_groups()
        .select('id')
        .eq('tournament_id', tournamentId);

      if (groupsError) throw groupsError;

      const groupIds = groups?.map((g: any) => g.id) || [];

      // Get all qualified teams from these groups
      const { data: qualifiedTeams, error: teamsError } = await db
        .world_cup_group_teams()
        .select('team_id')
        .in('group_id', groupIds)
        .eq('qualified', true);

      if (teamsError) throw teamsError;

      return qualifiedTeams?.map((t: any) => t.team_id) || [];
    } catch (error) {
      console.error('Error getting qualified teams from groups:', error);
      return [];
    }
  },

  /**
   * Delete all World Cup data for a tournament
   */
  async deleteWorldCupData(tournamentId: string): Promise<void> {
    if (!isSupabaseConfigured()) return;

    try {
      // Delete world cup groups (CASCADE will delete teams and matches)
      const { error: groupsError } = await db
        .world_cup_groups()
        .delete()
        .eq('tournament_id', tournamentId);

      if (groupsError) throw groupsError;

      // Delete knockout matches
      const { error: knockoutError } = await db
        .matches_new()
        .delete()
        .eq('tournament_id', tournamentId)
        .eq('match_type', 'world-cup-knockout');

      if (knockoutError) throw knockoutError;

      console.log(`Deleted all World Cup data for tournament ${tournamentId}`);
    } catch (error) {
      console.error('Error deleting World Cup data:', error);
      throw error;
    }
  },

  /**
   * Delete World Cup matches from match_history
   * Note: Uses raw supabase client as match_history is not in the normalized db object
   */
  async deleteWorldCupMatchHistory(tournamentId: string): Promise<void> {
    if (!isSupabaseConfigured()) return;

    // Import supabase dynamically to avoid circular dependencies
    const { supabase } = await import('../lib/supabase');

    try {
      const { error } = await supabase
        .from('match_history')
        .delete()
        .eq('tournament_id', tournamentId)
        .in('stage', ['world-cup-group', 'world-cup-knockout']);

      if (error) throw error;

      console.log(`Deleted World Cup match history for tournament ${tournamentId}`);
    } catch (error) {
      console.error('Error deleting World Cup match history:', error);
      throw error;
    }
  },
};
