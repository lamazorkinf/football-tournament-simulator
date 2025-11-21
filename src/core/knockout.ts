import { nanoid } from 'nanoid';
import type { KnockoutMatch, KnockoutBracket, WorldCupGroup, Team } from '../types';
import { sortStandings } from './scheduler';

/**
 * Generates the Round of 32 bracket from World Cup group results (16 groups)
 * FIFA standard format adapted for 64 teams:
 * - Winners of groups play runners-up from different groups
 * - Teams from same group can't meet until later rounds
 */
export function generateRoundOf32(groups: WorldCupGroup[], teams?: Team[]): KnockoutMatch[] {
  const matches: KnockoutMatch[] = [];

  // Sort groups A-P (16 groups)
  const sortedGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name));

  // Get top 2 from each group
  const groupResults = sortedGroups.map((group) => {
    const sorted = sortStandings(group.standings, teams);
    return {
      groupName: group.name,
      winner: sorted[0]?.teamId,
      runnerUp: sorted[1]?.teamId,
    };
  });

  // FIFA standard bracket pairings for 16 groups
  // Pattern: A1 vs B2, C1 vs D2, etc.
  const pairings = [
    { home: groupResults[0].winner, away: groupResults[1].runnerUp, position: 0 },   // A1 vs B2
    { home: groupResults[2].winner, away: groupResults[3].runnerUp, position: 1 },   // C1 vs D2
    { home: groupResults[4].winner, away: groupResults[5].runnerUp, position: 2 },   // E1 vs F2
    { home: groupResults[6].winner, away: groupResults[7].runnerUp, position: 3 },   // G1 vs H2
    { home: groupResults[8].winner, away: groupResults[9].runnerUp, position: 4 },   // I1 vs J2
    { home: groupResults[10].winner, away: groupResults[11].runnerUp, position: 5 }, // K1 vs L2
    { home: groupResults[12].winner, away: groupResults[13].runnerUp, position: 6 }, // M1 vs N2
    { home: groupResults[14].winner, away: groupResults[15].runnerUp, position: 7 }, // O1 vs P2
    { home: groupResults[1].winner, away: groupResults[0].runnerUp, position: 8 },   // B1 vs A2
    { home: groupResults[3].winner, away: groupResults[2].runnerUp, position: 9 },   // D1 vs C2
    { home: groupResults[5].winner, away: groupResults[4].runnerUp, position: 10 },  // F1 vs E2
    { home: groupResults[7].winner, away: groupResults[6].runnerUp, position: 11 },  // H1 vs G2
    { home: groupResults[9].winner, away: groupResults[8].runnerUp, position: 12 },  // J1 vs I2
    { home: groupResults[11].winner, away: groupResults[10].runnerUp, position: 13 },// L1 vs K2
    { home: groupResults[13].winner, away: groupResults[12].runnerUp, position: 14 },// N1 vs M2
    { home: groupResults[15].winner, away: groupResults[14].runnerUp, position: 15 },// P1 vs O2
  ];

  pairings.forEach((pairing) => {
    if (pairing.home && pairing.away) {
      matches.push({
        id: nanoid(),
        homeTeamId: pairing.home,
        awayTeamId: pairing.away,
        homeScore: null,
        awayScore: null,
        isPlayed: false,
        stage: 'world-cup-knockout',
        round: 'round-of-32',
        position: pairing.position,
      });
    }
  });

  return matches;
}

/**
 * Generates the Round of 16 bracket from Round of 32 results
 * Standard World Cup format:
 * - Winners of groups play runners-up from different groups
 * - Teams from same group can't meet until later rounds
 */
