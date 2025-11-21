import { isSupabaseConfigured } from '../lib/supabase';
import { db } from '../lib/supabaseNormalized';
import type { Tournament, Group, Match, TeamStanding, WorldCup, WorldCupGroup, KnockoutMatch, KnockoutBracket, Region } from '../types';

/**
 * Normalized Tournament Service
 *
 * This service interacts with the normalized database schema instead of JSONB.
 * It provides the same interface as tournamentService but uses relational tables.
 */

interface DbTournament {
  id: string;
  name: string;
  year: number;
  status: 'qualifiers' | 'world-cup' | 'completed';
  is_qualifiers_complete: boolean;
  has_any_match_played: boolean;
  champion_team_id: string | null;
  runner_up_team_id: string | null;
  third_place_team_id: string | null;
  fourth_place_team_id: string | null;
}

interface DbQualifierGroup {
  id: string;
  tournament_id: string;
  region: Region;
  name: string;
  num_qualify: number;
}

interface DbQualifierGroupTeam {
  id: string;
  group_id: string;
  team_id: string;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  qualified: boolean;
}

interface DbMatch {
  id: string;
  tournament_id: string;
  match_type: 'qualifier' | 'world-cup-group' | 'world-cup-knockout';
  qualifier_group_id: string | null;
  world_cup_group_id: string | null;
  knockout_round: string | null;
  knockout_position: number | null;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  is_played: boolean;
  home_penalties: number | null;
  away_penalties: number | null;
  winner_team_id: string | null;
  matchday: number | null;
}

interface DbWorldCupGroup {
  id: string;
  tournament_id: string;
  name: string;
  num_qualify: number;
}

interface DbWorldCupGroupTeam {
  id: string;
  group_id: string;
  team_id: string;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  qualified: boolean;
  final_position: number | null;
}

/**
 * Convert database qualifier group to app Group format
 */
const dbGroupToGroup = async (
  dbGroup: DbQualifierGroup,
  teams: DbQualifierGroupTeam[],
  matches: DbMatch[]
): Promise<Group> => {
  const standings: TeamStanding[] = teams.map(team => ({
    teamId: team.team_id,
    played: team.played,
    won: team.won,
    drawn: team.drawn,
    lost: team.lost,
    goalsFor: team.goals_for,
    goalsAgainst: team.goals_against,
    goalDifference: team.goal_difference,
    points: team.points,
  }));

  const groupMatches: Match[] = matches.map(match => ({
    id: match.id,
    homeTeamId: match.home_team_id,
    awayTeamId: match.away_team_id,
    homeScore: match.home_score,
    awayScore: match.away_score,
    isPlayed: match.is_played,
    stage: 'qualifier',
    matchday: match.matchday ?? undefined, // Preserve matchday for ordering (convert null to undefined)
  }));

  return {
    id: dbGroup.id,
    name: dbGroup.name,
    region: dbGroup.region,
    teamIds: teams.map(t => t.team_id),
    matches: groupMatches,
    standings,
    isDrawComplete: matches.length > 0,
  };
};

/**
 * Convert database world cup group to app WorldCupGroup format
 */
const dbWorldCupGroupToWorldCupGroup = async (
  dbGroup: DbWorldCupGroup,
  teams: DbWorldCupGroupTeam[],
  matches: DbMatch[]
): Promise<WorldCupGroup> => {
  const standings: TeamStanding[] = teams.map(team => ({
    teamId: team.team_id,
    played: team.played,
    won: team.won,
    drawn: team.drawn,
    lost: team.lost,
    goalsFor: team.goals_for,
    goalsAgainst: team.goals_against,
    goalDifference: team.goal_difference,
    points: team.points,
  }));

  const groupMatches: Match[] = matches.map(match => ({
    id: match.id,
    homeTeamId: match.home_team_id,
    awayTeamId: match.away_team_id,
    homeScore: match.home_score,
    awayScore: match.away_score,
    isPlayed: match.is_played,
    stage: 'world-cup-group',
    matchday: match.matchday ?? undefined, // Preserve matchday for ordering (convert null to undefined)
  }));

  return {
    id: dbGroup.id,
    name: dbGroup.name,
    teamIds: teams.map(t => t.team_id),
    matches: groupMatches,
    standings,
  };
};

/**
 * Load complete tournament from normalized schema
 */
