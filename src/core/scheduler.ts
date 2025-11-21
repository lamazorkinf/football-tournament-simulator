import type { Match, Group, Region, Team, TeamStanding } from '../types';
import { nanoid } from 'nanoid';

/**
 * Generates all matches for a round-robin group of 5 teams
 * Each team plays every other team twice (home and away)
 * Total: 5 teams * 4 opponents * 2 (home/away) = 20 matches per group
 */
export function generateRoundRobinMatches(teamIds: string[]): Match[] {
  const matches: Match[] = [];

  // Each team plays every other team twice
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = 0; j < teamIds.length; j++) {
      if (i !== j) {
        matches.push({
          id: nanoid(),
          homeTeamId: teamIds[i],
          awayTeamId: teamIds[j],
          homeScore: null,
          awayScore: null,
          isPlayed: false,
          stage: 'qualifier',
        });
      }
    }
  }

  return matches;
}

/**
 * Generates World Cup group matches (4 teams, each plays once)
 * Total: 4 teams -> 6 matches (4 choose 2)
 */
export function generateWorldCupGroupMatches(teamIds: string[]): Match[] {
  const matches: Match[] = [];

  // Each team plays every other team once
  for (let i = 0; i < teamIds.length; i++) {
    for (let j = i + 1; j < teamIds.length; j++) {
      matches.push({
        id: nanoid(),
        homeTeamId: teamIds[i],
        awayTeamId: teamIds[j],
        homeScore: null,
        awayScore: null,
        isPlayed: false,
        stage: 'world-cup-group',
      });
    }
  }

  return matches;
}

/**
 * Creates empty group structures for regional qualifiers
 * Teams and matches will be assigned later via the draw system
 */
export function createQualifierGroups(teams: Team[], region: Region): Group[] {
  const regionalTeams = teams.filter(t => t.region === region);
  const groupSize = 5;
  const numGroups = Math.ceil(regionalTeams.length / groupSize);

  const groups: Group[] = [];

  for (let i = 0; i < numGroups; i++) {
    const groupId = nanoid();

    groups.push({
      id: groupId,
      name: `Group ${String.fromCharCode(65 + i)}`, // A, B, C, ...
      region,
      teamIds: [], // Empty - will be filled by draw system
      matches: [], // Empty - will be generated after draw
      standings: [], // Empty - will be initialized after draw
      isDrawComplete: false,
    });
  }

  return groups;
}

/**
 * Initializes empty standings for teams
 */
export function initializeStandings(teamIds: string[]): TeamStanding[] {
  return teamIds.map(teamId => ({
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  }));
}

/**
 * Updates standings after a match
 */
export function updateStandings(
  standings: TeamStanding[],
  match: Match
): TeamStanding[] {
  if (!match.isPlayed || match.homeScore === null || match.awayScore === null) {
    return standings;
  }

  const homeStanding = standings.find(s => s.teamId === match.homeTeamId);
  const awayStanding = standings.find(s => s.teamId === match.awayTeamId);

  if (!homeStanding || !awayStanding) return standings;

  // Update home team
  homeStanding.played++;
  homeStanding.goalsFor += match.homeScore;
  homeStanding.goalsAgainst += match.awayScore;

  // Update away team
  awayStanding.played++;
  awayStanding.goalsFor += match.awayScore;
  awayStanding.goalsAgainst += match.homeScore;

  // Determine result
  if (match.homeScore > match.awayScore) {
    homeStanding.won++;
    homeStanding.points += 3;
    awayStanding.lost++;
  } else if (match.homeScore < match.awayScore) {
    awayStanding.won++;
    awayStanding.points += 3;
    homeStanding.lost++;
  } else {
    homeStanding.drawn++;
    awayStanding.drawn++;
    homeStanding.points++;
    awayStanding.points++;
  }

  // Update goal difference
  homeStanding.goalDifference = homeStanding.goalsFor - homeStanding.goalsAgainst;
  awayStanding.goalDifference = awayStanding.goalsFor - awayStanding.goalsAgainst;

  return [...standings];
}

/**
 * Sorts standings by points, goal difference, goals scored, then alphabetically
 */
export function sortStandings(standings: TeamStanding[], teams?: Team[]): TeamStanding[] {
  return [...standings].sort((a, b) => {
    // First by points
    if (b.points !== a.points) return b.points - a.points;

    // Then by goal difference
    if (b.goalDifference !== a.goalDifference) {
      return b.goalDifference - a.goalDifference;
    }

    // Then by goals scored
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;

    // Finally by alphabetical order (tie-breaker)
    if (teams) {
      const teamA = teams.find(t => t.id === a.teamId);
      const teamB = teams.find(t => t.id === b.teamId);
      if (teamA && teamB) {
        return teamA.name.localeCompare(teamB.name);
      }
    }
    return 0;
  });
}

/**
 * Gets top N teams from each group
 */
export function getQualifiedTeams(groups: Group[], numQualifiers: number, teams?: Team[]): string[] {
  const qualified: string[] = [];

  groups.forEach(group => {
    const sorted = sortStandings(group.standings, teams);
    const topTeams = sorted.slice(0, numQualifiers);
    qualified.push(...topTeams.map(s => s.teamId));
  });

  return qualified;
}
