import type { Tournament, Group, WorldCupGroup, KnockoutBracket } from '../types';

export interface QualifierProgress {
  totalGroups: number;
  completedGroups: number;
  totalMatches: number;
  playedMatches: number;
  percentage: number;
  isComplete: boolean;
}

export interface WorldCupGroupProgress {
  totalGroups: number;
  completedGroups: number;
  totalMatches: number;
  playedMatches: number;
  percentage: number;
  isComplete: boolean;
}

export interface KnockoutProgress {
  currentRound: 'round-of-32' | 'round-of-16' | 'quarter' | 'semi' | 'final' | 'complete';
  roundOf32Complete: boolean;
  roundOf16Complete: boolean;
  quarterFinalsComplete: boolean;
  semiFinalsComplete: boolean;
  thirdPlaceComplete: boolean;
  finalComplete: boolean;
  percentage: number;
  isComplete: boolean;
}

/**
 * Calculate progress of qualifier stage
 */
export function getQualifierProgress(tournament: Tournament): QualifierProgress {
  const allGroups: Group[] = [];

  // Collect all groups from all regions
  Object.values(tournament.qualifiers).forEach((regionGroups) => {
    allGroups.push(...regionGroups);
  });

  const totalGroups = allGroups.length;
  let totalMatches = 0;
  let playedMatches = 0;
  let completedGroups = 0;

  allGroups.forEach((group) => {
    const groupTotal = group.matches.length;
    const groupPlayed = group.matches.filter((m) => m.isPlayed).length;

    totalMatches += groupTotal;
    playedMatches += groupPlayed;

    if (groupTotal > 0 && groupPlayed === groupTotal) {
      completedGroups++;
    }
  });

  const percentage = totalMatches > 0 ? Math.round((playedMatches / totalMatches) * 100) : 0;
  const isComplete = completedGroups === totalGroups && totalGroups > 0;

  return {
    totalGroups,
    completedGroups,
    totalMatches,
    playedMatches,
    percentage,
    isComplete,
  };
}

/**
 * Calculate progress of World Cup group stage
 */
export function getWorldCupGroupProgress(groups: WorldCupGroup[]): WorldCupGroupProgress {
  const totalGroups = groups.length;
  let totalMatches = 0;
  let playedMatches = 0;
  let completedGroups = 0;

  groups.forEach((group) => {
    const groupTotal = group.matches.length;
    const groupPlayed = group.matches.filter((m) => m.isPlayed).length;

    totalMatches += groupTotal;
    playedMatches += groupPlayed;

    if (groupTotal > 0 && groupPlayed === groupTotal) {
      completedGroups++;
    }
  });

  const percentage = totalMatches > 0 ? Math.round((playedMatches / totalMatches) * 100) : 0;
  const isComplete = completedGroups === totalGroups && totalGroups > 0;

  return {
    totalGroups,
    completedGroups,
    totalMatches,
    playedMatches,
    percentage,
    isComplete,
  };
}

/**
 * Calculate progress of knockout stage
 */
export function getKnockoutProgress(knockout: KnockoutBracket): KnockoutProgress {
  // Check Round of 32
  const r32Total = knockout.roundOf32.length;
  const r32Played = knockout.roundOf32.filter((m) => m.isPlayed).length;
  const roundOf32Complete = r32Total > 0 && r32Played === r32Total;

  // Check Round of 16
  const r16Total = knockout.roundOf16.length;
  const r16Played = knockout.roundOf16.filter((m) => m.isPlayed).length;
  const roundOf16Complete = r16Total > 0 && r16Played === r16Total;

  // Check Quarter Finals
  const qfTotal = knockout.quarterFinals.length;
  const qfPlayed = knockout.quarterFinals.filter((m) => m.isPlayed).length;
  const quarterFinalsComplete = qfTotal > 0 && qfPlayed === qfTotal;

  // Check Semi Finals
  const sfTotal = knockout.semiFinals.length;
  const sfPlayed = knockout.semiFinals.filter((m) => m.isPlayed).length;
  const semiFinalsComplete = sfTotal > 0 && sfPlayed === sfTotal;

  // Check Third Place
  const thirdPlaceComplete = knockout.thirdPlace ? knockout.thirdPlace.isPlayed : false;

  // Check Final
  const finalComplete = knockout.final ? knockout.final.isPlayed : false;

  // Determine current round
  let currentRound: KnockoutProgress['currentRound'] = 'round-of-32';
  if (finalComplete) {
    currentRound = 'complete';
  } else if (semiFinalsComplete) {
    currentRound = 'final';
  } else if (quarterFinalsComplete) {
    currentRound = 'semi';
  } else if (roundOf16Complete) {
    currentRound = 'quarter';
  } else if (roundOf32Complete) {
    currentRound = 'round-of-16';
  }

  // Calculate percentage (R32=25%, R16=20%, QF=15%, SF=15%, 3rd=10%, Final=15%)
  let percentage = 0;
  if (r32Total > 0) percentage += (r32Played / r32Total) * 25;
  if (r16Total > 0) percentage += (r16Played / r16Total) * 20;
  if (qfTotal > 0) percentage += (qfPlayed / qfTotal) * 15;
  if (sfTotal > 0) percentage += (sfPlayed / sfTotal) * 15;
  if (knockout.thirdPlace) percentage += thirdPlaceComplete ? 10 : 0;
  if (knockout.final) percentage += finalComplete ? 15 : 0;

  percentage = Math.round(percentage);

  const isComplete = finalComplete && thirdPlaceComplete;

  return {
    currentRound,
    roundOf32Complete,
    roundOf16Complete,
    quarterFinalsComplete,
    semiFinalsComplete,
    thirdPlaceComplete,
    finalComplete,
    percentage,
    isComplete,
  };
}

/**
 * Check if tournament can advance to World Cup
 */
export function canAdvanceToWorldCup(tournament: Tournament): boolean {
  const progress = getQualifierProgress(tournament);
  return progress.isComplete && !tournament.worldCup;
}

/**
 * Check if World Cup can advance to knockout stage
 */
export function canAdvanceToKnockout(groups: WorldCupGroup[]): boolean {
  const progress = getWorldCupGroupProgress(groups);
  return progress.isComplete;
}
