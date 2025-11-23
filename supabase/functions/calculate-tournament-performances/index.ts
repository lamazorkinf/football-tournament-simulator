import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

type FinalStage =
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

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { tournamentId } = await req.json();

    if (!tournamentId) {
      return new Response(
        JSON.stringify({ error: 'tournamentId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Starting performance calculation for tournament ${tournamentId}`);

    // Get all teams that participated
    const { data: qualifierTeams } = await supabase
      .from('qualifier_group_teams')
      .select('team_id, qualifier_groups!inner(tournament_id)')
      .eq('qualifier_groups.tournament_id', tournamentId);

    const teamIds = Array.from(new Set(qualifierTeams?.map((qt: any) => qt.team_id) || []));
    console.log(`📊 Found ${teamIds.length} teams to process`);

    // Delete existing performance records for this tournament
    await supabase
      .from('team_tournament_performance')
      .delete()
      .eq('tournament_id', tournamentId);

    // Process teams in batches of 10 for better performance
    const BATCH_SIZE = 10;
    const batches: string[][] = [];
    for (let i = 0; i < teamIds.length; i += BATCH_SIZE) {
      batches.push(teamIds.slice(i, i + BATCH_SIZE));
    }

    let processedCount = 0;

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (teamId) => {
          await calculateTeamPerformance(supabase, tournamentId, teamId);
          processedCount++;
          console.log(`✅ Processed ${processedCount}/${teamIds.length} teams`);
        })
      );
    }

    console.log(`✅ All performances calculated for tournament ${tournamentId}`);

    return new Response(
      JSON.stringify({
        success: true,
        teamsProcessed: teamIds.length,
        message: `Successfully calculated performance for ${teamIds.length} teams`
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    console.error('❌ Error calculating performances:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function calculateTeamPerformance(
  supabase: any,
  tournamentId: string,
  teamId: string
): Promise<void> {
  console.log(`🔍 Calculating performance for team ${teamId} in tournament ${tournamentId}`);

  // 1. Check if team is champion, runner-up, third or fourth place
  const { data: tournament } = await supabase
    .from('tournaments_new')
    .select('champion_team_id, runner_up_team_id, third_place_team_id, fourth_place_team_id')
    .eq('id', tournamentId)
    .maybeSingle();

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
    const { data: knockoutMatches } = await supabase
      .from('matches_new')
      .select('knockout_round, winner_team_id, home_team_id, away_team_id')
      .eq('tournament_id', tournamentId)
      .eq('match_type', 'world-cup-knockout')
      .eq('is_played', true)
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`);

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
      const { data: wcGroups } = await supabase
        .from('world_cup_groups')
        .select('id')
        .eq('tournament_id', tournamentId);

      if (wcGroups && wcGroups.length > 0) {
        const groupIds = wcGroups.map((g: any) => g.id);
        const { data: wcGroupTeam } = await supabase
          .from('world_cup_group_teams')
          .select('qualified, group_id')
          .eq('team_id', teamId)
          .in('group_id', groupIds)
          .maybeSingle();

        if (wcGroupTeam) {
          if (!wcGroupTeam.qualified) {
            finalStage = 'eliminated-groups';
          }
        }
      }

      // 4. Check if eliminated in qualifiers
      if (finalStage === 'did-not-participate') {
        const { data: qualifierTeam } = await supabase
          .from('qualifier_group_teams')
          .select('qualified, group_id')
          .eq('team_id', teamId)
          .limit(1);

        if (qualifierTeam && qualifierTeam.length > 0) {
          if (!qualifierTeam[0].qualified) {
            finalStage = 'eliminated-qualifiers';
          }
        }
      }
    }
  }

  // 5. Get additional context (group names) for THIS tournament
  const { data: qualifierGroup } = await supabase
    .from('qualifier_group_teams')
    .select('group_id, qualifier_groups!inner(name, region, tournament_id)')
    .eq('team_id', teamId)
    .eq('qualifier_groups.tournament_id', tournamentId)
    .maybeSingle();

  const { data: wcGroup } = await supabase
    .from('world_cup_group_teams')
    .select('group_id, world_cup_groups!inner(name, tournament_id)')
    .eq('team_id', teamId)
    .eq('world_cup_groups.tournament_id', tournamentId)
    .maybeSingle();

  // Calculate stats from match_history (single source of truth)
  const { data: matches } = await supabase
    .from('match_history')
    .select('home_team_id, away_team_id, home_score, away_score')
    .eq('tournament_id', tournamentId)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`);

  let totalPlayed = 0;
  let totalWins = 0;
  let totalDraws = 0;
  let totalLosses = 0;
  let totalGoalsFor = 0;
  let totalGoalsAgainst = 0;

  matches?.forEach((match: any) => {
    const isHome = match.home_team_id === teamId;
    const teamScore = isHome ? match.home_score : match.away_score;
    const opponentScore = isHome ? match.away_score : match.home_score;

    totalPlayed++;
    totalGoalsFor += teamScore;
    totalGoalsAgainst += opponentScore;

    if (teamScore > opponentScore) totalWins++;
    else if (teamScore === opponentScore) totalDraws++;
    else totalLosses++;
  });

  const performanceData = {
    tournament_id: tournamentId,
    team_id: teamId,
    final_stage: finalStage,
    qualifier_group_name: qualifierGroup?.qualifier_groups?.name,
    qualifier_region: qualifierGroup?.qualifier_groups?.region,
    world_cup_group_name: wcGroup?.world_cup_groups?.name,
    total_matches_played: totalPlayed,
    total_wins: totalWins,
    total_draws: totalDraws,
    total_losses: totalLosses,
    total_goals_for: totalGoalsFor,
    total_goals_against: totalGoalsAgainst,
    updated_at: new Date().toISOString(),
  };

  // 6. Upsert the performance record
  const { error } = await supabase
    .from('team_tournament_performance')
    .upsert(performanceData, {
      onConflict: 'tournament_id,team_id',
    });

  if (error) {
    console.error('❌ Error storing performance:', error);
    throw error;
  }

  console.log(`✅ Performance calculated and stored: ${finalStage}`);
}