export function generateRoundOf16(groups: WorldCupGroup[], teams?: Team[]): KnockoutMatch[];
export function generateRoundOf16(roundOf32Matches: KnockoutMatch[], teams?: Team[]): KnockoutMatch[];
export function generateRoundOf16(input: WorldCupGroup[] | KnockoutMatch[], teams?: Team[]): KnockoutMatch[] {
  // Check if input is Round of 32 matches
  if (input.length > 0 && 'round' in input[0]) {
    return generateRoundOf16FromR32(input as KnockoutMatch[]);
  }

  // Original logic for groups
  const matches: KnockoutMatch[] = [];

  // Sort groups A-H
  const sortedGroups = [...(input as WorldCupGroup[])].sort((a, b) => a.name.localeCompare(b.name));

  // Get top 2 from each group
  const groupResults = sortedGroups.map((group) => {
    const sorted = sortStandings(group.standings, teams);
    return {
      groupName: group.name,
      winner: sorted[0]?.teamId,
      runnerUp: sorted[1]?.teamId,
    };
  });

  // Standard World Cup bracket pairings
  const pairings = [
    { home: groupResults[0].winner, away: groupResults[1].runnerUp, position: 0 }, // A1 vs B2
    { home: groupResults[2].winner, away: groupResults[3].runnerUp, position: 1 }, // C1 vs D2
    { home: groupResults[4].winner, away: groupResults[5].runnerUp, position: 2 }, // E1 vs F2
    { home: groupResults[6].winner, away: groupResults[7].runnerUp, position: 3 }, // G1 vs H2
    { home: groupResults[1].winner, away: groupResults[0].runnerUp, position: 4 }, // B1 vs A2
    { home: groupResults[3].winner, away: groupResults[2].runnerUp, position: 5 }, // D1 vs C2
    { home: groupResults[5].winner, away: groupResults[4].runnerUp, position: 6 }, // F1 vs E2
    { home: groupResults[7].winner, away: groupResults[6].runnerUp, position: 7 }, // H1 vs G2
  ];

  pairings.forEach((pairing) => {
    if (pairing.home && pairing.away) {
      matches.push({
        id: nanoid(),
        homeTeamId: pairing.home,
        awayTeamId: pairing.away,
        homeScore: null,
        awayScore: null,
        isPlayed: false,
        stage: 'world-cup-knockout',
        round: 'round-of-16',
        position: pairing.position,
      });
    }
  });

  return matches;
}

/**
 * Helper function to generate Round of 16 from Round of 32 results
 */
function generateRoundOf16FromR32(roundOf32: KnockoutMatch[]): KnockoutMatch[] {
  const matches: KnockoutMatch[] = [];

  // R32 has 16 matches (positions 0-15), R16 will have 8 matches
  // Pairing pattern: winners of matches 0-1, 2-3, 4-5, etc.
  const pairings = [
    { match1: 0, match2: 8, position: 0 },   // Winner R32-M1 vs Winner R32-M9
    { match1: 1, match2: 9, position: 1 },   // Winner R32-M2 vs Winner R32-M10
    { match1: 2, match2: 10, position: 2 },  // Winner R32-M3 vs Winner R32-M11
    { match1: 3, match2: 11, position: 3 },  // Winner R32-M4 vs Winner R32-M12
    { match1: 4, match2: 12, position: 4 },  // Winner R32-M5 vs Winner R32-M13
    { match1: 5, match2: 13, position: 5 },  // Winner R32-M6 vs Winner R32-M14
    { match1: 6, match2: 14, position: 6 },  // Winner R32-M7 vs Winner R32-M15
    { match1: 7, match2: 15, position: 7 },  // Winner R32-M8 vs Winner R32-M16
  ];

  pairings.forEach((pairing) => {
    const match1 = roundOf32.find((m) => m.position === pairing.match1);
    const match2 = roundOf32.find((m) => m.position === pairing.match2);

    if (match1?.winnerId && match2?.winnerId) {
      matches.push({
        id: nanoid(),
        homeTeamId: match1.winnerId,
        awayTeamId: match2.winnerId,
        homeScore: null,
        awayScore: null,
        isPlayed: false,
        stage: 'world-cup-knockout',
        round: 'round-of-16',
        position: pairing.position,
      });
    }
  });

  return matches;
}

/**
 * Generates quarter-final matches from Round of 16 results
 */
export function generateQuarterFinals(roundOf16: KnockoutMatch[]): KnockoutMatch[] {
  const matches: KnockoutMatch[] = [];

  // Standard bracket progression
  const pairings = [
    { match1: 0, match2: 4, position: 0 }, // Winner M1 vs Winner M5
    { match1: 2, match2: 6, position: 1 }, // Winner M3 vs Winner M7
    { match1: 1, match2: 5, position: 2 }, // Winner M2 vs Winner M6
    { match1: 3, match2: 7, position: 3 }, // Winner M4 vs Winner M8
  ];

  pairings.forEach((pairing) => {
    const match1 = roundOf16.find((m) => m.position === pairing.match1);
    const match2 = roundOf16.find((m) => m.position === pairing.match2);

    if (match1?.winnerId && match2?.winnerId) {
      matches.push({
        id: nanoid(),
        homeTeamId: match1.winnerId,
        awayTeamId: match2.winnerId,
        homeScore: null,
        awayScore: null,
        isPlayed: false,
        stage: 'world-cup-knockout',
        round: 'quarter-final',
        position: pairing.position,
      });
    }
  });

  return matches;
}

