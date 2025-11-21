import type { MatchResult } from '../types';
import { getEngineConfig } from '../store/useConfigStore';

/**
 * Simulates a football match based on team skills
 * @param homeSkill - Home team skill rating (0-100)
 * @param awaySkill - Away team skill rating (0-100)
 * @param disableHomeAdvantage - If true, no home advantage is applied (for World Cup/Knockouts)
 * @returns Match result with scores and skill changes
 */
export function simulateMatch(homeSkill: number, awaySkill: number, disableHomeAdvantage = false): MatchResult {
  const config = getEngineConfig();

  // Home advantage: configurable skill points (disabled for World Cup and knockouts)
  const adjustedHomeSkill = disableHomeAdvantage ? homeSkill : homeSkill + config.homeAdvantage;

  // Calculate skill difference (affects expected goals)
  const skillDiff = adjustedHomeSkill - awaySkill;

  // Base expected goals (Poisson-like distribution)
  const homeExpectedGoals = 1.5 + (skillDiff / 50);
  const awayExpectedGoals = 1.5 - (skillDiff / 50);

  // Generate actual goals with randomness
  const homeScore = generateGoals(homeExpectedGoals);
  const awayScore = generateGoals(awayExpectedGoals);

  // Calculate skill updates (ELO-like system)
  const { homeChange, awayChange } = calculateSkillChanges(
    homeSkill,
    awaySkill,
    homeScore,
    awayScore
  );

  return {
    homeScore,
    awayScore,
    homeSkillChange: homeChange,
    awaySkillChange: awayChange,
  };
}

/**
 * Generates goals based on expected goals using Poisson-like distribution
 */
function generateGoals(expectedGoals: number): number {
  // Clamp expected goals to reasonable range
  const lambda = Math.max(0, Math.min(4, expectedGoals));

  // Simple Poisson approximation using random numbers
  const random = Math.random();

  if (random < Math.exp(-lambda)) return 0;
  if (random < Math.exp(-lambda) * (1 + lambda)) return 1;
  if (random < Math.exp(-lambda) * (1 + lambda + lambda * lambda / 2)) return 2;
  if (random < Math.exp(-lambda) * (1 + lambda + lambda * lambda / 2 + Math.pow(lambda, 3) / 6)) return 3;

  // Add some variance for higher scores
  if (Math.random() > 0.9) return 4 + Math.floor(Math.random() * 3);

  return Math.floor(Math.random() * 5);
}

/**
 * Calculates skill rating changes based on match result
 * Uses ELO-like system with K-factor
 */
function calculateSkillChanges(
  homeSkill: number,
  awaySkill: number,
  homeScore: number,
  awayScore: number
): { homeChange: number; awayChange: number } {
  const config = getEngineConfig();

  // K-factor: how much ratings can change (configured by user)
  const kFactor = config.kFactor;

  // Expected result (0-1 scale)
  const expectedHome = 1 / (1 + Math.pow(10, (awaySkill - homeSkill) / 400));

  // Actual result (1 = win, 0.5 = draw, 0 = loss)
  let actualHome: number;
  if (homeScore > awayScore) actualHome = 1;
  else if (homeScore === awayScore) actualHome = 0.5;
  else actualHome = 0;

  // Calculate changes
  const homeChange = Math.round(kFactor * (actualHome - expectedHome));
  const awayChange = -homeChange;

  return { homeChange, awayChange };
}

/**
 * Updates a team's skill rating, ensuring it stays within bounds
 */
export function updateTeamSkill(currentSkill: number, change: number): number {
  const config = getEngineConfig();
  const newSkill = currentSkill + change;
  // Keep skill between configured limits
  return Math.max(config.skillMin, Math.min(config.skillMax, newSkill));
}

/**
 * Simulates a match with potential penalties (for knockout stages)
 */
export function simulateMatchWithPenalties(
  homeSkill: number,
  awaySkill: number,
  disableHomeAdvantage = true // Knockouts are always neutral
): MatchResult & { penalties?: { homeScore: number; awayScore: number } } {
  const result = simulateMatch(homeSkill, awaySkill, disableHomeAdvantage);

  // If it's a draw, simulate penalties
  if (result.homeScore === result.awayScore) {
    const penalties = simulatePenalties(homeSkill, awaySkill);
    return { ...result, penalties };
  }

  return result;
}

/**
 * Simulates penalty shootout
 */
function simulatePenalties(
  homeSkill: number,
  awaySkill: number
): { homeScore: number; awayScore: number } {
  // Penalty conversion rate based on skill (75-90% conversion)
  const homeConversionRate = 0.75 + (homeSkill / 100) * 0.15;
  const awayConversionRate = 0.75 + (awaySkill / 100) * 0.15;

  let homeScore = 0;
  let awayScore = 0;

  // Standard 5 penalties each
  for (let i = 0; i < 5; i++) {
    if (Math.random() < homeConversionRate) homeScore++;
    if (Math.random() < awayConversionRate) awayScore++;
  }

  // Sudden death if tied
  while (homeScore === awayScore) {
    if (Math.random() < homeConversionRate) homeScore++;
    if (Math.random() < awayConversionRate) awayScore++;
  }

  return { homeScore, awayScore };
}
