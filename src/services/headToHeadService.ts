import type { Team, Match } from '../types';
import { useTournamentStore } from '../store/useTournamentStore';

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
}

/**
 * Gets all matches between two teams from the tournament history
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

  return allMatches;
}

/**
 * Calculates comprehensive head-to-head statistics between two teams
 */
export function calculateHeadToHeadStats(
  team1Id: string,
  team2Id: string
): HeadToHeadStats {
  const matches = getMatchesBetweenTeams(team1Id, team2Id);

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
