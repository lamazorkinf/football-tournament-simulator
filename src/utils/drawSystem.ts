import type { Team, Group, Match } from '../types';
import { FIXTURE_TEMPLATE, type FixtureLetter } from '../constants/fixtureTemplate';
import { nanoid } from 'nanoid';

/**
 * Shuffle array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Divide teams into 5 pots based on skill rating
 * Pot 1 (A): Top seeds
 * Pot 2 (B): Second tier
 * Pot 3 (C): Third tier
 * Pot 4 (D): Fourth tier
 * Pot 5 (E): Fifth tier
 */
export function divideIntoPots(teams: Team[], numGroups: number): {
  potA: Team[];
  potB: Team[];
  potC: Team[];
  potD: Team[];
  potE: Team[];
} {
  // Sort teams by skill (highest first)
  const sortedTeams = [...teams].sort((a, b) => b.skill - a.skill);

  // Each pot should have exactly numGroups teams
  const potA = sortedTeams.slice(0, numGroups); // Top seeds
  const potB = sortedTeams.slice(numGroups, numGroups * 2);
  const potC = sortedTeams.slice(numGroups * 2, numGroups * 3);
  const potD = sortedTeams.slice(numGroups * 3, numGroups * 4);
  const potE = sortedTeams.slice(numGroups * 4, numGroups * 5);

  return { potA, potB, potC, potD, potE };
}

/**
 * Perform the draw: assign teams to groups and letters
 */
export function performDraw(
  groups: Group[],
  teams: Team[]
): Group[] {
  const numGroups = groups.length;

  // Divide teams into pots
  const { potA, potB, potC, potD, potE } = divideIntoPots(teams, numGroups);

  // Shuffle each pot
  const shuffledA = shuffleArray(potA);
  const shuffledB = shuffleArray(potB);
  const shuffledC = shuffleArray(potC);
  const shuffledD = shuffleArray(potD);
  const shuffledE = shuffleArray(potE);

  // Assign teams to groups
  return groups.map((group, index) => {
    const teamA = shuffledA[index];
    const teamB = shuffledB[index];
    const teamC = shuffledC[index];
    const teamD = shuffledD[index];
    const teamE = shuffledE[index];

    const letterAssignments: Record<string, FixtureLetter> = {
      [teamA.id]: 'A',
      [teamB.id]: 'B',
      [teamC.id]: 'C',
      [teamD.id]: 'D',
      [teamE.id]: 'E',
    };

    const teamIds = [teamA.id, teamB.id, teamC.id, teamD.id, teamE.id];

    return {
      ...group,
      teamIds,
      letterAssignments,
      isDrawComplete: true,
    };
  });
}

/**
 * Generate matches for a group based on the fixture template and letter assignments
 */
export function generateGroupMatches(
  _groupId: string,
  letterAssignments: Record<string, FixtureLetter>
): Match[] {
  // Invert the mapping: letter -> teamId
  const letterToTeam: Record<FixtureLetter, string> = {} as any;
  Object.entries(letterAssignments).forEach(([teamId, letter]) => {
    letterToTeam[letter] = teamId;
  });

  // Generate matches from template
  return FIXTURE_TEMPLATE.map((fixture) => ({
    id: nanoid(),
    homeTeamId: letterToTeam[fixture.home],
    awayTeamId: letterToTeam[fixture.away],
    homeScore: null,
    awayScore: null,
    isPlayed: false,
    stage: 'qualifier' as const,
    matchday: fixture.matchday, // Include matchday for global ordering
  }));
}

/**
 * Initialize standings for all teams in a group
 */
export function initializeStandings(teamIds: string[]) {
  return teamIds.map((teamId) => ({
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
