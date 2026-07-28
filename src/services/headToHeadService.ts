import type { Team, Match } from '../types';
import { useTournamentStore } from '../store/useTournamentStore';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isRoundKey, roundLongLabel } from '../core/formats/rounds';

export interface HeadToHeadStats {
  totalMatches: number;
  team1Wins: number;
  team2Wins: number;
  draws: number;
  team1GoalsFor: number;
  team2GoalsFor: number;
  team1GoalsAgainst: number;
  team2GoalsAgainst: number;
  lastFiveResults: MatchResult[];
  biggestWinTeam1: MatchResult | null;
  biggestWinTeam2: MatchResult | null;
  averageGoalsTeam1: number;
  averageGoalsTeam2: number;
}

export interface MatchResult {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  result: 'team1Win' | 'team2Win' | 'draw';
  stage: string;
  goalDifference: number;
  tournamentYear?: number;
  tournamentName?: string;
  knockoutRound?: string; // 'round-of-32', 'round-of-16', 'quarter', 'semi', 'third-place', 'final'
}

/**
 * Translates knockout round codes to Spanish display names.
 * Los rótulos viven en core/formats/rounds.ts (fuente única); acá sólo se
 * conserva el fallback histórico a 'Eliminatorias' para rondas desconocidas.
 */
export function getKnockoutRoundName(knockoutRound: string | undefined): string {
  if (!knockoutRound) return 'Eliminatorias';
  if (!isRoundKey(knockoutRound)) return 'Eliminatorias';
  return roundLongLabel(knockoutRound);
}

/**
 * Gets all matches between two teams from the database (match_history)
 */
async function getMatchesBetweenTeamsFromDB(team1Id: string, team2Id: string): Promise<Match[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    // Query match_history for all matches between these two teams
    // Direction 1: team1 as home, team2 as away
    const { data: data1, error: error1 } = await supabase
      .from('match_history')
      .select('id, home_team_id, away_team_id, home_score, away_score, stage, tournament_id, played_at')
      .eq('home_team_id', team1Id)
      .eq('away_team_id', team2Id);

    // Direction 2: team2 as home, team1 as away
    const { data: data2, error: error2 } = await supabase
      .from('match_history')
      .select('id, home_team_id, away_team_id, home_score, away_score, stage, tournament_id, played_at')
      .eq('home_team_id', team2Id)
      .eq('away_team_id', team1Id);

    if (error1 || error2) {
      console.error('Error fetching head-to-head matches:', error1 || error2);
      return [];
    }

    // Combine both results with proper typing
    const allMatches: any[] = [...(data1 || []), ...(data2 || [])];

    if (allMatches.length === 0) {
      console.log(`No matches found between ${team1Id} and ${team2Id}`);
      return [];
    }

    // Get unique tournament IDs
    const tournamentIds = Array.from(new Set(allMatches.map((m: any) => m.tournament_id).filter(Boolean)));

    // Fetch tournament information
    const tournamentMap = new Map();
    if (tournamentIds.length > 0) {
      const { data: tournaments } = await supabase
        .from('tournaments_new')
        .select('id, year, name')
        .in('id', tournamentIds);

      tournaments?.forEach((t: any) => {
        tournamentMap.set(t.id, { year: t.year, name: t.name });
      });
    }

    // Sort by played_at descending (most recent first)
    allMatches.sort((a: any, b: any) => new Date(b.played_at).getTime() - new Date(a.played_at).getTime());

    console.log(`Found ${allMatches.length} matches between teams in database`);

    // Convert database format to Match format with tournament info
    const matches: Match[] = allMatches.map((dbMatch: any) => {
      const tournamentInfo = tournamentMap.get(dbMatch.tournament_id);
      return {
        id: dbMatch.id,
        homeTeamId: dbMatch.home_team_id,
        awayTeamId: dbMatch.away_team_id,
        homeScore: dbMatch.home_score,
        awayScore: dbMatch.away_score,
        isPlayed: true,
        stage: dbMatch.stage || 'unknown',
        tournamentYear: tournamentInfo?.year,
        tournamentName: tournamentInfo?.name,
      } as any;
    });

    return matches;
  } catch (error) {
    console.error('Error in getMatchesBetweenTeamsFromDB:', error);
    return [];
  }
}