const loadTournamentFromNormalizedSchema = async (
  tournamentId: string
): Promise<Tournament | null> => {
  try {
    // Load tournament
    const { data: dbTournament, error: tournamentError } = await db
      .tournaments_new()
      .select('*')
      .eq('id', tournamentId)
      .single();

    if (tournamentError) {
      if (tournamentError.code === 'PGRST116') {
        return null;
      }
      throw tournamentError;
    }

    const tournament = dbTournament as DbTournament;

    // Load qualifier groups
    const { data: qualifierGroups, error: groupsError } = await db
      .qualifier_groups()
      .select('*')
      .eq('tournament_id', tournamentId);

    if (groupsError) throw groupsError;

    // Load qualifier group teams
    const groupIds = qualifierGroups?.map((g: any) => g.id) || [];
    const { data: qualifierTeams, error: teamsError } = await db
      .qualifier_group_teams()
      .select('*')
      .in('group_id', groupIds);

    if (teamsError) throw teamsError;

    // Load qualifier matches
    const { data: qualifierMatches, error: matchesError } = await db
      .matches_new()
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('match_type', 'qualifier');

    if (matchesError) throw matchesError;

    // Group data by region
    const qualifiers: { [key in Region]: Group[] } = {
      Europe: [],
      America: [],
      Africa: [],
      Asia: [],
    };

    for (const dbGroup of qualifierGroups || []) {
      const groupTeams = (qualifierTeams || []).filter((t: any) => t.group_id === dbGroup.id);
      const groupMatches = (qualifierMatches || []).filter((m: any) => m.qualifier_group_id === dbGroup.id);
      const group = await dbGroupToGroup(
        dbGroup as DbQualifierGroup,
        groupTeams as DbQualifierGroupTeam[],
        groupMatches as DbMatch[]
      );
      qualifiers[dbGroup.region as Region].push(group);
    }

    // Load World Cup data if exists
    let worldCup: WorldCup | null = null;
    if (tournament.status === 'world-cup' || tournament.status === 'completed') {
      // Load world cup groups
      const { data: wcGroups, error: wcGroupsError } = await db
        .world_cup_groups()
        .select('*')
        .eq('tournament_id', tournamentId);

      if (wcGroupsError) throw wcGroupsError;

      const wcGroupIds = wcGroups?.map((g: any) => g.id) || [];

      // Load world cup group teams
      const { data: wcTeams, error: wcTeamsError } = await db
        .world_cup_group_teams()
        .select('*')
        .in('group_id', wcGroupIds);

      if (wcTeamsError) throw wcTeamsError;

      // Load world cup group matches
      const { data: wcMatches, error: wcMatchesError } = await db
        .matches_new()
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('match_type', 'world-cup-group');

      if (wcMatchesError) throw wcMatchesError;

      // Build world cup groups
      const groups: WorldCupGroup[] = [];
      for (const dbGroup of wcGroups || []) {
        const groupTeams = (wcTeams || []).filter((t: any) => t.group_id === dbGroup.id);
        const groupMatches = (wcMatches || []).filter((m: any) => m.world_cup_group_id === dbGroup.id);
        const group = await dbWorldCupGroupToWorldCupGroup(
          dbGroup as DbWorldCupGroup,
          groupTeams as DbWorldCupGroupTeam[],
          groupMatches as DbMatch[]
        );
        groups.push(group);
      }

      // Load knockout matches
      const { data: knockoutMatches, error: knockoutError } = await db
        .matches_new()
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('match_type', 'world-cup-knockout');

      if (knockoutError) throw knockoutError;

      // Build knockout bracket
      const knockout: KnockoutBracket = {
        roundOf32: [],
        roundOf16: [],
        quarterFinals: [],
        semiFinals: [],
        thirdPlace: null,
        final: null,
      };

      for (const match of knockoutMatches || []) {
        const knockoutMatch: KnockoutMatch = {
          id: match.id,
          homeTeamId: match.home_team_id,
          awayTeamId: match.away_team_id,
          homeScore: match.home_score,
          awayScore: match.away_score,
          isPlayed: match.is_played,
          stage: 'world-cup-knockout',
          round: match.knockout_round as any,
          winnerId: match.winner_team_id || undefined,
          position: match.knockout_position || undefined,
          penalties: match.home_penalties !== null && match.away_penalties !== null
            ? { homeScore: match.home_penalties, awayScore: match.away_penalties }
            : undefined,
        };

        switch (match.knockout_round) {
          case 'round-of-32':
            knockout.roundOf32.push(knockoutMatch);
            break;
          case 'round-of-16':
            knockout.roundOf16.push(knockoutMatch);
            break;
          case 'quarter':
            knockout.quarterFinals.push(knockoutMatch);
            break;
          case 'semi':
            knockout.semiFinals.push(knockoutMatch);
            break;
          case 'third-place':
            knockout.thirdPlace = knockoutMatch;
            break;
          case 'final':
            knockout.final = knockoutMatch;
            break;
        }
      }

      // Get qualified team IDs from world cup group teams
      const qualifiedTeamIds = (wcTeams || [])
        .filter((t: any) => t.qualified)
        .map((t: any) => t.team_id);

      worldCup = {
        groups,
        knockout,
        qualifiedTeamIds,
        champion: tournament.champion_team_id || undefined,
        runnerUp: tournament.runner_up_team_id || undefined,
        thirdPlace: tournament.third_place_team_id || undefined,
        fourthPlace: tournament.fourth_place_team_id || undefined,
      };
    }

    // Load team tournament skills (originalSkills)
    const { data: teamSkills, error: skillsError } = await db
      .team_tournament_skills()
      .select('*')
      .eq('tournament_id', tournamentId);

    if (skillsError) throw skillsError;

    const originalSkills: Record<string, number> = {};
    for (const skill of teamSkills || []) {
      originalSkills[skill.team_id] = skill.skill_snapshot;
    }

    return {
      id: tournament.id,
      name: tournament.name,
      year: tournament.year,
      qualifiers,
      worldCup,
      isQualifiersComplete: tournament.is_qualifiers_complete,
      hasAnyMatchPlayed: tournament.has_any_match_played,
      originalSkills: Object.keys(originalSkills).length > 0 ? originalSkills : undefined,
    };
  } catch (error) {
    console.error('Error loading tournament from normalized schema:', error);
    return null;
  }
};

