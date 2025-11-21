import { isSupabaseConfigured } from '../lib/supabase';
import { db } from '../lib/supabaseNormalized';
import type { Group, Match, Region } from '../types';

/**
 * Normalized Qualifiers Service
 *
 * Handles operations specific to qualifier groups, teams, and matches
 * in the normalized schema.
 */

export const normalizedQualifiersService = {
  /**
   * Create qualifier groups for a tournament
   */
  async createQualifierGroups(
    tournamentId: string,
    region: Region,
    groups: Group[]
  ): Promise<void> {
    if (!isSupabaseConfigured()) return;

    try {
      for (const group of groups) {
        // Create or update qualifier group (upsert to avoid conflicts)
        const { error: groupError } = await db
          .qualifier_groups()
          .upsert({
            id: group.id,
            tournament_id: tournamentId,
            region,
            name: group.name,
            num_qualify: 2, // Default: top 2 qualify
          }, {
            onConflict: 'id'
          })
          .select()
          .single();

        if (groupError) throw groupError;

        // Delete existing team standings for this group to start fresh
        await db
          .qualifier_group_teams()
          .delete()
          .eq('group_id', group.id);

        // Create group teams with initial standings
        for (const teamId of group.teamIds) {
          const { error: teamError } = await db
            .qualifier_group_teams()
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
            await this.createQualifierMatch(tournamentId, group.id, match);
          }
        }
      }

      console.log(`Created ${groups.length} qualifier groups for region ${region}`);
    } catch (error) {
      console.error('Error creating qualifier groups:', error);
      throw error;
    }
  },

  /**
   * Create a single qualifier match
   */
  async createQualifierMatch(
    tournamentId: string,
    groupId: string,
    match: Match
  ): Promise<void> {
    if (!isSupabaseConfigured()) return;

    try {
      const { error } = await db
        .matches_new()
        .upsert({
          id: match.id,
          tournament_id: tournamentId,
          match_type: 'qualifier',
          qualifier_group_id: groupId,
          home_team_id: match.homeTeamId,
          away_team_id: match.awayTeamId,
          home_score: match.homeScore,
          away_score: match.awayScore,
          is_played: match.isPlayed,
          matchday: match.matchday, // Save matchday for ordering
        }, {
          onConflict: 'id'
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error creating qualifier match:', error);
      throw error;
    }
  },

  /**
   * Update match result
   * Note: Standings are updated automatically via database trigger
   */
  async updateMatchResult(
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

      console.log(`Match ${matchId} updated with result ${homeScore}-${awayScore}`);
      // Standings will be updated automatically by the trigger
    } catch (error) {
      console.error('Error updating match result:', error);
      throw error;
    }
  },

  /**
   * Mark teams as qualified in a group
   */
  async markTeamsAsQualified(
    groupId: string,
    qualifiedTeamIds: string[]
  ): Promise<void> {
    if (!isSupabaseConfigured()) return;

    try {
      // Reset all teams in group
      await db
        .qualifier_group_teams()
        .update({ qualified: false })
        .eq('group_id', groupId);

      // Mark qualified teams
      if (qualifiedTeamIds.length > 0) {
        const { error } = await db
          .qualifier_group_teams()
          .update({ qualified: true })
          .eq('group_id', groupId)
          .in('team_id', qualifiedTeamIds);

        if (error) throw error;
      }

      console.log(`Marked ${qualifiedTeamIds.length} teams as qualified in group ${groupId}`);
    } catch (error) {
      console.error('Error marking teams as qualified:', error);
      throw error;
    }
  },

  /**
   * Get all qualified teams for a tournament
   */
  async getQualifiedTeams(tournamentId: string): Promise<string[]> {
    if (!isSupabaseConfigured()) return [];

    try {
      // Get all qualifier groups for this tournament
      const { data: groups, error: groupsError } = await db
        .qualifier_groups()
        .select('id')
        .eq('tournament_id', tournamentId);

      if (groupsError) throw groupsError;

      const groupIds = groups?.map((g: any) => g.id) || [];

      // Get all qualified teams from these groups
      const { data: qualifiedTeams, error: teamsError } = await db
        .qualifier_group_teams()
        .select('team_id')
        .in('group_id', groupIds)
        .eq('qualified', true);

      if (teamsError) throw teamsError;

      return qualifiedTeams?.map((t: any) => t.team_id) || [];
    } catch (error) {
      console.error('Error getting qualified teams:', error);
      return [];
    }
  },

  /**
   * Delete all qualifier data for a tournament
   */
  async deleteQualifierData(tournamentId: string): Promise<void> {
    if (!isSupabaseConfigured()) return;

    try {
      // Delete qualifier groups (CASCADE will delete teams and matches)
      const { error } = await db
        .qualifier_groups()
        .delete()
        .eq('tournament_id', tournamentId);

      if (error) throw error;

      console.log(`Deleted all qualifier data for tournament ${tournamentId}`);
    } catch (error) {
      console.error('Error deleting qualifier data:', error);
      throw error;
    }
  },

  /**
   * Get standings for a specific group
   */
  async getGroupStandings(groupId: string) {
    if (!isSupabaseConfigured()) return [];

    try {
      const { data, error } = await db
        .qualifier_standings()
        .select('*')
        .eq('group_id', groupId)
        .order('position', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error getting group standings:', error);
      return [];
    }
  },

  /**
   * Get all standings for a tournament by region
   */
  async getTournamentStandingsByRegion(tournamentId: string, region: Region) {
    if (!isSupabaseConfigured()) return [];

    try {
      const { data, error } = await db
        .qualifier_standings()
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('region', region)
        .order('position', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error getting tournament standings:', error);
      return [];
    }
  },
};