/**
 * Gets all matches between two teams from the tournament history (LEGACY - only current tournament)
 */
export function getMatchesBetweenTeams(team1Id: string, team2Id: string): Match[] {
  const { currentTournament } = useTournamentStore.getState();
  if (!currentTournament) return [];

  const allMatches: Match[] = [];

  // Get matches from qualifiers
  Object.values(currentTournament.qualifiers).forEach((groups) => {
    groups.forEach((group) => {
      const groupMatches = group.matches.filter((match) => {
        const isTeam1Home = match.homeTeamId === team1Id && match.awayTeamId === team2Id;
        const isTeam1Away = match.homeTeamId === team2Id && match.awayTeamId === team1Id;
        return (isTeam1Home || isTeam1Away) && match.isPlayed;
      });
      allMatches.push(...groupMatches);
    });
  });

  // Get matches from World Cup groups
  if (currentTournament.worldCup) {
    currentTournament.worldCup.groups.forEach((group) => {
      const groupMatches = group.matches.filter((match) => {
        const isTeam1Home = match.homeTeamId === team1Id && match.awayTeamId === team2Id;
        const isTeam1Away = match.homeTeamId === team2Id && match.awayTeamId === team1Id;
        return (isTeam1Home || isTeam1Away) && match.isPlayed;
      });
      allMatches.push(...groupMatches);
    });

    // Get matches from knockout stage
    const knockout = currentTournament.worldCup.knockout;
    const knockoutMatches = [
      ...knockout.roundOf16,
      ...knockout.quarterFinals,
      ...knockout.semiFinals,
      ...(knockout.thirdPlace ? [knockout.thirdPlace] : []),
      ...(knockout.final ? [knockout.final] : []),
    ];

    const knockoutFiltered = knockoutMatches.filter((match) => {
      const isTeam1Home = match.homeTeamId === team1Id && match.awayTeamId === team2Id;
      const isTeam1Away = match.homeTeamId === team2Id && match.awayTeamId === team1Id;
      return (isTeam1Home || isTeam1Away) && match.isPlayed;
    });

    allMatches.push(...knockoutFiltered);
  }

  // Helper: partido jugado entre los dos equipos (cualquier orientación).
  const isBetween = (match: Match) => {
    const t1Home = match.homeTeamId === team1Id && match.awayTeamId === team2Id;
    const t1Away = match.homeTeamId === team2Id && match.awayTeamId === team1Id;
    return (t1Home || t1Away) && match.isPlayed;
  };

  // Continental
  if (currentTournament.continental?.brackets) {
    Object.values(currentTournament.continental.brackets).forEach((b) => {
      allMatches.push(...[
        ...b.roundOf64, ...b.roundOf32, ...b.roundOf16,
        ...b.quarterFinals, ...b.semiFinals,
        ...(b.final ? [b.final] : []),
        ...(b.thirdPlace ? [b.thirdPlace] : []),
      ].filter(isBetween));
    });
  }

  // Confederaciones — grupos + knockout
  if (currentTournament.confederationsCup) {
    currentTournament.confederationsCup.groups.forEach((g) => {
      allMatches.push(...g.matches.filter(isBetween));
    });
    const ck = currentTournament.confederationsCup.knockout;
    allMatches.push(...[
      ...ck.semiFinals,
      ...(ck.final ? [ck.final] : []),
      ...(ck.thirdPlace ? [ck.thirdPlace] : []),
    ].filter(isBetween));
  }

  return allMatches;
}

/**
 * Calculates comprehensive head-to-head statistics between two teams
 */