/**
 * Generates semi-final matches from quarter-final results
 */
export function generateSemiFinals(quarterFinals: KnockoutMatch[]): KnockoutMatch[] {
  const matches: KnockoutMatch[] = [];

  const pairings = [
    { match1: 0, match2: 1, position: 0 }, // Winner QF1 vs Winner QF2
    { match1: 2, match2: 3, position: 1 }, // Winner QF3 vs Winner QF4
  ];

  pairings.forEach((pairing) => {
    const match1 = quarterFinals.find((m) => m.position === pairing.match1);
    const match2 = quarterFinals.find((m) => m.position === pairing.match2);

    if (match1?.winnerId && match2?.winnerId) {
      matches.push({
        id: nanoid(),
        homeTeamId: match1.winnerId,
        awayTeamId: match2.winnerId,
        homeScore: null,
        awayScore: null,
        isPlayed: false,
        stage: 'world-cup-knockout',
        round: 'semi-final',
        position: pairing.position,
      });
    }
  });

  return matches;
}

/**
 * Generates the third-place match from semi-final losers
 */
export function generateThirdPlaceMatch(semiFinals: KnockoutMatch[]): KnockoutMatch | null {
  const losers = semiFinals.filter((m) => m.loserId).map((m) => m.loserId!);

  if (losers.length === 2) {
    return {
      id: nanoid(),
      homeTeamId: losers[0],
      awayTeamId: losers[1],
      homeScore: null,
      awayScore: null,
      isPlayed: false,
      stage: 'world-cup-knockout',
      round: 'third-place',
    };
  }

  return null;
}

/**
 * Generates the final match from semi-final winners
 */
export function generateFinal(semiFinals: KnockoutMatch[]): KnockoutMatch | null {
  const winners = semiFinals.filter((m) => m.winnerId).map((m) => m.winnerId!);

  if (winners.length === 2) {
    return {
      id: nanoid(),
      homeTeamId: winners[0],
      awayTeamId: winners[1],
      homeScore: null,
      awayScore: null,
      isPlayed: false,
      stage: 'world-cup-knockout',
      round: 'final',
    };
  }

  return null;
}

/**
 * Initialize empty knockout bracket
 */
export function initializeKnockoutBracket(): KnockoutBracket {
  return {
    roundOf32: [],
    roundOf16: [],
    quarterFinals: [],
    semiFinals: [],
    thirdPlace: null,
    final: null,
  };
}

/**
 * Check if all group stage matches are complete
 */
export function areGroupsComplete(groups: WorldCupGroup[]): boolean {
  return groups.every((group) => group.matches.every((match) => match.isPlayed));
}

/**
 * Check if a knockout round is complete
 */
export function isRoundComplete(matches: KnockoutMatch[]): boolean {
  return matches.length > 0 && matches.every((match) => match.isPlayed && match.winnerId);
}

/**
 * Determine winner of a knockout match (including penalties)
 */
export function determineKnockoutWinner(match: KnockoutMatch): {
  winnerId: string;
  loserId: string;
} | null {
  if (!match.isPlayed || match.homeScore === null || match.awayScore === null) {
    return null;
  }

  let winnerId: string;
  let loserId: string;

  // Check regular time
  if (match.homeScore > match.awayScore) {
    winnerId = match.homeTeamId;
    loserId = match.awayTeamId;
  } else if (match.awayScore > match.homeScore) {
    winnerId = match.awayTeamId;
    loserId = match.homeTeamId;
  } else if (match.penalties) {
    // Penalties
    if (match.penalties.homeScore > match.penalties.awayScore) {
      winnerId = match.homeTeamId;
      loserId = match.awayTeamId;
    } else {
      winnerId = match.awayTeamId;
      loserId = match.homeTeamId;
    }
  } else {
    return null;
  }

  return { winnerId, loserId };
}