export const normalizedTournamentService = {
  /**
   * Save or update tournament in normalized schema
   */
  async saveTournament(tournament: Tournament): Promise<void> {
    if (!isSupabaseConfigured()) {
      console.log('Supabase not configured, tournament not saved to database');
      return;
    }

    try {
      // Check if tournament exists
      const { data: existing } = await db
        .tournaments_new()
        .select('id')
        .eq('id', tournament.id)
        .single();

      // Determine status
      const status = tournament.worldCup
        ? (tournament.worldCup.champion ? 'completed' : 'world-cup')
        : 'qualifiers';

      if (existing) {
        // Update existing tournament
        const { error } = await db
          .tournaments_new()
          .update({
            name: tournament.name,
            year: tournament.year,
            status,
            is_qualifiers_complete: tournament.isQualifiersComplete,
            has_any_match_played: tournament.hasAnyMatchPlayed,
            champion_team_id: tournament.worldCup?.champion || null,
            runner_up_team_id: tournament.worldCup?.runnerUp || null,
            third_place_team_id: tournament.worldCup?.thirdPlace || null,
            fourth_place_team_id: tournament.worldCup?.fourthPlace || null,
          })
          .eq('id', tournament.id);

        if (error) throw error;
        console.log(`Tournament ${tournament.id} updated in database`);
      } else {
        // Insert new tournament
        const { error } = await db
          .tournaments_new()
          .insert({
            id: tournament.id,
            name: tournament.name,
            year: tournament.year,
            status,
            is_qualifiers_complete: tournament.isQualifiersComplete,
            has_any_match_played: tournament.hasAnyMatchPlayed,
            champion_team_id: tournament.worldCup?.champion || null,
            runner_up_team_id: tournament.worldCup?.runnerUp || null,
            third_place_team_id: tournament.worldCup?.thirdPlace || null,
            fourth_place_team_id: tournament.worldCup?.fourthPlace || null,
          });

        if (error) throw error;
        console.log(`Tournament ${tournament.id} created in database`);
      }

      // Save original skills if they exist
      if (tournament.originalSkills) {
        for (const [teamId, skill] of Object.entries(tournament.originalSkills)) {
          const { error } = await db
            .team_tournament_skills()
            .upsert({
              tournament_id: tournament.id,
              team_id: teamId,
              skill_snapshot: skill,
            }, {
              onConflict: 'tournament_id,team_id'
            });

          if (error) throw error;
        }
      }

      // Note: Qualifier groups, teams, and matches should be saved separately
      // through dedicated methods to maintain proper relationships
    } catch (error) {
      console.error('Error saving tournament to normalized schema:', error);
      throw error;
    }
  },

  /**
   * Load tournament from normalized schema
   */
  async loadTournament(tournamentId: string): Promise<Tournament | null> {
    return loadTournamentFromNormalizedSchema(tournamentId);
  },

  /**
   * Get the most recent tournament
   */
  async getLatestTournament(): Promise<Tournament | null> {
    if (!isSupabaseConfigured()) {
      console.log('Supabase not configured, cannot load tournament');
      return null;
    }

    try {
      const { data, error } = await db
        .tournaments_new()
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      return loadTournamentFromNormalizedSchema(data.id);
    } catch (error) {
      console.error('Error loading latest tournament:', error);
      return null;
    }
  },

  /**
   * Get all tournaments
   */
  async getAllTournaments(): Promise<Tournament[]> {
    if (!isSupabaseConfigured()) {
      return [];
    }

    try {
      const { data, error } = await db
        .tournaments_new()
        .select('id')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const tournaments: Tournament[] = [];
      for (const row of data || []) {
        const tournament = await loadTournamentFromNormalizedSchema(row.id);
        if (tournament) {
          tournaments.push(tournament);
        }
      }

      return tournaments;
    } catch (error) {
      console.error('Error loading tournaments:', error);
      return [];
    }
  },

  /**
   * Delete tournament from database
   */
  async deleteTournament(tournamentId: string): Promise<void> {
    if (!isSupabaseConfigured()) {
      return;
    }

    try {
      // CASCADE delete will handle all related records
      const { error } = await db
        .tournaments_new()
        .delete()
        .eq('id', tournamentId);

      if (error) throw error;
      console.log(`Tournament ${tournamentId} deleted from database`);
    } catch (error) {
      console.error('Error deleting tournament:', error);
      throw error;
    }
  },
};