export async function calculateHeadToHeadStats(
  team1Id: string,
  team2Id: string
): Promise<HeadToHeadStats> {
  // Try to get matches from database first
  let matches = await getMatchesBetweenTeamsFromDB(team1Id, team2Id);

  // Fallback to current tournament if database is not configured
  if (matches.length === 0 && !isSupabaseConfigured()) {
    matches = getMatchesBetweenTeams(team1Id, team2Id);
  }

  if (matches.length === 0) {
    return {
      totalMatches: 0,
      team1Wins: 0,
      team2Wins: 0,
      draws: 0,
      team1GoalsFor: 0,
      team2GoalsFor: 0,
      team1GoalsAgainst: 0,
      team2GoalsAgainst: 0,
      lastFiveResults: [],
      biggestWinTeam1: null,
      biggestWinTeam2: null,
      averageGoalsTeam1: 0,
      averageGoalsTeam2: 0,
    };
  }

  let team1Wins = 0;
  let team2Wins = 0;
  let draws = 0;
  let team1GoalsFor = 0;
  let team2GoalsFor = 0;
  let biggestWinTeam1: MatchResult | null = null;
  let biggestWinTeam2: MatchResult | null = null;

  const results: MatchResult[] = matches.map((match) => {
    const isTeam1Home = match.homeTeamId === team1Id;
    const team1Score = isTeam1Home ? match.homeScore! : match.awayScore!;
    const team2Score = isTeam1Home ? match.awayScore! : match.homeScore!;
    const goalDiff = team1Score - team2Score;

    team1GoalsFor += team1Score;
    team2GoalsFor += team2Score;

    let result: 'team1Win' | 'team2Win' | 'draw';
    if (team1Score > team2Score) {
      team1Wins++;
      result = 'team1Win';
    } else if (team2Score > team1Score) {
      team2Wins++;
      result = 'team2Win';
    } else {
      draws++;
      result = 'draw';
    }

    const matchResult: MatchResult = {
      matchId: match.id,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      homeScore: match.homeScore!,
      awayScore: match.awayScore!,
      result,
      stage: match.stage || 'qualifier',
      goalDifference: goalDiff,
      tournamentYear: (match as any).tournamentYear,
      tournamentName: (match as any).tournamentName,
      knockoutRound: (match as any).knockoutRound,
    };

    // Track biggest wins
    if (result === 'team1Win') {
      if (!biggestWinTeam1 || goalDiff > biggestWinTeam1.goalDifference) {
        biggestWinTeam1 = matchResult;
      }
    } else if (result === 'team2Win') {
      if (!biggestWinTeam2 || Math.abs(goalDiff) > Math.abs(biggestWinTeam2.goalDifference)) {
        biggestWinTeam2 = matchResult;
      }
    }

    return matchResult;
  });

  // Get last 5 matches (most recent first)
  const lastFiveResults = results.slice(-5).reverse();

  return {
    totalMatches: matches.length,
    team1Wins,
    team2Wins,
    draws,
    team1GoalsFor,
    team2GoalsFor,
    team1GoalsAgainst: team2GoalsFor,
    team2GoalsAgainst: team1GoalsFor,
    lastFiveResults,
    biggestWinTeam1,
    biggestWinTeam2,
    averageGoalsTeam1: team1GoalsFor / matches.length,
    averageGoalsTeam2: team2GoalsFor / matches.length,
  };
}

/**
 * Gets win percentage for a team against another
 */
export function getWinPercentage(stats: HeadToHeadStats, forTeam: 1 | 2): number {
  if (stats.totalMatches === 0) return 0;
  const wins = forTeam === 1 ? stats.team1Wins : stats.team2Wins;
  return (wins / stats.totalMatches) * 100;
}

/**
 * Gets form string (last 5 matches) for display
 */
export function getFormString(
  stats: HeadToHeadStats,
  teamId: string
): Array<'W' | 'D' | 'L'> {
  return stats.lastFiveResults.map((result) => {
    if (result.result === 'draw') return 'D';

    const isWin =
      (result.homeTeamId === teamId && result.result === 'team1Win') ||
      (result.awayTeamId === teamId && result.result === 'team2Win');

    return isWin ? 'W' : 'L';
  });
}

/**
 * Compares two teams' overall tournament performance
 */
export function compareOverallStats(team1: Team, team2: Team) {
  return {
    skillDifference: team1.skill - team2.skill,
    favoriteTeam: team1.skill > team2.skill ? team1.id : team2.id,
    skillGap: Math.abs(team1.skill - team2.skill),
    team1Tier: team1.tier || 'Average',
    team2Tier: team2.tier || 'Average',
  };
}
