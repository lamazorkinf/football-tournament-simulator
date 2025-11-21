import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { Team } from '../types';
import type { Database } from '../types/database';

type TeamRow = Database['public']['Tables']['teams']['Row'];
type TeamInsert = Database['public']['Tables']['teams']['Insert'];
type TeamUpdate = Database['public']['Tables']['teams']['Update'];

// Convert database row to app Team type
const dbTeamToTeam = (dbTeam: TeamRow): Team => ({
  id: dbTeam.id,
  name: dbTeam.name,
  flag: dbTeam.flag,
  region: dbTeam.region,
  skill: dbTeam.skill,
});

// Convert app Team type to database insert
const teamToDbInsert = (team: Team): TeamInsert => ({
  id: team.id,
  name: team.name,
  flag: team.flag,
  region: team.region,
  skill: team.skill,
});

export const teamsService = {
  // Get all teams
  async getAllTeams(): Promise<Team[]> {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .order('name');

    if (error) throw error;
    return data.map(dbTeamToTeam);
  },

  // Get teams by region
  async getTeamsByRegion(region: string): Promise<Team[]> {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('region', region)
      .order('name');

    if (error) throw error;
    return data.map(dbTeamToTeam);
  },

  // Get single team
  async getTeam(id: string): Promise<Team | null> {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }
    return dbTeamToTeam(data);
  },

  // Create team
  async createTeam(team: Team): Promise<Team> {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase
      .from('teams')
      .insert(teamToDbInsert(team) as any)
      .select()
      .single();

    if (error) throw error;
    return dbTeamToTeam(data);
  },

  // Create multiple teams
  async createTeams(teams: Team[]): Promise<Team[]> {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase
      .from('teams')
      .insert(teams.map(teamToDbInsert) as any)
      .select();

    if (error) throw error;
    return data.map(dbTeamToTeam);
  },

  // Update team
  async updateTeam(id: string, updates: Partial<Team>): Promise<Team> {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured');
    }

    const dbUpdates: TeamUpdate = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.flag !== undefined) dbUpdates.flag = updates.flag;
    if (updates.region !== undefined) dbUpdates.region = updates.region;
    if (updates.skill !== undefined) dbUpdates.skill = updates.skill;

    const { data, error } = await (supabase
      .from('teams') as any)
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return dbTeamToTeam(data);
  },

  // Delete team
  async deleteTeam(id: string): Promise<void> {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured');
    }

    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  // Batch update teams (for skill changes)
  async batchUpdateTeams(updates: Array<{ id: string; skill: number }>): Promise<void> {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured');
    }

    // Supabase doesn't have a native batch update, so we'll do it in parallel
    const promises = updates.map(({ id, skill }) =>
      (supabase
        .from('teams') as any)
        .update({ skill })
        .eq('id', id)
    );

    const results = await Promise.all(promises);
    const errors = results.filter((r) => r.error).map((r) => r.error);
    if (errors.length > 0) {
      throw new Error(`Failed to update ${errors.length} teams`);
    }
  },

  // Search teams
  async searchTeams(query: string): Promise<Team[]> {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase
      .from('teams')
      .select('*')
      .or(`name.ilike.%${query}%,id.ilike.%${query}%`)
      .order('name');

    if (error) throw error;
    return data.map(dbTeamToTeam);
  },

  // Get team statistics
  async getTeamStatistics(teamId: string) {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured');
    }

    const { data, error } = await supabase
      .from('team_statistics')
      .select('*')
      .eq('id', teamId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  },

  // Subscribe to team changes
  subscribeToTeams(callback: (teams: Team[]) => void) {
    if (!isSupabaseConfigured()) {
      console.warn('Supabase not configured, real-time updates disabled');
      return () => {};
    }

    const channel = supabase
      .channel('teams-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'teams',
        },
        async () => {
          // Reload all teams when any change occurs
          const teams = await teamsService.getAllTeams();
          callback(teams);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },
};
